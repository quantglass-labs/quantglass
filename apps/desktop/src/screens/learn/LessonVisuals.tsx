// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Lesson visual registry (VIS-1). Lessons declare visuals as data; this
 * module maps each declared type to a vetted component. Content never
 * carries markup, so community lesson packs stay safe. The annotation
 * grammar (dashed leaders, bold label, muted sublabel) follows the visual
 * spec for candlestick annotations.
 */

import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';

import {
  AuctionSim,
  CandleBuilder,
  IndicatorPlayground,
  PayoffExplorer,
  RiskSandbox,
} from './InteractiveWidgets';
import { ConformalVisualizer, MonteCarloAnimator, RegimeScrubber } from './EngineExplorers';

export interface LessonVisual {
  type: string;
  title?: string;
  params?: Record<string, unknown>;
}

const PALETTE = {
  bg: '#0a1730',
  // Candle semantics — kept domain-accurate (green up / red down).
  up: '#14c784',
  upEdge: '#a7f3d0',
  down: '#f6465d',
  downEdge: '#fecaca',
  ink: '#f1f6ff',
  muted: '#94aed8',
  leader: '#5f7cae',
  // Premium blue accent for decorative elements (matches the flow diagrams).
  accent: '#6aa0ff',
  panelStroke: 'rgba(141, 183, 255, 0.3)',
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
      <defs>
        <linearGradient id="qgFrame" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#102246" />
          <stop offset="0.55" stopColor="#0a1730" />
          <stop offset="1" stopColor="#070e1c" />
        </linearGradient>
        <linearGradient id="qgBox" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(24, 42, 76, 0.92)" />
          <stop offset="1" stopColor="rgba(12, 22, 42, 0.82)" />
        </linearGradient>
        <linearGradient id="qgAcc" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#4a86ff" />
          <stop offset="1" stopColor="#9cc0ff" />
        </linearGradient>
        <filter id="qgGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <marker
          id="qgArrow"
          viewBox="0 0 10 10"
          refX={8}
          refY={5}
          markerWidth={7}
          markerHeight={7}
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#9cc0ff" />
        </marker>
      </defs>
      <rect
        width="100%"
        height="100%"
        rx={16}
        fill="url(#qgFrame)"
        stroke="rgba(120, 165, 255, 0.12)"
      />
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
  const { t } = useTranslation();
  const bullish = params.variant !== 'bearish';
  return (
    <Frame
      title={t('academy.candlestickAnatomy')}
      subtitle={t('academy.candleSummary')}
      viewBox="0 0 1000 480"
      label={t('academy.candlestickDiagram')}
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
        {t('academy.vBody')}
      </text>
      <Leader x1={420} y1={120} x2={620} label={t('academy.vHigh')} sub={t('academy.highSub')} />
      <Leader
        x1={480}
        y1={195}
        x2={620}
        label={bullish ? t('academy.wClose') : t('academy.wOpen')}
        sub={bullish ? t('academy.priceAtEnd') : t('academy.priceAtStart')}
      />
      <Leader
        x1={480}
        y1={330}
        x2={620}
        label={bullish ? t('academy.wOpen') : t('academy.wClose')}
        sub={bullish ? t('academy.priceAtStart') : t('academy.priceAtEnd')}
      />
      <Leader x1={420} y1={420} x2={620} label={t('academy.vLow')} sub={t('academy.lowSub')} />
      <Leader x1={420} y1={158} x2={250} label={t('academy.vWick')} sub={t('academy.wickSub')} />
    </Frame>
  );
}

function CandleComparison() {
  const { t } = useTranslation();
  return (
    <Frame
      title={t('academy.greenVsRed')}
      subtitle={t('academy.sameAnatomy')}
      viewBox="0 0 1000 430"
      label={t('academy.greenRedComparison')}
    >
      <CandleGlyph x={300} top={120} bodyTop={190} bodyBottom={330} bottom={380} bullish />
      <text x={300} y={415} textAnchor="middle" fill={PALETTE.up} fontSize={18} fontWeight={800}>
        {t('academy.closeGtOpen')}
      </text>
      <CandleGlyph x={700} top={120} bodyTop={190} bodyBottom={330} bottom={380} bullish={false} />
      <text x={700} y={415} textAnchor="middle" fill={PALETTE.down} fontSize={18} fontWeight={800}>
        {t('academy.closeLtOpen')}
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
            <rect
              x={260}
              y={y}
              width={w}
              height={36}
              rx={9}
              fill="url(#qgAcc)"
              filter="url(#qgGlow)"
            />
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
              rx={14}
              fill="url(#qgBox)"
              stroke={PALETTE.panelStroke}
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
              <text x={x + gap - 28} y={152} fill={PALETTE.accent} fontSize={22} fontWeight={900}>
                →
              </text>
            ) : null}
          </g>
        );
      })}
    </Frame>
  );
}

