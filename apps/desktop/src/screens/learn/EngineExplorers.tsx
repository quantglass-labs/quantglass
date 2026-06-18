// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Engine-true explorers (VIS-3): visuals backed by the same math the engine
 * trades with — the regime classifier's exact gates, the conformal rank
 * formula with its honesty threshold, and Monte Carlo resampling of trade
 * outcomes. Live mode pulls the learner's own candles.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { backendClient } from '../../lib/backend';
import { averageTrueRange, directionalMovementIndex } from '../../lib/analytics';
import type { Candle } from '../../types';

const C = {
  bg: '#07111f',
  up: '#14c784',
  down: '#f6465d',
  ink: '#f8fafc',
  muted: '#9fb0c7',
  accent: '#8db7ff',
  warn: '#f0b84b',
  violet: '#a78bfa',
};

function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

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
    <div className="rounded-xl border border-zinc-800 bg-[#07111f] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">{title}</p>
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
          className="w-full accent-indigo-400"
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

function maxDrawdown(outcomes: number[]): number {
  let equity = 100;
  let peak = 100;
  let worst = 0;
  for (const r of outcomes) {
    equity *= 1 + r * 0.012;
    peak = Math.max(peak, equity);
    worst = Math.min(worst, ((equity - peak) / peak) * 100);
  }
  return worst;
}

export function MonteCarloAnimator({ params }: { params: Record<string, unknown> }) {
  const { t } = useTranslation();
  const outcomes = (params.outcomes as number[]) ?? DEFAULT_OUTCOMES;
  const [paths, setPaths] = useState<number[][]>([]);
  const raf = useRef<number | null>(null);

  function run() {
    if (raf.current) cancelAnimationFrame(raf.current);
    const all: number[][] = [];
    for (let k = 0; k < 200; k++) {
      const sample = Array.from(
        { length: outcomes.length },
        () => outcomes[Math.floor(Math.random() * outcomes.length)],
      );
      let equity = 100;
      all.push(sample.map((r) => (equity *= 1 + r * 0.012)));
    }
    if (reducedMotion()) {
      setPaths(all);
      return;
    }
    setPaths([]);
    let shown = 0;
    const step = () => {
      shown = Math.min(shown + 6, all.length);
      setPaths(all.slice(0, shown));
      if (shown < all.length) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }
  // Auto-run on mount; cleanup only on unmount. A dependency-less cleanup
  // would cancel the animation frame after every render and freeze the run.
  useEffect(() => {
    // Frame-aligned start keeps the initial state write out of the render
    // commit, so the mount never triggers a cascading synchronous render.
    const start = requestAnimationFrame(run);
    return () => {
      cancelAnimationFrame(start);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const drawdowns = paths.map((path) => {
    let peak = path[0] ?? 100;
    let worst = 0;
    for (const v of path) {
      peak = Math.max(peak, v);
      worst = Math.min(worst, ((v - peak) / peak) * 100);
    }
    return worst;
  });
  const sortedDd = [...drawdowns].sort((a, b) => a - b);
  const medianDd = sortedDd.length ? sortedDd[Math.floor(sortedDd.length / 2)] : 0;
  const p95Dd = sortedDd.length ? sortedDd[Math.floor(sortedDd.length * 0.05)] : 0;
  const historical = maxDrawdown(outcomes);

  const allValues = paths.flat();
  const lo = Math.min(90, ...allValues);
  const hi = Math.max(110, ...allValues);
  const px = (i: number) => 40 + (i / Math.max(outcomes.length - 1, 1)) * 460;
  const py = (v: number) => 270 - ((v - lo) / (hi - lo || 1)) * 230;

  return (
    <Shell
      title={t('academy.monteCarloTitle')}
      footer={
        <button
          type="button"
          className="rounded-lg border border-indigo-500/40 px-3 py-1.5 text-sm text-indigo-200 hover:bg-indigo-600/20"
          onClick={run}
        >
          {t('academy.resample')}
        </button>
      }
    >
      <svg
        viewBox="0 0 720 300"
        role="img"
        aria-label={t('academy.monteCarloPaths')}
        className="w-full"
      >
        <rect width="720" height="300" rx={12} fill={C.bg} />
        {paths.map((path, k) => (
          <polyline
            key={k}
            points={path.map((v, i) => `${px(i)},${py(v)}`).join(' ')}
            fill="none"
            stroke={C.accent}
            strokeWidth={1}
            opacity={0.12}
          />
        ))}
        <text x={520} y={60} fill={C.ink} fontSize={14} fontWeight={700}>
          {paths.length} resamples
        </text>
        <text x={520} y={92} fill={C.muted} fontSize={13}>
          historical max DD: {historical.toFixed(1)}%
        </text>
        <text x={520} y={118} fill={C.warn} fontSize={13}>
          median max DD: {paths.length ? medianDd.toFixed(1) : '—'}%
        </text>
        <text x={520} y={144} fill={C.down} fontSize={13} fontWeight={700}>
          95th-pct max DD: {paths.length ? p95Dd.toFixed(1) : '—'}%
        </text>
        <text x={40} y={28} fill={C.muted} fontSize={13}>
          {t('academy.sameTradesShuffled')}
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
          <label className="block text-xs text-zinc-400">
            <span className="flex justify-between">
              <span>{t('academy.calibrationTrades')}</span>
              <span className="text-zinc-200 font-medium">{n}</span>
            </span>
            <input
              type="range"
              className="mt-1 w-full accent-indigo-400"
              min={5}
              max={pool.length}
              value={n}
              onChange={(event) => setN(Number(event.target.value))}
            />
          </label>
          <label className="block text-xs text-zinc-400">
            <span className="flex justify-between">
              <span>{t('academy.coverage')}</span>
              <span className="text-zinc-200 font-medium">{coverage}%</span>
            </span>
            <input
              type="range"
              className="mt-1 w-full accent-indigo-400"
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
