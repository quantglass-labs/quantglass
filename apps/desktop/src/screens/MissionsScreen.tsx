// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Missions: a catalog of 100+ behavioral certifications, basic to
 * sophisticated for every level, evaluated over the user's own activity.
 * Community packs contribute more through the extension SDK. Replay
 * missions (scenario episodes) live below the catalog.
 */

import { useEffect, useMemo, useState } from 'react';
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

import { backendClient } from '../lib/backend';
import { ScenarioPlayer } from './missions/ScenarioPlayer';
import type { BackendStatus, MissionRecord, ScenarioDetail, ScenarioSummary } from '../types';

const CATEGORY_META: Record<string, { title: string; order: number }> = {
  'risk-discipline': { title: 'Risk Discipline', order: 1 },
  'process-quality': { title: 'Process Quality', order: 2 },
  'loss-acceptance': { title: 'Loss Acceptance', order: 3 },
  'tilt-control': { title: 'Tilt Control', order: 4 },
  journaling: { title: 'Journaling', order: 5 },
  selectivity: { title: 'Selectivity', order: 6 },
  'outcome-integrity': { title: 'Outcome Integrity', order: 7 },
  'replay-mastery': { title: 'Replay Mastery', order: 8 },
  'academy-scholar': { title: 'Academy Scholar', order: 9 },
  consistency: { title: 'Consistency', order: 10 },
  constitution: { title: 'Constitution', order: 11 },
  capstone: { title: 'Capstones', order: 12 },
};

const LEVELS = ['novice', 'intermediate', 'advanced', 'expert'] as const;

