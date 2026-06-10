// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { AlertTriangle, BookmarkPlus, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { TinyLineChart } from '../components/charts';
import { Button, DataStateView, EmptyState, ErrorState, LoadingSkeleton, MetricStat, Panel, SectionHeading } from '../components/ui';
import { backendClient } from '../lib/backend';
import { formatDateTime, formatPercent } from '../lib/format';
import type { CorridorIngestResult, SavedStrategy, ScreenState, StrategyPreset, SymbolRecord } from '../types';

export function BacktestScreen({
  state,
  presets,
  symbols,
  minBacktestSample,
  marketCorridorItems,
  onSaveStrategy,
}: {
  state: ScreenState;
  presets: StrategyPreset[];
  symbols: SymbolRecord[];
  minBacktestSample: number;
  marketCorridorItems: CorridorIngestResult[];
  onSaveStrategy: (strategy: SavedStrategy) => void;
}) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const requestedSymbolId = searchParams.get('symbol');
  const requestedSetupType = searchParams.get('setup');
  const initialPreset = useMemo(
    () => presets.find((preset) => preset.symbolId === requestedSymbolId && preset.setupType === requestedSetupType) ?? presets[0] ?? null,
    [presets, requestedSetupType, requestedSymbolId],
  );
  const [selectedPresetId, setSelectedPresetId] = useState(initialPreset?.id ?? '');
  const [feesPercent, setFeesPercent] = useState(initialPreset?.feesPercent ?? 0);
  const [slippagePercent, setSlippagePercent] = useState(initialPreset?.slippagePercent ?? 0);
  const [trainTestSplit, setTrainTestSplit] = useState(initialPreset?.trainTestSplit ?? 70);
  const [walkForward, setWalkForward] = useState(initialPreset?.walkForward ?? true);
  const [activePreset, setActivePreset] = useState<StrategyPreset | null>(initialPreset);
  const [runState, setRunState] = useState<'idle' | 'running' | 'error'>('idle');
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const retryMockView = () => window.location.reload();

  const preset = useMemo(() => presets.find((entry) => entry.id === selectedPresetId) ?? initialPreset, [initialPreset, presets, selectedPresetId]);
  const symbol = preset ? symbols.find((entry) => entry.id === preset.symbolId) ?? symbols[0] ?? null : null;
  const displayedPreset = activePreset;
  const liveCorridorItem = displayedPreset ? marketCorridorItems.find((entry) => entry.symbol === displayedPreset.symbolId) ?? null : null;
  const oosGap = displayedPreset ? displayedPreset.metrics.inSampleWinRate - displayedPreset.metrics.outOfSampleWinRate : 0;

  useEffect(() => {
    if (!selectedPresetId && initialPreset) {
      setSelectedPresetId(initialPreset.id);
    }
  }, [initialPreset, selectedPresetId]);

  useEffect(() => {
    if (!preset) return;
    setFeesPercent(preset.feesPercent);
    setSlippagePercent(preset.slippagePercent);
    setTrainTestSplit(preset.trainTestSplit);
    setWalkForward(preset.walkForward);
    setActivePreset(preset);
    setRunMessage(null);
  }, [preset]);

  useEffect(() => {
    if (!preset || !symbol) return;
    let cancelled = false;
    setRunState('running');
    setRunMessage('Running backend backtest with the current cost model and validation split.');

    backendClient
      .runBacktest({
        symbolId: preset.symbolId,
        marketType: symbol.marketType,
        timeframe: preset.timeframe,
        setupType: preset.setupType,
        feesPercent,
        slippagePercent,
        trainTestSplit,
        walkForward,
      })
      .then((response) => {
        if (cancelled) return;
        setActivePreset(response.item);
        setRunState('idle');
        setRunMessage('Metrics below are synced from the backend quant engine using stored corridor candles.');
      })
      .catch(() => {
        if (cancelled) return;
        setRunState('error');
        setRunMessage('Backend rerun failed, so the last loaded preset remains on screen.');
      });

    return () => {
      cancelled = true;
    };
  }, [feesPercent, preset, slippagePercent, symbol, trainTestSplit, walkForward]);

  return (
    <div className="space-y-8">
      <SectionHeading
        eyebrow="Backtesting"
        title="Statistically honest validation"
        description="Strategy selector, cost model inputs, in-sample vs out-of-sample metrics, and low-sample warnings. Parameter changes rerun the backend quant engine against stored corridor candles."
      />

      <div className="grid gap-6 xl:grid-cols-[0.9fr,1.4fr]">
        <Panel>
          <div className="space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Strategy / setup selector</p>
              <select className="mt-3 w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none" value={selectedPresetId} onChange={(event) => setSelectedPresetId(event.target.value)}>
                {!presets.length ? <option value="">No presets available</option> : null}
                {presets.map((entry) => (
                  <option key={entry.id} value={entry.id}>{entry.name}</option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm text-muted">
                <span className="block text-xs font-semibold uppercase tracking-[0.18em]">Fees %</span>
                <input className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none" type="number" step="0.01" value={feesPercent} onChange={(event) => setFeesPercent(Number(event.target.value))} />
              </label>
              <label className="space-y-2 text-sm text-muted">
                <span className="block text-xs font-semibold uppercase tracking-[0.18em]">Slippage %</span>
                <input className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none" type="number" step="0.01" value={slippagePercent} onChange={(event) => setSlippagePercent(Number(event.target.value))} />
              </label>
              <label className="space-y-2 text-sm text-muted">
                <span className="block text-xs font-semibold uppercase tracking-[0.18em]">Train / test split</span>
                <input className="w-full" type="range" min="50" max="90" value={trainTestSplit} onChange={(event) => setTrainTestSplit(Number(event.target.value))} />
                <span>{trainTestSplit}% train / {100 - trainTestSplit}% test</span>
              </label>
              <label className="flex items-center justify-between rounded-2xl border border-border bg-white/[0.03] px-4 py-3 text-sm text-muted">
                <span>Walk-forward analysis</span>
                <button type="button" className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${walkForward ? 'bg-buy/12 text-buy' : 'bg-white/8 text-muted'}`} onClick={() => setWalkForward((current) => !current)}>
                  {walkForward ? 'Enabled' : 'Disabled'}
                </button>
              </label>
            </div>

            <div className="rounded-3xl border border-border bg-white/[0.03] p-4 text-sm text-muted">
              <div className="flex items-center gap-2 text-ink">
                <SlidersHorizontal className="size-4 text-accent" />
                <span className="font-medium">Prefill source</span>
              </div>
              <p className="mt-2">Symbol: {symbol?.symbol ?? 'Unavailable'} · Setup: {preset?.setupType ?? 'Unavailable'} · Timeframe: {preset?.timeframe ?? 'Unavailable'}</p>
              {preset?.strategyName ? (
                <p className="mt-2">
                  Strategy source: {preset.strategyName} ({preset.strategySource ?? 'built-in'}{preset.extensionId ? ` / ${preset.extensionId}` : ''})
                </p>
              ) : null}
              <p className="mt-2">{runMessage ?? 'Parameter changes rerun against the backend and update the metrics below.'}</p>
              {liveCorridorItem ? <p className="mt-2">Live market corridor backing is available for {liveCorridorItem.symbol} {liveCorridorItem.timeframe} via {liveCorridorItem.provider}, last updated {formatDateTime(liveCorridorItem.latest_open_time_utc)} UTC.</p> : null}
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => {
                  if (!displayedPreset || !symbol) return;
                  onSaveStrategy({
                    id: `${displayedPreset.id}-${Date.now()}`,
                    name: `${symbol.symbol} ${displayedPreset.setupType}`,
                    symbolId: displayedPreset.symbolId,
                    setupType: displayedPreset.setupType,
                    timeframe: displayedPreset.timeframe,
                    savedAt: new Date().toISOString(),
                  });
                  navigate('/settings?tab=strategies');
                }}
              >
                <BookmarkPlus className="size-4" />
                Save strategy
              </Button>
            </div>
          </div>
        </Panel>

        <Panel>
          <DataStateView
            state={state}
            isEmpty={!displayedPreset}
            loading={<LoadingSkeleton chart rows={8} />}
            empty={
              <EmptyState
                title="No backtest results available"
                description="The selector and cost inputs remain active, but this results surface is in its explicit empty-state variant."
                action={presets[0] ? <Button variant="secondary" onClick={() => setSelectedPresetId(presets[0].id)}>Load first preset</Button> : undefined}
              />
            }
            error={<ErrorState title="Backtest results unavailable" description="The backtest results could not be loaded." onRetry={retryMockView} />}
            populated={displayedPreset ? (
              <div className="space-y-6">
                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted">Equity curve</p>
                    <TinyLineChart values={displayedPreset.equityCurve} tone="buy" />
                  </div>
                  <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted">Drawdown curve</p>
                    <TinyLineChart values={displayedPreset.drawdownCurve.map((value) => Math.abs(value))} tone="sell" />
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <MetricStat label="Net win rate" value={`${displayedPreset.metrics.winRate}%`} helper={displayedPreset.metrics.testPeriod} tone="buy" />
                  <MetricStat label="Average R" value={displayedPreset.metrics.avgR.toFixed(2)} helper="Net of fees + slippage" tone={displayedPreset.metrics.avgR >= 0 ? 'buy' : 'sell'} />
                  <MetricStat label="Expectancy" value={displayedPreset.metrics.expectancy.toFixed(2)} helper="Per trade in R terms" tone={displayedPreset.metrics.expectancy >= 0 ? 'buy' : 'sell'} />
                  <MetricStat label="Max drawdown" value={formatPercent(displayedPreset.metrics.maxDrawdown)} helper="Worst equity peak-to-trough" tone="sell" />
                  <MetricStat label="Sharpe" value={displayedPreset.metrics.sharpe.toFixed(2)} helper="Risk-adjusted return" />
                  <MetricStat label="Sortino" value={displayedPreset.metrics.sortino.toFixed(2)} helper="Downside-adjusted return" />
                  <MetricStat label="Profit factor" value={displayedPreset.metrics.profitFactor.toFixed(2)} helper="Gross wins / gross losses" />
                  <MetricStat label="Trade count" value={displayedPreset.metrics.tradeCount} helper={`Out-of-sample trade count · threshold ${minBacktestSample}`} tone={displayedPreset.metrics.tradeCount < minBacktestSample ? 'hold' : 'watch'} />
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">In-sample vs out-of-sample</p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <MetricStat label="In-sample win rate" value={`${displayedPreset.metrics.inSampleWinRate}%`} helper="Training segment" />
                      <MetricStat label="Out-of-sample win rate" value={`${displayedPreset.metrics.outOfSampleWinRate}%`} helper="Held-out validation" />
                    </div>
                    {oosGap > 5 ? (
                      <div className="mt-4 rounded-2xl border border-sell/30 bg-sell/10 p-4 text-sm text-muted">
                        Overfitting risk warning: out-of-sample win rate trails in-sample by {oosGap.toFixed(0)} percentage points.
                      </div>
                    ) : (
                      <div className="mt-4 rounded-2xl border border-buy/30 bg-buy/10 p-4 text-sm text-muted">
                        In-sample and out-of-sample performance remain close enough to avoid an overfitting warning.
                      </div>
                    )}
                  </div>
                  <div className="rounded-3xl border border-border bg-white/[0.03] p-4 text-sm text-muted">
                    {displayedPreset.metrics.tradeCount < minBacktestSample ? (
                      <div className="flex gap-3 rounded-2xl border border-hold/30 bg-hold/10 p-4 text-hold">
                        <AlertTriangle className="mt-0.5 size-5 shrink-0" />
                        <div>
                          <p className="font-semibold">Low-sample warning</p>
                          <p className="mt-1 text-sm text-muted">This setup has fewer than {minBacktestSample} trades, so the validation statistics should be treated as unstable.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-buy/30 bg-buy/10 p-4 text-muted">
                        Sample size is above the configured minimum backtest threshold of {minBacktestSample} trades.
                      </div>
                    )}
                    {runState === 'running' ? <p className="mt-4 text-xs uppercase tracking-[0.18em] text-muted">Refreshing backend run…</p> : null}
                    {runState === 'error' ? <p className="mt-4 text-xs uppercase tracking-[0.18em] text-sell">Backend rerun unavailable</p> : null}
                  </div>
                </div>
              </div>
            ) : null}
          />
        </Panel>
      </div>
    </div>
  );
}
