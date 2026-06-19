// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';

import type { Edge } from '@xyflow/react';
import type { QgNode } from './FlowCanvas';

// React Flow (and its CSS) only load when a diagram actually renders.
const FlowCanvas = lazy(() => import('./FlowCanvas'));

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

function DiagramFallback({ heightClass = 'h-[360px]' }: { heightClass?: string }) {
  return (
    <div className={`${heightClass} w-full animate-pulse rounded-2xl bg-panel/60`} aria-hidden />
  );
}

/**
 * The QuantGlass feedback loop as an animated, clickable diagram:
 * Signals → Backtest → Paper → Journal → Review → Constitution → ↻.
 * Node labels reuse the already-translated `nav.*` / constitution keys.
 */
export function FeedbackLoopDiagram({ onNavigate }: { onNavigate: (route: string) => void }) {
  const { t } = useTranslation();

  const nodes: QgNode[] = [
    {
      id: 'signals',
      type: 'qg',
      position: { x: 0, y: 0 },
      data: {
        label: t('nav.signals'),
        route: '/signals',
        targetPos: 'bottom',
        sourcePos: 'right',
        tone: 'accent',
      },
    },
    {
      id: 'backtest',
      type: 'qg',
      position: { x: 210, y: 0 },
      data: { label: t('nav.backtest'), route: '/backtest', targetPos: 'left', sourcePos: 'right' },
    },
    {
      id: 'paper',
      type: 'qg',
      position: { x: 420, y: 0 },
      data: {
        label: t('nav.portfolio'),
        route: '/portfolio',
        targetPos: 'left',
        sourcePos: 'bottom',
      },
    },
    {
      id: 'journal',
      type: 'qg',
      position: { x: 420, y: 150 },
      data: { label: t('nav.journal'), route: '/journal', targetPos: 'top', sourcePos: 'left' },
    },
    {
      id: 'review',
      type: 'qg',
      position: { x: 210, y: 150 },
      data: { label: t('nav.review'), route: '/review', targetPos: 'right', sourcePos: 'left' },
    },
    {
      id: 'constitution',
      type: 'qg',
      position: { x: 0, y: 150 },
      data: {
        label: t('review.constitution.title'),
        route: '/review',
        targetPos: 'right',
        sourcePos: 'top',
      },
    },
  ];

  const edges: Edge[] = [
    { id: 'e-signals-backtest', source: 'signals', target: 'backtest' },
    { id: 'e-backtest-paper', source: 'backtest', target: 'paper' },
    { id: 'e-paper-journal', source: 'paper', target: 'journal' },
    { id: 'e-journal-review', source: 'journal', target: 'review' },
    { id: 'e-review-constitution', source: 'review', target: 'constitution' },
    { id: 'e-constitution-signals', source: 'constitution', target: 'signals' },
  ];

  return (
    <Suspense fallback={<DiagramFallback />}>
      <FlowCanvas
        nodes={nodes}
        edges={edges}
        onNodeSelect={onNavigate}
        reducedMotion={prefersReducedMotion()}
        ariaLabel={t('howItWorks.title')}
      />
    </Suspense>
  );
}

/**
 * The honest-backtesting pipeline as an illustrative (non-clickable) diagram:
 * stored candles → train/test split → cost stress → Monte Carlo → bias gates →
 * honest result.
 */
export function BacktestPipelineDiagram() {
  const { t } = useTranslation();

  const steps: Array<{ id: string; label: string; tone?: 'accent' }> = [
    { id: 'data', label: t('backtest.pipeline.data') },
    { id: 'split', label: t('backtest.pipeline.split') },
    { id: 'cost', label: t('backtest.pipeline.cost') },
    { id: 'montecarlo', label: t('backtest.pipeline.montecarlo') },
    { id: 'gates', label: t('backtest.pipeline.gates') },
    { id: 'result', label: t('backtest.pipeline.result'), tone: 'accent' },
  ];

  const nodes: QgNode[] = steps.map((step, index) => ({
    id: step.id,
    type: 'qg',
    position: { x: index * 175, y: 0 },
    data: { label: step.label, targetPos: 'left', sourcePos: 'right', tone: step.tone },
  }));

  const edges: Edge[] = steps.slice(1).map((step, index) => ({
    id: `e-${steps[index].id}-${step.id}`,
    source: steps[index].id,
    target: step.id,
  }));

  return (
    <Suspense fallback={<DiagramFallback heightClass="h-[180px]" />}>
      <FlowCanvas
        nodes={nodes}
        edges={edges}
        reducedMotion={prefersReducedMotion()}
        ariaLabel={t('backtest.pipeline.title')}
        heightClass="h-[180px]"
      />
    </Suspense>
  );
}
