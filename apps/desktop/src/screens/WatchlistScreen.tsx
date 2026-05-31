import { Bell, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Sparkline } from '../components/charts';
import { Button, DataStateView, EmptyState, ErrorState, LoadingSkeleton, Panel, SectionHeading, SignalChip } from '../components/ui';
import { formatCurrency, formatPercent } from '../lib/format';
import type { ScreenState, SignalRecord, SymbolRecord } from '../types';

export function WatchlistScreen({
  state,
  symbols,
  watchlistIds,
  signals,
  onToggleWatchlist,
  onOpenSymbol,
  onOpenAlertModal,
}: {
  state: ScreenState;
  symbols: SymbolRecord[];
  watchlistIds: string[];
  signals: SignalRecord[];
  onToggleWatchlist: (symbolId: string) => void;
  onOpenSymbol: (symbolId: string) => void;
  onOpenAlertModal: (symbolId: string, signalId?: string) => void;
}) {
  const [query, setQuery] = useState('');
  const watchlist = symbols.filter((symbol) => watchlistIds.includes(symbol.id));
  const candidates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return symbols.filter((symbol) => !watchlistIds.includes(symbol.id) && (symbol.symbol.toLowerCase().includes(needle) || symbol.name.toLowerCase().includes(needle)));
  }, [query, symbols, watchlistIds]);
  const retryMockView = () => window.location.reload();

  return (
    <div className="space-y-8">
      <SectionHeading
        eyebrow="Watchlist"
        title="Curated symbol monitor"
        description="Grouped crypto and stock rows with sparkline, last price, active signal chips, alert access, and removal actions."
        action={
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Add symbol" className="w-full rounded-2xl border border-border bg-white/[0.04] py-3 pl-11 pr-4 text-sm text-ink outline-none focus:border-accent" />
            {candidates.length ? (
              <div className="glass-panel absolute left-0 right-0 top-[calc(100%+0.5rem)] rounded-3xl p-2">
                {candidates.slice(0, 5).map((candidate) => (
                  <button key={candidate.id} type="button" className="flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left transition hover:bg-white/5" onClick={() => { onToggleWatchlist(candidate.id); setQuery(''); }}>
                    <div>
                      <p className="font-medium text-ink">{candidate.symbol}</p>
                      <p className="text-xs text-muted">{candidate.name}</p>
                    </div>
                    <Button className="px-3 py-2 text-xs">Add</Button>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        }
      />

      <Panel>
        <DataStateView
          state={state}
          isEmpty={watchlist.length === 0}
          loading={<LoadingSkeleton rows={5} />}
          empty={<EmptyState title="Watchlist is empty" description="Add your first symbol from the search field to populate the grouped crypto and stock views." action={<Button onClick={() => setQuery('BTC')}>Add your first symbol</Button>} />}
          error={<ErrorState title="Watchlist unavailable" description="The grouped watchlist rows could not be loaded." onRetry={retryMockView} />}
          populated={
            <div className="space-y-8">
              {(['crypto', 'stocks'] as const).map((market) => {
                const rows = watchlist.filter((symbol) => symbol.marketType === market);
                if (!rows.length) return null;
                return (
                  <div key={market} className="space-y-4">
                    <h3 className="text-lg font-semibold capitalize text-ink">{market}</h3>
                    <div className="space-y-3">
                      {rows.map((symbol) => {
                        const signal = signals.find((record) => record.symbolId === symbol.id);
                        return (
                          <div key={symbol.id} className="flex flex-col gap-4 rounded-3xl border border-border bg-white/[0.03] p-4 lg:flex-row lg:items-center lg:justify-between">
                            <button type="button" className="flex flex-1 items-center gap-4 text-left" onClick={() => onOpenSymbol(symbol.id)}>
                              <div>
                                <p className="font-medium text-ink">{symbol.symbol}</p>
                                <p className="text-xs text-muted">{symbol.name}</p>
                              </div>
                              <Sparkline values={symbol.sparkline} positive={symbol.changePercent >= 0} />
                            </button>
                            <div className="flex flex-wrap items-center gap-4 lg:justify-end">
                              <div>
                                <p className="metric-text text-lg text-ink">{formatCurrency(symbol.lastPrice)}</p>
                                <p className={symbol.changePercent >= 0 ? 'text-sm text-buy' : 'text-sm text-sell'}>{formatPercent(symbol.changePercent)}</p>
                              </div>
                              {signal ? <SignalChip signal={signal.signal.signal} subdued={signal.signal.confidence < 55} /> : null}
                              <button type="button" className="rounded-full border border-border p-2 text-muted transition hover:bg-white/5 hover:text-ink" onClick={() => onOpenAlertModal(symbol.id, signal?.id)} aria-label={`Alert ${symbol.symbol}`}>
                                <Bell className="size-4" />
                              </button>
                              <button type="button" className="rounded-full border border-border p-2 text-muted transition hover:bg-white/5 hover:text-ink" onClick={() => onToggleWatchlist(symbol.id)} aria-label={`Remove ${symbol.symbol}`}>
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