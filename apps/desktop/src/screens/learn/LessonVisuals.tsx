// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Lesson visual registry (VIS-1). Lessons declare visuals as data; this
 * module maps each declared type to a vetted component. Content never carries
 * markup, so community lesson packs stay safe. Each visual is a bespoke,
 * premium SVG illustration that shares one visual language with the rest of the
 * app's diagrams (glass panels, glowing nodes, blue accents); candle colours
 * stay domain-accurate (green up / red down).
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
  up: '#14c784',
  upEdge: '#a7f3d0',
  down: '#f6465d',
  downEdge: '#fecaca',
  ink: '#f1f6ff',
  muted: '#94aed8',
  accent: '#9cc0ff',
  panelStroke: 'rgba(141, 183, 255, 0.35)',
};

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
    <svg viewBox={viewBox} role="img" aria-label={label} className="w-full rounded-2xl">
      <defs>
        <radialGradient id="qgFrame" cx="50%" cy="38%" r="80%">
          <stop offset="0" stopColor="#102246" />
          <stop offset="0.6" stopColor="#0a1730" />
          <stop offset="1" stopColor="#070e1c" />
        </radialGradient>
        <linearGradient id="qgBox" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(24, 42, 76, 0.95)" />
          <stop offset="1" stopColor="rgba(12, 22, 42, 0.85)" />
        </linearGradient>
        <linearGradient id="qgAcc" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#4a86ff" />
          <stop offset="1" stopColor="#9cc0ff" />
        </linearGradient>
        <linearGradient id="qgLink" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#4a86ff" stopOpacity="0.15" />
          <stop offset="1" stopColor="#9cc0ff" stopOpacity="0.9" />
        </linearGradient>
        <radialGradient id="qgCore" cx="50%" cy="40%" r="60%">
          <stop offset="0" stopColor="#6aa0ff" />
          <stop offset="1" stopColor="#0c1c3a" />
        </radialGradient>
        <filter id="qgGlow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2.6" result="b" />
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
        rx={18}
        fill="url(#qgFrame)"
        stroke="rgba(120, 165, 255, 0.12)"
      />
      <text x={w / 2} y={46} textAnchor="middle" fill={PALETTE.ink} fontSize={25} fontWeight={800}>
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

/** Reimagined: candle with a price axis, glowing OHLC markers, and side labels. */
function CandleAnatomy({ params }: { params: Record<string, unknown> }) {
  const { t } = useTranslation();
  const bullish = params.variant !== 'bearish';
  const x = 430;
  const levels = [
    { y: 120, label: t('academy.vHigh'), mx: x },
    { y: 195, label: bullish ? t('academy.wClose') : t('academy.wOpen'), mx: x + 60 },
    { y: 330, label: bullish ? t('academy.wOpen') : t('academy.wClose'), mx: x + 60 },
    { y: 420, label: t('academy.vLow'), mx: x },
  ];
  return (
    <Frame
      title={t('academy.candlestickAnatomy')}
      subtitle={t('academy.candleSummary')}
      viewBox="0 0 1000 480"
      label={t('academy.candlestickDiagram')}
    >
      {levels.map((lvl) => (
        <line
          key={lvl.label}
          x1={120}
          y1={lvl.y}
          x2={760}
          y2={lvl.y}
          stroke="rgba(141,183,255,0.18)"
          strokeDasharray="4 8"
        />
      ))}
      <CandleGlyph
        x={x}
        top={120}
        bodyTop={195}
        bodyBottom={330}
        bottom={420}
        bullish={bullish}
        width={120}
      />
      <text x={x} y={272} textAnchor="middle" fill="#06301f" fontSize={20} fontWeight={900}>
        {t('academy.vBody')}
      </text>
      {levels.map((lvl) => (
        <g key={`m-${lvl.label}`}>
          <circle cx={lvl.mx} cy={lvl.y} r={8} fill="#cfe6ff" filter="url(#qgGlow)" />
          <text x={775} y={lvl.y + 6} fill={PALETTE.ink} fontSize={18} fontWeight={700}>
            {lvl.label}
          </text>
        </g>
      ))}
      <text x={250} y={158} fill={PALETTE.muted} fontSize={13}>
        {t('academy.vWick')}
      </text>
    </Frame>
  );
}

