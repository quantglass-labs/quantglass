// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { ArrowRight, CircleSlash2, Flame } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  DataStateView,
  Button,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  Panel,
  SectionHeading,
  SignalChip,
  ConfidenceRing,
} from '../components/ui';
import { Sparkline } from '../components/charts';
import { CountUp, FadeIn } from '../components/motion';
import { MetricTile } from '../components/surface';
import { freshnessClassName, signalFreshness } from '../lib/freshness';
import { formatCurrency, formatPercent } from '../lib/format';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { backendClient } from '../lib/backend';
import { AiMarkdown } from '../components/AiMarkdown';
import type {
  Candle,
  CorridorIngestResult,
  PaperAccount,
  ScreenState,
  SignalRecord,
  SymbolRecord,
} from '../types';

const timeframePriority = ['15m', '1h', '4h', '1d'];

function marketCandleKey(symbol: string, timeframe: string) {
  return `${symbol}:${timeframe}`;
}

function selectDisplayCorridor(symbol: SymbolRecord, marketCorridorItems: CorridorIngestResult[]) {
  const candidates = marketCorridorItems.filter((item) => item.symbol === symbol.id);
  if (!candidates.length) {
    return null;
  }
  const preferred = symbol.marketType === 'stocks' ? ['1d'] : timeframePriority;
  return [...candidates].sort((left, right) => {
    const leftTime = Date.parse(left.latest_open_time_utc ?? '');
    const rightTime = Date.parse(right.latest_open_time_utc ?? '');
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    const leftPriority = preferred.indexOf(left.timeframe);
    const rightPriority = preferred.indexOf(right.timeframe);
    return (leftPriority === -1 ? 99 : leftPriority) - (rightPriority === -1 ? 99 : rightPriority);
  })[0];
}

function buildMarketDisplay(
  symbol: SymbolRecord,
  marketCorridorItems: CorridorIngestResult[],
  marketCandlesByKey: Record<string, Candle[]>,
) {
  const corridor = selectDisplayCorridor(symbol, marketCorridorItems);
  const candles = corridor
    ? (marketCandlesByKey[marketCandleKey(corridor.symbol, corridor.timeframe)] ?? [])
    : [];
  const closes = candles.map((candle) => candle.close).filter((value) => Number.isFinite(value));
  const latestClose = closes.length
    ? closes[closes.length - 1]
    : typeof corridor?.latest_close === 'number'
      ? corridor.latest_close
      : symbol.lastPrice;
  const previousClose = closes.length > 1 ? closes[closes.length - 2] : null;
  const changePercent =
    previousClose && previousClose !== 0
      ? ((latestClose - previousClose) / previousClose) * 100
      : symbol.changePercent;
  const sparkline = closes.length >= 2 ? closes.slice(-24) : symbol.sparkline;

  return {
    corridor,
    latestClose,
    changePercent,
    sparkline,
    hasBackendCandles: closes.length >= 2,
    sourceLabel: corridor
      ? `${corridor.timeframe} closed candles via ${corridor.provider}`
      : 'catalog fallback',
  };
}

type MarketRow = { symbol: SymbolRecord; display: ReturnType<typeof buildMarketDisplay> };

