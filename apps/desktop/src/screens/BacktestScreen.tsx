// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { AlertTriangle, BookmarkPlus, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { TinyLineChart } from '../components/charts';
import {
  Button,
  DataStateView,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  MetricStat,
  Panel,
  SectionHeading,
} from '../components/ui';
import { backendClient } from '../lib/backend';
import { formatDateTime, formatPercent } from '../lib/format';
import type {
  CorridorIngestResult,
  SavedStrategy,
  ScreenState,
  StrategyPreset,
  SymbolRecord,
  Timeframe,
} from '../types';

export function BacktestScreen({
  state,
  presets,
  symbols,
  minBacktestSample,
  marketCorridorItems,
  savedStrategies,
  onSaveStrategy,
}: {
  state: ScreenState;
  presets: StrategyPreset[];
  symbols: SymbolRecord[];
  minBacktestSample: number;
  marketCorridorItems: CorridorIngestResult[];
  savedStrategies: SavedStrategy[];
  onSaveStrategy: (strategy: SavedStrategy) => void;
}) {
  const [searchParams] = useSearchParams();
  // Explainer: open on the very first visit, collapsed afterwards.
  const [howToOpen, setHowToOpen] = useState<boolean>(() => {
    const stored = window.localStorage.getItem('qg-backtest-howto');
    if (stored === null) {
      window.localStorage.setItem('qg-backtest-howto', 'closed');
      return true;
    }
    return stored === 'open';
  });
  const [runNonce, setRunNonce] = useState(0);

  const startDemo = () => {
    setSelectedPresetId('demo-trend-pullback');
  };
  const navigate = useNavigate();
  const requestedSymbolId = searchParams.get('symbol');
  const requestedSetupType = searchParams.get('setup');
  const initialPreset = useMemo(
    () =>
      presets.find(
        (preset) =>
          preset.symbolId === requestedSymbolId && preset.setupType === requestedSetupType,
      ) ??
      presets[0] ??
      null,
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

  // Saved strategies (from Settings) and the demo become runnable presets:
  // zeroed metrics placeholders that the auto-run replaces immediately.
  const emptyMetrics: StrategyPreset['metrics'] = {
    winRate: 0,
    avgR: 0,
    expectancy: 0,
    maxDrawdown: 0,
    sharpe: 0,
    sortino: 0,
    profitFactor: 0,
    tradeCount: 0,
    testPeriod: 'pending first run',
    inSampleWinRate: 0,
    outOfSampleWinRate: 0,
  };
  const savedPresets = useMemo<StrategyPreset[]>(
    () =>
      savedStrategies.map((saved) => ({
        id: `saved-${saved.id}`,
        name: `Saved · ${saved.name}`,
        symbolId: saved.symbolId,
        setupType: saved.setupType,
        timeframe: saved.timeframe,
        feesPercent: 0.1,
        slippagePercent: 0.05,
        trainTestSplit: 70,
        walkForward: true,
        metrics: emptyMetrics,
        equityCurve: [],
        drawdownCurve: [],
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [savedStrategies],
  );
  const demoPresetOption = useMemo<StrategyPreset | null>(() => {
    const series = symbols.find((entry) => entry.id === 'BTCUSD') ?? symbols[0];
    if (!series) return null;
    return {
      id: 'demo-trend-pullback',
      name: `Demo · ${series.symbol} trend pullback (educational sample)`,
      symbolId: series.id,
      setupType: 'daily_trend_pullback',
      timeframe: '1h',
      feesPercent: 0.1,
      slippagePercent: 0.05,
      trainTestSplit: 70,
      walkForward: true,
      metrics: emptyMetrics,
      equityCurve: [],
      drawdownCurve: [],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols]);
  // Manual composition (create your own): symbol x setup family x timeframe.
  // The rules per family are the engine's published, tested code - this
  // composes WHICH rules run WHERE; it never invents untestable logic.
  const SETUP_FAMILIES: { id: string; label: string }[] = [
    { id: 'daily_trend_pullback', label: 'Pullback Continuation' },
    { id: 'trend_rejection_breakdown', label: 'Resistance Rejection (short)' },
    { id: 'breakout_retest_continuation', label: 'Breakout Retest' },
    { id: 'breakdown_retest_continuation', label: 'Breakdown Retest (short)' },
    { id: 'range_meanreversion_long', label: 'Range Bounce' },
    { id: 'range_meanreversion_short', label: 'Range Fade (short)' },
    { id: 'failed_breakout_reversal', label: 'Failed Breakout (short)' },
    { id: 'failed_breakdown_reversal', label: 'Failed Breakdown' },
    { id: 'liquidity_sweep_reclaim_long', label: 'Liquidity Sweep & Reclaim' },
    { id: 'ma_crossover_long', label: 'MA Crossover' },
    { id: 'inside_bar_break_long', label: 'Inside Bar Break' },
    { id: 'squeeze_release_long', label: 'Squeeze Release' },
    { id: 'narrow_range_break_long', label: 'Narrow Range Break' },
    { id: 'vwap_reclaim_long', label: 'VWAP Reclaim' },
    { id: 'gap_and_go_long', label: 'Gap and Go' },
  ];
  const timeframesBySymbol = useMemo(() => {
    const map = new Map<string, Timeframe[]>();
    for (const item of marketCorridorItems) {
      const list = map.get(item.symbol) ?? [];
      if (!list.includes(item.timeframe as Timeframe)) list.push(item.timeframe as Timeframe);
      map.set(item.symbol, list);
    }
    return map;
  }, [marketCorridorItems]);

  const [manualSymbolId, setManualSymbolId] = useState('');
  const [manualSetup, setManualSetup] = useState(SETUP_FAMILIES[0].id);
  const [manualTimeframe, setManualTimeframe] = useState<Timeframe>('1h');
  const manualTimeframes = manualSymbolId
    ? (timeframesBySymbol.get(manualSymbolId) ?? [])
    : (['15m', '1h', '4h', '1d'] as Timeframe[]);
  // If the chosen symbol doesn't carry the selected timeframe, snap to one
  // it does - composing an impossible combination must be impossible.
  if (manualSymbolId && manualTimeframes.length && !manualTimeframes.includes(manualTimeframe)) {
    setManualTimeframe(manualTimeframes[0]);
  }

  const manualPreset = useMemo<StrategyPreset | null>(() => {
    if (!manualSymbolId) return null;
    const series = symbols.find((entry) => entry.id === manualSymbolId);
    if (!series) return null;
    const family = SETUP_FAMILIES.find((entry) => entry.id === manualSetup);
    return {
      id: `manual-${manualSymbolId}-${manualSetup}-${manualTimeframe}`,
      name: `Custom · ${series.symbol} ${family?.label ?? manualSetup} ${manualTimeframe}`,
      symbolId: manualSymbolId,
      setupType: manualSetup,
      timeframe: manualTimeframe,
      feesPercent: 0.1,
      slippagePercent: 0.05,
      trainTestSplit: 70,
      walkForward: true,
      metrics: emptyMetrics,
      equityCurve: [],
      drawdownCurve: [],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualSymbolId, manualSetup, manualTimeframe, symbols]);

  const selectablePresets = useMemo(
    () => [
      ...presets,
      ...savedPresets,
      ...(manualPreset ? [manualPreset] : []),
      ...(demoPresetOption ? [demoPresetOption] : []),
    ],
    [presets, savedPresets, manualPreset, demoPresetOption],
  );

  const preset = useMemo(
    () => selectablePresets.find((entry) => entry.id === selectedPresetId) ?? initialPreset,
    [initialPreset, selectablePresets, selectedPresetId],
  );
  const symbol = preset
    ? (symbols.find((entry) => entry.id === preset.symbolId) ?? symbols[0] ?? null)
    : null;
  const displayedPreset = activePreset;
  const liveCorridorItem = displayedPreset
    ? (marketCorridorItems.find((entry) => entry.symbol === displayedPreset.symbolId) ?? null)
    : null;
  const oosGap = displayedPreset
    ? displayedPreset.metrics.inSampleWinRate - displayedPreset.metrics.outOfSampleWinRate
    : 0;

  // All three blocks adjust state during render (tracked previous values)
  // so preset switches never trigger cascading effect renders.
  if (!selectedPresetId && (initialPreset ?? selectablePresets[0])) {
    setSelectedPresetId((initialPreset ?? selectablePresets[0]).id);
  }

  const [syncedPresetId, setSyncedPresetId] = useState<string | null>(null);
  if (preset && preset.id !== syncedPresetId) {
    setSyncedPresetId(preset.id);
    setFeesPercent(preset.feesPercent);
    setSlippagePercent(preset.slippagePercent);
    setTrainTestSplit(preset.trainTestSplit);
    setWalkForward(preset.walkForward);
    setActivePreset(preset);
    setRunMessage(null);
  }

  const runKey = preset
    ? `${preset.id}|${feesPercent}|${slippagePercent}|${trainTestSplit}|${walkForward}|${runNonce}`
    : null;
  const [startedRunKey, setStartedRunKey] = useState<string | null>(null);
  if (runKey && symbol && runKey !== startedRunKey) {
    setStartedRunKey(runKey);
    setRunState('running');
    setRunMessage('Running backend backtest with the current cost model and validation split.');
  }

  useEffect(() => {
    if (!preset || !symbol) return;
    let cancelled = false;

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
        setRunMessage(
          'Metrics below are synced from the backend quant engine using stored corridor candles.',
        );
      })
      .catch(() => {
        if (cancelled) return;
        setRunState('error');
        const available = timeframesBySymbol.get(preset.symbolId) ?? [];
        setRunMessage(
          available.length && !available.includes(preset.timeframe)
            ? `No stored ${preset.timeframe} candles for ${symbol.symbol} - this symbol has ` +
                `${available.join(', ')} data. Pick one of those timeframes and rerun.`
            : 'The backend rerun failed - if data was just ingested, retry in a few seconds.',
        );
      });

    return () => {
      cancelled = true;
    };
  }, [feesPercent, preset, slippagePercent, symbol, trainTestSplit, walkForward, runNonce]);

  return (
    <div className="space-y-8">
      <SectionHeading
        eyebrow="Backtesting"
        title="Statistically honest validation"
        description="Strategy selector, cost model inputs, in-sample vs out-of-sample metrics, and low-sample warnings. Parameter changes rerun the backend quant engine against stored corridor candles."
      />

      <div className="flex flex-wrap gap-2">
        {['Past data only', 'Not a prediction', 'Costs included', 'Out-of-sample required'].map(
          (chip) => (
            <span
              key={chip}
              className="rounded-full border border-border bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted"
            >
              {chip}
            </span>
          ),
        )}
      </div>

      <Panel>
        <button
          type="button"
          onClick={() => {
            const next = !howToOpen;
            setHowToOpen(next);
            window.localStorage.setItem('qg-backtest-howto', next ? 'open' : 'closed');
          }}
          className="flex w-full items-center justify-between text-left"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            How this works
          </p>
          <span className="text-xs text-muted">{howToOpen ? 'Hide' : 'Show'}</span>
        </button>
        {howToOpen ? (
          <>
            <p className="mt-2 text-sm text-muted">
              It replays one setup's exact entry/stop/target rules over the candles stored on this
              machine and reports how that setup <span className="text-ink">would have</span> traded
              — win rate, expectancy in R, equity and drawdown — with fees and slippage charged on
              every round trip. It validates honestly: the sample is split chronologically into
              train/test so the headline numbers must survive data the rules never saw, and every
              run gets the workbench below — cost-stress scenarios, Monte Carlo drawdowns, bias
              gates, and the AI research review.
            </p>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted">
              <li>
                Pick a preset — presets are generated from the engine's live signals (one per
                symbol/setup the engine currently detects) plus anything you saved earlier.
              </li>
              <li>
                Adjust fees, slippage, and the train/test split; the run re-executes instantly.
              </li>
              <li>Read the out-of-sample row and the workbench before trusting anything else.</li>
              <li>
                Like a configuration? <span className="text-ink">Save strategy</span> stores it
                under Settings → Strategies for re-running later.
              </li>
            </ol>
            <p className="mt-3 text-xs text-muted">
              A backtest is evidence about the past, never a promise about the future. The matching
              Academy track (Backtesting & Statistical Honesty) teaches every number on this screen.
            </p>
          </>
        ) : null}
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[0.9fr,1.4fr]">
        <Panel>
          <div className="space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Strategy / setup selector
              </p>
              <select
                className="mt-3 w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                value={selectedPresetId}
                onChange={(event) => setSelectedPresetId(event.target.value)}
              >
                {!selectablePresets.length ? (
                  <option value="">Waiting for market data…</option>
                ) : null}
                {presets.length ? (
                  <optgroup label="Detected signals">
                    {presets.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {savedPresets.length ? (
                  <optgroup label="Saved strategies">
                    {savedPresets.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {demoPresetOption ? (
                  <optgroup label="Demo">
                    <option value={demoPresetOption.id}>{demoPresetOption.name}</option>
                  </optgroup>
                ) : null}
              </select>
              {!presets.length ? (
                <p className="mt-2 text-xs text-muted">
                  Detected-signal presets appear automatically once the engine has generated signals
                  from stored market data. Saved strategies and the demo are always available above.
                </p>
              ) : null}

              <div className="mt-4 rounded-2xl border border-border bg-white/[0.03] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                  Or compose your own
                </p>
                <p className="mt-1 text-xs text-muted">
                  A strategy here = symbol × setup family × timeframe × costs × validation. Each
                  family's entry/stop/target rules are the engine's published, backtested code
                  (taught in Learn); new rule families come from extensions — never from a free
                  -text box that can't be tested.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <select
                    aria-label="Symbol"
                    className="rounded-2xl border border-border bg-white/[0.04] px-3 py-2 text-sm text-ink outline-none"
                    value={manualSymbolId}
                    onChange={(event) => setManualSymbolId(event.target.value)}
                  >
                    <option value="">Symbol…</option>
                    {symbols.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.symbol}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Setup family"
                    className="rounded-2xl border border-border bg-white/[0.04] px-3 py-2 text-sm text-ink outline-none"
                    value={manualSetup}
                    onChange={(event) => setManualSetup(event.target.value)}
                  >
                    {SETUP_FAMILIES.map((family) => (
                      <option key={family.id} value={family.id}>
                        {family.label}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Timeframe"
                    className="rounded-2xl border border-border bg-white/[0.04] px-3 py-2 text-sm text-ink outline-none"
                    value={manualTimeframe}
                    onChange={(event) => setManualTimeframe(event.target.value as Timeframe)}
                  >
                    {manualTimeframes.map((tf) => (
                      <option key={tf} value={tf}>
                        {tf}
                      </option>
                    ))}
                  </select>
                </div>
                {manualSymbolId && manualTimeframes.length ? (
                  <p className="mt-2 text-xs text-muted">
                    {symbols.find((entry) => entry.id === manualSymbolId)?.symbol} has stored
                    candles for: {manualTimeframes.join(', ')}
                  </p>
                ) : null}
                <Button
                  variant="secondary"
                  className="mt-3 w-full"
                  disabled={!manualPreset || !manualTimeframes.length}
                  onClick={() => manualPreset && setSelectedPresetId(manualPreset.id)}
                >
                  Use this combination
                </Button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm text-muted">
                <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
                  Fees %
                </span>
                <input
                  className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                  type="number"
                  step="0.01"
                  value={feesPercent}
                  onChange={(event) => setFeesPercent(Number(event.target.value))}
                />
              </label>
              <label className="space-y-2 text-sm text-muted">
                <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
                  Slippage %
                </span>
                <input
                  className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                  type="number"
                  step="0.01"
                  value={slippagePercent}
                  onChange={(event) => setSlippagePercent(Number(event.target.value))}
                />
              </label>
              <label className="space-y-2 text-sm text-muted">
                <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
                  Train / test split
                </span>
                <input
                  className="w-full"
                  type="range"
                  min="50"
                  max="90"
                  value={trainTestSplit}
                  onChange={(event) => setTrainTestSplit(Number(event.target.value))}
                />
                <span>
                  {trainTestSplit}% train / {100 - trainTestSplit}% test
                </span>
              </label>
              <label className="flex items-center justify-between rounded-2xl border border-border bg-white/[0.03] px-4 py-3 text-sm text-muted">
                <span>Walk-forward analysis</span>
                <button
                  type="button"
                  className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${walkForward ? 'bg-buy/12 text-buy' : 'bg-white/8 text-muted'}`}
                  onClick={() => setWalkForward((current) => !current)}
                >
                  {walkForward ? 'Enabled' : 'Disabled'}
                </button>
              </label>
            </div>

            <div className="rounded-3xl border border-border bg-white/[0.03] p-4 text-sm text-muted">
              <div className="flex items-center gap-2 text-ink">
                <SlidersHorizontal className="size-4 text-accent" />
                <span className="font-medium">Prefill source</span>
              </div>
              <p className="mt-2">
                Symbol: {symbol?.symbol ?? 'Unavailable'} · Setup:{' '}
                {preset?.setupType ?? 'Unavailable'} · Timeframe:{' '}
                {preset?.timeframe ?? 'Unavailable'}
              </p>
              {preset?.strategyName ? (
                <p className="mt-2">
                  Strategy source: {preset.strategyName} ({preset.strategySource ?? 'built-in'}
                  {preset.extensionId ? ` / ${preset.extensionId}` : ''})
                </p>
              ) : null}
              <p className="mt-2">
                {runMessage ??
                  'Parameter changes rerun against the backend and update the metrics below.'}
              </p>
              {liveCorridorItem ? (
                <p className="mt-2">
                  Live market corridor backing is available for {liveCorridorItem.symbol}{' '}
                  {liveCorridorItem.timeframe} via {liveCorridorItem.provider}, last updated{' '}
                  {formatDateTime(liveCorridorItem.latest_open_time_utc)} UTC.
                </p>
              ) : null}
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
              <Button
                className="w-full"
                onClick={() => setRunNonce((nonce) => nonce + 1)}
                disabled={!preset || !symbol || runState === 'running'}
              >
                {runState === 'running' ? 'Running…' : 'Run backtest'}
              </Button>
            </div>

            <div className="rounded-2xl border border-border bg-white/[0.03] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Backtest readiness
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {[
                  { label: 'Strategy selected', ok: Boolean(preset) },
                  { label: 'Market data stored for symbol', ok: Boolean(symbol) },
                  { label: 'Costs configured', ok: feesPercent + slippagePercent > 0 },
                  { label: 'Train/test split set', ok: trainTestSplit > 0 && trainTestSplit < 100 },
                  { label: 'Walk-forward enabled', ok: walkForward },
                ].map((check) => (
                  <li key={check.label} className="flex items-center gap-2">
                    <span className={check.ok ? 'text-buy' : 'text-hold'}>
                      {check.ok ? '✓' : '⚠'}
                    </span>
                    <span className={check.ok ? 'text-muted' : 'text-ink'}>{check.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Panel>

        <Panel>
          <DataStateView
            state={state}
            isEmpty={!displayedPreset}
            loading={<LoadingSkeleton chart rows={8} />}
            empty={
              <div className="space-y-6">
                <EmptyState
                  title="Start your first statistically honest backtest"
                  description="Choose a strategy source, confirm costs and the train/test split, then run it to see equity, drawdown, out-of-sample metrics, Monte Carlo, and the AI review."
                  action={
                    <div className="flex flex-wrap justify-center gap-3">
                      {presets[0] ? (
                        <Button onClick={() => setSelectedPresetId(presets[0].id)}>
                          Use latest detected signal
                        </Button>
                      ) : null}
                      <Button variant="secondary" onClick={startDemo} disabled={!symbols.length}>
                        Try demo strategy
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => navigate('/settings?tab=strategies')}
                      >
                        Load saved strategy
                      </Button>
                    </div>
                  }
                />
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    'Equity curve',
                    'Drawdown',
                    'Win rate & expectancy',
                    'Train/test comparison',
                    'Cost stress table',
                    'Monte Carlo drawdowns',
                    'Bias & quality gates',
                    'AI research review',
                  ].map((label) => (
                    <div
                      key={label}
                      className="rounded-2xl border border-dashed border-border/70 bg-white/[0.02] px-4 py-6 text-center"
                    >
                      <p className="text-sm text-muted/70">{label}</p>
                      <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-muted/50">
                        appears after a run
                      </p>
                    </div>
                  ))}
                </div>
                <p className="text-center text-xs text-muted">
                  The demo runs the built-in trend-pullback rules on stored market data — an
                  educational sample, not a live signal.
                </p>
              </div>
            }
            error={
              <ErrorState
                title="Backtest results unavailable"
                description="The backtest results could not be loaded."
                onRetry={retryMockView}
              />
            }
            populated={
              displayedPreset ? (
                <div className="space-y-6">
                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                        Equity curve
                      </p>
                      <TinyLineChart values={displayedPreset.equityCurve} tone="buy" />
                    </div>
                    <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                        Drawdown curve
                      </p>
                      <TinyLineChart
                        values={displayedPreset.drawdownCurve.map((value) => Math.abs(value))}
                        tone="sell"
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <MetricStat
                      label="Net win rate"
                      value={`${displayedPreset.metrics.winRate}%`}
                      helper={displayedPreset.metrics.testPeriod}
                      tone="buy"
                    />
                    <MetricStat
                      label="Average R"
                      value={displayedPreset.metrics.avgR.toFixed(2)}
                      helper="Net of fees + slippage"
                      tone={displayedPreset.metrics.avgR >= 0 ? 'buy' : 'sell'}
                    />
                    <MetricStat
                      label="Expectancy"
                      value={displayedPreset.metrics.expectancy.toFixed(2)}
                      helper="Per trade in R terms"
                      tone={displayedPreset.metrics.expectancy >= 0 ? 'buy' : 'sell'}
                    />
                    <MetricStat
                      label="Max drawdown"
                      value={formatPercent(displayedPreset.metrics.maxDrawdown)}
                      helper="Worst equity peak-to-trough"
                      tone="sell"
                    />
                    <MetricStat
                      label="Sharpe"
                      value={displayedPreset.metrics.sharpe.toFixed(2)}
                      helper="Risk-adjusted return"
                    />
                    <MetricStat
                      label="Sortino"
                      value={displayedPreset.metrics.sortino.toFixed(2)}
                      helper="Downside-adjusted return"
                    />
                    <MetricStat
                      label="Profit factor"
                      value={displayedPreset.metrics.profitFactor.toFixed(2)}
                      helper="Gross wins / gross losses"
                    />
                    <MetricStat
                      label="Trade count"
                      value={displayedPreset.metrics.tradeCount}
                      helper={`Out-of-sample trade count · threshold ${minBacktestSample}`}
                      tone={
                        displayedPreset.metrics.tradeCount < minBacktestSample ? 'hold' : 'watch'
                      }
                    />
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                        In-sample vs out-of-sample
                      </p>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <MetricStat
                          label="In-sample win rate"
                          value={`${displayedPreset.metrics.inSampleWinRate}%`}
                          helper="Training segment"
                        />
                        <MetricStat
                          label="Out-of-sample win rate"
                          value={`${displayedPreset.metrics.outOfSampleWinRate}%`}
                          helper="Held-out validation"
                        />
                      </div>
                      {oosGap > 5 ? (
                        <div className="mt-4 rounded-2xl border border-sell/30 bg-sell/10 p-4 text-sm text-muted">
                          Overfitting risk warning: out-of-sample win rate trails in-sample by{' '}
                          {oosGap.toFixed(0)} percentage points.
                        </div>
                      ) : (
                        <div className="mt-4 rounded-2xl border border-buy/30 bg-buy/10 p-4 text-sm text-muted">
                          In-sample and out-of-sample performance remain close enough to avoid an
                          overfitting warning.
                        </div>
                      )}
                    </div>
                    <div className="rounded-3xl border border-border bg-white/[0.03] p-4 text-sm text-muted">
                      {displayedPreset.metrics.tradeCount < minBacktestSample ? (
                        <div className="flex gap-3 rounded-2xl border border-hold/30 bg-hold/10 p-4 text-hold">
                          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
                          <div>
                            <p className="font-semibold">Low-sample warning</p>
                            <p className="mt-1 text-sm text-muted">
                              This setup has fewer than {minBacktestSample} trades, so the
                              validation statistics should be treated as unstable.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-buy/30 bg-buy/10 p-4 text-muted">
                          Sample size is above the configured minimum backtest threshold of{' '}
                          {minBacktestSample} trades.
                        </div>
                      )}
                      {runState === 'running' ? (
                        <p className="mt-4 text-xs uppercase tracking-[0.18em] text-muted">
                          Refreshing backend run…
                        </p>
                      ) : null}
                      {runState === 'error' ? (
                        <p className="mt-4 text-xs uppercase tracking-[0.18em] text-sell">
                          Backend rerun unavailable
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null
            }
          />
        </Panel>
      </div>

      {activePreset?.workbench ? <WorkbenchPanels workbench={activePreset.workbench} /> : null}
    </div>
  );
}

function WorkbenchPanels({ workbench }: { workbench: NonNullable<StrategyPreset['workbench']> }) {
  const review = workbench.ai_review;
  const mc = workbench.monte_carlo;
  const statusTone: Record<string, string> = {
    pass: 'text-buy',
    warn: 'text-amber-300',
    fail: 'text-sell',
    info: 'text-muted',
  };
  return (
    <div className="space-y-6">
      {review ? (
        <Panel>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              AI research review
            </p>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                review.verdict.startsWith('Paper')
                  ? 'border-buy/40 text-buy'
                  : 'border-sell/40 text-sell'
              }`}
            >
              {review.verdict}
            </span>
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted">
              {review.source}
            </span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-ink">{review.summary}</p>
          <div className="mt-3 grid gap-2 text-xs text-muted sm:grid-cols-3">
            <p>
              <span className="text-ink">Overfit risk:</span> {review.overfit_risk}
            </p>
            <p>
              <span className="text-ink">Next action:</span> {review.next_action}
            </p>
            <p>
              <span className="text-ink">Live readiness:</span> {review.live_readiness}
            </p>
          </div>
        </Panel>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            Cost stress scenarios
          </p>
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-[0.14em] text-muted">
                <th className="py-1 pr-3">Scenario</th>
                <th className="py-1 pr-3">Expectancy</th>
                <th className="py-1 pr-3">Win rate</th>
                <th className="py-1">PF</th>
              </tr>
            </thead>
            <tbody>
              {workbench.stress.map((row) => (
                <tr key={row.scenario} className="border-t border-border/60">
                  <td className="py-2 pr-3 text-ink">{row.scenario}</td>
                  <td
                    className={`metric-text py-2 pr-3 ${
                      row.expectancy_r > 0 ? 'text-buy' : 'text-sell'
                    }`}
                  >
                    {row.expectancy_r.toFixed(2)}R
                  </td>
                  <td className="metric-text py-2 pr-3 text-ink">
                    {(row.win_rate * 100).toFixed(0)}%
                  </td>
                  <td className="metric-text py-2 text-ink">{row.profit_factor.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">
            Same simulation, worse costs. An edge that dies at 2x slippage was never an edge.
          </p>
        </Panel>

        <Panel>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            Monte Carlo drawdowns (out-of-sample)
          </p>
          {mc.available ? (
            <>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-border bg-white/[0.03] p-4">
                  <p className="metric-text text-xl text-ink">{mc.median_max_drawdown_r}R</p>
                  <p className="mt-1 text-xs text-muted">Median max drawdown</p>
                </div>
                <div className="rounded-2xl border border-border bg-white/[0.03] p-4">
                  <p className="metric-text text-xl text-sell">{mc.p95_max_drawdown_r}R</p>
                  <p className="mt-1 text-xs text-muted">95th-percentile drawdown</p>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted">
                {mc.runs} resamples of {mc.sample} OOS trades. {mc.caveat}
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted">{mc.reason}</p>
          )}
        </Panel>
      </div>

      <Panel>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            Bias & quality gates
          </p>
          <span className="ml-auto text-[11px] text-muted">
            experiment {workbench.fingerprint.experiment_id} · {workbench.fingerprint.dataset_range}
          </span>
        </div>
        <ul className="mt-3 space-y-2">
          {workbench.bias_gates.map((gate) => (
            <li key={gate.id} className="flex items-start gap-3 text-sm">
              <span
                className={`w-12 shrink-0 text-xs font-semibold uppercase ${statusTone[gate.status] ?? 'text-muted'}`}
              >
                {gate.status}
              </span>
              <span className="w-44 shrink-0 text-ink">{gate.label}</span>
              <span className="text-muted">{gate.evidence}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
