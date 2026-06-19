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
import { useTranslation } from 'react-i18next';

import { backendClient } from '../../lib/backend';
import type { MasteryResponse, ReviewCard } from '../../types';

function Flashcards({ onGraded }: { onGraded: () => void }) {
  const { t } = useTranslation();
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
    return <div className="mt-4 h-44 animate-pulse rounded-xl bg-white/5" aria-busy="true" />;
  }
  const card = queue[index];
  if (!card) {
    return (
      <p className="mt-4 rounded-xl border border-buy/30 bg-buy/10 p-4 text-sm text-buy">
        {t('academy.nothingDue')}
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
    <div className="mt-4 rounded-xl border border-border bg-white/[0.03] p-6">
      <div className="flex items-center justify-between text-xs text-muted/70">
        <span>
          Card {index + 1} of {queue.length}
        </span>
        <span className={card.status === 'new' ? 'text-watch' : 'text-hold'}>
          {card.status === 'new' ? t('academy.newTerm') : t('academy.dueForReview')}
        </span>
      </div>
      <p className="mt-4 text-center text-xl font-semibold text-ink">{card.term}</p>
      {revealed ? (
        <>
          <p className="mt-3 text-center text-sm leading-relaxed text-ink">{card.definition}</p>
          <div className="mt-5 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => void grade('again')}
              className="rounded-lg border border-sell/50 px-4 py-2 text-xs font-semibold text-sell transition-colors hover:bg-sell/15"
            >
              {t('academy.again')}
            </button>
            <button
              type="button"
              onClick={() => void grade('good')}
              className="rounded-lg border border-accent/50 px-4 py-2 text-xs font-semibold text-accent transition-colors hover:bg-accent/15"
            >
              {t('academy.good')}
            </button>
            <button
              type="button"
              onClick={() => void grade('easy')}
              className="rounded-lg border border-buy/50 px-4 py-2 text-xs font-semibold text-buy transition-colors hover:bg-buy/15"
            >
              {t('academy.easy')}
            </button>
          </div>
        </>
      ) : (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="rounded-lg border border-border px-5 py-2 text-sm text-ink transition-colors hover:border-white/20"
          >
            {t('academy.revealDefinition')}
          </button>
        </div>
      )}
    </div>
  );
}

export function PracticeView() {
  const { t } = useTranslation();
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
        <Sparkles size={18} className="text-accent" />
        <h2 className="text-lg font-semibold text-ink">{t('academy.practice')}</h2>
      </div>

      {!mastery ? (
        <div className="mt-4 h-24 animate-pulse rounded-xl bg-white/5" aria-busy="true" />
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-white/[0.03] p-4">
            <p className="text-xs text-muted">{t('academy.level')}</p>
            <p className="mt-1 text-lg font-semibold text-ink">
              {mastery.level} · {mastery.level_title}
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full bg-accentStrong"
                style={{ width: `${Math.min(100, (100 * xpInLevel) / Math.max(1, xpForLevel))}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-muted/70">
              {mastery.xp} / {mastery.next_level_xp} XP
            </p>
          </div>
          <div className="rounded-xl border border-border bg-white/[0.03] p-4">
            <p className="text-xs text-muted">{t('academy.streak')}</p>
            <p className="mt-1 flex items-center gap-1.5 text-lg font-semibold text-ink">
              <Flame
                size={16}
                className={mastery.streak_days > 0 ? 'text-hold' : 'text-muted/70'}
              />
              {mastery.streak_days} day{mastery.streak_days === 1 ? '' : 's'}
            </p>
            <p className="mt-1 text-[11px] text-muted/70">{t('academy.keepsItAlive')}</p>
          </div>
          <div className="rounded-xl border border-border bg-white/[0.03] p-4">
            <p className="text-xs text-muted">{t('academy.badges')}</p>
            <p className="mt-1 flex items-center gap-1.5 text-lg font-semibold text-ink">
              <Medal size={16} className={earned.length ? 'text-buy' : 'text-muted/70'} />
              {earned.length} / {mastery.badges.length}
            </p>
            <p className="mt-1 text-[11px] text-muted/70">{t('academy.onePerTrack')}</p>
          </div>
        </div>
      )}

      <h3 className="mt-6 text-sm font-semibold uppercase tracking-wider text-muted">
        {t('academy.termReview')}
      </h3>
      <Flashcards onGraded={refresh} />

      {mastery && mastery.badges.length ? (
        <>
          <h3 className="mt-6 text-sm font-semibold uppercase tracking-wider text-muted">
            {t('academy.trackBadges')}
          </h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {mastery.badges.map((badge) => (
              <div
                key={badge.track_id}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                  badge.earned ? 'border-buy/40 bg-buy/10' : 'border-border bg-white/[0.03]'
                }`}
              >
                <Medal
                  size={16}
                  className={badge.earned ? 'shrink-0 text-buy' : 'shrink-0 text-muted/70'}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{badge.title}</p>
                  <p className="text-[11px] text-muted/70">
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