function ObjectiveList({ mission }: { mission: MissionRecord }) {
  return (
    <ul className="mt-3 space-y-1.5">
      {mission.criteria.map((criterion) => (
        <li key={criterion.label} className="flex items-center gap-2 text-sm">
          {criterion.met ? (
            <CheckCircle2 size={15} className="shrink-0 text-emerald-400" />
          ) : (
            <Circle size={15} className="shrink-0 text-zinc-600" />
          )}
          <span className={criterion.met ? 'text-zinc-300' : 'text-zinc-400'}>
            {criterion.label}
          </span>
          <span className="ml-auto shrink-0 text-xs text-zinc-600">
            {criterion.current} / {criterion.target}
          </span>
          {!criterion.met && criterion.action ? (
            <Link
              to={criterion.action.route}
              title={criterion.action.cta}
              className="flex shrink-0 items-center gap-0.5 rounded-full border border-indigo-500/40 px-2 py-0.5 text-[11px] text-indigo-300 transition-colors hover:bg-indigo-600/20"
            >
              Go <ArrowUpRight size={11} />
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
}: {
  mission: MissionRecord;
  onAbandon: (id: string) => void;
}) {
  const met = mission.criteria.filter((criterion) => criterion.met).length;
  const next = mission.criteria.find((criterion) => !criterion.met);
  return (
    <div className="rounded-xl border border-indigo-500/40 bg-indigo-600/10 p-4">
      <div className="flex items-center gap-2">
        <Crosshair size={15} className="shrink-0 text-indigo-300" />
        <p className="font-semibold text-zinc-100">{mission.title}</p>
        <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] uppercase tracking-wider text-zinc-500">
          {mission.level}
        </span>
        <button
          type="button"
          onClick={() => onAbandon(mission.id)}
          className="ml-auto shrink-0 text-[11px] text-zinc-500 hover:text-zinc-300"
        >
          Stand down
        </button>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full bg-indigo-500"
          style={{ width: `${(100 * met) / Math.max(1, mission.criteria.length)}%` }}
        />
      </div>
      <p className="mt-1 text-[11px] text-zinc-500">
        {met} / {mission.criteria.length} objectives complete
      </p>
      {next ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-zinc-700/60 bg-zinc-900/50 px-3 py-2">
          <span className="text-xs uppercase tracking-wider text-indigo-300/80">Next</span>
          <span className="min-w-0 truncate text-sm text-zinc-200">{next.label}</span>
          {next.action ? (
            <Link
              to={next.action.route}
              className="ml-auto flex shrink-0 items-center gap-1 rounded-lg border border-indigo-500/50 px-2.5 py-1 text-xs font-semibold text-indigo-300 transition-colors hover:bg-indigo-600/20"
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
  slotsFull,
}: {
  mission: MissionRecord;
  onAccept: (id: string) => void;
  slotsFull: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const met = mission.criteria.filter((criterion) => criterion.met).length;

  return (
    <div
      className={`rounded-xl border ${
        mission.completed
          ? 'border-emerald-500/40 bg-emerald-600/10'
          : mission.active
            ? 'border-indigo-500/40 bg-zinc-900/40'
            : 'border-zinc-800 bg-zinc-900/40'
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start gap-3 p-4 text-left"
      >
        {expanded ? (
          <ChevronDown size={15} className="mt-1 shrink-0 text-zinc-500" />
        ) : (
          <ChevronRight size={15} className="mt-1 shrink-0 text-zinc-500" />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-zinc-100">
            {mission.title}
            <span className="ml-2 rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] uppercase tracking-wider text-zinc-500">
              {mission.level}
            </span>
            {mission.active ? (
              <span className="ml-1.5 rounded-full border border-indigo-500/40 px-2 py-0.5 text-[10px] text-indigo-300">
                active
              </span>
            ) : null}
            {mission.source === 'community' ? (
              <span className="ml-1.5 rounded-full border border-sky-500/40 px-2 py-0.5 text-[10px] text-sky-300">
                community
              </span>
            ) : null}
          </p>
          {!expanded ? (
            <p className="mt-0.5 line-clamp-1 text-sm text-zinc-500">{mission.description}</p>
          ) : null}
        </div>
        {mission.completed ? (
          <span className="shrink-0 rounded-full border border-emerald-500/40 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
            Done
          </span>
        ) : (
          <span className="shrink-0 text-xs text-zinc-600">
            {met}/{mission.criteria.length}
          </span>
        )}
      </button>
      {expanded ? (
        <div className="px-4 pb-4 pl-11">
          <p className="text-sm text-zinc-400">{mission.description}</p>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Objectives
          </p>
          <ObjectiveList mission={mission} />
          <div className="mt-3 flex items-center gap-3">
            {!mission.completed && !mission.active ? (
              <button
                type="button"
                disabled={slotsFull}
                onClick={() => onAccept(mission.id)}
                title={slotsFull ? 'All active slots are taken — stand down from one first.' : ''}
                className="rounded-lg border border-indigo-500/50 px-4 py-1.5 text-xs font-semibold text-indigo-300 transition-colors hover:bg-indigo-600/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Start mission
              </button>
            ) : null}
            {mission.lesson_links.length ? (
              <p className="text-xs text-zinc-500">
                Study first:{' '}
                {mission.lesson_links.map((lessonId, i) => (
                  <span key={lessonId}>
                    {i > 0 ? ' · ' : ''}
                    <Link to="/learn" className="text-indigo-300 hover:text-indigo-200">
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
  const [missions, setMissions] = useState<MissionRecord[] | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioSummary[] | null>(null);
  const [activeScenario, setActiveScenario] = useState<ScenarioDetail | null>(null);
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
      .catch(() => setError('Could not load missions. Is the backend running?'));
    backendClient
      .getScenarios()
      .then((response) => setScenarios(response.items))
      .catch(() => setScenarios([]));
  }, [backendStatus]);

  const refreshMissions = () => {
    void backendClient.getMissions().then((response) => setMissions(response.items));
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

  const openScenario = (scenarioId: string) => {
    void backendClient.getScenario(scenarioId).then(setActiveScenario);
  };

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
        <Target size={20} className="text-indigo-400" />
        <h1 className="text-lg font-semibold text-zinc-100">Missions</h1>
        {missions ? (
          <span className="rounded-full border border-zinc-700 px-2.5 py-0.5 text-xs text-zinc-400">
            {completedCount} / {missions.length} earned
          </span>
        ) : null}
        <span className="ml-auto text-xs text-zinc-600">
          Earned by conduct, not clicks — every criterion reads your real activity.
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="Search missions…"
          aria-label="Search missions"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="w-56 rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-1.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-indigo-500/60"
        />
        {['all', ...LEVELS].map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => setLevelFilter(level)}
            className={`rounded-full border px-3 py-1 text-xs capitalize transition-colors ${
              levelFilter === level
                ? 'border-indigo-400/60 bg-indigo-600/20 text-indigo-200'
                : 'border-zinc-700 text-zinc-500 hover:border-zinc-500'
            }`}
          >
            {level}
          </button>
        ))}
      </div>

      {activeMissions.length ? (
        <>
          <h2 className="mt-6 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-indigo-300">
            <Crosshair size={14} />
            Active missions
            <span className="text-xs font-normal normal-case tracking-normal text-zinc-600">
              {activeMissions.length} / {maxActive} slots
            </span>
          </h2>
          <div className="mt-3 space-y-3">
            {activeMissions.map((mission) => (
              <ActiveMissionCard key={mission.id} mission={mission} onAbandon={handleAbandon} />
            ))}
          </div>
        </>
      ) : missions ? (
        <p className="mt-6 rounded-xl border border-dashed border-zinc-700 bg-zinc-900/30 p-4 text-sm text-zinc-500">
          No active missions. Open a category below and start one — active missions pin your next
          objective and link straight to where you act.
        </p>
      ) : null}

      {error ? (
        <p className="mt-6 rounded-xl border border-amber-500/30 bg-amber-600/10 p-4 text-sm text-amber-300">
          {error}
        </p>
      ) : null}
      {!missions && !error ? (
        <div className="mt-6 space-y-3" aria-busy="true">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-24 animate-pulse rounded-xl bg-zinc-800/60" />
          ))}
        </div>
      ) : null}

      <div className="mt-5 space-y-4">
        {grouped?.length === 0 ? (
          <p className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-500">
            No missions match.
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
                  <ChevronDown size={15} className="text-zinc-500" />
                ) : (
                  <ChevronRight size={15} className="text-zinc-500" />
                )}
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">
                  {meta?.title ?? category.replace(/-/g, ' ')}
                </h2>
                <span
                  className={`text-xs ${
                    done === categoryMissions.length ? 'text-emerald-400' : 'text-zinc-600'
                  }`}
                >
                  {done}/{categoryMissions.length}
                </span>
                <span className="ml-auto h-px flex-1 max-w-[40%] bg-zinc-800" />
              </button>
              {open ? (
                <div className="mt-2 space-y-2">
                  {categoryMissions.map((mission) => (
                    <MissionCard
                      key={mission.id}
                      mission={mission}
                      onAccept={handleAccept}
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
          <h2 className="mt-10 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-zinc-400">
            <PlayCircle size={15} className="text-indigo-400" />
            Replay missions
          </h2>
          <p className="mt-1 text-xs text-zinc-600">
            Stylized recreations of real market episodes. Play them bar by bar and make the calls —
            the debrief grades the decision, not the outcome.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {scenarios.map((scenario) => (
              <button
                key={scenario.id}
                type="button"
                onClick={() => openScenario(scenario.id)}
                className={`rounded-xl border p-5 text-left transition-colors hover:border-indigo-400/50 ${
                  scenario.passed
                    ? 'border-emerald-500/40 bg-emerald-600/10'
                    : 'border-zinc-800 bg-zinc-900/40'
                }`}
              >
                <p className="font-semibold text-zinc-100">
                  {scenario.title}
                  <span className="ml-2 rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] uppercase tracking-wider text-zinc-500">
                    {scenario.level}
                  </span>
                </p>
                <p className="mt-1 line-clamp-3 text-sm text-zinc-400">{scenario.description}</p>
                <p className="mt-3 text-xs text-zinc-500">
                  {scenario.checkpoints} decisions · pass at {scenario.pass_percent}%
                  {scenario.best_percent !== null ? (
                    <span
                      className={`ml-2 font-semibold ${
                        scenario.passed ? 'text-emerald-300' : 'text-amber-300'
                      }`}
                    >
                      best {scenario.best_percent}%
                    </span>
                  ) : null}
                </p>
              </button>
            ))}
          </div>
        </>
      ) : null}
      <p className="mt-6 text-xs text-zinc-600">
        Completing missions unlocks Academy levels. Community packs can add more via the extension
        SDK. Educational use only — not financial advice.
      </p>
    </div>
  );
}
