// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Lesson visual registry (VIS-1). Lessons declare visuals as data; this
 * module maps each declared type to a vetted component. Content never
 * carries markup, so community lesson packs stay safe. The annotation
 * grammar (dashed leaders, bold label, muted sublabel) follows the visual
 * spec in docs/reading_candlestick_tutorial.html.
 */

import type { JSX } from 'react';

export interface LessonVisual {
  type: string;
  title?: string;
  params?: Record<string, unknown>;
}

const PALETTE = {
  bg: '#07111f',
  up: '#14c784',
  upEdge: '#a7f3d0',
  down: '#f6465d',
  downEdge: '#fecaca',
  ink: '#f8fafc',
  muted: '#9fb0c7',
  leader: '#506684',
};

function Leader({
  x1,
  y1,
  x2,
  label,
  sub,
}: {
  x1: number;
  y1: number;
  x2: number;
  label: string;
  sub?: string;
}) {
  return (
    <g>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y1}
        stroke={PALETTE.leader}
        strokeWidth={2}
        strokeDasharray="7 7"
      />
      <text x={x2 + 14} y={y1 + 6} fill={PALETTE.ink} fontSize={19} fontWeight={700}>
        {label}
      </text>
      {sub ? (
        <text x={x2 + 14} y={y1 + 30} fill={PALETTE.muted} fontSize={13}>
          {sub}
        </text>
      ) : null}
    </g>
  );
}

function Frame({
  title,
  subtitle,
  viewBox,
  label,
  children,
}: {
  title: string;
  subtitle?: string;
  viewBox: string;
  label: string;
  children: React.ReactNode;
}) {
  const [, , w] = viewBox.split(' ').map(Number);
  return (
    <svg viewBox={viewBox} role="img" aria-label={label} className="w-full rounded-xl">
      <rect width="100%" height="100%" rx={14} fill={PALETTE.bg} />
      <text x={w / 2} y={44} textAnchor="middle" fill={PALETTE.ink} fontSize={26} fontWeight={800}>
        {title}
      </text>
      {subtitle ? (
        <text x={w / 2} y={74} textAnchor="middle" fill={PALETTE.muted} fontSize={15}>
          {subtitle}
        </text>
      ) : null}
      {children}
    </svg>
  );
}

function CandleGlyph({
  x,
  top,
  bodyTop,
  bodyBottom,
  bottom,
  bullish,
  width = 90,
}: {
  x: number;
  top: number;
  bodyTop: number;
  bodyBottom: number;
  bottom: number;
  bullish: boolean;
  width?: number;
}) {
  const fill = bullish ? PALETTE.up : PALETTE.down;
  const edge = bullish ? PALETTE.upEdge : PALETTE.downEdge;
  return (
    <g>
      <line
        x1={x}
        y1={top}
        x2={x}
        y2={bottom}
        stroke={fill}
        strokeWidth={7}
        strokeLinecap="round"
      />
      <rect
        x={x - width / 2}
        y={bodyTop}
        width={width}
        height={Math.max(6, bodyBottom - bodyTop)}
        rx={10}
        fill={fill}
        stroke={edge}
        strokeWidth={2.5}
      />
    </g>
  );
}

function CandleAnatomy({ params }: { params: Record<string, unknown> }) {
  const bullish = params.variant !== 'bearish';
  return (
    <Frame
      title="Candlestick Anatomy"
      subtitle="One candle summarizes open, high, low, and close."
      viewBox="0 0 1000 480"
      label="Candlestick anatomy diagram"
    >
      <CandleGlyph
        x={420}
        top={120}
        bodyTop={195}
        bodyBottom={330}
        bottom={420}
        bullish={bullish}
        width={120}
      />
      <text x={420} y={272} textAnchor="middle" fill={PALETTE.bg} fontSize={20} fontWeight={900}>
        BODY
      </text>
      <Leader x1={420} y1={120} x2={620} label="High" sub="Highest traded price" />
      <Leader
        x1={480}
        y1={195}
        x2={620}
        label={bullish ? 'Close' : 'Open'}
        sub={bullish ? 'Price at the end' : 'Price at the start'}
      />
      <Leader
        x1={480}
        y1={330}
        x2={620}
        label={bullish ? 'Open' : 'Close'}
        sub={bullish ? 'Price at the start' : 'Price at the end'}
      />
      <Leader x1={420} y1={420} x2={620} label="Low" sub="Lowest traded price" />
      <Leader x1={420} y1={158} x2={250} label="Wick" sub="Visited, then rejected" />
    </Frame>
  );
}

