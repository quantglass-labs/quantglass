// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Progress view (ACAD-11): per-level and per-track mastery, weekly learning
 * pace, and local completion certificates. Certificates are earned by
 * finishing every lesson in a level and passing its exam; the verification
 * code is a stable hash of the achievement, generated locally.
 */

import { useEffect, useState } from 'react';

import { Award, BarChart3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { CountUp, FadeIn } from '../../components/motion';
import { MetricTile } from '../../components/surface';
import { backendClient } from '../../lib/backend';
import type { LearnAnalytics, LearnCertificate } from '../../types';

function CertificateCard({ certificate }: { certificate: LearnCertificate }) {
  const { t } = useTranslation();
  if (!certificate.earned) return null;
  return (
    <div className="rounded-xl border-2 border-emerald-500/40 bg-gradient-to-br from-zinc-900 to-emerald-950/40 p-6 text-center">
      <Award size={28} className="mx-auto text-emerald-300" />
      <p className="mt-2 text-xs uppercase tracking-[0.2em] text-emerald-400/80">
        {t('academy.certificateOfCompletion')}
      </p>
      <p className="mt-2 text-xl font-bold text-zinc-100">{certificate.level_title}</p>
      <p className="mt-1 text-sm text-zinc-400">
        {t('academy.certLessonsScore', {
          count: certificate.lesson_count,
          score: certificate.exam_score,
        })}
      </p>
      <p className="mt-3 text-[11px] text-zinc-600">
        {t('academy.certIssued', {
          date: certificate.issued_at?.slice(0, 10),
          code: certificate.verification,
        })}
      </p>
      <p className="mt-1 text-[10px] text-zinc-700">{t('academy.academyDisclaimer')}</p>
    </div>
  );
}

export function ProgressView() {
  const { t } = useTranslation();
  const [analytics, setAnalytics] = useState<LearnAnalytics | null>(null);
  const [certificates, setCertificates] = useState<LearnCertificate[]>([]);

  useEffect(() => {
    backendClient
      .getLearnAnalytics()
      .then((response) => {
        setAnalytics(response);
        const earned = response.levels.filter((level) => level.certificate_earned);
        void Promise.all(earned.map((level) => backendClient.getCertificate(level.id))).then(
          (results) => setCertificates(results.filter((result) => result.earned)),
        );
      })
      .catch(() => setAnalytics(null));
  }, []);

  const maxWeekly = Math.max(1, ...(analytics?.weekly.map((week) => week.lessons) ?? [1]));

  const totals = analytics
    ? {
        completed: analytics.levels.reduce((sum, level) => sum + level.completed, 0),
        lessons: analytics.levels.reduce((sum, level) => sum + level.total, 0),
        tracksMastered: analytics.tracks.filter((track) => track.earned).length,
        certs: analytics.levels.filter((level) => level.certificate_earned).length,
      }
    : null;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-2">
        <BarChart3 size={18} className="text-indigo-400" />
        <h2 className="text-lg font-semibold text-zinc-100">{t('academy.progress')}</h2>
      </div>

      {!analytics ? (
        <div className="mt-4 space-y-3" aria-busy="true">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-20 animate-pulse rounded-xl bg-zinc-800/60" />
          ))}
        </div>
      ) : (
        <>
          {totals ? (
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <MetricTile
                label={t('academy.lessonsCompleted')}
                hero
                helper={t('academy.ofInAcademy', { total: totals.lessons })}
              >
                <CountUp value={totals.completed} format={(n) => String(Math.round(n))} />
              </MetricTile>
              <MetricTile
                label={t('academy.completion')}
                toneClass="text-buy"
                helper={t('academy.acrossEveryLevel')}
              >
                <CountUp
                  value={totals.lessons ? (100 * totals.completed) / totals.lessons : 0}
                  format={(n) => `${Math.round(n)}%`}
                />
              </MetricTile>
              <MetricTile
                label={t('academy.tracksMastered')}
                toneClass="text-watch"
                helper={t('academy.fullTracksEarned')}
              >
                <CountUp value={totals.tracksMastered} format={(n) => String(Math.round(n))} />
              </MetricTile>
              <MetricTile
                label={t('academy.certificates')}
                helper={t('academy.levelsFullyCertified')}
              >
                <CountUp value={totals.certs} format={(n) => String(Math.round(n))} />
              </MetricTile>
            </div>
          ) : null}

          <div className="mt-4 space-y-3">
            {analytics.levels.map((level) => (
              <div key={level.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-zinc-100">{level.title}</p>
                  {level.assessment ? (
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] ${
                        level.assessment.passed
                          ? 'border-emerald-500/40 text-emerald-300'
                          : 'border-amber-500/40 text-amber-300'
                      }`}
                    >
                      {t('academy.examScore', { score: level.assessment.score })}
                    </span>
                  ) : null}
                  {level.certificate_earned ? (
                    <Award size={14} className="text-emerald-400" />
                  ) : null}
                  <span className="ml-auto text-xs text-zinc-500">
                    {level.completed}/{level.total} · {level.percent}%
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  <div className="h-full bg-indigo-500" style={{ width: `${level.percent}%` }} />
                </div>
              </div>
            ))}
          </div>

          {analytics.weekly.length ? (
            <>
              <h3 className="mt-6 text-sm font-semibold uppercase tracking-wider text-zinc-400">
                {t('academy.weeklyPace')}
              </h3>
              <div className="mt-3 flex items-end gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                {analytics.weekly.map((week) => (
                  <div key={week.week} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[10px] text-zinc-500">{week.lessons}</span>
                    <div
                      className="w-full rounded-t bg-indigo-500/70"
                      style={{ height: `${Math.max(6, (56 * week.lessons) / maxWeekly)}px` }}
                    />
                    <span className="text-[9px] text-zinc-600">{week.week.slice(5)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          <h3 className="mt-6 text-sm font-semibold uppercase tracking-wider text-zinc-400">
            {t('academy.tracks')}
          </h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {analytics.tracks.map((track) => (
              <div
                key={track.track_id}
                className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2.5"
              >
                <div className="flex items-center justify-between">
                  <p className="truncate text-sm text-zinc-200">{track.title}</p>
                  <span className="text-[11px] text-zinc-600">
                    {track.progress}/{track.total}
                  </span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className={track.earned ? 'h-full bg-emerald-500' : 'h-full bg-indigo-500/60'}
                    style={{ width: `${(100 * track.progress) / Math.max(1, track.total)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {certificates.length ? (
            <>
              <h3 className="mt-6 text-sm font-semibold uppercase tracking-wider text-zinc-400">
                {t('academy.certificates')}
              </h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {certificates.map((certificate, index) => (
                  <FadeIn key={certificate.level} delayMs={Math.min(index, 8) * 50}>
                    <CertificateCard certificate={certificate} />
                  </FadeIn>
                ))}
              </div>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
