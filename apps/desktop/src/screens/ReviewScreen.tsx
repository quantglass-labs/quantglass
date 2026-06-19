// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Review (MSN-4): the coach surface. Weekly process summary, the
 * decision-vs-outcome quadrants, repeated-mistake detections, and the
 * specific lessons and missions that train each fix.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { AlertTriangle, ClipboardCheck, ScrollText } from 'lucide-react';

import { BackendStatusNotice } from '../components/backendGate';
import { CountUp, FadeIn } from '../components/motion';
import { MetricTile } from '../components/surface';
import { backendClient } from '../lib/backend';
import { AiMarkdown } from '../components/AiMarkdown';
import type {
  BackendStatus,
  CoachNarrative,
  CoachResponse,
  ConstitutionCompliance,
  ConstitutionRules,
} from '../types';

// Maps a quadrant id to its tone + the `review.quadrant.<key>` translation subtree.
const QUADRANT_META: Record<string, { key: string; tone: string }> = {
  earned_win: { key: 'earnedWin', tone: 'text-buy' },
  well_played_loss: { key: 'wellPlayedLoss', tone: 'text-watch' },
  honest_tuition: { key: 'honestTuition', tone: 'text-ink' },
  dangerous_success: { key: 'dangerousSuccess', tone: 'text-hold' },
};

