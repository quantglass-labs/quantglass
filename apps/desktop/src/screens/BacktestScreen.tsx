// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { AlertTriangle, BookmarkPlus, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { TinyLineChart } from '../components/charts';
import { CountUp, FadeIn } from '../components/motion';
import { MetricTile } from '../components/surface';
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
  const { t } = useTranslation();
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
    setRunMessage(t('backtest.status.running'));
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
        setRunMessage(t('backtest.status.synced'));
      })
      .catch(() => {
        if (cancelled) return;
        setRunState('error');
        const available = timeframesBySymbol.get(preset.symbolId) ?? [];
        setRunMessage(
          available.length && !available.includes(preset.timeframe)
            ? t('backtest.status.noCandles', {
                timeframe: preset.timeframe,
                symbol: symbol.symbol,
                available: available.join(', '),
              })
            : t('backtest.runFailed'),
        );
      });

    return () => {
      cancelled = true;
    };
  }, [
    feesPercent,
    preset,
    slippagePercent,
    symbol,
    timeframesBySymbol,
    trainTestSplit,
    walkForward,
    runNonce,
    t,
  ]);

  return (
    <div className="space-y-8">
      <SectionHeading
        eyebrow={t('backtest.eyebrow')}
        title={t('backtest.title')}
        description={t('backtest.description')}
      />

      <div className="flex flex-wrap gap-2">
        {['pastDataOnly', 'notAPrediction', 'costsIncluded', 'outOfSampleRequired'].map((chip) => (
          <span
            key={chip}
            className="rounded-full border border-border bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted"
          >
            {t(`backtest.chips.${chip}`)}
          </span>
        ))}
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
            {t('backtest.howTo.title')}
          </p>
          <span className="text-xs text-muted">
            {howToOpen ? t('backtest.howTo.hide') : t('backtest.howTo.show')}
          </span>
        </button>
        {howToOpen ? (
          <>
            <p className="mt-2 text-sm text-muted">{t('backtest.howTo.intro')}</p>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted">
              <li>{t('backtest.howTo.step1')}</li>
              <li>{t('backtest.howTo.step2')}</li>
              <li>{t('backtest.howTo.step3')}</li>
              <li>
                <span className="text-ink">{t('backtest.howTo.step4Save')}</span>{' '}
                {t('backtest.howTo.step4Suffix')}
              </li>
            </ol>
            <p className="mt-3 text-xs text-muted">{t('backtest.howTo.footer')}</p>
          </>
        ) : null}
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[0.9fr,1.4fr]">
        <Panel>
          <div className="space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                {t('backtest.selector.title')}
              </p>
              <select
                className="mt-3 w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                value={selectedPresetId}
                onChange={(event) => setSelectedPresetId(event.target.value)}
              >
                {!selectablePresets.length ? (
                  <option value="">{t('backtest.selector.waitingForData')}</option>
                ) : null}
                {presets.length ? (
                  <optgroup label={t('backtest.selector.detectedSignals')}>
                    {presets.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {savedPresets.length ? (
                  <optgroup label={t('backtest.selector.savedStrategies')}>
                    {savedPresets.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {demoPresetOption ? (
                  <optgroup label={t('backtest.selector.demo')}>
                    <option value={demoPresetOption.id}>{demoPresetOption.name}</option>
                  </optgroup>
                ) : null}
              </select>
              {!presets.length ? (
                <p className="mt-2 text-xs text-muted">{t('backtest.selector.presetsHint')}</p>
              ) : null}

              <div className="mt-4 rounded-2xl border border-border bg-white/[0.03] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                  {t('backtest.selector.composeYourOwn')}
                </p>
                <p className="mt-1 text-xs text-muted">{t('backtest.selector.composeHint')}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <select
                    aria-label={t('backtest.selector.symbolAria')}
                    className="rounded-2xl border border-border bg-white/[0.04] px-3 py-2 text-sm text-ink outline-none"
                    value={manualSymbolId}
                    onChange={(event) => setManualSymbolId(event.target.value)}
                  >
                    <option value="">{t('backtest.selector.symbolPlaceholder')}</option>
                    {symbols.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.symbol}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={t('backtest.selector.setupFamilyAria')}
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
                    aria-label={t('backtest.selector.timeframeAria')}
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
                    {t('backtest.selector.storedCandles', {
                      symbol: symbols.find((entry) => entry.id === manualSymbolId)?.symbol,
                      timeframes: manualTimeframes.join(', '),
                    })}
                  </p>
                ) : null}
                <Button
                  variant="secondary"
                  className="mt-3 w-full"
                  disabled={!manualPreset || !manualTimeframes.length}
                  onClick={() => manualPreset && setSelectedPresetId(manualPreset.id)}
                >
                  {t('backtest.selector.useCombination')}
                </Button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm text-muted">
                <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
                  {t('backtest.costs.fees')}
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
                  {t('backtest.costs.slippage')}
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
                  {t('backtest.costs.split')}
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
                  {t('backtest.costs.splitLabel', {
                    train: trainTestSplit,
                    test: 100 - trainTestSplit,
                  })}
                </span>
              </label>
              <label className="flex items-center justify-between rounded-2xl border border-border bg-white/[0.03] px-4 py-3 text-sm text-muted">
                <span>{t('backtest.costs.walkForward')}</span>
                <button
                  type="button"
                  className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${walkForward ? 'bg-buy/12 text-buy' : 'bg-white/8 text-muted'}`}
                  onClick={() => setWalkForward((current) => !current)}
                >
                  {walkForward ? t('backtest.costs.enabled') : t('backtest.costs.disabled')}
                </button>
              </label>
            </div>

            <div className="rounded-3xl border border-border bg-white/[0.03] p-4 text-sm text-muted">
              <div className="flex items-center gap-2 text-ink">
                <SlidersHorizontal className="size-4 text-accent" />
                <span className="font-medium">{t('backtest.prefill.source')}</span>
              </div>
              <p className="mt-2">
                {t('backtest.prefill.line', {
                  symbol: symbol?.symbol ?? t('backtest.prefill.unavailable'),
                  setup: preset?.setupType ?? t('backtest.prefill.unavailable'),
                  timeframe: preset?.timeframe ?? t('backtest.prefill.unavailable'),
                })}
              </p>
              {preset?.strategyName ? (
                <p className="mt-2">
                  {t('backtest.prefill.strategySource', {
                    name: preset.strategyName,
                    source:
                      (preset.strategySource ?? t('backtest.prefill.builtIn')) +
                      (preset.extensionId ? ` / ${preset.extensionId}` : ''),
                  })}
                </p>
              ) : null}
              <p className="mt-2">{runMessage ?? t('backtest.defaultRunMessage')}</p>
              {liveCorridorItem ? (
                <p className="mt-2">
                  {t('backtest.prefill.liveBacking', {
                    symbol: liveCorridorItem.symbol,
                    timeframe: liveCorridorItem.timeframe,
                    provider: liveCorridorItem.provider,
                    time: formatDateTime(liveCorridorItem.latest_open_time_utc),
                  })}
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
                {t('backtest.saveStrategy')}
              </Button>
              <Button
                className="w-full"
                onClick={() => setRunNonce((nonce) => nonce + 1)}
                disabled={!preset || !symbol || runState === 'running'}
              >
                {runState === 'running' ? t('backtest.running') : t('backtest.runBacktest')}
              </Button>
            </div>

            <div className="rounded-2xl border border-border bg-white/[0.03] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                {t('backtest.readiness.title')}
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {[
                  { label: t('backtest.readiness.strategySelected'), ok: Boolean(preset) },
                  { label: t('backtest.readiness.marketDataStored'), ok: Boolean(symbol) },
                  {
                    label: t('backtest.readiness.costsConfigured'),
                    ok: feesPercent + slippagePercent > 0,
                  },
                  {
                    label: t('backtest.readiness.splitSet'),
                    ok: trainTestSplit > 0 && trainTestSplit < 100,
                  },
                  { label: t('backtest.readiness.walkForwardEnabled'), ok: walkForward },
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
                  title={t('backtest.empty.title')}
                  description={t('backtest.empty.description')}
                  action={
                    <div className="flex flex-wrap justify-center gap-3">
                      {presets[0] ? (
                        <Button onClick={() => setSelectedPresetId(presets[0].id)}>
                          {t('backtest.empty.useLatestSignal')}
                        </Button>
                      ) : null}
                      <Button variant="secondary" onClick={startDemo} disabled={!symbols.length}>
                        {t('backtest.empty.tryDemo')}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => navigate('/settings?tab=strategies')}
                      >
                        {t('backtest.empty.loadSaved')}
                      </Button>
                    </div>
                  }
                />
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    'equityCurve',
                    'drawdown',
                    'winRateExpectancy',
                    'trainTestComparison',
                    'costStressTable',
                    'monteCarloDrawdowns',
                    'biasQualityGates',
                    'aiResearchReview',
                  ].map((label) => (
                    <div
                      key={label}
                      className="rounded-2xl border border-dashed border-border/70 bg-white/[0.02] px-4 py-6 text-center"
                    >
                      <p className="text-sm text-muted/70">
                        {t(`backtest.empty.preview.${label}`)}
                      </p>
                      <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-muted/50">
                        {t('backtest.empty.appearsAfterRun')}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="text-center text-xs text-muted">{t('backtest.empty.demoNote')}</p>
              </div>
            }
            error={
              <ErrorState
                title={t('backtest.error.title')}
                description={t('backtest.error.description')}
                onRetry={retryMockView}
              />
            }
            populated={
              displayedPreset ? (
                <div className="space-y-6">
                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                        {t('backtest.charts.equityCurve')}
                      </p>
                      <TinyLineChart values={displayedPreset.equityCurve} tone="buy" />
                    </div>
                    <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                        {t('backtest.charts.drawdownCurve')}
                      </p>
                      <TinyLineChart
                        values={displayedPreset.drawdownCurve.map((value) => Math.abs(value))}
                        tone="sell"
                      />
                    </div>
                  </div>

                  <FadeIn>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <MetricTile
                        label={t('backtest.tiles.netWinRate')}
                        hero
                        toneClass="text-buy"
                        helper={displayedPreset.metrics.testPeriod}
                      >
                        <CountUp
                          value={displayedPreset.metrics.winRate}
                          format={(n) => `${Math.round(n)}%`}
                        />
                      </MetricTile>
                      <MetricTile
                        label={t('backtest.tiles.averageR')}
                        toneClass={displayedPreset.metrics.avgR >= 0 ? 'text-buy' : 'text-sell'}
                        helper={t('backtest.tiles.averageRHelper')}
                      >
                        <CountUp
                          value={displayedPreset.metrics.avgR}
                          format={(n) => n.toFixed(2)}
                        />
                      </MetricTile>
                      <MetricTile
                        label={t('backtest.tiles.expectancy')}
                        toneClass={
                          displayedPreset.metrics.expectancy >= 0 ? 'text-buy' : 'text-sell'
                        }
                        helper={t('backtest.tiles.expectancyHelper')}
                      >
                        <CountUp
                          value={displayedPreset.metrics.expectancy}
                          format={(n) => n.toFixed(2)}
                        />
                      </MetricTile>
                      <MetricTile
                        label={t('backtest.tiles.maxDrawdown')}
                        toneClass="text-sell"
                        helper={t('backtest.tiles.maxDrawdownHelper')}
                      >
                        <CountUp
                          value={displayedPreset.metrics.maxDrawdown}
                          format={(n) => formatPercent(n)}
                        />
                      </MetricTile>
                      <MetricTile
                        label={t('backtest.tiles.sharpe')}
                        helper={t('backtest.tiles.sharpeHelper')}
                      >
                        <CountUp
                          value={displayedPreset.metrics.sharpe}
                          format={(n) => n.toFixed(2)}
                        />
                      </MetricTile>
                      <MetricTile
                        label={t('backtest.tiles.sortino')}
                        helper={t('backtest.tiles.sortinoHelper')}
                      >
                        <CountUp
                          value={displayedPreset.metrics.sortino}
                          format={(n) => n.toFixed(2)}
                        />
                      </MetricTile>
                      <MetricTile
                        label={t('backtest.tiles.profitFactor')}
                        helper={t('backtest.tiles.profitFactorHelper')}
                      >
                        <CountUp
                          value={displayedPreset.metrics.profitFactor}
                          format={(n) => n.toFixed(2)}
                        />
                      </MetricTile>
                      <MetricTile
                        label={t('backtest.tiles.tradeCount')}
                        toneClass={
                          displayedPreset.metrics.tradeCount < minBacktestSample
                            ? 'text-hold'
                            : 'text-watch'
                        }
                        helper={t('backtest.tiles.tradeCountHelper', {
                          threshold: minBacktestSample,
                        })}
                      >
                        <CountUp
                          value={displayedPreset.metrics.tradeCount}
                          format={(n) => String(Math.round(n))}
                        />
                      </MetricTile>
                    </div>
                  </FadeIn>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                        {t('backtest.inOut.title')}
                      </p>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <MetricStat
                          label={t('backtest.inOut.inSampleWinRate')}
                          value={`${displayedPreset.metrics.inSampleWinRate}%`}
                          helper={t('backtest.inOut.trainingSegment')}
                        />
                        <MetricStat
                          label={t('backtest.inOut.outOfSampleWinRate')}
                          value={`${displayedPreset.metrics.outOfSampleWinRate}%`}
                          helper={t('backtest.inOut.heldOutValidation')}
                        />
                      </div>
                      {oosGap > 5 ? (
                        <div className="mt-4 rounded-2xl border border-sell/30 bg-sell/10 p-4 text-sm text-muted">
                          {t('backtest.inOut.overfittingWarning', { gap: oosGap.toFixed(0) })}
                        </div>
                      ) : (
                        <div className="mt-4 rounded-2xl border border-buy/30 bg-buy/10 p-4 text-sm text-muted">
                          {t('backtest.inOut.noOverfitting')}
                        </div>
                      )}
                    </div>
                    <div className="rounded-3xl border border-border bg-white/[0.03] p-4 text-sm text-muted">
                      {displayedPreset.metrics.tradeCount < minBacktestSample ? (
                        <div className="flex gap-3 rounded-2xl border border-hold/30 bg-hold/10 p-4 text-hold">
                          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
                          <div>
                            <p className="font-semibold">{t('backtest.sample.lowWarningTitle')}</p>
                            <p className="mt-1 text-sm text-muted">
                              {t('backtest.sample.lowWarningBody', {
                                threshold: minBacktestSample,
                              })}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-buy/30 bg-buy/10 p-4 text-muted">
                          {t('backtest.sample.aboveThreshold', { threshold: minBacktestSample })}
                        </div>
                      )}
                      {runState === 'running' ? (
                        <p className="mt-4 text-xs uppercase tracking-[0.18em] text-muted">
                          {t('backtest.sample.refreshing')}
                        </p>
                      ) : null}
                      {runState === 'error' ? (
                        <p className="mt-4 text-xs uppercase tracking-[0.18em] text-sell">
                          {t('backtest.sample.rerunUnavailable')}
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
  const { t } = useTranslation();
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
              {t('backtest.workbench.aiResearchReview')}
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
              <span className="text-ink">{t('backtest.workbench.overfitRisk')}</span>{' '}
              {review.overfit_risk}
            </p>
            <p>
              <span className="text-ink">{t('backtest.workbench.nextAction')}</span>{' '}
              {review.next_action}
            </p>
            <p>
              <span className="text-ink">{t('backtest.workbench.liveReadiness')}</span>{' '}
              {review.live_readiness}
            </p>
          </div>
        </Panel>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            {t('backtest.workbench.costStressScenarios')}
          </p>
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-[0.14em] text-muted">
                <th className="py-1 pr-3">{t('backtest.workbench.scenario')}</th>
                <th className="py-1 pr-3">{t('backtest.workbench.expectancy')}</th>
                <th className="py-1 pr-3">{t('backtest.workbench.winRate')}</th>
                <th className="py-1">{t('backtest.workbench.pf')}</th>
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
          <p className="mt-2 text-xs text-muted">{t('backtest.workbench.costStressNote')}</p>
        </Panel>

        <Panel>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            {t('backtest.workbench.monteCarloTitle')}
          </p>
          {mc.available ? (
            <>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-border bg-white/[0.03] p-4">
                  <p className="metric-text text-xl text-ink">{mc.median_max_drawdown_r}R</p>
                  <p className="mt-1 text-xs text-muted">
                    {t('backtest.workbench.medianMaxDrawdown')}
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-white/[0.03] p-4">
                  <p className="metric-text text-xl text-sell">{mc.p95_max_drawdown_r}R</p>
                  <p className="mt-1 text-xs text-muted">{t('backtest.workbench.p95Drawdown')}</p>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted">
                {t('backtest.workbench.mcRunsLine', {
                  runs: mc.runs,
                  sample: mc.sample,
                  caveat: mc.caveat,
                })}
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
            {t('backtest.workbench.biasGates')}
          </p>
          <span className="ml-auto text-[11px] text-muted">
            {t('backtest.workbench.experimentLine', {
              id: workbench.fingerprint.experiment_id,
              range: workbench.fingerprint.dataset_range,
            })}
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
