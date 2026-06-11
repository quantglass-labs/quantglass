// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Practice view (ACAD-6): the mastery loop. XP and level derived from real
 * progress, the daily streak, per-track badges, and a spaced-repetition
 * flashcard deck built from the key terms of completed lessons (SM-2-lite,
 * self-graded: again / good / easy).
 */

import { useCallback, useEffect, useState } from 'react';

import { Flame, Medal, Sparkles } from 'lucide-react';

import { backendClient } from '../../lib/backend';
import type { MasteryResponse, ReviewCard } from '../../types';

function Flashcards({ onGraded }: { onGraded: () => void }) {
  const [queue, setQueue] = useState<ReviewCard[] | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const load = useCallback(() => {
    backendClient
      .getReviewQueue()
      .then((response) => {
        setQueue(response.items);
        setIndex(0);
        setRevealed(false);
      })
      .catch(() => setQueue([]));
  }, []);

  useEffect(load, [load]);

  if (!queue) {
    return <div className="mt-4 h-44 animate-pulse rounded-xl bg-zinc-800/60" aria-busy="true" />;
  }
  const card = queue[index];
  if (!card) {
    return (
      <p className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-600/10 p-4 text-sm text-emerald-300">
        Nothing due. Complete more lessons to add terms, or come back tomorrow — spacing is the
        point.
      </p>
    );
  }

  const grade = async (value: 'again' | 'good' | 'easy') => {
    await backendClient.gradeReviewCard(card.term, value);
    onGraded();
    if (index + 1 < queue.length) {
      setIndex(index + 1);
      setRevealed(false);
    } else {
      load();
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
      <div className="flex items-center justify-between text-xs text-zinc-600">
        <span>
          Card {index + 1} of {queue.length}
        </span>
        <span className={card.status === 'new' ? 'text-sky-300' : 'text-amber-300'}>
          {card.status === 'new' ? 'new term' : 'due for review'}
        </span>
      </div>
      <p className="mt-4 text-center text-xl font-semibold text-zinc-100">{card.term}</p>
      {revealed ? (
        <>
          <p className="mt-3 text-center text-sm leading-relaxed text-zinc-300">
            {card.definition}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => void grade('again')}
              className="rounded-lg border border-rose-500/50 px-4 py-2 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-600/20"
            >
              Again
            </button>
            <button
              type="button"
              onClick={() => void grade('good')}
              className="rounded-lg border border-indigo-500/50 px-4 py-2 text-xs font-semibold text-indigo-300 transition-colors hover:bg-indigo-600/20"
            >
              Good
            </button>
            <button
              type="button"
              onClick={() => void grade('easy')}
              className="rounded-lg border border-emerald-500/50 px-4 py-2 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-600/20"
            >
              Easy
            </button>
          </div>
        </>
      ) : (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="rounded-lg border border-zinc-700 px-5 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-500"
          >
            Reveal definition
          </button>
        </div>
      )}
    </div>
  );
}

export function PracticeView() {
  const [mastery, setMastery] = useState<MasteryResponse | null>(null);

  const refresh = useCallback(() => {
    backendClient
      .getMastery()
      .then(setMastery)
      .catch(() => setMastery(null));
  }, []);

  useEffect(refresh, [refresh]);

  const earned = mastery?.badges.filter((badge) => badge.earned) ?? [];
  const xpInLevel = mastery ? mastery.xp - mastery.level ** 2 * 100 : 0;
  const xpForLevel = mastery ? mastery.next_level_xp - mastery.level ** 2 * 100 : 1;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-2">
        <Sparkles size={18} className="text-indigo-400" />
        <h2 className="text-lg font-semibold text-zinc-100">Practice</h2>
      </div>

      {!mastery ? (
        <div className="mt-4 h-24 animate-pulse rounded-xl bg-zinc-800/60" aria-busy="true" />
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <p className="text-xs text-zinc-500">Level</p>
            <p className="mt-1 text-lg font-semibold text-zinc-100">
              {mastery.level} · {mastery.level_title}
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full bg-indigo-500"
                style={{ width: `${Math.min(100, (100 * xpInLevel) / Math.max(1, xpForLevel))}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-zinc-600">
              {mastery.xp} / {mastery.next_level_xp} XP
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <p className="text-xs text-zinc-500">Streak</p>
            <p className="mt-1 flex items-center gap-1.5 text-lg font-semibold text-zinc-100">
              <Flame
                size={16}
                className={mastery.streak_days > 0 ? 'text-amber-400' : 'text-zinc-600'}
              />
              {mastery.streak_days} day{mastery.streak_days === 1 ? '' : 's'}
            </p>
            <p className="mt-1 text-[11px] text-zinc-600">Any Academy activity keeps it alive.</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <p className="text-xs text-zinc-500">Badges</p>
            <p className="mt-1 flex items-center gap-1.5 text-lg font-semibold text-zinc-100">
              <Medal size={16} className={earned.length ? 'text-emerald-400' : 'text-zinc-600'} />
              {earned.length} / {mastery.badges.length}
            </p>
            <p className="mt-1 text-[11px] text-zinc-600">One per completed track.</p>
          </div>
        </div>
      )}

      <h3 className="mt-6 text-sm font-semibold uppercase tracking-wider text-zinc-400">
        Term review
      </h3>
      <Flashcards onGraded={refresh} />

      {mastery && mastery.badges.length ? (
        <>
          <h3 className="mt-6 text-sm font-semibold uppercase tracking-wider text-zinc-400">
            Track badges
          </h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {mastery.badges.map((badge) => (
              <div
                key={badge.track_id}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                  badge.earned
                    ? 'border-emerald-500/40 bg-emerald-600/10'
                    : 'border-zinc-800 bg-zinc-900/40'
                }`}
              >
                <Medal
                  size={16}
                  className={badge.earned ? 'shrink-0 text-emerald-400' : 'shrink-0 text-zinc-600'}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm text-zinc-200">{badge.title}</p>
                  <p className="text-[11px] text-zinc-600">
                    {badge.level} · {badge.progress}/{badge.total} lessons
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
