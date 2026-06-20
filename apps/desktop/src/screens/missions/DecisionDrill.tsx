// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Decision drill player. A mission's interactive half: scenario, decision
 * checkpoints, choices graded server-side on Process / Risk / Discipline,
 * consequences per decision, and a risk-officer note. A severe choice
 * fails the run regardless of score — profit logic never passes a mission.
 */

import { useEffect, useState } from 'react';

import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowLeft, Flame, ShieldCheck } from 'lucide-react';

import { backendClient } from '../../lib/backend';
import { AiMarkdown } from '../../components/AiMarkdown';
import { CountUp, FadeIn } from '../../components/motion';
import type { DrillDetail, DrillGradeResponse } from '../../types';

function ScoreTile({ label, value, bar }: { label: string; value: number; bar: number }) {
  const tone = value >= bar ? 'text-buy' : 'text-hold';
  return (
    <div className="rounded-lg border border-border bg-background/40 px-4 py-3 text-center">
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
      <p className="mt-0.5 text-[11px] uppercase tracking-wider text-muted">{label}</p>
    </div>
  );
}

/**
 * The reward for passing: your discipline streak ticking up. On-brand — it
 * celebrates the consistency of showing up, never the P&L of the choice.
 */
function StreakReward({ streak, extendedToday }: { streak: number; extendedToday: boolean }) {
  const { t } = useTranslation();
  return (
    <FadeIn>
      <div className="mb-3 flex items-center gap-3 rounded-xl border border-hold/40 bg-gradient-to-r from-hold/15 to-hold/5 p-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-hold/20 text-hold">
          <Flame size={22} className="drop-shadow-[0_0_6px_rgba(240,184,75,0.5)]" />
        </div>
        <div>
          <p className="flex items-baseline gap-1.5 font-semibold text-ink">
            <CountUp value={streak} format={(n) => String(Math.round(n))} />
            <span className="text-sm font-normal text-muted">
              {t('missions.drill.streakLabel')}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-hold/90">
            {extendedToday ? t('missions.drill.extendedToday') : t('missions.drill.loggedToday')}
          </p>
        </div>
      </div>
    </FadeIn>
  );
}

