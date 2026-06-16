// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Bell, Search, Trash2 } from 'lucide-react';
import { AiInsight } from '../components/aiInsight';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkline } from '../components/charts';
import { CountUp, FadeIn } from '../components/motion';
import { MetricTile } from '../components/surface';
import {
  Button,
  DataStateView,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  Panel,
  SectionHeading,
  SignalChip,
} from '../components/ui';
import { formatCurrency, formatPercent } from '../lib/format';
import type { RelativeStrengthRanking, ScreenState, SignalRecord, SymbolRecord } from '../types';

export function WatchlistScreen({
  state,
  symbols,
  watchlistIds,
  signals,
  ranking,
  onToggleWatchlist,
  onTrackCustomSymbol,
  onOpenSymbol,
  onOpenAlertModal,
}: {
  state: ScreenState;
  symbols: SymbolRecord[];
  watchlistIds: string[];
  signals: SignalRecord[];
  ranking: RelativeStrengthRanking[];
  onToggleWatchlist: (symbolId: string) => void;
  onTrackCustomSymbol: (symbol: string, marketType: 'crypto' | 'stocks') => void;
  onOpenSymbol: (symbolId: string) => void;
  onOpenAlertModal: (symbolId: string, signalId?: string) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const watchlist = symbols.filter((symbol) => watchlistIds.includes(symbol.id));
  const candidates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return symbols.filter(
      (symbol) =>
        !watchlistIds.includes(symbol.id) &&
        (symbol.symbol.toLowerCase().includes(needle) ||
          symbol.name.toLowerCase().includes(needle)),
    );
  }, [query, symbols, watchlistIds]);
  // Offer to track a brand-new ticker when the typed symbol isn't already known.
  const trimmedQuery = query.trim();
  const canTrackCustom =
    trimmedQuery.length > 0 &&
    !symbols.some((symbol) => symbol.symbol.toLowerCase() === trimmedQuery.toLowerCase());
  const trackCustom = (marketType: 'crypto' | 'stocks') => {
    onTrackCustomSymbol(trimmedQuery, marketType);
    setQuery('');
  };
  const topRanked = useMemo(() => {
    const seen = new Set<string>();
    const deduped: RelativeStrengthRanking[] = [];
    for (const entry of ranking) {
      if (seen.has(entry.symbol)) continue;
      seen.add(entry.symbol);
      deduped.push(entry);
    }
    return deduped.slice(0, 6);
  }, [ranking]);
  const retryMockView = () => window.location.reload();

  return (
    <div className="space-y-8">
      <SectionHeading
        eyebrow={t('watchlist.eyebrow')}
        title={t('watchlist.title')}
        description={t('watchlist.description')}
        action={
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-muted" />

            <AiInsight surface="watchlist" title={t('watchlist.aiTitle')} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('watchlist.addPlaceholder')}
              className="w-full rounded-2xl border border-border bg-white/[0.04] py-3 ps-11 pe-4 text-sm text-ink outline-none focus:border-accent"
            />
            {candidates.length || canTrackCustom ? (
              <div className="glass-panel absolute left-0 right-0 top-[calc(100%+0.5rem)] rounded-3xl p-2">
                {candidates.slice(0, 5).map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    className="flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left transition hover:bg-white/5"
                    onClick={() => {
                      onToggleWatchlist(candidate.id);
                      setQuery('');
                    }}
                  >
                    <div>
                      <p className="font-medium text-ink">{candidate.symbol}</p>
                      <p className="text-xs text-muted">{candidate.name}</p>
                    </div>
                    <Button className="px-3 py-2 text-xs">{t('common.add')}</Button>
                  </button>
                ))}
                {canTrackCustom ? (
                  <div className="flex items-center justify-between gap-2 rounded-2xl px-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">
                        {t('watchlist.trackCustom', { symbol: trimmedQuery.toUpperCase() })}
                      </p>
                      <p className="text-xs text-muted">{t('watchlist.notListed')}</p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <Button className="px-3 py-2 text-xs" onClick={() => trackCustom('stocks')}>
                        {t('watchlist.trackStock')}
                      </Button>
                      <Button className="px-3 py-2 text-xs" onClick={() => trackCustom('crypto')}>
                        {t('watchlist.trackCrypto')}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricTile
          label={t('watchlist.tiles.onWatchlist')}
          hero
          helper={t('watchlist.tiles.onWatchlistHelper')}
        >
          <CountUp value={watchlist.length} format={(n) => String(Math.round(n))} />
        </MetricTile>
        <MetricTile
          label={t('watchlist.tiles.trackedUniverse')}
          helper={t('watchlist.tiles.trackedUniverseHelper')}
        >
          <CountUp value={symbols.length} format={(n) => String(Math.round(n))} />
        </MetricTile>
        <MetricTile
          label={t('watchlist.tiles.topRs')}
          toneClass="text-buy"
          helper={t('watchlist.tiles.topRsHelper')}
        >
          <CountUp
            value={topRanked[0]?.relative_strength_percentile ?? 0}
            format={(n) => String(Math.round(n))}
          />
        </MetricTile>
      </div>

      {topRanked.length ? (
        <Panel>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-ink">{t('watchlist.candidates.title')}</h3>
              <span className="text-xs text-muted">{t('watchlist.candidates.subtitle')}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {topRanked.map((entry, index) => {
                const symbolRecord = symbols.find((symbol) => symbol.id === entry.symbol);
                const positive = entry.momentum_score >= 0;
                return (
                  <FadeIn key={`${entry.symbol}:${entry.timeframe}`} delayMs={index * 50}>
                    <button
                      type="button"
                      onClick={() => symbolRecord && onOpenSymbol(symbolRecord.id)}
                      className="flex h-full w-full flex-col gap-2 rounded-3xl border border-border bg-gradient-to-b from-white/[0.05] to-white/[0.01] p-4 text-left shadow-md shadow-black/15 transition hover:border-accent/40 hover:bg-white/5"
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-ink">{entry.symbol}</p>
                        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                          {entry.timeframe}
                        </span>
                      </div>
                      <p className="metric-text text-2xl text-ink">
                        {entry.relative_strength_percentile.toFixed(0)}
                        <span className="text-sm text-muted"> {t('watchlist.rsSuffix')}</span>
                      </p>
                      <div className="flex items-center justify-between text-sm">
                        <span className={positive ? 'text-buy' : 'text-sell'}>
                          {formatPercent(entry.momentum_score * 100)}
                        </span>
                        <span className="text-xs text-muted">
                          {t('watchlist.peerRank', {
                            rank: entry.peer_rank,
                            total: entry.peer_group_size,
                            market: entry.market_type,
                          })}
                        </span>
                      </div>
                    </button>
                  </FadeIn>
                );
              })}
            </div>
          </div>
        </Panel>
      ) : null}

      <Panel>
        <DataStateView
          state={state}
          isEmpty={watchlist.length === 0}
          loading={<LoadingSkeleton rows={5} />}
          empty={
            <EmptyState
              title={t('watchlist.empty.title')}
              description={t('watchlist.empty.description')}
              action={
                <Button onClick={() => setQuery('BTC')}>{t('watchlist.empty.action')}</Button>
              }
            />
          }
          error={
            <ErrorState
              title={t('watchlist.error.title')}
              description={t('watchlist.error.description')}
              onRetry={retryMockView}
            />
          }
          populated={
            <div className="space-y-8">
              {(['crypto', 'stocks'] as const).map((market) => {
                const rows = watchlist.filter((symbol) => symbol.marketType === market);
                if (!rows.length) return null;
                return (
                  <div key={market} className="space-y-4">
                    <h3 className="text-lg font-semibold text-ink">
                      {t(`common.markets.${market}`)}
                    </h3>
                    <div className="space-y-3">
                      {rows.map((symbol) => {
                        const signal = signals.find((record) => record.symbolId === symbol.id);
                        return (
                          <div
                            key={symbol.id}
                            className="flex flex-col gap-4 rounded-3xl border border-border bg-white/[0.03] p-4 lg:flex-row lg:items-center lg:justify-between"
                          >
                            <button
                              type="button"
                              className="flex flex-1 items-center gap-4 text-left"
                              onClick={() => onOpenSymbol(symbol.id)}
                            >
                              <div>
                                <p className="font-medium text-ink">{symbol.symbol}</p>
                                <p className="text-xs text-muted">{symbol.name}</p>
                              </div>
                              <Sparkline
                                values={symbol.sparkline}
                                positive={symbol.changePercent >= 0}
                              />
                            </button>
                            <div className="flex flex-wrap items-center gap-4 lg:justify-end">
                              <div>
                                <p className="metric-text text-lg text-ink">
                                  {formatCurrency(symbol.lastPrice)}
                                </p>
                                <p
                                  className={
                                    symbol.changePercent >= 0
                                      ? 'text-sm text-buy'
                                      : 'text-sm text-sell'
                                  }
                                >
                                  {formatPercent(symbol.changePercent)}
                                </p>
                              </div>
                              {signal ? (
                                <SignalChip
                                  signal={signal.signal.signal}
                                  subdued={signal.signal.confidence < 55}
                                />
                              ) : null}
                              <button
                                type="button"
                                className="rounded-full border border-border p-2 text-muted transition hover:bg-white/5 hover:text-ink"
                                onClick={() => onOpenAlertModal(symbol.id, signal?.id)}
                                aria-label={t('watchlist.aria.alert', { symbol: symbol.symbol })}
                              >
                                <Bell className="size-4" />
                              </button>
                              <button
                                type="button"
                                className="rounded-full border border-border p-2 text-muted transition hover:bg-white/5 hover:text-ink"
                                onClick={() => onToggleWatchlist(symbol.id)}
                                aria-label={t('watchlist.aria.remove', { symbol: symbol.symbol })}
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          }
        />
      </Panel>
    </div>
  );
}
