// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Bell, BookmarkPlus, ChartCandlestick, CircleSlash2, Play, Search, SlidersHorizontal } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BarChart, TinyLineChart } from '../components/charts';
import {
  aroon,
  averageTrueRange,
  bollingerBands,
  chaikinMoneyFlow,
  commodityChannelIndex,
  directionalMovementIndex,
  donchianChannel,
  exponentialMovingAverage,
  keltnerChannel,
  momentum,
  moneyFlowIndex,
  movingAverageConvergenceDivergence,
  normalizedAverageTrueRange,
  onBalanceVolume,
  rateOfChange,
  realizedVolatility,
  relativeStrengthIndex,
  relativeVolume,
  rollingStandardDeviation,
  sessionVwap,
  simpleMovingAverage,
  stochasticOscillator,
  volumeSma,
  volumeWeightedMovingAverage,
  weightedMovingAverage,
  williamsR,
  zScore,
} from '../lib/analytics';
import { freshnessClassName, signalFreshness } from '../lib/freshness';
import { formatCurrency, formatDateTime, formatLargeNumber } from '../lib/format';
import { Button, DataStateView, EmptyState, ErrorState, LoadingSkeleton, MetricStat, Panel, PillTabs, SectionHeading, SignalChip } from '../components/ui';
import type { Candle, CorridorIngestResult, IndicatorRegistryEntry, NewsItem, ScreenState, SignalRecord, SymbolRecord, Timeframe } from '../types';

const TradingViewCandlestickChart = lazy(async () => import('../components/tvChart').then((module) => ({ default: module.TradingViewCandlestickChart })));

const READY_INDICATOR_IDS = new Set([
  'ema21',
  'sma50',
  'rsi14',
  'rsi2',
  'atr14',
  'adx14',
  'macd-histogram',
  'bollinger-20-2',
  'donchian-20',
  'keltner-21-atr',
  'sma20',
  'sma100',
  'sma200',
  'ema8',
  'ema34',
  'ema55',
  'wma20',
  'vwma20',
  'vwap-session',
  'aroon-25',
  'dmi-14',
  'cci20',
  'stochastic-14-3',
  'williams-r',
  'roc12',
  'momentum10',
  'realized-vol-20',
  'stddev-20',
  'zscore-20',
  'natr14',
  'obv',
  'mfi14',
  'cmf20',
  'volume-sma20',
  'relative-volume-20',
  'community-volume-participation',
]);

const DEFAULT_INDICATOR_IDS = ['ema21', 'sma50', 'bollinger-20-2', 'rsi14', 'macd-histogram', 'atr14', 'volume-sma20'];
const PRICE_COLORS = ['#8db7ff', '#f0b84b', '#18c37f', '#ff8fb3', '#4dd2ff', '#b893ff', '#ffb45c', '#7ee787'];

interface ComputedIndicatorView {
  definition: IndicatorRegistryEntry;
  status: 'ready' | 'extension' | 'catalog';
  executable: boolean;
  placement: 'price' | 'panel' | 'volume';
  values: number[];
  secondary?: number[];
  tertiary?: number[];
  color: string;
  label: string;
}

function timeframeMinutes(timeframe: Timeframe) {
  switch (timeframe) {
    case '15m':
      return 15;
    case '1h':
      return 60;
    case '4h':
      return 240;
    case '1d':
      return 1440;
  }
}

function resampleCandles(candles: Candle[], from: Timeframe, to: Timeframe): Candle[] {
  if (from === to) return candles;
  const fromMinutes = timeframeMinutes(from);
  const toMinutes = timeframeMinutes(to);
  if (toMinutes <= fromMinutes || toMinutes % fromMinutes !== 0) {
    return [];
  }

  const bucketSize = toMinutes / fromMinutes;
  const resampled: Candle[] = [];
  for (let index = bucketSize - 1; index < candles.length; index += bucketSize) {
    const slice = candles.slice(index - bucketSize + 1, index + 1);
    if (slice.length !== bucketSize) continue;
    resampled.push({
      time: slice[slice.length - 1].time,
      open: slice[0].open,
      high: Math.max(...slice.map((candle) => candle.high)),
      low: Math.min(...slice.map((candle) => candle.low)),
      close: slice[slice.length - 1].close,
      volume: slice.reduce((total, candle) => total + candle.volume, 0),
    });
  }
  return resampled;
}

