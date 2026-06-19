// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Engine-true explorers (VIS-3): visuals backed by the same math the engine
 * trades with — the regime classifier's exact gates, the conformal rank
 * formula with its honesty threshold, and Monte Carlo resampling of trade
 * outcomes. Live mode pulls the learner's own candles.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { backendClient } from '../../lib/backend';
import { averageTrueRange, directionalMovementIndex } from '../../lib/analytics';
import type { Candle } from '../../types';

const C = {
  bg: '#0a1426',
  up: '#14c784',
  down: '#f6465d',
  ink: '#f1f6ff',
  muted: '#94aed8',
  accent: '#8db7ff',
  warn: '#f0b84b',
  violet: '#a78bfa',
};

function Shell({
  title,
  children,
  footer,
}: {
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[rgba(120,165,255,0.18)] bg-gradient-to-br from-[#13284a]/55 to-[#0a1426]/75 p-4 shadow-[0_14px_40px_rgba(2,7,18,0.5)] backdrop-blur-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8ea6cf]">{title}</p>
      <div className="mt-3">{children}</div>
      {footer ? <div className="mt-3">{footer}</div> : null}
    </div>
  );
}

function syntheticCandles(n = 160, seed = 11): Candle[] {
  let v = 100;
  let s = seed;
  const out: Candle[] = [];
  for (let i = 0; i < n; i++) {
    s = (s * 9301 + 49297) % 233280;
    const rnd = s / 233280 - 0.5;
    const drift = i % 60 < 30 ? 0.004 : -0.001; // alternating character
    const range = 1 + Math.abs(Math.sin(i / 17)) * 2.2;
    const open = v;
    v = Math.max(40, v * (1 + rnd * 0.025 + drift));
    out.push({
      time: i,
      open,
      close: v,
      high: Math.max(open, v) + range,
      low: Math.min(open, v) - range,
      volume: 1000,
    });
  }
  return out;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
}

// ---------------------------------------------------------------------------
// Regime scrubber: the engine's exact gates over a price series.
// ---------------------------------------------------------------------------

const REGIME_COLORS: Record<string, string> = {
  trending: C.up,
  ranging: C.accent,
  transitional: C.warn,
  volatile: C.down,
};

export function RegimeScrubber({ params }: { params: Record<string, unknown> }) {
  const { t } = useTranslation();
  const [candles, setCandles] = useState<Candle[]>(() => syntheticCandles());
  const [source, setSource] = useState('synthetic series');
  const [playhead, setPlayhead] = useState(120);

  useEffect(() => {
    const symbol = typeof params.symbol === 'string' ? params.symbol : 'BTCUSD';
    if (params.data !== 'live') return;
    backendClient
      .getMarketCandles(symbol, String(params.timeframe ?? '1h'))
      .then((response) => {
        const items = (response.items ?? []) as unknown as Candle[];
        if (items.length >= 80) {
          setCandles(items.slice(-160));
          setSource(`${symbol} ${String(params.timeframe ?? '1h')} (your live data)`);
        }
      })
      .catch(() => undefined);
  }, [params.data, params.symbol, params.timeframe]);

  const regimes = useMemo(() => {
    const atr = averageTrueRange(candles, 14);
    const { adx } = directionalMovementIndex(candles, 14);
    return candles.map((candle, i) => {
      const atrPct = candle.close > 0 ? (atr[i] ?? 0) / candle.close : 0;
      const window = atr
        .slice(Math.max(0, i - 49), i + 1)
        .map((value, j) => {
          const price = candles[Math.max(0, i - 49) + j]?.close ?? 1;
          return price > 0 ? value / price : 0;
        })
        .filter((value) => value > 0);
      const baseline = median(window) || atrPct;
      if (baseline && atrPct >= baseline * 1.7) return 'volatile';
      const a = adx[i] ?? 0;
      if (a >= 22) return 'trending';
      if (a < 16) return 'ranging';
      return 'transitional';
    });
  }, [candles]);

  const closes = candles.map((candle) => candle.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const px = (i: number) => 40 + (i / (candles.length - 1)) * 640;
  const py = (v: number) => 230 - ((v - min) / (max - min || 1)) * 180;
  const idx = Math.min(playhead, candles.length - 1);
  const { adx } = useMemo(() => directionalMovementIndex(candles, 14), [candles]);
  const atrSeries = useMemo(() => averageTrueRange(candles, 14), [candles]);

  return (
    <Shell
      title={t('academy.regimeScrubberTitle', { source })}
      footer={
        <input
          type="range"
          aria-label={t('academy.playhead')}
          className="w-full accent-[#4a86ff]"
          min={20}
          max={candles.length - 1}
          value={idx}
          onChange={(event) => setPlayhead(Number(event.target.value))}
        />
      }
    >
      <svg
        viewBox="0 0 720 300"
        role="img"
        aria-label={t('academy.regimeScrubber')}
        className="w-full"
      >
        <rect width="720" height="300" rx={12} fill={C.bg} />
        {candles.map((_, i) =>
          i % 2 === 0 ? (
            <rect
              key={i}
              x={px(i) - 2}
              y={250}
              width={4.5}
              height={14}
              fill={REGIME_COLORS[regimes[i]] ?? C.muted}
              opacity={0.9}
            />
          ) : null,
        )}
        <polyline
          points={closes.map((v, i) => `${px(i)},${py(v)}`).join(' ')}
          fill="none"
          stroke={C.muted}
          strokeWidth={1.6}
        />
        <line x1={px(idx)} y1={40} x2={px(idx)} y2={264} stroke={C.violet} strokeWidth={2} />
        <text x={40} y={28} fill={REGIME_COLORS[regimes[idx]]} fontSize={17} fontWeight={800}>
          {regimes[idx].toUpperCase()}
        </text>
        <text x={170} y={28} fill={C.muted} fontSize={13}>
          ADX {(adx[idx] ?? 0).toFixed(1)} (gates: ≥22 trending, &lt;16 ranging) · ATR%{' '}
          {(((atrSeries[idx] ?? 0) / (closes[idx] || 1)) * 100).toFixed(2)} (volatile at 1.7×
          median)
        </text>
        {Object.entries(REGIME_COLORS).map(([name, color], i) => (
          <g key={name}>
            <rect x={40 + i * 150} y={278} width={10} height={10} rx={2} fill={color} />
            <text x={56 + i * 150} y={287} fill={C.muted} fontSize={11}>
              {name}
            </text>
          </g>
        ))}
      </svg>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Monte Carlo animator: resampled equity paths + drawdown distribution.
// ---------------------------------------------------------------------------

const DEFAULT_OUTCOMES = [
  1.4, -1, 0.8, -1, 2.1, -1, -1, 1.7, 0.4, -1, 2.6, -1, 1.1, -1, -1, 0.9, 1.9, -1, 0.6, -1, 1.3, -1,
  2.2, -1, 0.7, 1.5, -1, -1, 1.8, -1,
];

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
}

function McSlider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  suffix = '',
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  suffix?: string;
}) {
  return (
    <label className="block text-xs text-[#94aed8]">
      <span className="flex justify-between">
        <span>{label}</span>
        <span className="font-medium text-[#dbe9ff]">
          {value}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        className="mt-1 w-full accent-[#4a86ff]"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

/**
 * Advanced, interactive Monte Carlo. Live sliders (win rate, avg win/loss in R,
 * trades, runs) drive a seeded resample; the chart shows a 5–95th percentile
 * band, a fan of sample equity paths, the median, and risk stats (drawdown
 * percentiles, P(end below start), P(ruin)). Resample draws a fresh sequence.
 */
export function MonteCarloAnimator({ params }: { params: Record<string, unknown> }) {
  const { t } = useTranslation();
  const [winRate, setWinRate] = useState(Number(params.winRate ?? 45));
  const [avgWin, setAvgWin] = useState(Number(params.avgWin ?? 1.7));
  const [avgLoss, setAvgLoss] = useState(Number(params.avgLoss ?? 1));
  const [trades, setTrades] = useState(Number(params.trades ?? 40));
  const [runs, setRuns] = useState(Number(params.runs ?? 220));
  const [seed, setSeed] = useState(7);
  const risk = 0.02;

  const sim = useMemo(() => {
    const rng = mulberry32((seed * 2654435761) >>> 0);
    const curves: number[][] = [];
    for (let s = 0; s < runs; s++) {
      let eq = 100;
      const c = [100];
      for (let i = 0; i < trades; i++) {
        const r = rng() < winRate / 100 ? avgWin : -avgLoss;
        eq *= 1 + r * risk;
        c.push(eq);
      }
      curves.push(c);
    }
    const p5: number[] = [];
    const p50: number[] = [];
    const p95: number[] = [];
    for (let i = 0; i <= trades; i++) {
      const col = curves.map((c) => c[i]).sort((a, b) => a - b);
      p5.push(quantile(col, 0.05));
      p50.push(quantile(col, 0.5));
      p95.push(quantile(col, 0.95));
    }
    const term = curves.map((c) => c[trades]).sort((a, b) => a - b);
    const dds = curves
      .map((c) => {
        let pk = c[0];
        let w = 0;
        for (const v of c) {
          pk = Math.max(pk, v);
          w = Math.min(w, ((v - pk) / pk) * 100);
        }
        return w;
      })
      .sort((a, b) => a - b);
    const n = Math.max(runs, 1);
    return {
      curves,
      p5,
      p50,
      p95,
      medTerm: quantile(term, 0.5),
      loTerm: quantile(term, 0.05),
      hiTerm: quantile(term, 0.95),
      below: (term.filter((v) => v < 100).length / n) * 100,
      ruin: (term.filter((v) => v < 60).length / n) * 100,
      medDD: quantile(dds, 0.5),
      p95DD: quantile(dds, 0.05),
    };
  }, [winRate, avgWin, avgLoss, trades, runs, seed]);

  const all = sim.curves.flat();
  const lo = Math.min(95, ...all);
  const hi = Math.max(105, ...all);
  const X = (i: number) => 50 + (i / Math.max(trades, 1)) * 620;
  const Y = (v: number) => 320 - ((v - lo) / (hi - lo || 1)) * 250;
  const toPts = (arr: number[]) => arr.map((v, i) => `${X(i)},${Y(v)}`).join(' ');
  const band = `${sim.p95.map((v, i) => `${X(i)},${Y(v)}`).join(' ')} ${sim.p5
    .map((_, i) => `${X(trades - i)},${Y(sim.p5[trades - i])}`)
    .join(' ')}`;
  const sampleCount = Math.min(70, runs);
  const sample = Array.from(
    { length: sampleCount },
    (_, k) => sim.curves[Math.floor((k * runs) / sampleCount)],
  );

  return (
    <Shell
      title={t('academy.monteCarloTitle')}
      footer={
        <div className="grid items-end gap-3 sm:grid-cols-3">
          <McSlider
            label={t('academy.mc.winRate')}
            value={winRate}
            min={20}
            max={70}
            onChange={setWinRate}
            suffix="%"
          />
          <McSlider
            label={t('academy.mc.avgWin')}
            value={avgWin}
            min={0.5}
            max={4}
            step={0.1}
            onChange={(v) => setAvgWin(Number(v.toFixed(1)))}
            suffix="R"
          />
          <McSlider
            label={t('academy.mc.avgLoss')}
            value={avgLoss}
            min={0.5}
            max={2}
            step={0.1}
            onChange={(v) => setAvgLoss(Number(v.toFixed(1)))}
            suffix="R"
          />
          <McSlider
            label={t('academy.mc.trades')}
            value={trades}
            min={10}
            max={80}
            onChange={setTrades}
          />
          <McSlider
            label={t('academy.mc.runs')}
            value={runs}
            min={60}
            max={400}
            step={20}
            onChange={setRuns}
          />
          <button
            type="button"
            className="rounded-lg border border-[rgba(141,183,255,0.4)] px-3 py-1.5 text-sm text-[#bcd6ff] hover:bg-[rgba(74,134,255,0.18)]"
            onClick={() => setSeed((s) => s + 1)}
          >
            {t('academy.mc.resample')}
          </button>
        </div>
      }
    >
      <svg
        viewBox="0 0 720 380"
        role="img"
        aria-label={t('academy.monteCarloPaths')}
        className="w-full"
      >
        <defs>
          <linearGradient id="mcBand" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#4a86ff" stopOpacity="0.28" />
            <stop offset="1" stopColor="#4a86ff" stopOpacity="0.04" />
          </linearGradient>
          <filter id="mcGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect width="720" height="380" rx={12} fill={C.bg} />
        <line
          x1={50}
          y1={Y(100)}
          x2={670}
          y2={Y(100)}
          stroke="rgba(141,183,255,0.3)"
          strokeDasharray="4 6"
        />
        <text x={672} y={Y(100) + 4} fill={C.muted} fontSize={11}>
          {t('academy.mc.start')}
        </text>
        <polygon points={band} fill="url(#mcBand)" />
        {sample.map((c, k) => (
          <polyline
            key={k}
            points={toPts(c)}
            fill="none"
            stroke={C.accent}
            strokeWidth={1}
            opacity={0.1}
          />
        ))}
        <polyline
          points={toPts(sim.p95)}
          fill="none"
          stroke="#9cc0ff"
          strokeWidth={1.5}
          opacity={0.5}
        />
        <polyline
          points={toPts(sim.p5)}
          fill="none"
          stroke="#9cc0ff"
          strokeWidth={1.5}
          opacity={0.5}
        />
        <polyline
          points={toPts(sim.p50)}
          fill="none"
          stroke="#cfe6ff"
          strokeWidth={2.5}
          filter="url(#mcGlow)"
        />
        <text x={20} y={28} fill={C.ink} fontSize={15} fontWeight={800}>
          {t('academy.mc.runsLabel', { n: runs })}
        </text>
        <text x={50} y={356} fill={C.muted} fontSize={12.5}>
          {t('academy.mc.medianEnd')}{' '}
          <tspan fill="#cfe0ff" fontWeight={700}>
            {sim.medTerm.toFixed(0)}%
          </tspan>
          {'   ·   '}
          <tspan fill="#cfe0ff" fontWeight={700}>
            {sim.loTerm.toFixed(0)}–{sim.hiTerm.toFixed(0)}%
          </tspan>
          {'   ·   '}
          {t('academy.mc.maxDdMed')}{' '}
          <tspan fill={C.warn} fontWeight={700}>
            {sim.medDD.toFixed(1)}%
          </tspan>
          {'   ·   '}
          {t('academy.mc.maxDd95')}{' '}
          <tspan fill={C.down} fontWeight={700}>
            {sim.p95DD.toFixed(1)}%
          </tspan>
        </text>
        <text x={50} y={374} fill={C.muted} fontSize={12.5}>
          {t('academy.mc.belowStart')}{' '}
          <tspan fill={C.warn} fontWeight={700}>
            {sim.below.toFixed(0)}%
          </tspan>
          {'   ·   '}
          {t('academy.mc.ruin')}{' '}
          <tspan fill={C.down} fontWeight={700}>
            {sim.ruin.toFixed(0)}%
          </tspan>
        </text>
      </svg>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Conformal visualizer: rank quantiles with the honesty threshold.
// ---------------------------------------------------------------------------

export function ConformalVisualizer({ params }: { params: Record<string, unknown> }) {
  const { t } = useTranslation();
  const pool = (params.outcomes as number[]) ?? DEFAULT_OUTCOMES.concat(DEFAULT_OUTCOMES);
  const [n, setN] = useState(Math.min(30, pool.length));
  const [coverage, setCoverage] = useState(90);

  const sample = pool.slice(0, n);
  const sorted = [...sample].sort((a, b) => a - b);
  const alpha = 1 - coverage / 100;
  // The engine's exact rank math, epsilon-guarded.
  const lowerRank = Math.floor((n + 1) * (alpha / 2) + 1e-9);
  const upperRank = Math.ceil((n + 1) * (1 - alpha / 2) - 1e-9);
  const valid = lowerRank >= 1 && upperRank <= n;
  const lower = valid ? sorted[lowerRank - 1] : null;
  const upper = valid ? sorted[upperRank - 1] : null;

  const minV = Math.min(...sorted, -1.5);
  const maxV = Math.max(...sorted, 2.5);
  const px = (v: number) => 60 + ((v - minV) / (maxV - minV || 1)) * 600;

  return (
    <Shell
      title={t('academy.conformalTitle')}
      footer={
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-[#94aed8]">
            <span className="flex justify-between">
              <span>{t('academy.calibrationTrades')}</span>
              <span className="text-zinc-200 font-medium">{n}</span>
            </span>
            <input
              type="range"
              className="mt-1 w-full accent-[#4a86ff]"
              min={5}
              max={pool.length}
              value={n}
              onChange={(event) => setN(Number(event.target.value))}
            />
          </label>
          <label className="block text-xs text-[#94aed8]">
            <span className="flex justify-between">
              <span>{t('academy.coverage')}</span>
              <span className="text-zinc-200 font-medium">{coverage}%</span>
            </span>
            <input
              type="range"
              className="mt-1 w-full accent-[#4a86ff]"
              min={70}
              max={95}
              step={5}
              value={coverage}
              onChange={(event) => setCoverage(Number(event.target.value))}
            />
          </label>
        </div>
      }
    >
      <svg
        viewBox="0 0 720 220"
        role="img"
        aria-label={t('academy.conformalInterval')}
        className="w-full"
      >
        <rect width="720" height="220" rx={12} fill={C.bg} />
        {valid && lower !== null && upper !== null ? (
          <rect
            x={px(lower)}
            y={90}
            width={Math.max(px(upper) - px(lower), 2)}
            height={60}
            fill={C.up}
            opacity={0.15}
          />
        ) : null}
        <line x1={60} y1={120} x2={660} y2={120} stroke={C.muted} strokeWidth={1.5} />
        {sorted.map((v, i) => (
          <circle
            key={i}
            cx={px(v)}
            cy={120}
            r={5}
            fill={valid && (i === lowerRank - 1 || i === upperRank - 1) ? C.warn : C.accent}
            opacity={0.85}
          />
        ))}
        <text x={60} y={40} fill={valid ? C.up : C.down} fontSize={16} fontWeight={800}>
          {valid && lower !== null && upper !== null
            ? `Next trade in [${lower.toFixed(2)}R, ${upper.toFixed(2)}R] with ≥${coverage}% coverage`
            : `No guarantee — n=${n} is below the minimum for ${coverage}% coverage`}
        </text>
        <text x={60} y={66} fill={C.muted} fontSize={13}>
          {t('academy.ranksExplain', { lower: lowerRank, upper: upperRank })}
        </text>
        <text x={60} y={196} fill={C.muted} fontSize={12}>
          {t('academy.eachDotOos')}
        </text>
      </svg>
    </Shell>
  );
}
