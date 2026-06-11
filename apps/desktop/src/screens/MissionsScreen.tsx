// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Missions (MSN-3): behavioral certifications evaluated over the user's own
 * paper trading. Each mission shows its criteria with live progress; passes
 * persist and feed the Academy's unlock ladder.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { CheckCircle2, Circle, Target } from 'lucide-react';

import { backendClient } from '../lib/backend';
import type { BackendStatus, MissionRecord } from '../types';

export function MissionsScreen({ backendStatus }: { backendStatus: BackendStatus }) {
  const [missions, setMissions] = useState<MissionRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (backendStatus !== 'online') return;
    backendClient
      .getMissions()
      .then((response) => setMissions(response.items))
      .catch(() => setError('Could not load missions. Is the backend running?'));
  }, [backendStatus]);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center gap-2">
        <Target size={20} className="text-indigo-400" />
        <h1 className="text-lg font-semibold text-zinc-100">Missions</h1>
        <span className="ml-auto text-xs text-zinc-600">
          Earned by conduct, not clicks — every criterion reads your real paper trading.
        </span>
      </div>

      {error ? (
        <p className="mt-6 rounded-xl border border-amber-500/30 bg-amber-600/10 p-4 text-sm text-amber-300">
          {error}
        </p>
      ) : null}
      {!missions && !error ? (
        <div className="mt-6 space-y-3" aria-busy="true">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-32 rounded-xl bg-zinc-800/60 animate-pulse" />
          ))}
        </div>
      ) : null}

      <div className="mt-6 space-y-4">
        {missions?.map((mission) => (
          <div
            key={mission.id}
            className={`rounded-xl border p-5 ${
              mission.completed
                ? 'border-emerald-500/40 bg-emerald-600/10'
                : 'border-zinc-800 bg-zinc-900/40'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-zinc-100">
                  {mission.title}
                  <span className="ml-2 rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] uppercase tracking-wider text-zinc-500">
                    {mission.level}
                  </span>
                </p>
                <p className="mt-1 text-sm text-zinc-400">{mission.description}</p>
              </div>
              {mission.completed ? (
                <span className="shrink-0 rounded-full border border-emerald-500/40 px-3 py-1 text-xs font-semibold text-emerald-300">
                  Completed
                </span>
              ) : null}
            </div>
            <ul className="mt-4 space-y-1.5">
              {mission.criteria.map((criterion) => (
                <li key={criterion.label} className="flex items-center gap-2 text-sm">
                  {criterion.met ? (
                    <CheckCircle2 size={15} className="shrink-0 text-emerald-400" />
                  ) : (
                    <Circle size={15} className="shrink-0 text-zinc-600" />
                  )}
                  <span className={criterion.met ? 'text-zinc-300' : 'text-zinc-500'}>
                    {criterion.label}
                  </span>
                  <span className="ml-auto text-xs text-zinc-600">
                    {criterion.current} / {criterion.target}
                  </span>
                </li>
              ))}
            </ul>
            {mission.lesson_links.length ? (
              <p className="mt-3 text-xs text-zinc-500">
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
        ))}
      </div>
      <p className="mt-6 text-xs text-zinc-600">
        Completing missions unlocks Academy levels. Educational use only — not financial advice.
      </p>
    </div>
  );
}
