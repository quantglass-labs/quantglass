// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Missions: a catalog of 100+ behavioral certifications, basic to
 * sophisticated for every level, evaluated over the user's own activity.
 * Community packs contribute more through the extension SDK. Replay
 * missions (scenario episodes) live below the catalog.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import {
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Crosshair,
  PlayCircle,
  Target,
} from 'lucide-react';

import { AiInsight } from '../components/aiInsight';
import { BackendStatusNotice } from '../components/backendGate';
import { MissionsTierDiagram } from '../components/flow/FlowDiagram';
import { CountUp, FadeIn } from '../components/motion';
import { MetricTile } from '../components/surface';
import { backendClient } from '../lib/backend';
import { DailyBriefing } from './missions/DailyBriefing';
import { DecisionDrill } from './missions/DecisionDrill';
import { ScenarioPlayer } from './missions/ScenarioPlayer';
import type {
  BackendStatus,
  DailyBriefing as DailyBriefingData,
  MissionRecord,
  ScenarioDetail,
  ScenarioSummary,
} from '../types';

// Order + `missions.categories.<key>` subkey for each mission category.
const CATEGORY_META: Record<string, { key: string; order: number }> = {
  'risk-discipline': { key: 'riskDiscipline', order: 1 },
  'process-quality': { key: 'processQuality', order: 2 },
  'loss-acceptance': { key: 'lossAcceptance', order: 3 },
  'tilt-control': { key: 'tiltControl', order: 4 },
  journaling: { key: 'journaling', order: 5 },
  selectivity: { key: 'selectivity', order: 6 },
  'outcome-integrity': { key: 'outcomeIntegrity', order: 7 },
  'replay-mastery': { key: 'replayMastery', order: 8 },
  'academy-scholar': { key: 'academyScholar', order: 9 },
  consistency: { key: 'consistency', order: 10 },
  constitution: { key: 'constitution', order: 11 },
  capstone: { key: 'capstone', order: 12 },
};

const LEVELS = ['novice', 'intermediate', 'advanced', 'expert'] as const;