/** Reimagined: same prices, two outcomes — green close>open vs red close<open. */
function CandleComparison() {
  const { t } = useTranslation();
  return (
    <Frame
      title={t('academy.greenVsRed')}
      subtitle={t('academy.sameAnatomy')}
      viewBox="0 0 1000 440"
      label={t('academy.greenRedComparison')}
    >
      {[
        { x: 300, bullish: true, caption: t('academy.closeGtOpen'), color: PALETTE.up },
        { x: 700, bullish: false, caption: t('academy.closeLtOpen'), color: PALETTE.down },
      ].map((c) => (
        <g key={c.x}>
          <CandleGlyph
            x={c.x}
            top={120}
            bodyTop={190}
            bodyBottom={330}
            bottom={380}
            bullish={c.bullish}
          />
          <circle
            cx={c.x + 70}
            cy={c.bullish ? 330 : 190}
            r={7}
            fill="#cfe6ff"
            filter="url(#qgGlow)"
          />
          <circle
            cx={c.x + 70}
            cy={c.bullish ? 190 : 330}
            r={7}
            fill="#cfe6ff"
            filter="url(#qgGlow)"
          />
          <text x={c.x + 86} y={c.bullish ? 335 : 195} fill={PALETTE.muted} fontSize={13}>
            {t('academy.wOpen')}
          </text>
          <text x={c.x + 86} y={c.bullish ? 195 : 335} fill={PALETTE.muted} fontSize={13}>
            {t('academy.wClose')}
          </text>
          <text x={c.x} y={420} textAnchor="middle" fill={c.color} fontSize={18} fontWeight={800}>
            {c.caption}
          </text>
        </g>
      ))}
    </Frame>
  );
}

/** Reimagined: gradient lollipop bars with end dots, value chips, and gridlines. */
function MagnitudeBars({ params }: { params: Record<string, unknown> }) {
  const items = (params.items as { label: string; value: number; note?: string }[]) ?? [];
  const max = Math.max(...items.map((item) => item.value), 1);
  const rowH = 56;
  const top = 124;
  const height = top + items.length * rowH + 6;
  const x0 = 250;
  const xMax = 520;
  return (
    <Frame
      title={String(params.heading ?? 'Magnitude')}
      subtitle={params.subtitle ? String(params.subtitle) : undefined}
      viewBox={`0 0 1000 ${height}`}
      label={`${String(params.heading ?? 'Magnitude')} comparison`}
    >
      {[0, 0.5, 1].map((g) => (
        <line
          key={g}
          x1={x0 + g * (xMax - x0)}
          y1={96}
          x2={x0 + g * (xMax - x0)}
          y2={height - 18}
          stroke="rgba(141,183,255,0.1)"
        />
      ))}
      {items.map((item, i) => {
        const cy = top + i * rowH;
        const len = Math.max(10, (item.value / max) * (xMax - x0));
        return (
          <g key={item.label}>
            <text x={50} y={cy + 5} fill={PALETTE.ink} fontSize={15} fontWeight={700}>
              {item.label}
            </text>
            <rect
              x={x0}
              y={cy - 8}
              width={len}
              height={16}
              rx={8}
              fill="url(#qgAcc)"
              filter="url(#qgGlow)"
            />
            <text x={x0 + len + 16} y={cy + 5} fill="#cfe0ff" fontSize={13.5} fontWeight={600}>
              {item.note ?? item.value}
            </text>
          </g>
        );
      })}
    </Frame>
  );
}

/** Reimagined: a glowing node timeline (numbered light-nodes on a progress line). */
function ProcessSteps({ params }: { params: Record<string, unknown> }) {
  const steps = (params.steps as string[]) ?? [];
  const n = Math.max(steps.length, 1);
  const x0 = 130;
  const x1 = 870;
  const cy = 132;
  const stepX = (i: number) => (n > 1 ? x0 + (i * (x1 - x0)) / (n - 1) : (x0 + x1) / 2);
  return (
    <Frame
      title={String(params.heading ?? 'Process')}
      viewBox="0 0 1000 240"
      label={`${String(params.heading ?? 'Process')} steps`}
    >
      <line x1={x0} y1={cy} x2={x1} y2={cy} stroke="rgba(141,183,255,0.2)" strokeWidth={3} />
      <line
        x1={x0}
        y1={cy}
        x2={x1}
        y2={cy}
        stroke="url(#qgLink)"
        strokeWidth={3}
        filter="url(#qgGlow)"
      />
      {steps.map((step, i) => {
        const x = stepX(i);
        const last = i === steps.length - 1;
        return (
          <g key={step}>
            <circle
              cx={x}
              cy={cy}
              r={last ? 28 : 25}
              fill={last ? 'url(#qgCore)' : 'url(#qgBox)'}
              stroke={PALETTE.accent}
              strokeWidth={2}
              filter="url(#qgGlow)"
            />
            <text x={x} y={cy + 6} textAnchor="middle" fill="#fff" fontSize={16} fontWeight={800}>
              {i + 1}
            </text>
            <text
              x={x}
              y={cy + 58}
              textAnchor="middle"
              fill={PALETTE.ink}
              fontSize={14}
              fontWeight={700}
            >
              {step}
            </text>
          </g>
        );
      })}
    </Frame>
  );
}

