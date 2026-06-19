// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Daily briefing: the discipline streak + today's featured mission.
 *
 * The streak rewards *showing up and practising* — consecutive days of
 * Academy/mission work — never profit. Today's mission is a deterministic,
 * date-seeded pick from the user's incomplete missions so there is always one
 * clear, on-brand rep to do today.
 */

import { ArrowUpRight, CheckCircle2, Crosshair, Flame } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { DailyBriefing as DailyBriefingData } from '../../types';

function WeekStrip({ week, locale }: { week: DailyBriefingData['week']; locale: string }) {
  const narrow = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
  return (
    <div className="flex items-end gap-1.5">
      {week.map((dot, index) => {
        const today = index === week.length - 1;
        const day = new Date(`${dot.date}T00:00:00`);
        return (
          <div key={dot.date} className="flex flex-col items-center gap-1">
            <span
              title={dot.date}
              className={`size-2.5 rounded-full transition-colors ${
                dot.active
                  ? 'bg-hold'
                  : today
                    ? 'bg-transparent ring-1 ring-hold/60'
                    : 'bg-white/10'
              } ${today && dot.active ? 'ring-2 ring-hold/40' : ''}`}
            />
            <span className={`text-[9px] ${today ? 'text-hold/90' : 'text-muted/70'}`}>
              {narrow.format(day)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function DailyBriefing({
  briefing,
  onRunDrill,
  onAccept,
  slotsFull,
}: {
  briefing: DailyBriefingData;
  onRunDrill: (category: string) => void;
  onAccept: (id: string) => void;
  slotsFull: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { streak, longest, active_today: activeToday, week } = briefing;
  const daily = briefing.daily_mission;

  const subline = activeToday
    ? t('missions.daily.showedUp')
    : streak > 0
      ? t('missions.daily.keepAlive')
      : t('missions.daily.startToday');

  // Today's mission CTA: prefer a runnable decision drill, else accept it.
  const drillCriterion = daily?.criteria.find((c) => !c.met && c.drill);
  const met = daily ? daily.criteria.filter((c) => c.met).length : 0;

  return (
    <div className="relative mt-5 overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-panelStrong/60 to-panel/10 shadow-lg shadow-black/20">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 p-5">
        <div className="flex items-center gap-3">
          <div
            className={`flex size-12 items-center justify-center rounded-2xl ${
              streak > 0 ? 'bg-hold/15 text-hold' : 'bg-white/5 text-muted/60'
            }`}
          >
            <Flame
              size={22}
              className={activeToday ? 'drop-shadow-[0_0_8px_rgba(240,184,75,0.55)]' : ''}
            />
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="metric-text text-3xl leading-none text-ink">{streak}</span>
              <span className="text-sm text-muted">{t('missions.daily.dayStreak')}</span>
            </div>
            <p className="mt-1 max-w-xs text-xs text-muted/80">{subline}</p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-5">
          {longest > 0 ? (
            <div className="text-end">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted/70">
                {t('missions.daily.bestLabel')}
              </p>
              <p className="metric-text text-lg leading-tight text-ink">{longest}</p>
            </div>
          ) : null}
          <WeekStrip week={week} locale={i18n.language} />
        </div>
      </div>

      {daily ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-border bg-background/30 px-5 py-3.5">
          <Crosshair size={15} className="shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent/80">
              {t('missions.daily.todaysMission')}
            </p>
            <p className="mt-0.5 truncate text-sm font-semibold text-ink">
              {daily.title}
              <span className="ms-2 rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted">
                {t(`missions.levels.${daily.level}`, { defaultValue: daily.level })}
              </span>
            </p>
          </div>
          <span className="shrink-0 text-xs text-muted/70">
            {met}/{daily.criteria.length}
          </span>
          {drillCriterion ? (
            <button
              type="button"
              onClick={() => onRunDrill(drillCriterion.drill as string)}
              className="flex shrink-0 items-center gap-1 rounded-xl border border-buy/50 px-3 py-1.5 text-xs font-semibold text-buy transition-colors hover:bg-buy/15"
            >
              {t('missions.card.runDrill')} <ArrowUpRight size={12} />
            </button>
          ) : daily.active ? (
            <span className="shrink-0 rounded-xl border border-accent/40 px-3 py-1.5 text-xs font-semibold text-accent">
              {t('missions.card.activeBadge')}
            </span>
          ) : (
            <button
              type="button"
              disabled={slotsFull}
              onClick={() => onAccept(daily.id)}
              title={slotsFull ? t('missions.card.slotsFull') : ''}
              className="shrink-0 rounded-xl border border-accent/50 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t('missions.card.startMission')}
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 border-t border-border bg-background/30 px-5 py-3.5 text-sm text-buy">
          <CheckCircle2 size={15} className="shrink-0" />
          {t('missions.daily.allComplete')}
        </div>
      )}
    </div>
  );
}