function ConstitutionPanel({ backendStatus }: { backendStatus: BackendStatus }) {
  const { t } = useTranslation();
  const [compliance, setCompliance] = useState<ConstitutionCompliance | null>(null);
  const [rules, setRules] = useState<ConstitutionRules | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (backendStatus !== 'online') return;
    backendClient
      .getConstitutionCompliance()
      .then((response) => {
        setCompliance(response);
        setRules(response.rules);
      })
      .catch(() => setCompliance(null));
  }, [backendStatus]);

  if (!rules) return null;

  const handleAdopt = async () => {
    setSaving(true);
    try {
      await backendClient.saveConstitution(rules);
      const response = await backendClient.getConstitutionCompliance();
      setCompliance(response);
      setRules(response.rules);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-8 rounded-xl border border-border bg-white/[0.03] p-5">
      <div className="flex items-center gap-2">
        <ScrollText size={16} className="text-accent" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
          {t('review.constitution.title')}
        </h2>
        {compliance?.adopted ? (
          <span className="ml-auto rounded-full border border-buy/40 px-2.5 py-0.5 text-xs text-buy">
            {t('review.constitution.adopted')}
          </span>
        ) : (
          <span className="ml-auto text-xs text-muted/70">
            {t('review.constitution.notAdopted')}
          </span>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/40 px-3 py-2.5 text-sm text-ink">
          {t('review.constitution.maxRisk')}
          <input
            type="number"
            min={0.1}
            max={10}
            step={0.1}
            value={rules.max_risk_percent}
            onChange={(event) =>
              setRules({ ...rules, max_risk_percent: Number(event.target.value) })
            }
            className="w-20 rounded border border-border bg-panel px-2 py-1 text-right text-ink focus:border-accent focus:outline-none"
          />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/40 px-3 py-2.5 text-sm text-ink">
          {t('review.constitution.maxTrades')}
          <input
            type="number"
            min={1}
            max={50}
            value={rules.daily_max_trades}
            onChange={(event) =>
              setRules({ ...rules, daily_max_trades: Number(event.target.value) })
            }
            className="w-20 rounded border border-border bg-panel px-2 py-1 text-right text-ink focus:border-accent focus:outline-none"
          />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/40 px-3 py-2.5 text-sm text-ink">
          {t('review.constitution.requireStop')}
          <input
            type="checkbox"
            checked={rules.require_stop}
            onChange={(event) => setRules({ ...rules, require_stop: event.target.checked })}
            className="h-4 w-4 accent-indigo-500"
          />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/40 px-3 py-2.5 text-sm text-ink">
          {t('review.constitution.requireReason')}
          <input
            type="checkbox"
            checked={rules.require_reason}
            onChange={(event) => setRules({ ...rules, require_reason: event.target.checked })}
            className="h-4 w-4 accent-indigo-500"
          />
        </label>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleAdopt()}
          className="rounded-lg border border-accent/50 px-4 py-2 text-xs font-semibold text-accent transition-colors hover:bg-accent/15 disabled:opacity-40"
        >
          {saving
            ? t('common.saving')
            : compliance?.adopted
              ? t('review.constitution.amend')
              : t('review.constitution.adopt')}
        </button>
        {compliance?.adopted ? (
          <span className="text-xs text-muted/70">
            {t('review.constitution.tradesUsed', {
              used: compliance.trades_today,
              max: compliance.rules.daily_max_trades,
            })}
          </span>
        ) : null}
      </div>

      {compliance?.adopted && compliance.total_trades > 0 ? (
        <ul className="mt-4 space-y-1.5">
          {compliance.checks.map((check) => (
            <li key={check.id} className="flex items-center gap-2 text-sm">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  check.violations === 0 ? 'bg-buy' : 'bg-hold'
                }`}
              />
              <span className="text-muted">{check.label}</span>
              <span className="ml-auto text-xs text-muted/70">
                {check.violations === 0
                  ? t('review.constitution.clean')
                  : t('review.constitution.violations', {
                      count: check.violations,
                      total: compliance.total_trades,
                    })}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function ReviewScreen({ backendStatus }: { backendStatus: BackendStatus }) {
  const { t } = useTranslation();
  const [coach, setCoach] = useState<CoachResponse | null>(null);
  const [narrative, setNarrative] = useState<CoachNarrative | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (backendStatus !== 'online') return;
    backendClient
      .getReviewCoach()
      .then(setCoach)
      .catch(() => setError(t('review.loadError')));
    backendClient
      .getCoachNarrative()
      .then(setNarrative)
      .catch(() => setNarrative(null));
  }, [backendStatus, t]);

  const summary = coach?.summary;
  const quadrants = summary?.quadrants ?? {};

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center gap-2">
        <ClipboardCheck size={20} className="text-accent" />
        <h1 className="text-lg font-semibold text-ink">{t('review.title')}</h1>
        <span className="ml-auto text-xs text-muted/70">{t('review.tagline')}</span>
      </div>

      <BackendStatusNotice status={backendStatus} />
      {error ? (
        <p className="mt-6 rounded-xl border border-hold/30 bg-hold/10 p-4 text-sm text-hold">
          {error}
        </p>
      ) : null}
      {!coach && !error && backendStatus !== 'offline' ? (
        <div className="mt-6 space-y-3" aria-busy="true">
          {[1, 2].map((n) => (
            <div key={n} className="h-36 animate-pulse rounded-xl bg-white/5" />
          ))}
        </div>
      ) : null}

      {coach ? (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <MetricTile
              label={t('review.tiles.trades7d')}
              helper={t('review.tiles.trades7dHelper')}
            >
              <CountUp value={coach.weekly.trades} format={(n) => String(Math.round(n))} />
            </MetricTile>
            <MetricTile
              label={t('review.tiles.process7d')}
              hero
              toneClass={
                coach.weekly.average_process_score >= (summary?.process_good_bar ?? 70)
                  ? 'text-buy'
                  : 'text-watch'
              }
              helper={t('review.tiles.process7dHelper', { bar: summary?.process_good_bar ?? 70 })}
            >
              <CountUp
                value={coach.weekly.average_process_score}
                format={(n) => String(Math.round(n))}
              />
            </MetricTile>
            <MetricTile
              label={t('review.tiles.tradesAll')}
              helper={t('review.tiles.tradesAllHelper')}
            >
              <CountUp value={summary?.trades ?? 0} format={(n) => String(Math.round(n))} />
            </MetricTile>
            <MetricTile
              label={t('review.tiles.processAll')}
              helper={t('review.tiles.processAllHelper')}
            >
              <CountUp
                value={summary?.average_process_score ?? 0}
                format={(n) => String(Math.round(n))}
              />
            </MetricTile>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Object.entries(QUADRANT_META).map(([key, meta], index) => (
              <FadeIn key={key} delayMs={index * 50}>
                <div className="rounded-2xl border border-border bg-gradient-to-b from-white/[0.05] to-white/[0.01] p-4 shadow-md shadow-black/15">
                  <p className={`metric-text text-2xl ${meta.tone}`}>{quadrants[key] ?? 0}</p>
                  <p className="mt-1 text-xs font-medium text-muted">
                    {t(`review.quadrant.${meta.key}.label`)}
                  </p>
                  <p className="text-[11px] text-muted/70">
                    {t(`review.quadrant.${meta.key}.hint`)}
                  </p>
                </div>
              </FadeIn>
            ))}
          </div>

          {narrative ? (
            <div className="mt-6 rounded-xl border border-accent/30 bg-accent/10 p-5">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-accent">
                  {t('review.coachNote')}
                </p>
                <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted">
                  {narrative.source}
                </span>
              </div>
              <AiMarkdown className="mt-2 text-sm leading-relaxed text-ink">
                {narrative.summary}
              </AiMarkdown>
            </div>
          ) : null}

          <h2 className="mt-8 text-sm font-semibold uppercase tracking-wider text-muted">
            {t('review.whatKeepsHappening')}
          </h2>
          {coach.detections.length === 0 ? (
            <p className="mt-3 rounded-xl border border-buy/30 bg-buy/10 p-4 text-sm text-buy">
              {t('review.noMistakes')}
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {coach.detections.map((detection) => (
                <div
                  key={detection.id}
                  className="rounded-xl border border-hold/30 bg-white/[0.03] p-4"
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={15} className="shrink-0 text-hold" />
                    <p className="font-medium text-ink">{detection.label}</p>
                    <span className="ml-auto rounded-full border border-hold/40 px-2 py-0.5 text-xs text-hold">
                      ×{detection.count}
                    </span>
                  </div>
                  {detection.symbols.filter(Boolean).length ? (
                    <p className="mt-1 text-xs text-muted/70">
                      {t('review.seenOn', {
                        symbols: detection.symbols.filter(Boolean).join(', '),
                      })}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-muted">{t('review.trainTheFix')}</span>
                    {detection.lessons.map((lesson) => (
                      <Link
                        key={lesson.id}
                        to="/learn"
                        className="rounded-full border border-accent/40 px-2.5 py-1 text-accent transition-colors hover:bg-accent/15"
                      >
                        {lesson.title}
                      </Link>
                    ))}
                    {detection.missions.map((mission) => (
                      <Link
                        key={mission}
                        to="/missions"
                        className="rounded-full border border-buy/40 px-2.5 py-1 text-buy transition-colors hover:bg-buy/15"
                      >
                        {t('review.missionLabel', { name: mission.replace(/-/g, ' ') })}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <ConstitutionPanel backendStatus={backendStatus} />
          <p className="mt-6 text-xs text-muted/70">{t('review.footer')}</p>
        </>
      ) : null}
    </div>
  );
}
