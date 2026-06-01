// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Bell, BookmarkPlus, ChartCandlestick, CircleSlash2, Play, SlidersHorizontal } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BarChart, TinyLineChart } from '../components/charts';
import { averageTrueRange, bollingerBands, exponentialMovingAverage, movingAverageConvergenceDivergence, relativeStrengthIndex, simpleMovingAverage } from '../lib/analytics';
import { freshnessClassName, signalFreshness } from '../lib/freshness';
import { formatCurrency, formatDateTime, formatLargeNumber } from '../lib/format';
import { Button, DataStateView, EmptyState, ErrorState, LoadingSkeleton, MetricStat, Panel, PillTabs, SectionHeading, SignalChip } from '../components/ui';
import type { Candle, CorridorIngestResult, NewsItem, ScreenState, SignalRecord, SymbolRecord, Timeframe } from '../types';

const TradingViewCandlestickChart = lazy(async () => import('../components/tvChart').then((module) => ({ default: module.TradingViewCandlestickChart })));

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

export function SymbolDetailScreen({
  state,
  symbols,
  signals,
  news,
  watchlistIds,
  marketCorridorItems,
  marketCandlesByKey,
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
  const liveCorridorItem = symbol ? marketCorridorItems.find((entry) => entry.symbol === symbol.id) ?? null : null;
  const [timeframe, setTimeframe] = useState<Timeframe>((liveCorridorItem?.timeframe as Timeframe | undefined) ?? signalRecord?.signal.timeframe ?? '1h');
  const [overlays, setOverlays] = useState({ ema: true, sma: true, bollinger: true, rsi: true, macd: true, atr: true, volume: true, levels: true });
  const retryMockView = () => window.location.reload();

  useEffect(() => {
    setTimeframe((liveCorridorItem?.timeframe as Timeframe | undefined) ?? signalRecord?.signal.timeframe ?? '1h');
  }, [liveCorridorItem?.timeframe, signalRecord?.signal.timeframe, symbol?.id]);

  const liveTimeframe = liveCorridorItem?.timeframe as Timeframe | undefined;
  const liveCandles = liveTimeframe ? marketCandlesByKey[`${symbol.id}:${liveTimeframe}`] ?? [] : [];
  const backendCandles = useMemo(() => {
    if (!liveCandles.length || !liveTimeframe) return [];
    return resampleCandles(liveCandles, liveTimeframe, timeframe);
  }, [liveCandles, liveTimeframe, timeframe]);
  const candles = useMemo(() => backendCandles, [backendCandles]);
  const usesBackendCandles = backendCandles.length > 0;
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
  const symbolNews = news.filter((item) => item.symbol === (signalRecord?.signal.symbol ?? symbol?.symbol));
  const currentSignalFreshness = signalRecord ? signalFreshness(signalRecord.signal) : null;

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
                    {liveCorridorItem ? <p className="text-xs text-muted">{usesBackendCandles ? (liveTimeframe === timeframe ? `Live backend corridor candles: ${liveCorridorItem.provider} ${liveCorridorItem.timeframe} · latest ${formatDateTime(liveCorridorItem.latest_open_time_utc)} UTC` : `Backend ${liveTimeframe} corridor candles from ${liveCorridorItem.provider}, resampled to ${timeframe}. Latest source candle ${formatDateTime(liveCorridorItem.latest_open_time_utc)} UTC.`) : `Backend corridor is available for ${liveCorridorItem.timeframe} via ${liveCorridorItem.provider}; current ${timeframe} view is using deterministic fallback data.`}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { key: 'ema', label: 'EMA' },
                      { key: 'sma', label: 'SMA' },
                      { key: 'bollinger', label: 'Bollinger' },
                      { key: 'levels', label: 'S/R' },
                      { key: 'rsi', label: 'RSI' },
                      { key: 'macd', label: 'MACD' },
                      { key: 'atr', label: 'ATR' },
                      { key: 'volume', label: 'Volume' },
                    ].map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] transition ${overlays[item.key as keyof typeof overlays] ? 'border-accent bg-accentStrong/15 text-ink' : 'border-border text-muted hover:bg-white/5'}`}
                        onClick={() => setOverlays((current) => ({ ...current, [item.key]: !current[item.key as keyof typeof current] }))}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="overflow-hidden rounded-[28px] border border-border bg-surface/40 p-2">
                  <Suspense fallback={<LoadingSkeleton chart rows={0} />}>
                    <TradingViewCandlestickChart
                      candles={candles}
                      ema={ema}
                      sma={sma}
                      bollingerUpper={bands.upper}
                      bollingerLower={bands.lower}
                      showEma={overlays.ema}
                      showSma={overlays.sma}
                      showBollinger={overlays.bollinger}
                      showSupportResistance={overlays.levels}
                      supportLevel={supportLevel}
                      resistanceLevel={resistanceLevel}
                      entryZone={signalRecord?.signal.entry_zone ?? [0, 0]}
                      stopLoss={signalRecord?.signal.stop_loss ?? 0}
                      takeProfit={signalRecord?.signal.take_profit ?? []}
                    />
                  </Suspense>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  {overlays.rsi ? (
                    <Panel className="p-4">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted">RSI panel</p>
                      <TinyLineChart values={rsi.slice(-24)} tone="hold" />
                    </Panel>
                  ) : null}
                  {overlays.macd ? (
                    <Panel className="p-4">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted">MACD panel</p>
                      <BarChart values={macd.histogram.slice(-18)} />
                    </Panel>
                  ) : null}
                  {overlays.volume ? (
                    <Panel className="p-4">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted">Volume panel</p>
                      <BarChart values={volumes.slice(-18).map((value) => value / 100)} />
                    </Panel>
                  ) : null}
                  {overlays.atr ? (
                    <Panel className="p-4 md:col-span-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">ATR panel</p>
                          <p className="text-sm text-muted">Volatility regime stays aligned with closed candles only.</p>
                        </div>
                        <div className="metric-text text-lg text-ink">{formatCurrency(atr.at(-1) ?? 0)}</div>
                      </div>
                      <TinyLineChart values={atr.slice(-24)} tone="accent" />
                    </Panel>
                  ) : null}
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