function Flowchart({ params }: { params: Record<string, unknown> }) {
  const steps = (params.steps as { text: string; yes?: string; no?: string }[]) ?? [];
  const height = 120 + steps.length * 96;
  return (
    <Frame
      title={String(params.heading ?? 'Decision Flow')}
      viewBox={`0 0 1000 ${height}`}
      label={`${String(params.heading ?? 'Decision flow')} flowchart`}
    >
      {steps.map((step, i) => {
        const y = 100 + i * 96;
        return (
          <g key={step.text}>
            <rect
              x={250}
              y={y}
              width={500}
              height={62}
              rx={14}
              fill="url(#qgBox)"
              stroke={PALETTE.panelStroke}
            />
            <text
              x={500}
              y={y + 28}
              textAnchor="middle"
              fill={PALETTE.ink}
              fontSize={16}
              fontWeight={700}
            >
              {step.text}
            </text>
            {step.yes ? (
              <text x={500} y={y + 50} textAnchor="middle" fill={PALETTE.muted} fontSize={12}>
                yes → {step.yes}
                {step.no ? `  ·  no → ${step.no}` : ''}
              </text>
            ) : null}
            {i < steps.length - 1 ? (
              <line
                x1={500}
                y1={y + 62}
                x2={500}
                y2={y + 96}
                stroke="url(#qgAcc)"
                strokeWidth={3}
                filter="url(#qgGlow)"
                markerEnd="url(#qgArrow)"
              />
            ) : null}
          </g>
        );
      })}
    </Frame>
  );
}

function LabeledInputs({ params }: { params: Record<string, unknown> }) {
  const inputs = (params.inputs as { label: string; note?: string }[]) ?? [];
  const hub = String(params.hub ?? 'Output');
  const height = Math.max(360, 140 + inputs.length * 64);
  const cy = height / 2 + 20;
  return (
    <Frame
      title={String(params.heading ?? 'Inputs')}
      viewBox={`0 0 1000 ${height}`}
      label={`${String(params.heading ?? 'Inputs')} diagram`}
    >
      {inputs.map((input, i) => {
        const y = 110 + i * 64;
        return (
          <g key={input.label}>
            <rect
              x={50}
              y={y}
              width={300}
              height={48}
              rx={12}
              fill="url(#qgBox)"
              stroke={PALETTE.panelStroke}
            />
            <text
              x={200}
              y={y + 22}
              textAnchor="middle"
              fill={PALETTE.ink}
              fontSize={14}
              fontWeight={700}
            >
              {input.label}
            </text>
            {input.note ? (
              <text x={200} y={y + 40} textAnchor="middle" fill={PALETTE.muted} fontSize={11}>
                {input.note}
              </text>
            ) : null}
            <line
              x1={350}
              y1={y + 24}
              x2={620}
              y2={cy}
              stroke={PALETTE.leader}
              strokeWidth={2}
              opacity={0.7}
            />
          </g>
        );
      })}
      <circle
        cx={700}
        cy={cy}
        r={84}
        fill="url(#qgAcc)"
        opacity={0.18}
        stroke={PALETTE.accent}
        strokeWidth={2.5}
      />
      <text
        x={700}
        y={cy + 6}
        textAnchor="middle"
        fill={PALETTE.ink}
        fontSize={18}
        fontWeight={800}
      >
        {hub}
      </text>
    </Frame>
  );
}

const REGISTRY: Record<string, (props: { params: Record<string, unknown> }) => JSX.Element> = {
  candle_anatomy: CandleAnatomy,
  candle_comparison: () => <CandleComparison />,
  magnitude_bars: MagnitudeBars,
  process_steps: ProcessSteps,
  flowchart: Flowchart,
  labeled_inputs: LabeledInputs,
  risk_sandbox: RiskSandbox,
  candle_builder: () => <CandleBuilder />,
  indicator_playground: IndicatorPlayground,
  auction_sim: () => <AuctionSim />,
  payoff_explorer: PayoffExplorer,
  regime_scrubber: RegimeScrubber,
  monte_carlo: MonteCarloAnimator,
  conformal_visualizer: ConformalVisualizer,
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