function CandleComparison() {
  return (
    <Frame
      title="Green vs Red"
      subtitle="Same anatomy — opposite battle outcome."
      viewBox="0 0 1000 430"
      label="Green versus red candle comparison"
    >
      <CandleGlyph x={300} top={120} bodyTop={190} bodyBottom={330} bottom={380} bullish />
      <text x={300} y={415} textAnchor="middle" fill={PALETTE.up} fontSize={18} fontWeight={800}>
        Close &gt; Open — buyers won
      </text>
      <CandleGlyph x={700} top={120} bodyTop={190} bodyBottom={330} bottom={380} bullish={false} />
      <text x={700} y={415} textAnchor="middle" fill={PALETTE.down} fontSize={18} fontWeight={800}>
        Close &lt; Open — sellers won
      </text>
    </Frame>
  );
}

function MagnitudeBars({ params }: { params: Record<string, unknown> }) {
  const items = (params.items as { label: string; value: number; note?: string }[]) ?? [];
  const max = Math.max(...items.map((item) => item.value), 1);
  const rowH = 64;
  const height = 110 + items.length * rowH;
  return (
    <Frame
      title={String(params.heading ?? 'Magnitude')}
      subtitle={params.subtitle ? String(params.subtitle) : undefined}
      viewBox={`0 0 1000 ${height}`}
      label={`${String(params.heading ?? 'Magnitude')} comparison`}
    >
      {items.map((item, i) => {
        const y = 110 + i * rowH;
        const w = Math.max(24, (item.value / max) * 560);
        return (
          <g key={item.label}>
            <text x={40} y={y + 26} fill={PALETTE.ink} fontSize={17} fontWeight={700}>
              {item.label}
            </text>
            <rect x={260} y={y} width={w} height={36} rx={8} fill={PALETTE.up} opacity={0.85} />
            <text x={260 + w + 12} y={y + 25} fill={PALETTE.muted} fontSize={15}>
              {item.note ?? item.value}
            </text>
          </g>
        );
      })}
    </Frame>
  );
}

function ProcessSteps({ params }: { params: Record<string, unknown> }) {
  const steps = (params.steps as string[]) ?? [];
  const w = 1000;
  const gap = (w - 120) / Math.max(steps.length, 1);
  return (
    <Frame
      title={String(params.heading ?? 'Process')}
      viewBox="0 0 1000 240"
      label={`${String(params.heading ?? 'Process')} steps`}
    >
      {steps.map((step, i) => {
        const x = 60 + i * gap;
        return (
          <g key={step}>
            <rect
              x={x}
              y={110}
              width={gap - 40}
              height={70}
              rx={12}
              fill="#0e2238"
              stroke={PALETTE.leader}
            />
            <text
              x={x + (gap - 40) / 2}
              y={152}
              textAnchor="middle"
              fill={PALETTE.ink}
              fontSize={15}
              fontWeight={700}
            >
              {step}
            </text>
            {i < steps.length - 1 ? (
              <text x={x + gap - 28} y={152} fill={PALETTE.up} fontSize={22} fontWeight={900}>
                →
              </text>
            ) : null}
          </g>
        );
      })}
    </Frame>
  );
}

const REGISTRY: Record<string, (props: { params: Record<string, unknown> }) => JSX.Element> = {
  candle_anatomy: CandleAnatomy,
  candle_comparison: () => <CandleComparison />,
  magnitude_bars: MagnitudeBars,
  process_steps: ProcessSteps,
};

export function LessonVisuals({ visuals }: { visuals?: LessonVisual[] }) {
  if (!visuals?.length) return null;
  return (
    <div className="my-6 space-y-5">
      {visuals.map((visual, i) => {
        const Component = REGISTRY[visual.type];
        if (!Component) return null;
        return (
          <figure key={`${visual.type}-${i}`}>
            <Component params={visual.params ?? {}} />
            {visual.title ? (
              <figcaption className="mt-2 text-center text-xs text-zinc-500">
                {visual.title}
              </figcaption>
            ) : null}
          </figure>
        );
      })}
    </div>
  );
}
