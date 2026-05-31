import { useMemo, useState } from 'react';
import { formatCurrency, formatDateTime } from '../lib/format';
import { Button, DataStateView, EmptyState, ErrorState, LoadingSkeleton, Panel, SectionHeading, SignalChip } from '../components/ui';
import type { MarketType, ScreenState, SignalRecord, SignalType, SymbolRecord, Timeframe } from '../types';

export function SignalsScreen({
  state,
  symbols,
  signals,
  marketFilter,
  onOpenSymbol,
  onOpenSignal,
  onOpenPaperTrade,
}: {
  state: ScreenState;
  symbols: SymbolRecord[];
  signals: SignalRecord[];
  marketFilter: MarketType | 'all';
  onOpenSymbol: (symbolId: string) => void;
  onOpenSignal: (signalId: string) => void;
  onOpenPaperTrade: (signalId: string) => void;
}) {
  const [signalType, setSignalType] = useState<'all' | SignalType>('all');
  const [minConfidence, setMinConfidence] = useState(0);
  const [timeframe, setTimeframe] = useState<'all' | Timeframe>('all');
  const [activeOnly, setActiveOnly] = useState(false);

  const rows = useMemo(
    () =>
      signals.filter((record) => {
        if (marketFilter !== 'all' && record.marketType !== marketFilter) return false;
        if (signalType !== 'all' && record.signal.signal !== signalType) return false;
        if (record.signal.confidence < minConfidence) return false;
        if (timeframe !== 'all' && record.signal.timeframe !== timeframe) return false;
        if (activeOnly && record.status !== 'active') return false;
        return true;
      }),
    [activeOnly, marketFilter, minConfidence, signalType, signals, timeframe],
  );
  const retryMockView = () => window.location.reload();

  return (
    <div className="space-y-8">
      <SectionHeading
        eyebrow="Signals"
        title="Filterable signal inventory"
        description="Current and historical signals with setup type, expectancy, status, and direct routing to the symbol detail screen or signal drawer. Signal records are generated from stored market corridor candles on the backend."
      />

      <Panel>
        <div className="grid gap-3 lg:grid-cols-[repeat(4,minmax(0,1fr)),auto]">
          <label className="space-y-2 text-sm text-muted">
            <span className="block text-xs font-semibold uppercase tracking-[0.18em]">Signal type</span>
            <select className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none" value={signalType} onChange={(event) => setSignalType(event.target.value as typeof signalType)}>
              <option value="all">All</option>
              <option value="BUY_ZONE">Buy zone</option>
              <option value="SELL">Sell</option>
              <option value="HOLD">Hold</option>
              <option value="WAIT">Wait</option>
              <option value="WATCH">Watch</option>
            </select>
          </label>
          <label className="space-y-2 text-sm text-muted">
            <span className="block text-xs font-semibold uppercase tracking-[0.18em]">Min confidence</span>
            <select className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none" value={minConfidence} onChange={(event) => setMinConfidence(Number(event.target.value))}>
              <option value={0}>0%</option>
              <option value={50}>50%</option>
              <option value={60}>60%</option>
              <option value={70}>70%</option>
            </select>
          </label>
          <label className="space-y-2 text-sm text-muted">
            <span className="block text-xs font-semibold uppercase tracking-[0.18em]">Timeframe</span>
            <select className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none" value={timeframe} onChange={(event) => setTimeframe(event.target.value as typeof timeframe)}>
              <option value="all">All</option>
              <option value="15m">15m</option>
              <option value="1h">1h</option>
              <option value="4h">4h</option>
              <option value="1d">1d</option>
            </select>
          </label>
          <label className="space-y-2 text-sm text-muted">
            <span className="block text-xs font-semibold uppercase tracking-[0.18em]">Status scope</span>
            <button type="button" className={`w-full rounded-2xl border px-4 py-3 text-left ${activeOnly ? 'border-accent bg-accentStrong/15 text-ink' : 'border-border bg-white/[0.04] text-muted'}`} onClick={() => setActiveOnly((current) => !current)}>
              {activeOnly ? 'Active only' : 'All statuses'}
            </button>
          </label>
          <div className="flex items-end">
            <Button variant="secondary" className="w-full" onClick={() => { setSignalType('all'); setMinConfidence(0); setTimeframe('all'); setActiveOnly(false); }}>
              Reset filters
            </Button>
          </div>
        </div>
      </Panel>

      <Panel>
        <DataStateView
          state={state}
          isEmpty={rows.length === 0}
          loading={<LoadingSkeleton rows={6} />}
          empty={<EmptyState title="No signals match the current filter" description="Try broadening the market, status, or confidence filters to repopulate the backend-generated table." />}
          error={<ErrorState title="Signals table unavailable" description="The backend signal inventory could not be loaded." onRetry={retryMockView} />}
          populated={
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-3 text-left">
                <thead>
                  <tr className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                    <th className="px-4">Symbol</th>
                    <th className="px-4">Signal</th>
                    <th className="px-4">Confidence</th>
                    <th className="px-4">R:R</th>
                    <th className="px-4">Setup type</th>
                    <th className="px-4">Backtested win-rate</th>
                    <th className="px-4">Status</th>
                    <th className="px-4">Generated</th>
                    <th className="px-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((record) => {
                    const symbol = symbols.find((entry) => entry.id === record.symbolId);
                    return (
                      <tr key={record.id} className={`rounded-3xl border border-border bg-white/[0.03] ${record.signal.confidence < 55 ? 'opacity-80' : ''}`}>
                        <td className="rounded-l-3xl px-4 py-4">
                          <button type="button" className="text-left" onClick={() => onOpenSymbol(record.symbolId)}>
                            <p className="font-medium text-ink">{record.signal.symbol}</p>
                            <p className="text-xs text-muted">{symbol?.marketType} · {record.signal.timeframe}</p>
                          </button>
                        </td>
                        <td className="px-4 py-4"><SignalChip signal={record.signal.signal} subdued={record.signal.confidence < 55} /></td>
                        <td className="metric-text px-4 py-4 text-ink">{record.signal.confidence}</td>
                        <td className="metric-text px-4 py-4 text-ink">{record.signal.risk_reward.toFixed(1)}</td>
                        <td className="px-4 py-4 text-sm text-muted">{record.signal.confidence_basis.setup_type}</td>
                        <td className="metric-text px-4 py-4 text-ink">{(record.signal.confidence_basis.backtested_winrate * 100).toFixed(0)}%</td>
                        <td className="px-4 py-4 text-sm text-muted">{record.status}</td>
                        <td className="px-4 py-4 text-sm text-muted">{formatDateTime(record.signal.generated_at_utc)}</td>
                        <td className="rounded-r-3xl px-4 py-4">
                          <div className="flex flex-wrap gap-2">
                            <Button variant="secondary" className="px-3 py-2 text-xs" onClick={() => onOpenSymbol(record.symbolId)}>
                              Symbol
                            </Button>
                            <Button variant="ghost" className="px-3 py-2 text-xs" onClick={() => onOpenSignal(record.id)}>
                              Detail drawer
                            </Button>
                            <Button className="px-3 py-2 text-xs" onClick={() => onOpenPaperTrade(record.id)}>
                              Paper trade
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          }
        />
      </Panel>

      <Panel>
        <SectionHeading eyebrow="Canonical signal shape" title="Schema summary" description="The table above derives from the same field-for-field canonical signal object shown in the signal detail drawer." />
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {signals.slice(0, 3).map((record) => (
            <div key={record.id} className="rounded-2xl border border-border bg-white/[0.03] p-4">
              <p className="font-medium text-ink">{record.signal.symbol}</p>
              <p className="mt-2 text-sm text-muted">Entry zone {record.signal.entry_zone.map((level) => formatCurrency(level)).join(' - ')}</p>
              <p className="mt-1 text-sm text-muted">Fees/slippage {record.signal.fees_slippage_assumed}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}