import { Bell, Clipboard, ShieldAlert } from 'lucide-react';
import { Drawer, Button, DataStateView, EmptyState, ErrorState, LoadingSkeleton, MetricStat, Panel, SignalChip } from '../components/ui';
import { formatCurrency, formatDateTime } from '../lib/format';
import type { ScreenState, SignalRecord, SymbolRecord } from '../types';

export function SignalDetailDrawer({
  state,
  open,
  signalRecord,
  symbol,
  onClose,
  onPaperTrade,
  onCreateAlert,
  onCopyJson,
}: {
  state: ScreenState;
  open: boolean;
  signalRecord: SignalRecord | null;
  symbol: SymbolRecord | null;
  onClose: () => void;
  onPaperTrade: () => void;
  onCreateAlert: () => void;
  onCopyJson: () => void;
}) {
  const retryMockView = () => window.location.reload();

  return (
    <Drawer open={open} title={signalRecord ? `${signalRecord.signal.symbol} signal detail` : 'Signal detail'} description="Full canonical signal object with confidence basis, risk ladder, AI narration, and paper-only execution actions. Signal records are generated on the backend from stored corridor candles." onClose={onClose}>
      {signalRecord ? (
        <DataStateView
          state={state}
          loading={<LoadingSkeleton rows={8} />}
          empty={<EmptyState title="Signal detail is empty" description="The drawer stays mounted with an explicit empty state even when no signal payload is available." />}
          error={<ErrorState title="Signal detail unavailable" description="The canonical signal drawer could not be loaded." onRetry={retryMockView} />}
          populated={
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-4 rounded-3xl border border-border bg-white/[0.03] p-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Canonical signal</p>
                  <h4 className="mt-1 text-2xl font-semibold text-ink">{signalRecord.signal.symbol}</h4>
                  <p className="mt-2 text-sm text-muted">{symbol?.marketType} · {signalRecord.signal.timeframe} · generated {formatDateTime(signalRecord.signal.generated_at_utc)} UTC</p>
                </div>
                <SignalChip signal={signalRecord.signal.signal} subdued={signalRecord.signal.confidence < 55} />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <MetricStat label="Signal id" value={signalRecord.id} helper="Traceable record id for JSON export" />
                <MetricStat label="Risk level" value={signalRecord.signal.risk_level} helper={`Status: ${signalRecord.status}`} />
                <MetricStat label="Confidence" value={signalRecord.signal.confidence} helper="Deterministic evidence score" />
                <MetricStat label="Entry zone" value={signalRecord.signal.entry_zone.map((level) => formatCurrency(level)).join(' - ')} helper="Zone rendered field-for-field" />
                <MetricStat label="Risk / reward" value={signalRecord.signal.risk_reward.toFixed(1)} helper={signalRecord.signal.fees_slippage_assumed} />
              </div>

              <Panel className="p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Confidence basis</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <MetricStat label="Trend alignment" value={signalRecord.signal.confidence_basis.trend_alignment.toFixed(2)} />
                  <MetricStat label="Volume confirmation" value={signalRecord.signal.confidence_basis.volume_confirmation.toFixed(2)} />
                  <MetricStat label="Volatility regime" value={signalRecord.signal.confidence_basis.volatility_regime} />
                  <MetricStat label="Setup type" value={signalRecord.signal.confidence_basis.setup_type} />
                  <MetricStat label="Backtested win rate" value={`${(signalRecord.signal.confidence_basis.backtested_winrate * 100).toFixed(0)}%`} />
                  <MetricStat label="Expectancy R" value={signalRecord.signal.confidence_basis.backtested_expectancy_R.toFixed(2)} />
                  <MetricStat label="Sample size" value={signalRecord.signal.confidence_basis.backtest_sample_size} helper={signalRecord.signal.confidence_basis.backtest_sample_size < 50 ? 'Low-sample warning' : 'Above minimum threshold'} />
                  <MetricStat label="OOS validated" value={signalRecord.signal.confidence_basis.out_of_sample_validated ? 'Yes' : 'No'} />
                </div>
              </Panel>

              <Panel className="p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Risk ladder and invalidation</p>
                <div className="mt-3 space-y-2 text-sm text-muted">
                  <p>Stop loss: <span className="metric-text text-ink">{formatCurrency(signalRecord.signal.stop_loss)}</span></p>
                  <p>Take profit ladder: <span className="metric-text text-ink">{signalRecord.signal.take_profit.map((level) => formatCurrency(level)).join(', ')}</span></p>
                  <p>Invalidation: <span className="text-ink">{signalRecord.signal.invalidation}</span></p>
                  <p>Fees and slippage: <span className="text-ink">{signalRecord.signal.fees_slippage_assumed}</span></p>
                  <p>Candle status: <span className="text-ink">{signalRecord.signal.candle_status}</span></p>
                  <p>Data source: <span className="text-ink">{signalRecord.signal.data_source}</span></p>
                </div>
              </Panel>

              <Panel className="p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Engine reasons</p>
                <ul className="mt-3 space-y-2 text-sm text-muted">
                  {signalRecord.signal.reasons.map((reason) => (
                    <li key={reason} className="rounded-2xl border border-border bg-white/[0.03] px-3 py-2">{reason}</li>
                  ))}
                </ul>
              </Panel>

              <Panel className="p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">AI explanation</p>
                <p className="mt-3 rounded-2xl border border-watch/20 bg-watch/8 p-4 text-sm text-muted">AI explanation — narrates engine facts only. {signalRecord.signal.ai_explanation}</p>
                <p className="mt-3 text-xs text-muted">{signalRecord.signal.disclaimer}</p>
              </Panel>

              <Panel className="p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Signal JSON preview</p>
                <pre className="mt-3 overflow-x-auto rounded-2xl border border-border bg-surface/50 p-4 text-xs text-muted">{JSON.stringify(signalRecord.signal, null, 2)}</pre>
              </Panel>

              <div className="flex flex-wrap gap-3">
                <Button onClick={onPaperTrade}>Paper trade this</Button>
                <Button variant="secondary" onClick={onCreateAlert}>
                  <Bell className="size-4" />
                  Create alert
                </Button>
                <button type="button" title="Enable in Settings → Risk & Safety; paper trading only by default" className="rounded-2xl border border-border bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-muted">
                  <ShieldAlert className="mr-2 inline size-4" />
                  Live trade disabled
                </button>
                <Button variant="ghost" onClick={onCopyJson}>
                  <Clipboard className="size-4" />
                  Copy signal JSON
                </Button>
              </div>
            </div>
          }
        />
      ) : (
        <EmptyState title="No signal selected" description="Open any signal card, row action, or symbol-detail button to populate this drawer." />
      )}
    </Drawer>
  );
}