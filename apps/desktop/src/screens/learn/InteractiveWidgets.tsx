// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Interactive concept widgets (VIS-2): manipulable visuals registered in the
 * lesson visual registry. Sliders are preferred over drag for accessibility;
 * animations respect prefers-reduced-motion.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { exponentialMovingAverage, relativeStrengthIndex } from '../../lib/analytics';

const C = {
  bg: '#0a1426',
  panel: '#13284a',
  up: '#14c784',
  down: '#f6465d',
  ink: '#f1f6ff',
  muted: '#94aed8',
  accent: '#8db7ff',
  warn: '#f0b84b',
};

function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

function Slider({
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

function WidgetShell({
  title,
  children,
  controls,
}: {
  title: string;
  children: React.ReactNode;
  controls?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[rgba(120,165,255,0.18)] bg-gradient-to-br from-[#13284a]/55 to-[#0a1426]/75 p-4 shadow-[0_14px_40px_rgba(2,7,18,0.5)] backdrop-blur-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8ea6cf]">{title}</p>
      <div className="mt-3">{children}</div>
      {controls ? <div className="mt-4 grid gap-3 sm:grid-cols-2">{controls}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Risk sandbox: move stop/target, watch R:R and position size respond.
// ---------------------------------------------------------------------------

export function RiskSandbox({ params }: { params: Record<string, unknown> }) {
  const { t } = useTranslation();
  const entry = Number(params.entry ?? 100);
  const balance = Number(params.balance ?? 10000);
  const riskPercent = Number(params.riskPercent ?? 1);
  const [stop, setStop] = useState(entry * 0.95);
  const [target, setTarget] = useState(entry * 1.1);

  const risk = Math.max(entry - stop, 0.0001);
  const reward = Math.max(target - entry, 0);
  const rr = reward / risk;
  const units = (balance * (riskPercent / 100)) / risk;

  const scale = (price: number) => 360 - ((price - entry * 0.85) / (entry * 0.3)) * 320;

  return (
    <WidgetShell
      title={t('academy.riskSandboxTitle')}
      controls={
        <>
          <Slider
            label={t('academy.stopLoss')}
            value={Number(stop.toFixed(1))}
            min={Number((entry * 0.86).toFixed(1))}
            max={Number((entry * 0.999).toFixed(1))}
            step={0.1}
            onChange={setStop}
          />
          <Slider
            label={t('academy.target')}
            value={Number(target.toFixed(1))}
            min={Number((entry * 1.001).toFixed(1))}
            max={Number((entry * 1.14).toFixed(1))}
            step={0.1}
            onChange={setTarget}
          />
        </>
      }
    >
      <svg
        viewBox="0 0 720 400"
        role="img"
        aria-label={t('academy.riskRewardLevels')}
        className="w-full"
      >
        <rect width="720" height="400" rx={12} fill={C.bg} />
        <rect
          x={60}
          y={scale(target)}
          width={400}
          height={scale(entry) - scale(target)}
          fill={C.up}
          opacity={0.12}
        />
        <rect
          x={60}
          y={scale(entry)}
          width={400}
          height={scale(stop) - scale(entry)}
          fill={C.down}
          opacity={0.12}
        />
        {[
          { price: target, color: C.up, label: t('academy.lineTarget', { v: target.toFixed(1) }) },
          { price: entry, color: C.accent, label: t('academy.lineEntry', { v: entry.toFixed(1) }) },
          { price: stop, color: C.down, label: t('academy.lineStop', { v: stop.toFixed(1) }) },
        ].map((line) => (
          <g key={line.label}>
            <line
              x1={60}
              y1={scale(line.price)}
              x2={460}
              y2={scale(line.price)}
              stroke={line.color}
              strokeWidth={3}
            />
            <text
              x={470}
              y={scale(line.price) + 5}
              fill={line.color}
              fontSize={15}
              fontWeight={700}
            >
              {line.label}
            </text>
          </g>
        ))}
        <text x={60} y={36} fill={C.ink} fontSize={17} fontWeight={800}>
          R:R {rr.toFixed(2)}
        </text>
        <text x={200} y={36} fill={C.muted} fontSize={15}>
          1R = {risk.toFixed(2)}
        </text>
        <text x={350} y={36} fill={C.warn} fontSize={15} fontWeight={700}>
          {t('academy.sizeFor', {
            pct: riskPercent,
            balance: balance.toLocaleString(),
            units: units.toFixed(2),
          })}
        </text>
      </svg>
    </WidgetShell>
  );
}

// ---------------------------------------------------------------------------
// Candle builder: O/H/L/C sliders morph a candle; replay shows compression.
// ---------------------------------------------------------------------------

export function CandleBuilder() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(40);
  const [close, setClose] = useState(70);
  const [high, setHigh] = useState(85);
  const [low, setLow] = useState(25);
  const [phase, setPhase] = useState(0); // 0..1 replay progress, 1 = candle shown
  const raf = useRef<number | null>(null);

  const hi = Math.max(high, open, close);
  const lo = Math.min(low, open, close);
  const bullish = close >= open;
  const y = (v: number) => 340 - (v / 100) * 300;

  const path = useMemo(() => {
    const points = [
      open,
      open * 0.9 + lo * 0.1,
      lo,
      (lo + hi) / 2,
      hi,
      hi * 0.85 + close * 0.15,
      close,
    ];
    return points.map((v, i) => `${80 + i * 60},${y(v)}`).join(' ');
  }, [open, close, hi, lo]);

  function replay() {
    if (reducedMotion()) {
      setPhase(1);
      return;
    }
    setPhase(0);
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / 1800, 1);
      setPhase(p);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }
  useEffect(() => {
    // Frame-aligned start keeps the initial state write out of the render
    // commit, so the mount never triggers a cascading synchronous render.
    const start = requestAnimationFrame(replay);
    return () => {
      cancelAnimationFrame(start);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  const pathLen = 500;
  return (
    <WidgetShell
      title={t('academy.candleBuilderTitle')}
      controls={
        <>
          <Slider label={t('academy.wOpen')} value={open} min={10} max={90} onChange={setOpen} />
          <Slider label={t('academy.wClose')} value={close} min={10} max={90} onChange={setClose} />
          <Slider label={t('academy.vHigh')} value={high} min={10} max={95} onChange={setHigh} />
          <Slider label={t('academy.vLow')} value={low} min={5} max={90} onChange={setLow} />
        </>
      }
    >
      <svg
        viewBox="0 0 720 380"
        role="img"
        aria-label={t('academy.candleBuilder')}
        className="w-full"
      >
        <rect width="720" height="380" rx={12} fill={C.bg} />
        <polyline
          points={path}
          fill="none"
          stroke={C.accent}
          strokeWidth={3}
          strokeDasharray={pathLen}
          strokeDashoffset={pathLen * (1 - Math.min(phase * 1.4, 1))}
          opacity={phase < 1 ? 1 : 0.25}
        />
        <g opacity={phase >= 0.7 ? (phase - 0.7) / 0.3 : 0}>
          <line
            x1={560}
            y1={y(hi)}
            x2={560}
            y2={y(lo)}
            stroke={bullish ? C.up : C.down}
            strokeWidth={6}
            strokeLinecap="round"
          />
          <rect
            x={530}
            y={y(Math.max(open, close))}
            width={60}
            height={Math.max(6, Math.abs(y(open) - y(close)))}
            rx={8}
            fill={bullish ? C.up : C.down}
          />
        </g>
        <text x={80} y={36} fill={C.muted} fontSize={14}>
          {t('academy.pathHoldsTrades')}
        </text>
      </svg>
      <button
        type="button"
        className="mt-3 rounded-lg border border-[rgba(141,183,255,0.4)] px-3 py-1.5 text-sm text-[#bcd6ff] hover:bg-[rgba(74,134,255,0.18)]"
        onClick={replay}
      >
        {t('academy.replayCompression')}
      </button>
    </WidgetShell>
  );
}

// ---------------------------------------------------------------------------
// Indicator playground: period sliders over a synthetic series.
// ---------------------------------------------------------------------------

function syntheticCloses(n = 90, seed = 7): number[] {
  let v = 100;
  let s = seed;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    s = (s * 9301 + 49297) % 233280;
    const rnd = s / 233280 - 0.5;
    v = Math.max(40, v * (1 + rnd * 0.04 + Math.sin(i / 9) * 0.004));
    out.push(v);
  }
  return out;
}

export function IndicatorPlayground({ params }: { params: Record<string, unknown> }) {
  const { t } = useTranslation();
  const indicator = String(params.indicator ?? 'ema');
  const closes = useMemo(() => syntheticCloses(), []);
  const [period, setPeriod] = useState(indicator === 'rsi' ? 14 : 21);

  const series = useMemo(() => {
    if (indicator === 'rsi') return relativeStrengthIndex(closes, period);
    return exponentialMovingAverage(closes, period);
  }, [closes, indicator, period]);

  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const px = (i: number) => 40 + (i / (closes.length - 1)) * 640;
  const py = (v: number) => 300 - ((v - min) / (max - min)) * 250;
  const pr = (v: number) => 300 - (v / 100) * 250;

  return (
    <WidgetShell
      title={t('academy.indicatorPlaygroundTitle', { indicator: indicator.toUpperCase() })}
      controls={
        <Slider
          label={t('academy.indPeriod', { ind: indicator.toUpperCase() })}
          value={period}
          min={2}
          max={50}
          onChange={setPeriod}
        />
      }
    >
      <svg
        viewBox="0 0 720 340"
        role="img"
        aria-label={t('academy.indicatorPlayground')}
        className="w-full"
      >
        <rect width="720" height="340" rx={12} fill={C.bg} />
        {indicator === 'rsi' ? (
          <>
            <line
              x1={40}
              y1={pr(70)}
              x2={680}
              y2={pr(70)}
              stroke={C.down}
              strokeDasharray="6 6"
              opacity={0.5}
            />
            <line
              x1={40}
              y1={pr(30)}
              x2={680}
              y2={pr(30)}
              stroke={C.up}
              strokeDasharray="6 6"
              opacity={0.5}
            />
            <polyline
              points={series.map((v, i) => `${px(i)},${pr(v)}`).join(' ')}
              fill="none"
              stroke={C.warn}
              strokeWidth={2.5}
            />
            <text x={44} y={pr(70) - 8} fill={C.down} fontSize={12}>
              70
            </text>
            <text x={44} y={pr(30) - 8} fill={C.up} fontSize={12}>
              30
            </text>
          </>
        ) : (
          <>
            <polyline
              points={closes.map((v, i) => `${px(i)},${py(v)}`).join(' ')}
              fill="none"
              stroke={C.muted}
              strokeWidth={1.5}
              opacity={0.7}
            />
            <polyline
              points={series.map((v, i) => `${px(i)},${py(v)}`).join(' ')}
              fill="none"
              stroke={C.accent}
              strokeWidth={3}
            />
          </>
        )}
        <text x={40} y={28} fill={C.muted} fontSize={13}>
          {indicator === 'rsi' ? t('academy.rsiCaption') : t('academy.emaCaption')}
        </text>
      </svg>
    </WidgetShell>
  );
}

// ---------------------------------------------------------------------------
// Auction simulator: market orders consume the book; price and cost respond.
// ---------------------------------------------------------------------------

const BOOK = [
  { price: 100.05, size: 5 },
  { price: 100.1, size: 8 },
  { price: 100.15, size: 12 },
  { price: 100.2, size: 20 },
  { price: 100.3, size: 30 },
];

export function AuctionSim() {
  const { t } = useTranslation();
  const [consumed, setConsumed] = useState(0);
  const orderSize = 10;
  const levels = BOOK.reduce<{ price: number; size: number; eaten: number }[]>((acc, level) => {
    const already = acc.reduce((sum, l) => sum + l.eaten, 0);
    const eaten = Math.min(level.size, Math.max(consumed - already, 0));
    acc.push({ ...level, eaten });
    return acc;
  }, []);
  const filledLevels = (() => {
    let need = consumed;
    let cost = 0;
    for (const level of BOOK) {
      const take = Math.min(level.size, need);
      cost += take * level.price;
      need -= take;
      if (need <= 0) break;
    }
    return consumed > 0 ? cost / consumed : 0;
  })();
  const eatenLevels = levels.filter((level) => level.eaten > 0);
  const lastPrice = eatenLevels.length ? eatenLevels[eatenLevels.length - 1].price : 100.0;

  return (
    <WidgetShell title={t('academy.auctionTitle')}>
      <svg
        viewBox="0 0 720 320"
        role="img"
        aria-label={t('academy.orderBookAuction')}
        className="w-full"
      >
        <rect width="720" height="320" rx={12} fill={C.bg} />
        {levels.map((level, i) => {
          const y = 60 + i * 48;
          const left = level.size - level.eaten;
          return (
            <g key={level.price}>
              <text x={50} y={y + 22} fill={C.ink} fontSize={15} fontWeight={700}>
                {level.price.toFixed(2)}
              </text>
              <rect
                x={140}
                y={y}
                width={left * 14}
                height={32}
                rx={6}
                fill={C.down}
                opacity={0.7}
              />
              {level.eaten > 0 ? (
                <rect
                  x={140 + left * 14}
                  y={y}
                  width={level.eaten * 14}
                  height={32}
                  rx={6}
                  fill={C.muted}
                  opacity={0.25}
                />
              ) : null}
              <text x={150 + level.size * 14} y={y + 22} fill={C.muted} fontSize={13}>
                {t('academy.unitsLeft', { left })}
                {level.eaten ? t('academy.eatenSuffix', { n: level.eaten }) : ''}
              </text>
            </g>
          );
        })}
        <text x={480} y={80} fill={C.ink} fontSize={15} fontWeight={700}>
          {t('academy.bought', { n: consumed })}
        </text>
        <text x={480} y={108} fill={C.warn} fontSize={14}>
          {t('academy.avgFill', { v: consumed ? filledLevels.toFixed(3) : '—' })}
        </text>
        <text x={480} y={136} fill={C.accent} fontSize={14}>
          {t('academy.lastPrice', { v: consumed ? lastPrice.toFixed(2) : '100.00' })}
        </text>
        <text x={480} y={164} fill={C.down} fontSize={14}>
          {t('academy.slippage', {
            v: consumed ? `${(((filledLevels - 100.05) / 100.05) * 100).toFixed(3)}%` : '—',
          })}
        </text>
      </svg>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="rounded-lg border border-[rgba(141,183,255,0.4)] px-3 py-1.5 text-sm text-[#bcd6ff] hover:bg-[rgba(74,134,255,0.18)]"
          onClick={() => setConsumed(Math.min(consumed + orderSize, 75))}
        >
          {t('academy.marketBuy', { n: orderSize })}
        </button>
        <button
          type="button"
          className="rounded-lg border border-[rgba(141,183,255,0.2)] px-3 py-1.5 text-sm text-[#94aed8] hover:bg-[rgba(141,183,255,0.1)]"
          onClick={() => setConsumed(0)}
        >
          {t('academy.resetBook')}
        </button>
      </div>
    </WidgetShell>
  );
}

// ---------------------------------------------------------------------------
// Payoff explorer: leverage slider vs ATR noise band.
// ---------------------------------------------------------------------------

export function PayoffExplorer({ params }: { params: Record<string, unknown> }) {
  const { t } = useTranslation();
  const atrPercent = Number(params.atrPercent ?? 3);
  const [leverage, setLeverage] = useState(5);
  const wipeout = 100 / leverage;
  const insideNoise = wipeout <= atrPercent;

  const x = (pct: number) => 60 + (pct / 25) * 600;
  return (
    <WidgetShell
      title={t('academy.leverageTitle')}
      controls={
        <Slider
          label={t('academy.leverage')}
          value={leverage}
          min={1}
          max={50}
          suffix="×"
          onChange={setLeverage}
        />
      }
    >
      <svg
        viewBox="0 0 720 230"
        role="img"
        aria-label={t('academy.leverageDistance')}
        className="w-full"
      >
        <rect width="720" height="230" rx={12} fill={C.bg} />
        <rect
          x={x(0)}
          y={90}
          width={x(atrPercent) - x(0)}
          height={50}
          fill={C.warn}
          opacity={0.25}
        />
        <text x={x(0) + 6} y={120} fill={C.warn} fontSize={13}>
          {t('academy.typicalRange', { pct: atrPercent })}
        </text>
        <line
          x1={x(Math.min(wipeout, 25))}
          y1={60}
          x2={x(Math.min(wipeout, 25))}
          y2={170}
          stroke={C.down}
          strokeWidth={4}
        />
        <text x={x(Math.min(wipeout, 25)) + 8} y={76} fill={C.down} fontSize={14} fontWeight={800}>
          {t('academy.wipeoutAt', { pct: wipeout.toFixed(1) })}
        </text>
        <line x1={x(0)} y1={170} x2={x(25)} y2={170} stroke={C.muted} strokeWidth={2} />
        {[0, 5, 10, 15, 20, 25].map((pct) => (
          <text key={pct} x={x(pct) - 8} y={195} fill={C.muted} fontSize={12}>
            {pct}%
          </text>
        ))}
        <text x={60} y={36} fill={insideNoise ? C.down : C.up} fontSize={15} fontWeight={800}>
          {insideNoise ? t('academy.liqInside') : t('academy.liqBeyond')}
        </text>
      </svg>
    </WidgetShell>
  );
}