export function DecisionDrill({ category, onExit }: { category: string; onExit: () => void }) {
  const { t } = useTranslation();
  const [drill, setDrill] = useState<DrillDetail | null>(null);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [grade, setGrade] = useState<DrillGradeResponse | null>(null);
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Was the user already active today before this drill? Captured on mount so
  // a pass can tell "extended today" from "already logged".
  const [activeAtStart, setActiveAtStart] = useState(false);
  const [rewardStreak, setRewardStreak] = useState<number | null>(null);

  useEffect(() => {
    backendClient
      .getDrill(category)
      .then(setDrill)
      .catch(() => setError(t('missions.drill.loadError')));
    backendClient
      .getDailyBriefing()
      .then((briefing) => setActiveAtStart(briefing.active_today))
      .catch(() => undefined);
  }, [category, t]);

  // On a pass, the drill has just recorded today's activity; surface the
  // resulting streak as the reward. (The display is gated on `grade.passed`,
  // so a stale value from a prior run is never shown.)
  useEffect(() => {
    if (!grade?.passed) return;
    backendClient
      .getDailyBriefing()
      .then((briefing) => setRewardStreak(briefing.streak))
      .catch(() => undefined);
  }, [grade]);

  const reset = () => {
    setStep(0);
    setAnswers({});
    setGrade(null);
  };

  const choose = async (optionId: string) => {
    const next = { ...answers, [String(step)]: optionId };
    setAnswers(next);
    if (drill && step + 1 < drill.checkpoints.length) {
      setStep(step + 1);
      return;
    }
    setGrading(true);
    try {
      setGrade(await backendClient.gradeDrill(category, next));
    } finally {
      setGrading(false);
    }
  };

  if (error) {
    return (
      <p className="rounded-xl border border-hold/30 bg-hold/10 p-4 text-sm text-hold">{error}</p>
    );
  }
  if (!drill) {
    return <div className="h-48 animate-pulse rounded-xl bg-white/5" aria-busy="true" />;
  }

  const checkpoint = drill.checkpoints[step];

  return (
    <div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onExit}
          className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted transition-colors hover:border-white/20"
        >
          <ArrowLeft size={13} /> {t('missions.drill.back')}
        </button>
        <h2 className="font-semibold text-ink">
          {t('missions.drill.heading', { title: drill.title })}
        </h2>
        <span className="ml-auto text-xs text-muted/70">
          {t('missions.drill.passRule', { percent: drill.pass_percent })}
          {drill.best_percent !== null
            ? t('missions.drill.best', { percent: drill.best_percent })
            : ''}
        </span>
      </div>

      <p className="mt-3 rounded-xl border border-border bg-white/[0.03] p-4 text-sm leading-relaxed text-ink">
        {drill.scenario}
      </p>

      {!grade ? (
        <div className="mt-4 rounded-xl border border-accent/40 bg-accent/10 p-5">
          <p className="text-xs uppercase tracking-wider text-accent">
            {t('missions.drill.decisionOf', {
              current: step + 1,
              total: drill.checkpoints.length,
            })}
          </p>
          <p className="mt-2 font-medium text-ink">{checkpoint.question}</p>
          <div className="mt-3 space-y-2">
            {checkpoint.options.map((option) => (
              <button
                key={option.id}
                type="button"
                disabled={grading}
                onClick={() => void choose(option.id)}
                className="w-full rounded-lg border border-border bg-background/50 px-3 py-2.5 text-left text-sm text-ink transition-colors hover:border-accent/60 hover:bg-accent/10 disabled:opacity-50"
              >
                {option.label}
              </button>
            ))}
          </div>
          {grading ? (
            <p className="mt-3 text-xs text-muted">{t('missions.drill.grading')}</p>
          ) : null}
        </div>
      ) : (
        <div className="mt-4">
          {grade.passed && rewardStreak && rewardStreak > 0 ? (
            <StreakReward streak={rewardStreak} extendedToday={!activeAtStart} />
          ) : null}
          <div className="grid grid-cols-3 gap-3">
            <ScoreTile
              label={t('missions.drill.scoreProcess')}
              value={grade.scores.process}
              bar={grade.pass_percent}
            />
            <ScoreTile
              label={t('missions.drill.scoreRisk')}
              value={grade.scores.risk}
              bar={grade.pass_percent}
            />
            <ScoreTile
              label={t('missions.drill.scoreDiscipline')}
              value={grade.scores.discipline}
              bar={grade.pass_percent}
            />
          </div>
          <div
            className={`mt-3 flex items-start gap-3 rounded-xl border p-4 ${
              grade.passed ? 'border-buy/40 bg-buy/10' : 'border-hold/40 bg-hold/10'
            }`}
          >
            {grade.passed ? (
              <ShieldCheck size={18} className="mt-0.5 shrink-0 text-buy" />
            ) : (
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-hold" />
            )}
            <div>
              <p className="font-semibold text-ink">
                {grade.passed ? t('missions.drill.passed') : t('missions.drill.failed')}
                {grade.severe_violation ? t('missions.drill.severe') : ''}
              </p>
              <p className="mt-1 text-sm text-ink">{grade.officer_note}</p>
            </div>
          </div>
          <div className="mt-3 space-y-3">
            {grade.checkpoints.map((item, index) => (
              <div
                key={index}
                className={`rounded-xl border p-4 ${
                  item.severe ? 'border-sell/40 bg-sell/10' : 'border-border bg-white/[0.03]'
                }`}
              >
                <p className="text-sm font-medium text-ink">{item.question}</p>
                {item.chosen ? (
                  <p className="mt-1 text-xs text-muted">
                    {t('missions.drill.youChose', { choice: item.chosen })}
                  </p>
                ) : null}
                <p className="mt-2 text-sm leading-relaxed text-muted">{item.feedback}</p>
                {item.best_choice ? (
                  <p className="mt-2 text-xs text-buy/80">
                    {t('missions.drill.strongerPlay', { choice: item.best_choice })}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
          <AiDebrief grade={grade} />
          <div className="mt-4 flex justify-center gap-3">
            <button
              type="button"
              onClick={reset}
              className="rounded-lg border border-accent/50 px-5 py-2 text-sm font-semibold text-accent transition-colors hover:bg-accent/15"
            >
              {t('missions.drill.replay')}
            </button>
            <button
              type="button"
              onClick={onExit}
              className="rounded-lg border border-border px-5 py-2 text-sm text-ink transition-colors hover:border-white/20"
            >
              {t('missions.drill.backToMissions')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AiDebrief({ grade }: { grade: DrillGradeResponse }) {
  const { t } = useTranslation();
  const [debrief, setDebrief] = useState<{ summary: string; source: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const ask = async () => {
    setLoading(true);
    try {
      setDebrief(
        await backendClient.getPostmortem('drill', {
          scores: grade.scores,
          severe_violation: grade.severe_violation,
          passed: grade.passed,
          choices: grade.checkpoints.map((c) => ({
            question: c.question,
            chosen: c.chosen,
            severe: c.severe,
          })),
        }),
      );
    } catch {
      setDebrief({ summary: t('missions.drill.debrief.unavailable'), source: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-3">
      {!debrief ? (
        <button
          type="button"
          disabled={loading}
          onClick={() => void ask()}
          className="w-full rounded-xl border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm text-accent transition-colors hover:bg-accent/15 disabled:opacity-50"
        >
          {loading ? t('missions.drill.debrief.loading') : t('missions.drill.debrief.cta')}
        </button>
      ) : (
        <div className="rounded-xl border border-accent/25 bg-accent/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">
            {t('missions.drill.debrief.title')}{' '}
            <span className="ml-1 rounded-full border border-border px-2 py-0.5 text-[10px] normal-case text-muted">
              {debrief.source}
            </span>
          </p>
          <AiMarkdown className="mt-2 text-sm leading-relaxed text-ink">
            {debrief.summary}
          </AiMarkdown>
        </div>
      )}
    </div>
  );
}