// Dense market-grid cell: ticker, % change (regime-colored left edge), price,
// sparkline — so the whole universe is visible at a glance.
function GridCell({ row, onOpen }: { row: MarketRow; onOpen: (id: string) => void }) {
  const up = row.display.changePercent >= 0;
  return (
    <button
      type="button"
      onClick={() => onOpen(row.symbol.id)}
      className={`group rounded-xl border border-l-2 border-border bg-white/[0.02] p-2.5 text-left transition hover:border-accent/40 hover:bg-white/[0.05] ${
        up ? 'border-l-buy/60' : 'border-l-sell/60'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold text-ink">{row.symbol.symbol}</span>
        <span className={`text-xs font-medium tabular-nums ${up ? 'text-buy' : 'text-sell'}`}>
          {formatPercent(row.display.changePercent)}
        </span>
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <span className="metric-text text-[13px] text-muted">
          {formatCurrency(row.display.latestClose)}
        </span>
        <Sparkline values={row.display.sparkline} positive={up} />
      </div>
    </button>
  );
}

// Surfaces the Missions discipline streak on the home screen — a gentle pull
// back into the practice loop. Rewards consistency, never P&L; only appears
// once a streak exists.
function StreakChip() {
  const { t } = useTranslation();
  const [streak, setStreak] = useState<number | null>(null);
  const [activeToday, setActiveToday] = useState(false);
  useEffect(() => {
    // Cheap streak-only call — must not drag the home screen into a full
    // mission evaluation.
    backendClient
      .getStreakSummary()
      .then((b) => {
        setStreak(b.streak);
        setActiveToday(b.active_today);
      })
      .catch(() => undefined);
  }, []);
  if (!streak) return null;
  return (
    <Link
      to="/missions"
      title={t('dashboard.streakChipTitle')}
      className="flex items-center gap-2 rounded-full border border-hold/30 bg-hold/10 px-3 py-1.5 text-xs font-semibold text-hold transition-colors hover:border-hold/50"
    >
      <Flame
        size={14}
        className={activeToday ? 'drop-shadow-[0_0_6px_rgba(240,184,75,0.55)]' : ''}
      />
      {streak} {t('missions.daily.dayStreak')}
    </Link>
  );
}

export function DashboardScreen({
  onClosePosition,
  state,
  symbols,
  signals,
  paperAccount,
  marketCorridorItems,
  marketCandlesByKey,
  marketCorridorRefreshing,
  onRefreshMarketCorridor,
  onOpenSymbol,
  onOpenSignal,
  onRunBacktest,
}: {
  onClosePosition?: (symbolId: string) => void;
  state: ScreenState;
  symbols: SymbolRecord[];
  signals: SignalRecord[];
  watchlistIds: string[];
  paperAccount: PaperAccount;
  marketCorridorItems: CorridorIngestResult[];
  marketCandlesByKey: Record<string, Candle[]>;
  marketCorridorRefreshing: boolean;
  onRefreshMarketCorridor: () => void;
  onOpenSymbol: (symbolId: string) => void;
  onOpenSignal: (signalId: string) => void;
  onRunBacktest: (symbolId: string, setupType: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const now = new Date();
  const hour = now.getHours();
  const greeting = t(
    hour < 12
      ? 'dashboard.greeting.morning'
      : hour < 18
        ? 'dashboard.greeting.afternoon'
        : 'dashboard.greeting.evening',
  );
  const todayLabel = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(now);
  const marketRows: MarketRow[] = symbols.map((symbol) => ({
    symbol,
    display: buildMarketDisplay(symbol, marketCorridorItems, marketCandlesByKey),
  }));
  const movers = [...marketRows]
    .filter((row) => Number.isFinite(row.display.changePercent) && row.display.changePercent !== 0)
    .sort((a, b) => Math.abs(b.display.changePercent) - Math.abs(a.display.changePercent))
    .slice(0, 8);
  const actionable = [...signals]
    .filter((record) => record.signal.signal === 'BUY_ZONE' || record.signal.signal === 'SELL')
    .sort((a, b) => b.signal.confidence - a.signal.confidence);
  const heroSignals = (
    actionable.length
      ? actionable
      : [...signals].sort((a, b) => b.signal.confidence - a.signal.confidence)
  ).slice(0, 6);
  const activeCount = signals.filter((record) => record.status === 'active').length;
  const buyCount = signals.filter((record) => record.signal.signal === 'BUY_ZONE').length;
  const regime = buyCount >= 3 ? t('dashboard.regime.riskOn') : t('dashboard.regime.mixed');
  const retryMockView = () => window.location.reload();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
            {greeting}
            <span className="ms-2 font-normal normal-case tracking-normal text-muted/70">
              {todayLabel}
            </span>
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-ink">{t('dashboard.title')}</h1>
        </div>
        <div className="flex items-center gap-3">
          <StreakChip />
          <Button
            variant="secondary"
            onClick={onRefreshMarketCorridor}
            disabled={marketCorridorRefreshing}
          >
            {marketCorridorRefreshing ? t('dashboard.refreshing') : t('dashboard.refresh')}
          </Button>
        </div>
      </div>

      {state !== 'ready' ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Panel key={index}>
              <LoadingSkeleton rows={2} />
            </Panel>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricTile
            label={t('dashboard.tiles.activeSignals')}
            hero
            toneClass={activeCount > 0 ? 'text-accent' : 'text-muted'}
            helper={t('dashboard.tiles.activeSignalsHelper', { count: heroSignals.length })}
          >
            <CountUp value={activeCount} format={(n) => String(Math.round(n))} />
          </MetricTile>
          <MetricTile
            label={t('dashboard.tiles.marketRegime')}
            toneClass={buyCount >= 3 ? 'text-buy' : 'text-watch'}
            helper={t('dashboard.tiles.marketRegimeHelper')}
          >
            <span className="text-2xl">{regime}</span>
          </MetricTile>
          <MetricTile
            label={t('dashboard.tiles.paperBalance')}
            helper={t('dashboard.tiles.paperBalanceHelper', {
              count: paperAccount.openPositions.length,
            })}
          >
            <CountUp value={paperAccount.balance} format={(n) => formatCurrency(n)} />
          </MetricTile>
          <MetricTile
            label={t('dashboard.tiles.realizedPnl')}
            toneClass={paperAccount.realizedPnl >= 0 ? 'text-buy' : 'text-sell'}
            helper={t('dashboard.tiles.realizedPnlHelper')}
          >
            <CountUp value={paperAccount.realizedPnl} format={(n) => formatCurrency(n)} />
          </MetricTile>
        </div>
      )}

      <Panel>
        <SectionHeading
          eyebrow={t('dashboard.topSignals.eyebrow')}
          title={t('dashboard.topSignals.title')}
          description={t('dashboard.topSignals.description')}
        />
        <div className="mt-5">
          <DataStateView
            state={state}
            isEmpty={heroSignals.length === 0}
            loading={<LoadingSkeleton rows={4} />}
            empty={
              <EmptyState
                title={t('dashboard.topSignals.emptyTitle')}
                description={t('dashboard.topSignals.emptyDescription')}
              />
            }
            error={
              <ErrorState
                title={t('dashboard.topSignals.errorTitle')}
                description={t('dashboard.topSignals.errorDescription')}
                onRetry={retryMockView}
              />
            }
            populated={
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {heroSignals.map((record, index) => {
                  const fresh = signalFreshness(record.signal);
                  return (
                    <FadeIn key={record.id} delayMs={index * 50}>
                      <div className="group flex h-full items-center gap-4 rounded-2xl border border-border bg-gradient-to-b from-white/[0.05] to-white/[0.01] p-4 shadow-md shadow-black/15 transition hover:border-accent/40 hover:bg-white/[0.06]">
                        <ConfidenceRing value={record.signal.confidence} size={56} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold text-ink">
                              {record.signal.symbol}
                            </span>
                            <SignalChip
                              signal={record.signal.signal}
                              subdued={record.signal.confidence < 55}
                            />
                          </div>
                          <p className="mt-1 text-xs text-muted">
                            {record.signal.timeframe} · {record.signal.confidence_basis.setup_type}
                          </p>
                          <p className="metric-text mt-1 text-sm text-ink">
                            R:R {record.signal.risk_reward.toFixed(1)} ·{' '}
                            <span className={freshnessClassName(fresh.tone)}>{fresh.label}</span>
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              type="button"
                              className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-ink transition hover:bg-white/5"
                              onClick={() => onOpenSignal(record.id)}
                            >
                              View signal
                            </button>
                            <button
                              type="button"
                              className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-ink transition hover:bg-white/5"
                              onClick={() =>
                                onRunBacktest(
                                  record.symbolId,
                                  record.signal.confidence_basis.setup_type,
                                )
                              }
                            >
                              <CircleSlash2 className="mr-1 inline size-3" />
                              Backtest
                            </button>
                          </div>
                        </div>
                        <ArrowRight className="size-4 shrink-0 self-start text-muted transition group-hover:text-ink" />
                      </div>
                    </FadeIn>
                  );
                })}
              </div>
            }
          />
        </div>
      </Panel>

      <DailyBrief />

      <Panel>
        <SectionHeading
          eyebrow={t('dashboard.grid.eyebrow')}
          title={t('dashboard.grid.title', { count: marketRows.length })}
          description={t('dashboard.grid.description')}
        />
        <div className="mt-5 grid gap-5 xl:grid-cols-[2.4fr,1fr]">
          <DataStateView
            state={state}
            isEmpty={marketRows.length === 0}
            loading={<LoadingSkeleton rows={6} />}
            empty={
              <EmptyState
                title={t('dashboard.grid.emptyTitle')}
                description={t('dashboard.grid.emptyDescription')}
              />
            }
            error={
              <ErrorState
                title={t('dashboard.grid.errorTitle')}
                description={t('dashboard.grid.errorDescription')}
                onRetry={retryMockView}
              />
            }
            populated={
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
                      buyCount >= 3
                        ? 'border-buy/30 bg-buy/12 text-buy'
                        : 'border-watch/30 bg-watch/12 text-watch'
                    }`}
                  >
                    {regime}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
                  {marketRows.map((row) => (
                    <GridCell key={row.symbol.id} row={row} onOpen={onOpenSymbol} />
                  ))}
                </div>
              </div>
            }
          />

          <div className="space-y-4">
            <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                {t('dashboard.movers.title')}
              </p>
              <div className="mt-3 space-y-1">
                {movers.length ? (
                  movers.map((row) => {
                    const up = row.display.changePercent >= 0;
                    return (
                      <button
                        key={row.symbol.id}
                        type="button"
                        onClick={() => onOpenSymbol(row.symbol.id)}
                        className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-left transition hover:bg-white/5"
                      >
                        <span className="text-sm font-medium text-ink">{row.symbol.symbol}</span>
                        <span className="metric-text text-xs text-muted">
                          {formatCurrency(row.display.latestClose)}
                        </span>
                        <span
                          className={`text-xs font-semibold tabular-nums ${
                            up ? 'text-buy' : 'text-sell'
                          }`}
                        >
                          {formatPercent(row.display.changePercent)}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted">{t('dashboard.movers.empty')}</p>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                {t('dashboard.paperAccount.title')}
              </p>
              {paperAccount.openPositions.length ? (
                <div className="mt-3 space-y-2">
                  {paperAccount.openPositions.map((position) => (
                    <div
                      key={position.symbolId}
                      className="flex items-center justify-between gap-2 rounded-xl border border-border bg-white/[0.03] p-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{position.symbolId}</p>
                        <p className="text-xs text-muted">
                          {position.side.toUpperCase()} · {position.quantity}
                        </p>
                      </div>
                      <span
                        className={
                          position.pnl >= 0
                            ? 'metric-text text-sm text-buy'
                            : 'metric-text text-sm text-sell'
                        }
                      >
                        {formatCurrency(position.pnl)}
                      </span>
                      {onClosePosition ? (
                        <button
                          type="button"
                          onClick={() => onClosePosition(position.symbolId)}
                          className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted transition hover:border-sell/50 hover:text-sell"
                        >
                          {t('common.close')}
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted">{t('dashboard.paperAccount.empty')}</p>
              )}
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function DailyBrief() {
  const { t } = useTranslation();
  const [brief, setBrief] = useState<{ summary: string; source: string } | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    backendClient
      .getDailyBrief()
      .then((response) => {
        setBrief(response);
        setState('ready');
      })
      .catch(() => setState('error'));
  }, []);
  if (state === 'loading') {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-white/[0.03] px-4 py-2.5">
        <span className="size-3 shrink-0 animate-spin rounded-full border-2 border-accent/30 border-t-accent motion-reduce:animate-none" />
        <p className="text-xs text-muted">{t('dashboard.brief.generating')}</p>
      </div>
    );
  }
  if (state === 'error' || !brief) {
    return null;
  }
  return (
    <div className="space-y-2 rounded-2xl border border-accent/25 bg-accentStrong/8 p-4">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
          {t('dashboard.brief.title')}
        </p>
        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted">
          {brief.source}
        </span>
      </div>
      <AiMarkdown className="text-sm leading-relaxed text-ink">{brief.summary}</AiMarkdown>
      <p className="text-[11px] text-muted">{t('dashboard.brief.footer')}</p>
    </div>
  );
}
