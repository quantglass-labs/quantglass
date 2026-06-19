// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  BadgeCheck,
  Coins,
  Database,
  Dices,
  FlaskConical,
  Gauge,
  GitBranch,
  GraduationCap,
  type LucideIcon,
  ShieldCheck,
  Target,
  TrendingUp,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { FlowRail, type RailItem } from './FlowRail';

/**
 * The honest-backtesting pipeline as a premium rail: stored candles → train/test
 * split → cost stress → Monte Carlo → bias gates → honest result.
 */
export function BacktestPipelineDiagram() {
  const { t } = useTranslation();
  const items: RailItem[] = [
    { id: 'data', title: t('backtest.pipeline.data'), Icon: Database },
    { id: 'split', title: t('backtest.pipeline.split'), Icon: GitBranch },
    { id: 'cost', title: t('backtest.pipeline.cost'), Icon: Coins },
    { id: 'montecarlo', title: t('backtest.pipeline.montecarlo'), Icon: Dices },
    { id: 'gates', title: t('backtest.pipeline.gates'), Icon: ShieldCheck },
    { id: 'result', title: t('backtest.pipeline.result'), Icon: BadgeCheck, accent: true },
  ];
  return <FlowRail items={items} ariaLabel={t('backtest.pipeline.title')} />;
}

export type TierMapTier = {
  id: string;
  title: string;
  completed: number;
  total: number;
  unlocked: boolean;
};

function tierItems(tiers: TierMapTier[], Icon: LucideIcon): RailItem[] {
  return tiers.map((tier) => ({
    id: tier.id,
    title: tier.title,
    sub: `${tier.completed}/${tier.total}`,
    Icon,
    locked: !tier.unlocked,
    accent: tier.total > 0 && tier.completed >= tier.total,
  }));
}

/** Academy tiers as a live progression rail (progress + lock state). */
export function LearnTierMapDiagram({ tiers }: { tiers: TierMapTier[] }) {
  const { t } = useTranslation();
  return <FlowRail items={tierItems(tiers, GraduationCap)} ariaLabel={t('learn.tierMap.title')} />;
}

/** Missions completed per tier as a live progression rail. */
export function MissionsTierDiagram({ tiers }: { tiers: TierMapTier[] }) {
  const { t } = useTranslation();
  return <FlowRail items={tierItems(tiers, Target)} ariaLabel={t('missions.tierMap.title')} />;
}

/**
 * The per-signal confidence build, bound to the signal's own `confidence_basis`:
 * Backtest → Expectancy → Out-of-sample → Confidence.
 */
export function EvidencePipelineDiagram({
  winrate,
  expectancyR,
  sampleSize,
  outOfSampleValidated,
  confidence,
}: {
  winrate: number;
  expectancyR: number;
  sampleSize: number;
  outOfSampleValidated: boolean;
  confidence: number;
}) {
  const { t } = useTranslation();
  const items: RailItem[] = [
    {
      id: 'backtest',
      title: t('signalDetail.evidence.backtest'),
      sub: `${Math.round(winrate * 100)}% · ${sampleSize}`,
      Icon: FlaskConical,
    },
    {
      id: 'expectancy',
      title: t('signalDetail.evidence.expectancy'),
      sub: `${expectancyR.toFixed(2)}R`,
      Icon: TrendingUp,
    },
    {
      id: 'oos',
      title: t('signalDetail.evidence.oos'),
      sub: outOfSampleValidated ? '✓' : '—',
      Icon: ShieldCheck,
      locked: !outOfSampleValidated,
    },
    {
      id: 'confidence',
      title: t('signalDetail.evidence.confidence'),
      sub: `${Math.round(confidence)}`,
      Icon: Gauge,
      accent: true,
    },
  ];
  return <FlowRail items={items} ariaLabel={t('signalDetail.evidence.title')} />;
}
