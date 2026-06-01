// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { ArrowRight, BookmarkPlus, CircleSlash2, TrendingDown, TrendingUp } from 'lucide-react';
import { DataStateView, Button, EmptyState, ErrorState, LoadingSkeleton, MetricStat, Panel, SectionHeading, SignalChip, ConfidenceRing } from '../components/ui';
import { Sparkline } from '../components/charts';
import { formatCurrency, formatPercent } from '../lib/format';
import type { CorridorIngestResult, PaperAccount, ScreenState, SignalRecord, SymbolRecord } from '../types';

export function DashboardScreen({
  state,
  symbols,
  signals,
  watchlistIds,
  paperAccount,
  marketCorridorItems,
  marketCorridorRefreshing,
  onRefreshMarketCorridor,
  onOpenSymbol,
  onOpenSignal,
  onRunBacktest,
}: {
  state: ScreenState;
  symbols: SymbolRecord[];
  signals: SignalRecord[];
  watchlistIds: string[];
  paperAccount: PaperAccount;
  marketCorridorItems: CorridorIngestResult[];
  marketCorridorRefreshing: boolean;
  onRefreshMarketCorridor: () => void;
  onOpenSymbol: (symbolId: string) => void;
  onOpenSignal: (signalId: string) => void;
  onRunBacktest: (symbolId: string, setupType: string) => void;
}) {
  const latestSignals = [...signals]
    .sort((left, right) => Date.parse(right.signal.generated_at_utc) - Date.parse(left.signal.generated_at_utc))
    .slice(0, 4);
  const watchlist = symbols.filter((symbol) => watchlistIds.includes(symbol.id)).slice(0, 5);
  const regime = signals.filter((signal) => signal.signal.signal === 'BUY_ZONE').length >= 3 ? 'Risk-On / Trending' : 'Mixed / Rotational';
  const corridorBySymbol = new Map(marketCorridorItems.map((item) => [item.symbol, item]));
  const retryMockView = () => window.location.reload();

  return (
    <div className="space-y-8">
      <SectionHeading
        eyebrow="Dashboard"
        title="Cross-market decision support"
        description="Market regime, current signal inventory, watchlist momentum, and paper-account exposure with backend corridor prices and backend-generated signals."
        action={
          <Button variant="secondary" onClick={onRefreshMarketCorridor} disabled={marketCorridorRefreshing}>
            {marketCorridorRefreshing ? 'Refreshing corridor...' : 'Refresh corridor'}
          </Button>
        }
      />

      {state !== 'ready' ? (
        <div className="grid gap-4 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Panel key={index}>
              <LoadingSkeleton rows={2} />
            </Panel>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-4">
          <Panel>
            <MetricStat label="Paper Balance" value={formatCurrency(paperAccount.balance)} helper={`${paperAccount.openPositions.length} open paper positions`} tone="default" />
          </Panel>
          <Panel>
            <MetricStat label="Realized P&L" value={formatCurrency(paperAccount.realizedPnl)} helper="Backend paper account since inception" tone="buy" />
          </Panel>
          <Panel>
            <MetricStat label="Market Regime" value={regime} helper="Derived from current backend signal inventory" tone="watch" />
          </Panel>
          <Panel>
            <MetricStat label="Active Signals" value={signals.filter((signal) => signal.status === 'active').length} helper="Closed-candle only signals" tone="hold" />
          </Panel>
        </div>
      )}

      <Panel className="overflow-hidden p-0">
        <DataStateView
          state={state}
          isEmpty={symbols.length === 0}
          loading={<LoadingSkeleton rows={6} />}
          empty={
            <EmptyState
              title="Dashboard overview is empty"
                description="The market strip and paper-account snapshot are in their explicit empty-state variant for this surface."
                action={<Button variant="secondary" onClick={() => onOpenSymbol(symbols[0]?.id ?? 'BTCUSD')}>Open a symbol</Button>}
            />
          }
          error={<ErrorState title="Dashboard overview unavailable" description="The market overview strip and paper-account snapshot could not be loaded." onRetry={retryMockView} />}
          populated={
            <div className="grid gap-4 border-b border-border p-5 lg:grid-cols-[1.6fr,1fr]">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Market overview strip</p>
                    <h3 className="text-lg font-semibold text-ink">BTC, SPY, and sector breadth</h3>
                  </div>
                  <div className="rounded-full border border-buy/30 bg-buy/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-buy">{regime}</div>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {symbols.slice(0, 6).map((symbol) => (
                    <button
                      key={symbol.id}
                      type="button"
                      className="rounded-2xl border border-border bg-white/[0.03] p-4 text-left transition hover:bg-white/[0.05]"
                      onClick={() => onOpenSymbol(symbol.id)}
                    >
                      <div className="mb-3 flex items-center justify-between gap-4">
                        <div>
                          <p className="font-medium text-ink">{symbol.symbol}</p>
                          <p className="text-xs text-muted">{symbol.name}</p>
                          {corridorBySymbol.get(symbol.id) ? <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-accent">Live {corridorBySymbol.get(symbol.id)?.timeframe} via {corridorBySymbol.get(symbol.id)?.provider}</p> : null}
                        </div>
                        <div className={symbol.changePercent >= 0 ? 'text-buy' : 'text-sell'}>
                          {symbol.changePercent >= 0 ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
                        </div>
                      </div>
                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <p className="metric-text text-lg text-ink">{formatCurrency(symbol.lastPrice)}</p>
                          <p className={symbol.changePercent >= 0 ? 'text-sm text-buy' : 'text-sm text-sell'}>{formatPercent(symbol.changePercent)}</p>
                        </div>
                        <Sparkline values={symbol.sparkline} positive={symbol.changePercent >= 0} />
                      </div>
                      {corridorBySymbol.get(symbol.id)?.diagnostics.length ? <p className="mt-3 text-xs text-hold">Diagnostics: {corridorBySymbol.get(symbol.id)?.diagnostics.join(', ')}</p> : null}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3 rounded-[26px] border border-border bg-white/[0.03] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Paper account snapshot</p>
                {paperAccount.openPositions.map((position) => (
                  <div key={position.symbolId} className="flex items-center justify-between rounded-2xl border border-border bg-white/[0.03] p-3">
                    <div>
                      <p className="font-medium text-ink">{position.symbolId}</p>
                      <p className="text-xs text-muted">
                        {position.side.toUpperCase()} · {position.quantity} @ {formatCurrency(position.averagePrice)}
                      </p>
                    </div>
                    <div className={position.pnl >= 0 ? 'metric-text text-buy' : 'metric-text text-sell'}>{formatCurrency(position.pnl)}</div>
                  </div>
                ))}
              </div>
            </div>
          }
        />
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[1.35fr,1fr]">
        <Panel>
          <SectionHeading
            eyebrow="Latest signals"
            title="Evidence-based signal feed"
            description="Every card routes to a symbol detail screen or the full signal drawer. Low-confidence setups are de-emphasized."
          />
          <div className="mt-5">
            <DataStateView
              state={state}
              isEmpty={latestSignals.length === 0}
              loading={<LoadingSkeleton rows={4} />}
              empty={
                <EmptyState
                  title="No latest signals to show"
                  description="This feed is intentionally empty in this state so the dashboard still exposes a defined empty state."
                  action={<Button variant="secondary" onClick={() => onOpenSymbol(symbols[0]?.id ?? 'BTCUSD')}>Open symbol detail</Button>}
                />
              }
              error={<ErrorState title="Signal feed unavailable" description="The latest-signals card feed could not be loaded." onRetry={retryMockView} />}
              populated={
                <div className="grid gap-4 lg:grid-cols-2">
                  {latestSignals.map((record) => (
                    <div
                      key={record.id}
                      className={`rounded-[26px] border border-border bg-white/[0.03] p-4 text-left transition hover:bg-white/[0.05] ${record.signal.confidence < 55 ? 'opacity-75' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-ink">{record.signal.symbol}</p>
                          <p className="text-xs text-muted">{record.signal.timeframe} · {record.status}</p>
                        </div>
                        <SignalChip signal={record.signal.signal} subdued={record.signal.confidence < 55} />
                      </div>
                      <div className="mt-4 flex items-center gap-4">
                        <ConfidenceRing value={record.signal.confidence} size={62} />
                        <div className="space-y-2">
                          <p className="metric-text text-xl text-ink">R:R {record.signal.risk_reward.toFixed(1)}</p>
                          <p className="text-sm text-muted">{record.signal.confidence_basis.setup_type}</p>
                          {record.signal.confidence < 55 ? (
                            <p className="text-xs font-medium text-hold">Low-confidence signal de-emphasized</p>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-4 flex items-center justify-between text-sm text-muted">
                        <span>{record.signal.generated_at_utc.replace('T', ' ').slice(0, 16)}Z</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="rounded-full border border-border px-3 py-1 text-xs font-medium text-ink transition hover:bg-white/5"
                            onClick={() => onOpenSymbol(record.symbolId)}
                          >
                            Open symbol
                          </button>
                          <button
                            type="button"
                            className="rounded-full border border-border px-3 py-1 text-xs font-medium text-ink transition hover:bg-white/5"
                            onClick={(event) => {
                              event.stopPropagation();
                              onOpenSignal(record.id);
                            }}
                          >
                            View signal
                          </button>
                          <button
                            type="button"
                            className="rounded-full border border-border px-3 py-1 text-xs font-medium text-ink transition hover:bg-white/5"
                            onClick={(event) => {
                              event.stopPropagation();
                              onRunBacktest(record.symbolId, record.signal.confidence_basis.setup_type);
                            }}
                          >
                            <CircleSlash2 className="mr-1 inline size-3.5" />
                            Backtest
                          </button>
                          <ArrowRight className="size-4" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              }
            />
          </div>
        </Panel>

        <Panel>
          <SectionHeading eyebrow="Watchlist snapshot" title="Focus list" description="Compact symbols with sparkline, last price, change, and active-signal state." />
          <div className="mt-5">
            <DataStateView
              state={state}
              isEmpty={watchlist.length === 0}
              loading={<LoadingSkeleton rows={5} />}
              empty={
                <EmptyState
                  title="Watchlist snapshot is empty"
                  description="The dashboard snapshot has no rows in this state, but the screen stays navigable and explicitly handled."
                  action={<Button variant="secondary" onClick={() => onOpenSymbol(symbols[0]?.id ?? 'BTCUSD')}>Browse a symbol</Button>}
                />
              }
              error={<ErrorState title="Watchlist snapshot unavailable" description="The dashboard watchlist panel could not be loaded." onRetry={retryMockView} />}
              populated={
                <div className="space-y-3">
                  {watchlist.map((symbol) => {
                    const latestSignal = signals.find((record) => record.symbolId === symbol.id);
                    return (
                      <div
                        key={symbol.id}
                        className="flex w-full items-center justify-between gap-4 rounded-2xl border border-border bg-white/[0.03] p-4 text-left transition hover:bg-white/[0.05]"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate font-medium text-ink">{symbol.symbol}</p>
                            {latestSignal ? <SignalChip signal={latestSignal.signal.signal} subdued={latestSignal.signal.confidence < 55} /> : null}
                          </div>
                          <div className="mt-2 flex items-center gap-4 text-sm text-muted">
                            <span className="metric-text text-ink">{formatCurrency(symbol.lastPrice)}</span>
                            <span className={symbol.changePercent >= 0 ? 'text-buy' : 'text-sell'}>{formatPercent(symbol.changePercent)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Sparkline values={symbol.sparkline} positive={symbol.changePercent >= 0} />
                          <button
                            type="button"
                            className="rounded-full border border-border p-2 text-muted transition hover:bg-white/5 hover:text-ink"
                            onClick={() => onOpenSymbol(symbol.id)}
                            aria-label={`Open ${symbol.symbol}`}
                          >
                            <BookmarkPlus className="size-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              }
            />
          </div>
        </Panel>
      </div>
    </div>
  );
}