function ObjectiveList({
  mission,
  onRunDrill,
}: {
  mission: MissionRecord;
  onRunDrill: (category: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <ul className="mt-3 space-y-1.5">
      {mission.criteria.map((criterion) => (
        <li key={criterion.label} className="flex items-center gap-2 text-sm">
          {criterion.met ? (
            <CheckCircle2 size={15} className="shrink-0 text-buy" />
          ) : (
            <Circle size={15} className="shrink-0 text-muted/70" />
          )}
          <span className={criterion.met ? 'text-ink' : 'text-muted'}>{criterion.label}</span>
          <span className="ml-auto shrink-0 text-xs text-muted/70">
            {criterion.current} / {criterion.target}
          </span>
          {!criterion.met && criterion.drill ? (
            <button
              type="button"
              onClick={() => onRunDrill(criterion.drill as string)}
              className="flex shrink-0 items-center gap-0.5 rounded-full border border-buy/40 px-2 py-0.5 text-[11px] text-buy transition-colors hover:bg-buy/15"
            >
              {t('missions.card.runDrill')} <ArrowUpRight size={11} />
            </button>
          ) : !criterion.met && criterion.action ? (
            <Link
              to={criterion.action.route}
              title={criterion.action.cta}
              className="flex shrink-0 items-center gap-0.5 rounded-full border border-accent/40 px-2 py-0.5 text-[11px] text-accent transition-colors hover:bg-accent/15"
            >
              {t('missions.card.go')} <ArrowUpRight size={11} />
            </Link>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function ActiveMissionCard({
  mission,
  onAbandon,
  onRunDrill,
}: {
  mission: MissionRecord;
  onAbandon: (id: string) => void;
  onRunDrill: (category: string) => void;
}) {
  const { t } = useTranslation();
  const met = mission.criteria.filter((criterion) => criterion.met).length;
  const next = mission.criteria.find((criterion) => !criterion.met);
  return (
    <div className="rounded-xl border border-accent/40 bg-accent/10 p-4">
      <div className="flex items-center gap-2">
        <Crosshair size={15} className="shrink-0 text-accent" />
        <p className="font-semibold text-ink">{mission.title}</p>
        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted">
          {mission.level}
        </span>
        <button
          type="button"
          onClick={() => onAbandon(mission.id)}
          className="ml-auto shrink-0 text-[11px] text-muted hover:text-ink"
        >
          {t('missions.card.standDown')}
        </button>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full bg-accentStrong"
          style={{ width: `${(100 * met) / Math.max(1, mission.criteria.length)}%` }}
        />
      </div>
      <p className="mt-1 text-[11px] text-muted">
        {t('missions.card.objectivesComplete', { met, total: mission.criteria.length })}
      </p>
      {next ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-2">
          <span className="text-xs uppercase tracking-wider text-accent/80">
            {t('missions.card.next')}
          </span>
          <span className="min-w-0 truncate text-sm text-ink">{next.label}</span>
          {next.drill ? (
            <button
              type="button"
              onClick={() => onRunDrill(next.drill as string)}
              className="ml-auto flex shrink-0 items-center gap-1 rounded-lg border border-buy/50 px-2.5 py-1 text-xs font-semibold text-buy transition-colors hover:bg-buy/15"
            >
              {t('missions.card.runDecisionDrill')} <ArrowUpRight size={12} />
            </button>
          ) : next.action ? (
            <Link
              to={next.action.route}
              className="ml-auto flex shrink-0 items-center gap-1 rounded-lg border border-accent/50 px-2.5 py-1 text-xs font-semibold text-accent transition-colors hover:bg-accent/15"
            >
              {next.action.cta} <ArrowUpRight size={12} />
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MissionCard({
  mission,
  onAccept,
  onRunDrill,
  slotsFull,
}: {
  mission: MissionRecord;
  onAccept: (id: string) => void;
  onRunDrill: (category: string) => void;
  slotsFull: boolean;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const met = mission.criteria.filter((criterion) => criterion.met).length;

  return (
    <div
      className={`rounded-xl border ${
        mission.completed
          ? 'border-buy/40 bg-buy/10'
          : mission.active
            ? 'border-accent/40 bg-white/[0.03]'
            : 'border-border bg-white/[0.03]'
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start gap-3 p-4 text-left"
      >
        {expanded ? (
          <ChevronDown size={15} className="mt-1 shrink-0 text-muted" />
        ) : (
          <ChevronRight size={15} className="mt-1 shrink-0 text-muted" />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">
            {mission.title}
            <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted">
              {t(`missions.levels.${mission.level}`, { defaultValue: mission.level })}
            </span>
            {mission.active ? (
              <span className="ml-1.5 rounded-full border border-accent/40 px-2 py-0.5 text-[10px] text-accent">
                {t('missions.card.activeBadge')}
              </span>
            ) : null}
            {mission.source === 'community' ? (
              <span className="ml-1.5 rounded-full border border-watch/40 px-2 py-0.5 text-[10px] text-watch">
                {t('missions.card.communityBadge')}
              </span>
            ) : null}
          </p>
          {!expanded ? (
            <p className="mt-0.5 line-clamp-1 text-sm text-muted">{mission.description}</p>
          ) : null}
        </div>
        {mission.completed ? (
          <span className="shrink-0 rounded-full border border-buy/40 px-2.5 py-0.5 text-xs font-semibold text-buy">
            {t('missions.card.done')}
          </span>
        ) : (
          <span className="shrink-0 text-xs text-muted/70">
            {met}/{mission.criteria.length}
          </span>
        )}
      </button>
      {expanded ? (
        <div className="px-4 pb-4 pl-11">
          <p className="text-sm text-muted">{mission.description}</p>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-muted">
            {t('missions.card.objectives')}
          </p>
          <ObjectiveList mission={mission} onRunDrill={onRunDrill} />
          <div className="mt-3 flex items-center gap-3">
            {!mission.completed && !mission.active ? (
              <button
                type="button"
                disabled={slotsFull}
                onClick={() => onAccept(mission.id)}
                title={slotsFull ? t('missions.card.slotsFull') : ''}
                className="rounded-lg border border-accent/50 px-4 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t('missions.card.startMission')}
              </button>
            ) : null}
            {mission.lesson_links.length ? (
              <p className="text-xs text-muted">
                {t('missions.card.studyFirst')}{' '}
                {mission.lesson_links.map((lessonId, i) => (
                  <span key={lessonId}>
                    {i > 0 ? ' · ' : ''}
                    <Link to="/learn" className="text-accent hover:text-accent">
                      {lessonId}
                    </Link>
                  </span>
                ))}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function MissionsScreen({ backendStatus }: { backendStatus: BackendStatus }) {
  const { t } = useTranslation();
  const [missions, setMissions] = useState<MissionRecord[] | null>(null);
  const [briefing, setBriefing] = useState<DailyBriefingData | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioSummary[] | null>(null);
  const [activeScenario, setActiveScenario] = useState<ScenarioDetail | null>(null);
  const [activeDrill, setActiveDrill] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});

  const [maxActive, setMaxActive] = useState(3);

  useEffect(() => {
    if (backendStatus !== 'online') return;
    backendClient
      .getMissions()
      .then((response) => {
        setMissions(response.items);
        setMaxActive(response.max_active);
      })
      .catch(() => setError(t('missions.loadError')));
    backendClient
      .getDailyBriefing()
      .then(setBriefing)
      .catch(() => setBriefing(null));
    backendClient
      .getScenarios()
      .then((response) => setScenarios(response.items))
      .catch(() => setScenarios([]));
  }, [backendStatus, t]);

  const refreshMissions = () => {
    void backendClient.getMissions().then((response) => setMissions(response.items));
    void backendClient
      .getDailyBriefing()
      .then(setBriefing)
      .catch(() => undefined);
  };

  const handleAccept = (missionId: string) => {
    void backendClient.acceptMission(missionId).then(refreshMissions);
  };

  const handleAbandon = (missionId: string) => {
    void backendClient.abandonMission(missionId).then(refreshMissions);
  };

  const grouped = useMemo(() => {
    if (!missions) return null;
    const needle = query.trim().toLowerCase();
    const filtered = missions.filter((mission) => {
      if (levelFilter !== 'all' && mission.level !== levelFilter) return false;
      if (!needle) return true;
      return (
        mission.title.toLowerCase().includes(needle) ||
        mission.description.toLowerCase().includes(needle)
      );
    });
    const byCategory = new Map<string, MissionRecord[]>();
    for (const mission of filtered) {
      const list = byCategory.get(mission.category) ?? [];
      list.push(mission);
      byCategory.set(mission.category, list);
    }
    return [...byCategory.entries()].sort(
      ([a], [b]) => (CATEGORY_META[a]?.order ?? 99) - (CATEGORY_META[b]?.order ?? 99),
    );
  }, [missions, query, levelFilter]);

  const completedCount = missions?.filter((mission) => mission.completed).length ?? 0;
  const activeMissions = missions?.filter((mission) => mission.active && !mission.completed) ?? [];
  const slotsFull = activeMissions.length >= maxActive;
  const searching = query.trim().length > 0;

  const missionTiers = useMemo(() => {
    const order = ['novice', 'intermediate', 'advanced', 'expert'];
    return order
      .map((id) => {
        const inTier = (missions ?? []).filter((mission) => mission.level === id);
        return {
          id,
          title: t(`missions.levels.${id}`, { defaultValue: id }),
          completed: inTier.filter((mission) => mission.completed).length,
          total: inTier.length,
          unlocked: true,
        };
      })
      .filter((tier) => tier.total > 0);
  }, [missions, t]);

  const openScenario = (scenarioId: string) => {
    void backendClient.getScenario(scenarioId).then(setActiveScenario);
  };

  if (activeDrill) {
    return (
      <div className="mx-auto max-w-4xl">
        <DecisionDrill
          category={activeDrill}
          onExit={() => {
            setActiveDrill(null);
            refreshMissions();
          }}
        />
      </div>
    );
  }

  if (activeScenario) {
    return (
      <div className="mx-auto max-w-4xl">
        <ScenarioPlayer
          scenario={activeScenario}
          onExit={() => {
            setActiveScenario(null);
            void backendClient.getScenarios().then((response) => setScenarios(response.items));
          }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center gap-2">
        <Target size={20} className="text-accent" />
        <h1 className="text-lg font-semibold text-ink">{t('missions.title')}</h1>
        {missions ? (
          <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted">
            {t('missions.earnedBadge', { completed: completedCount, total: missions.length })}
          </span>
        ) : null}
        <span className="ml-auto text-xs text-muted/70">{t('missions.tagline')}</span>
      </div>

      {missions ? (
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <MetricTile
            label={t('missions.tiles.certificationsEarned')}
            hero
            helper={t('missions.tiles.certificationsEarnedHelper', { count: missions.length })}
          >
            <CountUp value={completedCount} format={(n) => String(Math.round(n))} />
          </MetricTile>
          <MetricTile
            label={t('missions.tiles.completion')}
            toneClass="text-buy"
            helper={t('missions.tiles.completionHelper')}
          >
            <CountUp
              value={missions.length ? (100 * completedCount) / missions.length : 0}
              format={(n) => `${Math.round(n)}%`}
            />
          </MetricTile>
          <MetricTile
            label={t('missions.tiles.activeMissions')}
            toneClass="text-watch"
            helper={t('missions.tiles.activeMissionsHelper', { count: maxActive })}
          >
            <CountUp value={activeMissions.length} format={(n) => String(Math.round(n))} />
          </MetricTile>
          <MetricTile
            label={t('missions.tiles.replaysPassed')}
            helper={t('missions.tiles.replaysPassedHelper')}
          >
            <CountUp
              value={scenarios?.filter((scenario) => scenario.passed).length ?? 0}
              format={(n) => String(Math.round(n))}
            />
          </MetricTile>
        </div>
      ) : null}

      {briefing ? (
        <DailyBriefing
          briefing={briefing}
          onRunDrill={setActiveDrill}
          onAccept={handleAccept}
          slotsFull={slotsFull}
        />
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder={t('missions.searchPlaceholder')}
          aria-label={t('missions.searchPlaceholder')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="w-56 rounded-lg border border-border bg-background/50 px-3 py-1.5 text-sm text-ink outline-none placeholder:text-muted/70 focus:border-accent/60"
        />
        {['all', ...LEVELS].map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => setLevelFilter(level)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              levelFilter === level
                ? 'border-accent/60 bg-accent/15 text-accent'
                : 'border-border text-muted hover:border-white/20'
            }`}
          >
            {t(`missions.levels.${level}`)}
          </button>
        ))}
      </div>

      {missions && missionTiers.length > 0 ? (
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            {t('missions.tierMap.title')}
          </p>
          <p className="mb-2 text-xs text-muted">{t('missions.tierMap.subtitle')}</p>
          <MissionsTierDiagram tiers={missionTiers} />
        </div>
      ) : null}

      {activeMissions.length ? (
        <>
          <h2 className="mt-6 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-accent">
            <Crosshair size={14} />
            {t('missions.activeHeading')}
            <span className="text-xs font-normal normal-case tracking-normal text-muted/70">
              {t('missions.slots', { active: activeMissions.length, max: maxActive })}
            </span>
          </h2>
          <div className="mt-3 space-y-3">
            {activeMissions.map((mission) => (
              <ActiveMissionCard
                key={mission.id}
                mission={mission}
                onAbandon={handleAbandon}
                onRunDrill={setActiveDrill}
              />
            ))}
          </div>
        </>
      ) : missions ? (
        <p className="mt-6 rounded-xl border border-dashed border-border bg-white/[0.02] p-4 text-sm text-muted">
          {t('missions.noActive')}
        </p>
      ) : null}

      <BackendStatusNotice status={backendStatus} />
      <AiInsight surface="missions" title={t('missions.aiTitle')} />
      {error ? (
        <p className="mt-6 rounded-xl border border-hold/30 bg-hold/10 p-4 text-sm text-hold">
          {error}
        </p>
      ) : null}
      {!missions && !error && backendStatus !== 'offline' ? (
        <div className="mt-6 space-y-3" aria-busy="true">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-24 animate-pulse rounded-xl bg-white/5" />
          ))}
        </div>
      ) : null}

      <div className="mt-5 space-y-4">
        {grouped?.length === 0 ? (
          <p className="rounded-xl border border-border bg-white/[0.03] p-4 text-sm text-muted">
            {t('missions.noMatch')}
          </p>
        ) : null}
        {grouped?.map(([category, categoryMissions]) => {
          const meta = CATEGORY_META[category];
          const done = categoryMissions.filter((mission) => mission.completed).length;
          const open = searching || (openCategories[category] ?? false);
          return (
            <div key={category}>
              <button
                type="button"
                onClick={() => setOpenCategories({ ...openCategories, [category]: !open })}
                className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left"
              >
                {open ? (
                  <ChevronDown size={15} className="text-muted" />
                ) : (
                  <ChevronRight size={15} className="text-muted" />
                )}
                <h2 className="text-sm font-semibold uppercase tracking-wider text-ink">
                  {meta ? t(`missions.categories.${meta.key}`) : category.replace(/-/g, ' ')}
                </h2>
                <span
                  className={`text-xs ${
                    done === categoryMissions.length ? 'text-buy' : 'text-muted/70'
                  }`}
                >
                  {done}/{categoryMissions.length}
                </span>
                <span className="ml-auto h-px flex-1 max-w-[40%] bg-white/10" />
              </button>
              {open ? (
                <div className="mt-2 space-y-2">
                  {categoryMissions.map((mission) => (
                    <MissionCard
                      key={mission.id}
                      mission={mission}
                      onAccept={handleAccept}
                      onRunDrill={setActiveDrill}
                      slotsFull={slotsFull}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {scenarios && scenarios.length > 0 ? (
        <>
          <h2 className="mt-10 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted">
            <PlayCircle size={15} className="text-accent" />
            {t('missions.replay.title')}
          </h2>
          <p className="mt-1 text-xs text-muted/70">{t('missions.replay.description')}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {scenarios.map((scenario, index) => (
              <FadeIn key={scenario.id} delayMs={Math.min(index, 8) * 50}>
                <button
                  type="button"
                  onClick={() => openScenario(scenario.id)}
                  className={`h-full w-full rounded-xl border p-5 text-left transition-colors hover:border-accent/50 ${
                    scenario.passed ? 'border-buy/40 bg-buy/10' : 'border-border bg-white/[0.03]'
                  }`}
                >
                  <p className="font-semibold text-ink">
                    {scenario.title}
                    <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted">
                      {t(`missions.levels.${scenario.level}`, { defaultValue: scenario.level })}
                    </span>
                  </p>
                  <p className="mt-1 line-clamp-3 text-sm text-muted">{scenario.description}</p>
                  <p className="mt-3 text-xs text-muted">
                    {t('missions.replay.decisions', {
                      count: scenario.checkpoints,
                      percent: scenario.pass_percent,
                    })}
                    {scenario.best_percent !== null ? (
                      <span
                        className={`ml-2 font-semibold ${
                          scenario.passed ? 'text-buy' : 'text-hold'
                        }`}
                      >
                        {t('missions.replay.best', { percent: scenario.best_percent })}
                      </span>
                    ) : null}
                  </p>
                </button>
              </FadeIn>
            ))}
          </div>
        </>
      ) : null}
      <p className="mt-6 text-xs text-muted/70">{t('missions.footer')}</p>
    </div>
  );
}