function marketCandleKey(symbol: string, timeframe: Timeframe) {
  return `${symbol}:${timeframe}`;
}

function categoryLabel(category: string) {
  return category
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function indicatorStatus(indicator: IndicatorRegistryEntry): ComputedIndicatorView['status'] {
  if (indicator.source === 'extension') return 'extension';
  return READY_INDICATOR_IDS.has(indicator.id) ? 'ready' : 'catalog';
}

function computeIndicatorView(indicator: IndicatorRegistryEntry, candles: Candle[], colorIndex: number): ComputedIndicatorView {
  const closes = candles.map((candle) => candle.close);
  const volumes = candles.map((candle) => candle.volume);
  const macd = movingAverageConvergenceDivergence(closes);
  const bands = bollingerBands(closes, 20);
  const atr14 = averageTrueRange(candles, 14);
  const dmi = directionalMovementIndex(candles, 14);
  const color = PRICE_COLORS[colorIndex % PRICE_COLORS.length];
  const empty = closes.map(() => 0);
  const status = indicatorStatus(indicator);
  const executable = READY_INDICATOR_IDS.has(indicator.id);
  const price = (values: number[], secondary?: number[], tertiary?: number[]): ComputedIndicatorView => ({
    definition: indicator,
    status,
    executable,
    placement: 'price',
    values,
    secondary,
    tertiary,
    color,
    label: indicator.name,
  });
  const panel = (values: number[], secondary?: number[], tertiary?: number[]): ComputedIndicatorView => ({
    definition: indicator,
    status,
    executable,
    placement: indicator.category === 'volume' ? 'volume' : 'panel',
    values,
    secondary,
    tertiary,
    color,
    label: indicator.name,
  });

  switch (indicator.id) {
    case 'ema8':
      return price(exponentialMovingAverage(closes, 8));
    case 'ema21':
      return price(exponentialMovingAverage(closes, 21));
    case 'ema34':
      return price(exponentialMovingAverage(closes, 34));
    case 'ema55':
      return price(exponentialMovingAverage(closes, 55));
    case 'sma20':
      return price(simpleMovingAverage(closes, 20));
    case 'sma50':
      return price(simpleMovingAverage(closes, 50));
    case 'sma100':
      return price(simpleMovingAverage(closes, 100));
    case 'sma200':
      return price(simpleMovingAverage(closes, 200));
    case 'wma20':
      return price(weightedMovingAverage(closes, 20));
    case 'vwma20':
      return price(volumeWeightedMovingAverage(candles, 20));
    case 'vwap-session':
      return price(sessionVwap(candles));
    case 'bollinger-20-2':
      return price(bands.middle, bands.upper, bands.lower);
    case 'donchian-20': {
      const donchian = donchianChannel(candles, 20);
      return price(donchian.upper, donchian.lower);
    }
    case 'keltner-21-atr': {
      const keltner = keltnerChannel(candles, 21);
      return price(keltner.middle, keltner.upper, keltner.lower);
    }
    case 'rsi14':
      return panel(relativeStrengthIndex(closes, 14));
    case 'rsi2':
      return panel(relativeStrengthIndex(closes, 2));
    case 'macd-histogram':
      return panel(macd.histogram, macd.macd, macd.signal);
    case 'atr14':
      return panel(atr14);
    case 'adx14':
      return panel(dmi.adx, dmi.plus, dmi.minus);
    case 'dmi-14':
      return panel(dmi.plus, dmi.minus);
    case 'aroon-25': {
      const aroonValues = aroon(candles, 25);
      return panel(aroonValues.up, aroonValues.down, aroonValues.oscillator);
    }
    case 'stochastic-14-3': {
      const stochastic = stochasticOscillator(candles, 14, 3);
      return panel(stochastic.k, stochastic.d);
    }
    case 'williams-r':
      return panel(williamsR(candles, 14));
    case 'roc12':
      return panel(rateOfChange(closes, 12));
    case 'momentum10':
      return panel(momentum(closes, 10));
    case 'cci20':
      return panel(commodityChannelIndex(candles, 20));
    case 'realized-vol-20':
      return panel(realizedVolatility(closes, 20));
    case 'stddev-20':
      return panel(rollingStandardDeviation(closes, 20));
    case 'zscore-20':
      return panel(zScore(closes, 20));
    case 'natr14':
      return panel(normalizedAverageTrueRange(candles, 14));
    case 'obv':
      return panel(onBalanceVolume(candles));
    case 'mfi14':
      return panel(moneyFlowIndex(candles, 14));
    case 'cmf20':
      return panel(chaikinMoneyFlow(candles, 20));
    case 'volume-sma20':
      return panel(volumeSma(candles, 20));
    case 'relative-volume-20':
      return panel(relativeVolume(candles, 20));
    case 'community-volume-participation':
      return panel(relativeVolume(candles, 20));
    default:
      return {
        definition: indicator,
        status,
        executable,
        placement: 'panel',
        values: empty,
        color,
        label: indicator.name,
      };
  }
}

function resolveCandleSource(
  corridorItems: CorridorIngestResult[],
  marketCandlesByKey: Record<string, Candle[]>,
  timeframe: Timeframe,
) {
  const exact = corridorItems.find((entry) => entry.timeframe === timeframe);
  if (exact) {
    const exactCandles = marketCandlesByKey[marketCandleKey(exact.symbol, timeframe)] ?? [];
    if (exactCandles.length) {
      return {
        source: exact,
        sourceTimeframe: timeframe,
        candles: exactCandles,
        exact: true,
      };
    }
  }

  const targetMinutes = timeframeMinutes(timeframe);
  const aggregateCandidates = corridorItems
    .map((entry) => ({
      entry,
      sourceTimeframe: entry.timeframe as Timeframe,
      sourceMinutes: timeframeMinutes(entry.timeframe as Timeframe),
      candles: marketCandlesByKey[marketCandleKey(entry.symbol, entry.timeframe as Timeframe)] ?? [],
    }))
    .filter((candidate) => candidate.candles.length > 0 && candidate.sourceMinutes < targetMinutes && targetMinutes % candidate.sourceMinutes === 0)
    .sort((left, right) => right.sourceMinutes - left.sourceMinutes);

  for (const candidate of aggregateCandidates) {
    const candles = resampleCandles(candidate.candles, candidate.sourceTimeframe, timeframe);
    if (candles.length) {
      return {
        source: candidate.entry,
        sourceTimeframe: candidate.sourceTimeframe,
        candles,
        exact: false,
      };
    }
  }

  return {
    source: exact ?? corridorItems[0] ?? null,
    sourceTimeframe: exact?.timeframe as Timeframe | undefined,
    candles: [] as Candle[],
    exact: false,
  };
}

export function SymbolDetailScreen({
  state,
  symbols,
  signals,
  news,
  watchlistIds,
  marketCorridorItems,
  marketCandlesByKey,
  extensionIndicators,
  marketCorridorRefreshing,
  onRefreshMarketCorridor,
  onToggleWatchlist,
  onOpenSignal,
  onOpenAlertModal,
  onRunBacktest,
}: {
  state: ScreenState;
  symbols: SymbolRecord[];
  signals: SignalRecord[];
  news: NewsItem[];
  watchlistIds: string[];
  marketCorridorItems: CorridorIngestResult[];
  marketCandlesByKey: Record<string, Candle[]>;
  extensionIndicators: IndicatorRegistryEntry[];
  marketCorridorRefreshing: boolean;
  onRefreshMarketCorridor: () => void;
  onToggleWatchlist: (symbolId: string) => void;
  onOpenSignal: (signalId: string) => void;
  onOpenAlertModal: (symbolId: string, signalId?: string) => void;
  onRunBacktest: (symbolId: string, setupType: string) => void;
}) {
  const navigate = useNavigate();
  const { symbolId = 'BTCUSD' } = useParams();
  const matchedSymbol = symbols.find((entry) => entry.id === symbolId);
  const symbol = matchedSymbol ?? symbols[0] ?? null;
  const signalRecord = symbol ? signals.find((entry) => entry.symbolId === symbol.id) ?? null : null;
  const symbolCorridorItems = useMemo(
    () => (symbol ? marketCorridorItems.filter((entry) => entry.symbol === symbol.id) : []),
    [marketCorridorItems, symbol],
  );
  const defaultCorridorItem = symbolCorridorItems.find((entry) => entry.timeframe === signalRecord?.signal.timeframe) ?? symbolCorridorItems[0] ?? null;
  const [timeframe, setTimeframe] = useState<Timeframe>((defaultCorridorItem?.timeframe as Timeframe | undefined) ?? signalRecord?.signal.timeframe ?? '1h');
  const [indicatorBrowserOpen, setIndicatorBrowserOpen] = useState(false);
  const [indicatorSearch, setIndicatorSearch] = useState('');
  const [selectedIndicatorIds, setSelectedIndicatorIds] = useState<string[]>(DEFAULT_INDICATOR_IDS);
  const [showSupportResistance, setShowSupportResistance] = useState(true);
  const retryMockView = () => window.location.reload();

  useEffect(() => {
    setTimeframe((defaultCorridorItem?.timeframe as Timeframe | undefined) ?? signalRecord?.signal.timeframe ?? '1h');
  }, [defaultCorridorItem?.timeframe, signalRecord?.signal.timeframe, symbol?.id]);

  const candleSource = useMemo(
    () => resolveCandleSource(symbolCorridorItems, marketCandlesByKey, timeframe),
    [marketCandlesByKey, symbolCorridorItems, timeframe],
  );
  const liveCorridorItem = candleSource.source;
  const liveTimeframe = candleSource.sourceTimeframe;
  const backendCandles = candleSource.candles;
  const candles = backendCandles;
  const usesBackendCandles = backendCandles.length > 0;
  const usesExactTimeframe = candleSource.exact;
  const closes = candles.map((candle) => candle.close);
  const volumes = candles.map((candle) => candle.volume);
  const lows = candles.map((candle) => candle.low);
  const highs = candles.map((candle) => candle.high);
  const ema = useMemo(() => exponentialMovingAverage(closes, 21), [closes]);
  const sma = useMemo(() => simpleMovingAverage(closes, 50), [closes]);
  const bands = useMemo(() => bollingerBands(closes, 20), [closes]);
  const rsi = useMemo(() => relativeStrengthIndex(closes, 14), [closes]);
  const macd = useMemo(() => movingAverageConvergenceDivergence(closes), [closes]);
  const atr = useMemo(() => averageTrueRange(candles, 14), [candles]);
  const supportLevel = useMemo(() => (lows.length ? Math.min(...lows.slice(-24)) : 0), [lows]);
  const resistanceLevel = useMemo(() => (highs.length ? Math.max(...highs.slice(-24)) : 0), [highs]);
  const indicatorDefinitions = useMemo(
    () => [...extensionIndicators].sort((left, right) => {
      const leftStatus = indicatorStatus(left);
      const rightStatus = indicatorStatus(right);
      const statusOrder = { ready: 0, extension: 1, catalog: 2 };
      return statusOrder[leftStatus] - statusOrder[rightStatus] || left.category.localeCompare(right.category) || left.name.localeCompare(right.name);
    }),
    [extensionIndicators],
  );
  const selectedIndicators = useMemo(
    () => selectedIndicatorIds
      .map((id, index) => {
        const definition = indicatorDefinitions.find((indicator) => indicator.id === id);
        return definition ? computeIndicatorView(definition, candles, index) : null;
      })
      .filter((indicator): indicator is ComputedIndicatorView => Boolean(indicator)),
    [candles, indicatorDefinitions, selectedIndicatorIds],
  );
  const priceIndicators = useMemo(
    () => selectedIndicators.filter((indicator) => indicator.executable && indicator.placement === 'price'),
    [selectedIndicators],
  );
  const panelIndicators = useMemo(
    () => selectedIndicators.filter((indicator) => indicator.placement !== 'price'),
    [selectedIndicators],
  );
  const indicatorGroups = useMemo(() => {
    const query = indicatorSearch.trim().toLowerCase();
    const groups = new Map<string, IndicatorRegistryEntry[]>();
    indicatorDefinitions
      .filter((indicator) => {
        if (!query) return true;
        return [
          indicator.name,
          indicator.id,
          indicator.category,
          indicator.description,
          ...(indicator.families ?? []),
        ].join(' ').toLowerCase().includes(query);
      })
      .forEach((indicator) => {
        groups.set(indicator.category, [...(groups.get(indicator.category) ?? []), indicator]);
      });
    return [...groups.entries()];
  }, [indicatorDefinitions, indicatorSearch]);
  const symbolNews = news.filter((item) => item.symbol === (signalRecord?.signal.symbol ?? symbol?.symbol));
  const currentSignalFreshness = signalRecord ? signalFreshness(signalRecord.signal) : null;
  const readyIndicatorCount = indicatorDefinitions.filter((indicator) => indicatorStatus(indicator) === 'ready').length;

  function toggleIndicator(indicatorId: string) {
    setSelectedIndicatorIds((current) =>
      current.includes(indicatorId)
        ? current.filter((id) => id !== indicatorId)
        : [...current, indicatorId],
    );
  }

  const indicatorStats = [
    { label: 'EMA 21', value: formatCurrency(ema.at(-1) ?? 0), helper: 'Short-term trend support' },
    { label: 'SMA 50', value: formatCurrency(sma.at(-1) ?? 0), helper: 'Intermediate trend baseline' },
    { label: 'RSI 14', value: `${(rsi.at(-1) ?? 0).toFixed(1)}`, helper: 'Momentum oscillator' },
    { label: 'ATR 14', value: formatCurrency(atr.at(-1) ?? 0), helper: 'Volatility per bar' },
    { label: 'Support zone', value: formatCurrency(supportLevel), helper: 'Rolling 24-bar floor' },
    { label: 'Resistance zone', value: formatCurrency(resistanceLevel), helper: 'Rolling 24-bar ceiling' },
  ];

  if (!matchedSymbol || !symbol) {
    return (
      <div className="space-y-8">
        <SectionHeading
          eyebrow="Unknown symbol"
          title="Requested symbol was not found"
          description="The symbol-detail route stays explicit when a symbol id is invalid instead of silently swapping to another instrument."
        />
        <Panel>
          <ErrorState title="Symbol detail unavailable" description={`No symbol definition exists for "${symbolId}".`} />
          <div className="mt-4 flex flex-wrap gap-3">
            <Button onClick={() => navigate('/')}>Return to dashboard</Button>
            <Button variant="secondary" onClick={() => navigate(`/symbol/${symbol.id}`)}>
              Open {symbol.symbol}
            </Button>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <SectionHeading
        eyebrow={`${symbol.marketType.toUpperCase()} / ${symbol.symbol}`}
        title={`${symbol.name} detail`}
        description="Large chart with overlay toggles, deterministic signal context, backend corridor candles with backend resampling where possible, backend-served news, and direct routes to the signal drawer, alert modal, and prefilled backtest."
        action={
          <div className="flex flex-wrap gap-3">
            <PillTabs
              value={timeframe}
              onChange={setTimeframe}
              options={[
                { value: '15m', label: '15m' },
                { value: '1h', label: '1h' },
                { value: '4h', label: '4h' },
                { value: '1d', label: '1d' },
              ]}
            />
            {liveCorridorItem ? <Button variant="secondary" onClick={onRefreshMarketCorridor} disabled={marketCorridorRefreshing}>{marketCorridorRefreshing ? 'Refreshing corridor...' : 'Refresh corridor'}</Button> : null}
            <Button variant="secondary" onClick={() => onToggleWatchlist(symbol.id)}>
              <BookmarkPlus className="size-4" />
              {watchlistIds.includes(symbol.id) ? 'Remove from watchlist' : 'Add to watchlist'}
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.5fr,0.9fr]">
        <Panel>
          <DataStateView
            state={state}
            isEmpty={!candles.length}
            loading={<LoadingSkeleton chart rows={5} />}
            empty={
              <EmptyState
                title="No closed candles for this view"
                description="No closed candles are available for this timeframe. Switch timeframe or open another symbol to keep navigating."
                action={<Button variant="secondary" onClick={() => setTimeframe('1d')}>Switch to 1d</Button>}
              />
            }
            error={<ErrorState title="Chart surface unavailable" description="The candlestick, overlays, and indicator panels could not be rendered." onRetry={retryMockView} />}
            populated={
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border bg-white/[0.03] p-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-muted">
                      <ChartCandlestick className="size-4 text-accent" />
                      <span>{symbol.venue}</span>
                    </div>
                    <div className="flex items-end gap-3">
                      <h2 className="metric-text text-3xl text-ink">{formatCurrency(symbol.lastPrice)}</h2>
                      <p className={symbol.changePercent >= 0 ? 'text-buy' : 'text-sell'}>{symbol.changePercent >= 0 ? '+' : ''}{symbol.changePercent.toFixed(1)}%</p>
                    </div>
                    {liveCorridorItem ? <p className="text-xs text-muted">{usesBackendCandles ? (usesExactTimeframe ? `Live backend corridor candles: ${liveCorridorItem.provider} ${liveCorridorItem.timeframe} · latest ${formatDateTime(liveCorridorItem.latest_open_time_utc)} UTC` : `Backend ${liveTimeframe} corridor candles from ${liveCorridorItem.provider}, aggregated to ${timeframe}. Latest source candle ${formatDateTime(liveCorridorItem.latest_open_time_utc)} UTC.`) : `Backend corridor is available for ${liveCorridorItem.timeframe} via ${liveCorridorItem.provider}; no closed ${timeframe} candles are available yet.`}</p> : null}
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] transition ${showSupportResistance ? 'border-accent bg-accentStrong/15 text-ink' : 'border-border text-muted hover:bg-white/5'}`}
                      onClick={() => setShowSupportResistance((current) => !current)}
                    >
                      S/R
                    </button>
                    <Button variant="secondary" onClick={() => setIndicatorBrowserOpen((current) => !current)}>
                      <SlidersHorizontal className="size-4" />
                      Indicators
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-buy/30 bg-buy/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-buy">{readyIndicatorCount} ready</span>
                  <span className="rounded-full border border-border px-3 py-1 text-xs text-muted">{indicatorDefinitions.length} registry entries</span>
                  {selectedIndicators.map((indicator) => (
                    <button
                      key={indicator.definition.id}
                      type="button"
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${indicator.status === 'ready' ? 'border-accent/50 bg-accentStrong/10 text-ink' : indicator.status === 'extension' ? 'border-accent/30 bg-accentStrong/5 text-accent' : 'border-border text-muted'}`}
                      onClick={() => toggleIndicator(indicator.definition.id)}
                      title={indicator.status === 'ready' ? 'Remove executable indicator' : 'Remove selected catalog/extension indicator'}
                    >
                      {indicator.definition.name}
                    </button>
                  ))}
                </div>

                {indicatorBrowserOpen ? (
                  <Panel className="space-y-4 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted">Indicator browser</p>
                        <p className="mt-1 text-sm text-muted">Add ready indicators to the chart or select catalog and extension entries to inspect contribution status.</p>
                      </div>
                      <label className="flex min-w-[260px] items-center gap-2 rounded-2xl border border-border bg-white/[0.04] px-3 py-2 text-sm text-muted">
                        <Search className="size-4" />
                        <input
                          value={indicatorSearch}
                          onChange={(event) => setIndicatorSearch(event.target.value)}
                          placeholder="Search 100+ indicators"
                          className="w-full bg-transparent text-ink outline-none placeholder:text-muted"
                        />
                      </label>
                    </div>
                    <div className="max-h-[420px] space-y-4 overflow-y-auto pr-1">
                      {indicatorGroups.map(([category, indicators]) => (
                        <div key={category} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{categoryLabel(category)}</p>
                            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">{indicators.length}</span>
                          </div>
                          <div className="grid gap-2 md:grid-cols-2">
                            {indicators.map((indicator) => {
                              const status = indicatorStatus(indicator);
                              const selected = selectedIndicatorIds.includes(indicator.id);
                              return (
                                <button
                                  key={indicator.id}
                                  type="button"
                                  className={`rounded-2xl border p-3 text-left transition ${selected ? 'border-accent/60 bg-accentStrong/10' : 'border-border bg-white/[0.03] hover:bg-white/[0.06]'}`}
                                  onClick={() => toggleIndicator(indicator.id)}
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-sm font-medium text-ink">{indicator.name}</p>
                                    <div className="flex flex-wrap gap-1">
                                      <span className={`rounded-full border px-2 py-0.5 text-[11px] ${status === 'ready' ? 'border-buy/30 bg-buy/10 text-buy' : status === 'extension' ? 'border-accent/30 bg-accentStrong/10 text-accent' : 'border-border text-muted'}`}>
                                        {status === 'ready' ? 'Ready' : status === 'extension' ? 'Extension' : 'Catalog'}
                                      </span>
                                      {selected ? <span className="rounded-full border border-accent/40 px-2 py-0.5 text-[11px] text-accent">Selected</span> : null}
                                    </div>
                                  </div>
                                  <p className="mt-2 text-xs text-muted">{indicator.description}</p>
                                  <p className="mt-2 text-[11px] text-muted">Outputs: {indicator.outputs.join(', ') || 'none'}</p>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Panel>
                ) : null}

                <div className="overflow-hidden rounded-[28px] border border-border bg-surface/40 p-2">
                  <Suspense fallback={<LoadingSkeleton chart rows={0} />}>
                    <TradingViewCandlestickChart
                      candles={candles}
                      ema={ema}
                      sma={sma}
                      bollingerUpper={bands.upper}
                      bollingerLower={bands.lower}
                      showEma={false}
                      showSma={false}
                      showBollinger={false}
                      showSupportResistance={showSupportResistance}
                      supportLevel={supportLevel}
                      resistanceLevel={resistanceLevel}
                      entryZone={signalRecord?.signal.entry_zone ?? [0, 0]}
                      stopLoss={signalRecord?.signal.stop_loss ?? 0}
                      takeProfit={signalRecord?.signal.take_profit ?? []}
                      priceSeries={priceIndicators.flatMap((indicator) => [
                        { id: indicator.definition.id, name: indicator.definition.name, values: indicator.values, color: indicator.color },
                        ...(indicator.secondary ? [{ id: `${indicator.definition.id}-secondary`, name: `${indicator.definition.name} 2`, values: indicator.secondary, color: '#f0b84b' }] : []),
                        ...(indicator.tertiary ? [{ id: `${indicator.definition.id}-tertiary`, name: `${indicator.definition.name} 3`, values: indicator.tertiary, color: '#f05b78' }] : []),
                      ])}
                    />
                  </Suspense>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  {panelIndicators.map((indicator) => (
                    <Panel key={indicator.definition.id} className={indicator.definition.id === 'atr14' ? 'p-4 md:col-span-3' : 'p-4'}>
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{indicator.definition.name}</p>
                          <p className="mt-1 text-xs text-muted">{categoryLabel(indicator.definition.category)}</p>
                        </div>
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] ${indicator.status === 'ready' ? 'border-buy/30 bg-buy/10 text-buy' : indicator.status === 'extension' ? 'border-accent/30 bg-accentStrong/10 text-accent' : 'border-border text-muted'}`}>
                          {indicator.status === 'ready' ? 'Ready' : indicator.status === 'extension' ? 'Extension' : 'Catalog'}
                        </span>
                      </div>
                      {indicator.executable ? (
                        <>
                          {indicator.definition.id === 'macd-histogram' || indicator.placement === 'volume' ? (
                            <BarChart values={indicator.values.slice(-24).map((value) => Math.abs(value) > 10000 ? value / 1000 : value)} />
                          ) : (
                            <TinyLineChart values={indicator.values.slice(-24)} tone={indicator.definition.category === 'momentum' ? 'hold' : 'accent'} />
                          )}
                          <p className="mt-3 text-xs text-muted">
                            Latest {Number.isFinite(indicator.values.at(-1)) ? indicator.values.at(-1)?.toFixed(2) : 'n/a'}
                            {indicator.secondary?.length ? ` / secondary ${indicator.secondary.at(-1)?.toFixed(2)}` : ''}
                          </p>
                        </>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-border bg-white/[0.03] p-3 text-sm text-muted">
                          {indicator.status === 'extension'
                            ? 'Registered by an extension. Runtime compute hooks are recognized by the registry; chart execution needs an extension-provided compute adapter.'
                            : 'Catalog target. This indicator is documented for contributors but is not executable in the chart yet.'}
                        </div>
                      )}
                    </Panel>
                  ))}
                </div>
              </div>
            }
          />
        </Panel>

        <div className="space-y-6">
          <Panel>
            <DataStateView
              state={state}
              isEmpty={!signalRecord}
              loading={<LoadingSkeleton rows={5} />}
              empty={
                <EmptyState
                  title="No current signal for this symbol"
                  description="This state keeps the right-rail decision card explicit even when no backend signal is available."
                  action={<Button variant="secondary" onClick={() => onOpenAlertModal(symbol.id)}>Create alert instead</Button>}
                />
              }
              error={<ErrorState title="Current signal unavailable" description="The deterministic signal card could not be loaded." onRetry={retryMockView} />}
              populated={signalRecord ? (
                <div className="space-y-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Current signal</p>
                      <h3 className="mt-1 text-xl font-semibold text-ink">Deterministic decision card</h3>
                    </div>
                    <SignalChip signal={signalRecord.signal.signal} subdued={signalRecord.signal.confidence < 55} />
                  </div>

                  <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
                    <p className="metric-text text-3xl text-ink">{signalRecord.signal.confidence}</p>
                    <p className="mt-1 text-sm text-muted">Evidence-based confidence</p>
                    {signalRecord.signal.confidence < 55 ? <p className="mt-2 text-xs font-medium text-hold">Low-confidence signal warning</p> : null}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {indicatorStats.map((item) => (
                      <MetricStat key={item.label} label={item.label} value={item.value} helper={item.helper} />
                    ))}
                  </div>

                  <div className="space-y-3 rounded-3xl border border-border bg-white/[0.03] p-4">
                    <div className="flex items-center gap-2 text-sm text-muted">
                      <SlidersHorizontal className="size-4 text-accent" />
                      <span>Entry zone {signalRecord.signal.entry_zone.map((level) => formatCurrency(level)).join(' - ')}</span>
                    </div>
                    <div className="text-sm text-muted">Stop {formatCurrency(signalRecord.signal.stop_loss)} · TP ladder {signalRecord.signal.take_profit.map((level) => formatCurrency(level)).join(', ')}</div>
                    <div className="text-sm text-muted">Generated {formatDateTime(signalRecord.signal.generated_at_utc)} UTC</div>
                    {currentSignalFreshness ? (
                      <div className="pt-1">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${freshnessClassName(currentSignalFreshness.tone)}`}>
                          {currentSignalFreshness.label}
                        </span>
                        <p className="mt-2 text-xs text-muted">{currentSignalFreshness.detail}</p>
                      </div>
                    ) : null}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Button onClick={() => onOpenSignal(signalRecord.id)}>
                      <Play className="size-4" />
                      View full signal
                    </Button>
                    <Button variant="secondary" onClick={() => onRunBacktest(symbol.id, signalRecord.signal.confidence_basis.setup_type)}>
                      <CircleSlash2 className="size-4" />
                      Run backtest on this setup
                    </Button>
                    <Button variant="secondary" onClick={() => onOpenAlertModal(symbol.id, signalRecord.id)}>
                      <Bell className="size-4" />
                      Create alert
                    </Button>
                  </div>
                </div>
              ) : null}
            />
          </Panel>

          <Panel>
            <SectionHeading eyebrow="Recent news" title="Catalyst tape" description="Backend-served news feed. Provider-backed ranking and live ingestion remain the next news-layer gap." />
            <div className="mt-5">
              <DataStateView
                state={state}
                isEmpty={symbolNews.length === 0}
                loading={<LoadingSkeleton rows={3} />}
                empty={<div className="rounded-2xl border border-dashed border-border bg-white/[0.03] p-6 text-sm text-muted">No news items are available for this symbol right now.</div>}
                error={<ErrorState title="News tape unavailable" description="The backend news list could not be loaded." onRetry={retryMockView} />}
                populated={
                  <div className="space-y-3">
                    {symbolNews.map((item) => (
                      <div key={item.id} className="rounded-2xl border border-border bg-white/[0.03] p-4">
                        <div className="flex items-center justify-between gap-4">
                          <p className="text-sm font-semibold text-ink">{item.headline}</p>
                          <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${item.sentiment === 'positive' ? 'bg-buy/12 text-buy' : item.sentiment === 'negative' ? 'bg-sell/12 text-sell' : 'bg-white/8 text-muted'}`}>{item.sentiment}</span>
                        </div>
                        <p className="mt-2 text-sm text-muted">{item.summary}</p>
                        <div className="mt-3 flex items-center justify-between text-xs text-muted">
                          <span>{item.source}</span>
                          <span>{formatDateTime(item.publishedAt)} UTC</span>
                        </div>
                      </div>
                    ))}
                  </div>
                }
              />
            </div>
          </Panel>
          <Panel>
            <SectionHeading eyebrow="Volume context" title="Closed-candle only" description={usesBackendCandles ? 'No partial bars. These candles come from the local backend corridor store, with backend resampling when needed.' : 'No partial bars. This timeframe is still using deterministic fallback candles.'} />
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <MetricStat label="Latest volume" value={formatLargeNumber(volumes.at(-1) ?? 0)} helper="Closed bar only" tone="watch" />
              <MetricStat label="Candle count" value={candles.length} helper={usesBackendCandles ? `${timeframe} backend-derived window` : `${timeframe} fallback window`} />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