/** Reimagined: a branching decision spine — glowing decision cards, yes flows down, no branches off. */
function Flowchart({ params }: { params: Record<string, unknown> }) {
  const steps = (params.steps as { text: string; yes?: string; no?: string }[]) ?? [];
  const outcome = params.outcome ? String(params.outcome) : undefined;
  const n = steps.length;
  const cardH = 74;
  const gap = 42;
  const top = 92;
  const height = top + n * (cardH + gap) + (outcome ? 60 : 12);
  return (
    <Frame
      title={String(params.heading ?? 'Decision Flow')}
      viewBox={`0 0 1000 ${height}`}
      label={`${String(params.heading ?? 'Decision flow')} flowchart`}
    >
      {steps.map((step, i) => {
        const y = top + i * (cardH + gap);
        const lastDecision = i === n - 1;
        const accent = lastDecision && !outcome;
        const detail = [step.yes ? `yes → ${step.yes}` : null, step.no ? `no → ${step.no}` : null]
          .filter(Boolean)
          .join('  ·  ');
        return (
          <g key={step.text}>
            <rect
              x={270}
              y={y}
              width={460}
              height={cardH}
              rx={16}
              fill={accent ? 'rgba(74,134,255,0.18)' : 'url(#qgBox)'}
              stroke={accent ? '#6aa0ff' : PALETTE.panelStroke}
              strokeWidth={accent ? 2 : 1}
              filter="url(#qgGlow)"
            />
            <text
              x={500}
              y={detail ? y + 32 : y + cardH / 2 + 6}
              textAnchor="middle"
              fill={PALETTE.ink}
              fontSize={16}
              fontWeight={700}
            >
              {step.text}
            </text>
            {detail ? (
              <text x={500} y={y + 56} textAnchor="middle" fill={PALETTE.muted} fontSize={12.5}>
                {detail}
              </text>
            ) : null}
            {!lastDecision || outcome ? (
              <line
                x1={500}
                y1={y + cardH}
                x2={500}
                y2={y + cardH + gap}
                stroke="url(#qgAcc)"
                strokeWidth={3}
                filter="url(#qgGlow)"
                markerEnd="url(#qgArrow)"
              />
            ) : null}
          </g>
        );
      })}
      {outcome ? (
        <g>
          <rect
            x={320}
            y={top + n * (cardH + gap)}
            width={360}
            height={44}
            rx={14}
            fill="rgba(74,134,255,0.18)"
            stroke="#6aa0ff"
            strokeWidth={2}
            filter="url(#qgGlow)"
          />
          <text
            x={500}
            y={top + n * (cardH + gap) + 28}
            textAnchor="middle"
            fill="#eaf3ff"
            fontSize={15}
            fontWeight={800}
          >
            {outcome}
          </text>
        </g>
      ) : null}
    </Frame>
  );
}

/** Reimagined: a radial hub — inputs converge via glowing links into a glowing core. */
function LabeledInputs({ params }: { params: Record<string, unknown> }) {
  const inputs = (params.inputs as { label: string; note?: string }[]) ?? [];
  const hub = String(params.hub ?? 'Output');
  const top = 110;
  const gap = 80;
  const height = Math.max(360, top + inputs.length * gap + 30);
  const coreX = 720;
  const coreR = 70;
  const coreY = height / 2 + 16;
  return (
    <Frame
      title={String(params.heading ?? 'Inputs')}
      viewBox={`0 0 1000 ${height}`}
      label={`${String(params.heading ?? 'Inputs')} diagram`}
    >
      {inputs.map((input, i) => {
        const y = top + i * gap + 23;
        return (
          <path
            key={`l-${input.label}`}
            d={`M380 ${y} C 540 ${y}, 580 ${coreY}, ${coreX - coreR} ${coreY}`}
            stroke="url(#qgLink)"
            strokeWidth={2.5}
            fill="none"
            filter="url(#qgGlow)"
          />
        );
      })}
      {inputs.map((input, i) => {
        const y = top + i * gap;
        return (
          <g key={input.label}>
            <rect
              x={50}
              y={y}
              width={330}
              height={46}
              rx={13}
              fill="url(#qgBox)"
              stroke={PALETTE.panelStroke}
            />
            <text
              x={215}
              y={input.note ? y + 20 : y + 28}
              textAnchor="middle"
              fill={PALETTE.ink}
              fontSize={13.5}
              fontWeight={700}
            >
              {input.label}
            </text>
            {input.note ? (
              <text x={215} y={y + 37} textAnchor="middle" fill={PALETTE.muted} fontSize={11}>
                {input.note}
              </text>
            ) : null}
            <circle cx={380} cy={y + 23} r={5} fill="#9cc0ff" filter="url(#qgGlow)" />
          </g>
        );
      })}
      <circle cx={coreX} cy={coreY} r={coreR + 22} fill="none" stroke="rgba(141,183,255,0.22)" />
      <circle
        cx={coreX}
        cy={coreY}
        r={coreR}
        fill="url(#qgCore)"
        stroke="#9cc0ff"
        strokeWidth={2}
        filter="url(#qgGlow)"
      />
      <text x={coreX} y={coreY + 6} textAnchor="middle" fill="#fff" fontSize={18} fontWeight={800}>
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
              <figcaption className="mt-2 text-center text-xs text-muted">
                {visual.title}
              </figcaption>
            ) : null}
          </figure>
        );
      })}
    </div>
  );
}
