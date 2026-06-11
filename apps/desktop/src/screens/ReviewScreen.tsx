// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Review (MSN-4): the coach surface. Weekly process summary, the
 * decision-vs-outcome quadrants, repeated-mistake detections, and the
 * specific lessons and missions that train each fix.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { AlertTriangle, ClipboardCheck } from 'lucide-react';

import { backendClient } from '../lib/backend';
import type { BackendStatus, CoachResponse } from '../types';

const QUADRANT_META: Record<string, { label: string; tone: string; hint: string }> = {
  earned_win: {
    label: 'Earned wins',
    tone: 'text-emerald-300',
    hint: 'Good decision, good outcome',
  },
  well_played_loss: {
    label: 'Well-played losses',
    tone: 'text-sky-300',
    hint: 'Good decision, variance took it',
  },
  honest_tuition: {
    label: 'Honest tuition',
    tone: 'text-zinc-300',
    hint: 'Bad decision, the market billed you',
  },
  dangerous_success: {
    label: 'Dangerous successes',
    tone: 'text-amber-300',
    hint: 'Bad decision rewarded — the worst quadrant',
  },
};

export function ReviewScreen({ backendStatus }: { backendStatus: BackendStatus }) {
  const [coach, setCoach] = useState<CoachResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (backendStatus !== 'online') return;
    backendClient
      .getReviewCoach()
      .then(setCoach)
      .catch(() => setError('Could not load the review. Is the backend running?'));
  }, [backendStatus]);

  const summary = coach?.summary;
  const quadrants = summary?.quadrants ?? {};

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center gap-2">
        <ClipboardCheck size={20} className="text-indigo-400" />
        <h1 className="text-lg font-semibold text-zinc-100">Review</h1>
        <span className="ml-auto text-xs text-zinc-600">
          Grades the decision, not the outcome — then prescribes the fix.
        </span>
      </div>

      {error ? (
        <p className="mt-6 rounded-xl border border-amber-500/30 bg-amber-600/10 p-4 text-sm text-amber-300">
          {error}
        </p>
      ) : null}
      {!coach && !error ? (
        <div className="mt-6 space-y-3" aria-busy="true">
          {[1, 2].map((n) => (
            <div key={n} className="h-36 animate-pulse rounded-xl bg-zinc-800/60" />
          ))}
        </div>
      ) : null}

      {coach ? (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <p className="text-xs text-zinc-500">Trades (7 days)</p>
              <p className="mt-1 text-2xl font-semibold text-zinc-100">{coach.weekly.trades}</p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <p className="text-xs text-zinc-500">Process (7 days)</p>
              <p
                className={`mt-1 text-2xl font-semibold ${
                  coach.weekly.average_process_score >= (summary?.process_good_bar ?? 70)
                    ? 'text-emerald-300'
                    : 'text-amber-300'
                }`}
              >
                {coach.weekly.average_process_score}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <p className="text-xs text-zinc-500">Trades (all time)</p>
              <p className="mt-1 text-2xl font-semibold text-zinc-100">{summary?.trades ?? 0}</p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <p className="text-xs text-zinc-500">Process (all time)</p>
              <p className="mt-1 text-2xl font-semibold text-zinc-100">
                {summary?.average_process_score ?? 0}
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Object.entries(QUADRANT_META).map(([key, meta]) => (
              <div key={key} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <p className={`text-2xl font-semibold ${meta.tone}`}>{quadrants[key] ?? 0}</p>
                <p className="mt-1 text-xs font-medium text-zinc-400">{meta.label}</p>
                <p className="text-[11px] text-zinc-600">{meta.hint}</p>
              </div>
            ))}
          </div>

          <h2 className="mt-8 text-sm font-semibold uppercase tracking-wider text-zinc-400">
            What keeps happening
          </h2>
          {coach.detections.length === 0 ? (
            <p className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-600/10 p-4 text-sm text-emerald-300">
              No repeated mistakes detected. Keep the journal honest and the streak alive.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {coach.detections.map((detection) => (
                <div
                  key={detection.id}
                  className="rounded-xl border border-amber-500/30 bg-zinc-900/40 p-4"
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={15} className="shrink-0 text-amber-400" />
                    <p className="font-medium text-zinc-100">{detection.label}</p>
                    <span className="ml-auto rounded-full border border-amber-500/40 px-2 py-0.5 text-xs text-amber-300">
                      ×{detection.count}
                    </span>
                  </div>
                  {detection.symbols.filter(Boolean).length ? (
                    <p className="mt-1 text-xs text-zinc-600">
                      Seen on {detection.symbols.filter(Boolean).join(', ')}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-zinc-500">Train the fix:</span>
                    {detection.lessons.map((lesson) => (
                      <Link
                        key={lesson.id}
                        to="/learn"
                        className="rounded-full border border-indigo-500/40 px-2.5 py-1 text-indigo-300 transition-colors hover:bg-indigo-600/20"
                      >
                        {lesson.title}
                      </Link>
                    ))}
                    {detection.missions.map((mission) => (
                      <Link
                        key={mission}
                        to="/missions"
                        className="rounded-full border border-emerald-500/40 px-2.5 py-1 text-emerald-300 transition-colors hover:bg-emerald-600/20"
                      >
                        Mission: {mission.replace(/-/g, ' ')}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-6 text-xs text-zinc-600">
            Educational instrumentation over your own paper trading — never financial advice.
          </p>
        </>
      ) : null}
    </div>
  );
}
