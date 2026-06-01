// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { AppShell } from './components/layout';
import { ConfirmDialog, Modal, ToastLayer, Button, LoadingSkeleton } from './components/ui';
import type { ToastMessage } from './components/ui';
import { symbolCatalog, symbolById } from './data/symbolCatalog';
import { SignalDetailDrawer } from './screens/SignalDetailDrawer';
import { backendClient, mapMarketCandlesToChartSeries, mapProviderSettingsResponseToUi, mapUiSettingsToProviderRequest } from './lib/backend';
import { formatCurrency } from './lib/format';
import type { AlertHistoryItem, AlertRecord, AiSettings, ApiKeyField, BackendStatus, Candle, CorridorIngestResult, ExtensionRegistryEntry, MarketType, NewsItem, NotificationTestChannel, PaperAccount, ProviderRegistryEntry, ProviderSettings, RelativeStrengthRanking, SavedStrategy, ScreenState, SignalRecord, StrategyPreset, TradingMode } from './types';

const DashboardScreen = lazy(async () => import('./screens/DashboardScreen').then((module) => ({ default: module.DashboardScreen })));
const SymbolDetailScreen = lazy(async () => import('./screens/SymbolDetailScreen').then((module) => ({ default: module.SymbolDetailScreen })));
const SignalsScreen = lazy(async () => import('./screens/SignalsScreen').then((module) => ({ default: module.SignalsScreen })));
const BacktestScreen = lazy(async () => import('./screens/BacktestScreen').then((module) => ({ default: module.BacktestScreen })));
const WatchlistScreen = lazy(async () => import('./screens/WatchlistScreen').then((module) => ({ default: module.WatchlistScreen })));
const AlertsScreen = lazy(async () => import('./screens/AlertsScreen').then((module) => ({ default: module.AlertsScreen })));
const SettingsScreen = lazy(async () => import('./screens/SettingsScreen').then((module) => ({ default: module.SettingsScreen })));

interface AlertModalState {
  open: boolean;
  symbolId: string;
  signalId?: string;
  alertId?: string;
}

function corridorKey(symbol: string, timeframe: string) {
  return `${symbol}:${timeframe}`;
}

function buildToast(id: string, title: string, description?: string): ToastMessage {
  return { id, title, description };
}

const defaultProviderSettings: ProviderSettings = {
  viewMode: 'simple',
  cryptoPrimary: 'Coinbase',
  cryptoSecondary: 'Kraken',
  cryptoFallback: 'Gemini',
  stocksPrimary: 'Alpaca',
  stocksSecondary: 'Finnhub',
  stocksFallback: 'Twelve Data',
  cryptoRateLimitPerMinute: 24,
  stocksRateLimitPerMinute: 58,
};

const defaultAiSettings: AiSettings = {
  model: 'qwen3:14b-q4_K_M',
  cloudEnabled: false,
  provider: 'ollama',
  baseUrl: 'http://127.0.0.1:11434',
  apiKeyId: null,
  temperature: 0.2,
  maxTokens: 180,
  requestTimeoutSeconds: 8,
};

const defaultPaperAccount: PaperAccount = {
  balance: 0,
  buyingPower: 0,
  realizedPnl: 0,
  openPositions: [],
};

const defaultApiKeys: ApiKeyField[] = [];

export default function App() {
  const navigate = useNavigate();
  const [marketFilter, setMarketFilter] = useState<MarketType | 'all'>('all');
  const [screenState, setScreenState] = useState<ScreenState>('loading');
  const [backendStatus, setBackendStatus] = useState<BackendStatus>('connecting');
  const [backendErrorMessage, setBackendErrorMessage] = useState<string | null>(null);
  const [tradingMode, setTradingMode] = useState<TradingMode>('paper');
  const [watchlistIds, setWatchlistIds] = useState<string[]>([]);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [alertHistory, setAlertHistory] = useState<AlertHistoryItem[]>([]);
  const [paperAccount, setPaperAccount] = useState<PaperAccount>(defaultPaperAccount);
  const [savedStrategies, setSavedStrategies] = useState<SavedStrategy[]>([]);
  const [signalRecords, setSignalRecords] = useState<SignalRecord[]>([]);
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [marketRanking, setMarketRanking] = useState<RelativeStrengthRanking[]>([]);
  const [backtestPresets, setBacktestPresets] = useState<StrategyPreset[]>([]);
  const [providerSettings, setProviderSettings] = useState(defaultProviderSettings);
  const [providerRegistry, setProviderRegistry] = useState<ProviderRegistryEntry[]>([]);
  const [extensionRegistry, setExtensionRegistry] = useState<ExtensionRegistryEntry[]>([]);
  const [aiSettings, setAiSettings] = useState(defaultAiSettings);
  const [apiKeys, setApiKeys] = useState<ApiKeyField[]>(defaultApiKeys);
  const [marketCorridorItems, setMarketCorridorItems] = useState<CorridorIngestResult[]>([]);
  const [marketCandlesByKey, setMarketCandlesByKey] = useState<Record<string, Candle[]>>({});
  const [marketCorridorRefreshing, setMarketCorridorRefreshing] = useState(false);
  const [minBacktestSample, setMinBacktestSample] = useState(50);
  const [signalDrawerId, setSignalDrawerId] = useState<string | null>(null);
  const [paperTradeSignalId, setPaperTradeSignalId] = useState<string | null>(null);
  const [alertModal, setAlertModal] = useState<AlertModalState>({ open: false, symbolId: 'BTCUSD' });
  const [alertCondition, setAlertCondition] = useState('');
  const [alertChannel, setAlertChannel] = useState<AlertRecord['channel']>('desktop');
  const [paperTradeQty, setPaperTradeQty] = useState(1);
  const [paperTradeSide, setPaperTradeSide] = useState<'long' | 'short'>('long');
  const [liveConfirmOpen, setLiveConfirmOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const corridorBySymbol = useMemo(
    () => new Map(marketCorridorItems.map((item) => [item.symbol, item])),
    [marketCorridorItems],
  );
  const displaySymbols = useMemo(
    () =>
      symbolCatalog.map((symbol) => {
        const liveItem = corridorBySymbol.get(symbol.id);
        if (!liveItem) {
          return symbol;
        }

        const liveCandles = marketCandlesByKey[corridorKey(liveItem.symbol, liveItem.timeframe)] ?? [];
        const latestClose = liveCandles.at(-1)?.close ?? liveItem.latest_close;
        const previousClose = liveCandles.at(-2)?.close;

        return {
          ...symbol,
          lastPrice: latestClose,
          changePercent: previousClose ? ((latestClose - previousClose) / previousClose) * 100 : symbol.changePercent,
          sparkline: liveCandles.length >= 2 ? liveCandles.slice(-24).map((candle) => candle.close) : symbol.sparkline,
        };
      }),
    [corridorBySymbol, marketCandlesByKey],
  );
  const filteredSymbols = useMemo(
    () => (marketFilter === 'all' ? displaySymbols : displaySymbols.filter((symbol) => symbol.marketType === marketFilter)),
    [displaySymbols, marketFilter],
  );
  const filteredSignals = useMemo(
    () => (marketFilter === 'all' ? signalRecords : signalRecords.filter((record) => record.marketType === marketFilter)),
    [marketFilter, signalRecords],
  );
  const signalRecord = signalDrawerId ? signalRecords.find((record) => record.id === signalDrawerId) ?? null : null;
  const signalSymbol = signalRecord ? displaySymbols.find((entry) => entry.id === signalRecord.symbolId) ?? symbolById[signalRecord.symbolId] : null;
  const paperTradeRecord = paperTradeSignalId ? signalRecords.find((record) => record.id === paperTradeSignalId) ?? null : null;
  const isLiveTradingMode = tradingMode === 'live';

  function pushToast(title: string, description?: string) {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((current) => [...current, buildToast(id, title, description)]);
  }

  useEffect(() => {
    if (!toasts.length) return undefined;
    const timers = toasts.map((toast) =>
      window.setTimeout(() => {
        setToasts((current) => current.filter((entry) => entry.id !== toast.id));
      }, 3200),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [toasts]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapBackend() {
      setBackendStatus('connecting');
      setScreenState('loading');
      setBackendErrorMessage(null);

      async function loadMarketCorridor(refreshIfEmpty: boolean) {
        const statusResponse = await backendClient.getMarketCorridorStatus();
        let items = statusResponse.items;

        if (refreshIfEmpty && items.length === 0) {
          const refreshed = await backendClient.refreshMarketCorridor();
          items = refreshed.items;
        }

        const candleResponses = await Promise.all(
          items.map((item) => backendClient.getMarketCandles(item.symbol, item.timeframe)),
        );

        return {
          items,
          candleSeries: Object.fromEntries(
            candleResponses.map((response) => [
              corridorKey(response.symbol, response.timeframe),
              mapMarketCandlesToChartSeries(response.items),
            ]),
          ) as Record<string, Candle[]>,
        };
      }

      try {
        const [health, providerResponse, providerRegistryResponse, extensionRegistryResponse, watchlistResponse, marketCorridorResponse] = await Promise.all([
          backendClient.getHealth(),
          backendClient.getProviderSettings(),
          backendClient.getProviderRegistry(),
          backendClient.getExtensionRegistry(),
          backendClient.getWatchlist(),
          loadMarketCorridor(true),
        ]);

        const [aiResponse, apiKeysResponse, alertsResponse, alertHistoryResponse, paperAccountResponse, signalsResponse, newsResponse, backtestsResponse] = await Promise.all([
          backendClient.getAiSettings(),
          backendClient.getApiKeys(),
          backendClient.getAlerts(),
          backendClient.getAlertHistory(),
          backendClient.getPaperAccount(),
          backendClient.getSignals(),
          backendClient.getNews(),
          backendClient.getBacktestPresets(),
        ]);

        const savedStrategiesResponse = await backendClient.getSavedStrategies();

        const marketRankingResponse = await backendClient
          .getMarketRanking()
          .catch(() => ({ generated_at_utc: '', items: [] as RelativeStrengthRanking[] }));

        if (cancelled) return;

        setBackendStatus(health.status === 'ok' ? 'online' : 'offline');
        setScreenState('ready');
        setProviderSettings((current) => mapProviderSettingsResponseToUi(providerResponse, current));
        setProviderRegistry(providerRegistryResponse.providers);
        setExtensionRegistry(extensionRegistryResponse.extensions);
        setMarketCorridorItems(marketCorridorResponse.items);
        setMarketCandlesByKey(marketCorridorResponse.candleSeries);
        setTradingMode(providerResponse.safety.trading_mode);
        setMinBacktestSample(providerResponse.safety.min_backtest_sample);
        setAiSettings(aiResponse.ai);
        setApiKeys(apiKeysResponse.items);
        setAlerts(alertsResponse.items);
        setAlertHistory(alertHistoryResponse.items);
        setSignalRecords(signalsResponse.items);
        setNewsItems(newsResponse.items);
        setBacktestPresets(backtestsResponse.items);
        setPaperAccount(paperAccountResponse.account);
        setSavedStrategies(savedStrategiesResponse.items);
        setMarketRanking(marketRankingResponse.items);

        const backendWatchlistIds = watchlistResponse.items
          .map((entry) => entry.symbol.toUpperCase())
          .filter((symbolId) => Boolean(symbolById[symbolId]));

        setWatchlistIds(backendWatchlistIds);
      } catch (error) {
        if (!cancelled) {
          setBackendStatus('offline');
          setScreenState('error');
          setBackendErrorMessage(
            error instanceof Error
              ? `Unable to load desktop data from the local backend: ${error.message}`
              : 'Unable to load desktop data from the local backend. Start the backend and retry.',
          );
        }
      }
    }

    void bootstrapBackend();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (backendStatus !== 'online') {
      return undefined;
    }

    let cancelled = false;

    async function refreshExecutionState() {
      try {
        const [alertsResponse, alertHistoryResponse, paperAccountResponse] = await Promise.all([
          backendClient.getAlerts(),
          backendClient.getAlertHistory(),
          backendClient.getPaperAccount(),
        ]);
        if (cancelled) return;
        setAlerts(alertsResponse.items);
        setAlertHistory(alertHistoryResponse.items);
        setPaperAccount(paperAccountResponse.account);
      } catch {
        if (!cancelled) {
          pushToast('Realtime sync failed', 'The backend emitted an event, but the follow-up refresh failed.');
        }
      }
    }

    const unsubscribe = backendClient.subscribeEvents((event) => {
      if (cancelled) return;

      if (event.type === 'alert.fired') {
        const message = typeof event.payload.message === 'string' ? event.payload.message : 'A backend alert fired.';
        pushToast('Alert fired', message);
        void refreshExecutionState();
        return;
      }

      if (event.type === 'paper.trade.executed') {
        const symbolId = typeof event.payload.symbolId === 'string' ? event.payload.symbolId : 'Position';
        pushToast('Paper trade executed', `${symbolId} was filled by the backend execution scheduler.`);
        void refreshExecutionState();
        return;
      }

      if (event.type === 'paper.account.updated') {
        void refreshExecutionState();
        return;
      }

      if (event.type === 'scheduler.job_error') {
        const message = typeof event.payload.message === 'string' ? event.payload.message : 'A scheduler job reported an error.';
        pushToast('Backend scheduler warning', message);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [backendStatus]);

  function refreshMarketCorridor() {
    if (backendStatus !== 'online' || marketCorridorRefreshing) {
      return;
    }

    setMarketCorridorRefreshing(true);
    void (async () => {
      try {
        const refreshed = await backendClient.refreshMarketCorridor();
        const candleResponses = await Promise.all(
          refreshed.items.map((item) => backendClient.getMarketCandles(item.symbol, item.timeframe)),
        );
        setMarketCorridorItems(refreshed.items);
        setMarketCandlesByKey(
          Object.fromEntries(
            candleResponses.map((response) => [
              corridorKey(response.symbol, response.timeframe),
              mapMarketCandlesToChartSeries(response.items),
            ]),
          ) as Record<string, Candle[]>,
        );
        pushToast(
          'Market corridor refreshed',
          refreshed.items.length
            ? `Updated ${refreshed.items.map((item) => `${item.symbol} ${item.timeframe}`).join(', ')} from the backend corridor.`
            : 'No market corridor targets returned from the backend refresh.',
        );
      } catch {
        pushToast('Market corridor refresh failed', 'The backend refresh request failed, so the existing market corridor snapshot was kept.');
      } finally {
        setMarketCorridorRefreshing(false);
      }
    })();
  }

  function persistProviderSettings(
    nextProviderSettings: typeof providerSettings,
    nextTradingMode: TradingMode = tradingMode,
    nextMinBacktestSample: number = minBacktestSample,
  ) {
    if (backendStatus !== 'online') {
      pushToast(
        'Settings unavailable',
        'The backend is offline, so provider and safety settings cannot be updated right now.',
      );
      return;
    }

    void (async () => {
      try {
        const response = await backendClient.updateProviderSettings(
          mapUiSettingsToProviderRequest(
            nextProviderSettings,
            nextTradingMode,
            nextMinBacktestSample,
          ),
        );
        setProviderSettings((current) =>
          mapProviderSettingsResponseToUi(response, current),
        );
        setTradingMode(response.safety.trading_mode);
        setMinBacktestSample(response.safety.min_backtest_sample);
      } catch {
        pushToast(
          'Settings update failed',
          'The backend settings update failed, so no change was applied.',
        );
      }
    })();
  }

  function persistAiSettings(nextAiSettings: AiSettings) {
    if (backendStatus !== 'online') {
      pushToast(
        'AI settings unavailable',
        'The backend is offline, so AI settings cannot be updated right now.',
      );
      return;
    }

    void (async () => {
      try {
        const response = await backendClient.updateAiSettings(nextAiSettings);
        setAiSettings(response.ai);
      } catch {
        pushToast(
          'AI settings update failed',
          'The backend AI settings update failed, so no change was applied.',
        );
      }
    })();
  }

  function persistApiKey(keyId: string, value: string) {
    if (backendStatus !== 'online') {
      pushToast(
        'API key save unavailable',
        'The backend is offline, so API key changes cannot be saved right now.',
      );
      return;
    }

    void (async () => {
      try {
        const response = await backendClient.updateApiKey(keyId, { value });
        const registryResponse = await backendClient.getProviderRegistry();
        setApiKeys((current) => current.map((item) => (item.id === keyId ? response.item : item)));
        setProviderRegistry(registryResponse.providers);
        pushToast('API key saved', `${response.item.label} was updated in backend settings.`);
      } catch {
        pushToast(
          'API key save failed',
          'The backend API key update failed, so no change was applied.',
        );
      }
    })();
  }

  function sendNotificationTest(channel: NotificationTestChannel) {
    if (backendStatus !== 'online') {
      pushToast(
        'Notification test unavailable',
        'The backend is offline, so notification tests cannot run right now.',
      );
      return;
    }

    void (async () => {
      try {
        const response = await backendClient.testNotification(channel);
        pushToast(
          response.delivered ? `${channel === 'telegram' ? 'Telegram' : 'Email'} test sent` : `${channel === 'telegram' ? 'Telegram' : 'Email'} test failed`,
          response.detail,
        );
      } catch {
        pushToast(
          'Notification test failed',
          'The backend notification test request failed before a delivery result was returned.',
        );
      }
    })();
  }

  function handleSelectSymbol(symbolId: string) {
    navigate(`/symbol/${symbolId}`);
  }

  function handleToggleWatchlist(symbolId: string) {
    const symbol = symbolById[symbolId];
    const isRemoving = watchlistIds.includes(symbolId);

    if (backendStatus !== 'online' || !symbol) {
      pushToast(
        'Watchlist unavailable',
        'The backend is offline, so the watchlist cannot be changed right now.',
      );
      return;
    }

    void (async () => {
      try {
        if (isRemoving) {
          await backendClient.removeWatchlistItem(symbolId);
          setWatchlistIds((current) => current.filter((entry) => entry !== symbolId));
          pushToast('Removed from watchlist', `${symbolId} removed from the backend watchlist.`);
          return;
        }

        await backendClient.addWatchlistItem({
          symbol: symbolId,
          market_type: symbol.marketType,
        });
        setWatchlistIds((current) => (current.includes(symbolId) ? current : [...current, symbolId]));
        pushToast('Added to watchlist', `${symbolId} saved to the backend watchlist.`);
      } catch {
        pushToast(
          'Watchlist update failed',
          'The backend rejected the watchlist update, so no change was applied.',
        );
      }
    })();
  }

  function handleOpenAlertModal(symbolId: string, signalId?: string, alertId?: string) {
    const record = alertId ? alerts.find((entry) => entry.id === alertId) : undefined;
    setAlertModal({ open: true, symbolId, signalId, alertId });
    setAlertCondition(record?.condition ?? (signalId ? 'Alert when this setup reappears on a closed candle' : ''));
    setAlertChannel(record?.channel ?? 'desktop');
  }

  function handleSaveAlert() {
    const nextAlert = {
      symbolId: alertModal.symbolId,
      condition: alertCondition || 'Closed candle alert',
      channel: alertChannel,
      status: 'armed' as const,
    };

    if (backendStatus !== 'online') {
      pushToast('Alert save unavailable', 'The backend is offline, so alerts cannot be saved right now.');
      return;
    }

    void (async () => {
      try {
        if (alertModal.alertId) {
          const response = await backendClient.updateAlert(alertModal.alertId, nextAlert);
          setAlerts((current) =>
            current.map((entry) =>
              entry.id === alertModal.alertId ? response.item : entry,
            ),
          );
          pushToast('Alert updated', 'The alert configuration was saved to the backend.');
        } else {
          const response = await backendClient.createAlert(nextAlert);
          setAlerts((current) => [response.item, ...current]);
          pushToast('Alert created', 'The new alert is now persisted in the backend.');
        }
        setAlertModal({ open: false, symbolId: alertModal.symbolId });
      } catch {
        pushToast(
          'Alert save failed',
          'The backend rejected the alert save, so no persistent change was made.',
        );
      }
    })();
  }

  function handleOpenSignal(signalId: string) {
    setSignalDrawerId(signalId);
  }

  function handleCopySignal() {
    if (!signalRecord) return;
    navigator.clipboard?.writeText(JSON.stringify(signalRecord.signal, null, 2));
    pushToast('Signal JSON copied', 'The canonical signal object was copied to the clipboard.');
  }

  function handleRunBacktest(symbolId: string, setupType: string) {
    navigate(`/backtest?symbol=${symbolId}&setup=${setupType}`);
  }

  function handleSaveStrategy(strategy: SavedStrategy) {
    if (backendStatus !== 'online') {
      pushToast('Strategy save unavailable', 'The backend is offline, so strategies cannot be saved right now.');
      return;
    }

    void (async () => {
      try {
        const response = await backendClient.createSavedStrategy(strategy);
        setSavedStrategies((current) => [
          response.item,
          ...current.filter((entry) => entry.id !== response.item.id),
        ]);
        pushToast('Strategy saved', 'The strategy now appears in Settings → Strategies and is persisted in the backend.');
      } catch {
        pushToast('Strategy save failed', 'The backend strategy save failed, so no change was applied.');
      }
    })();
  }

  function handleConfirmPaperTrade() {
    if (!paperTradeRecord) return;

    const entryPrice = (paperTradeRecord.signal.entry_zone[0] + paperTradeRecord.signal.entry_zone[1]) / 2;

    if (backendStatus !== 'online') {
      pushToast('Trade submission unavailable', 'The backend is offline, so this trade cannot be submitted right now.');
      setPaperTradeSignalId(null);
      return;
    }

    void (async () => {
      try {
        const response = await backendClient.submitPaperTrade({
          signalId: paperTradeRecord.id,
          symbol: paperTradeRecord.symbolId,
          side: paperTradeSide,
          quantity: paperTradeQty,
          entryPrice,
        });
        setPaperAccount(response.account);
        pushToast(
          response.tradingMode === 'live' ? 'Live trade submitted' : 'Paper trade queued',
          response.tradingMode === 'live'
            ? `${paperTradeRecord.signal.symbol} ${paperTradeSide} x ${paperTradeQty} was submitted to the configured live broker route.`
            : `${paperTradeRecord.signal.symbol} ${paperTradeSide} x ${paperTradeQty} was queued for backend execution.`,
        );
      } catch {
        pushToast(
          'Trade submission failed',
          isLiveTradingMode
            ? 'The backend rejected the live trade request. Check broker routing and configured credentials, then retry.'
            : 'The backend paper trade request failed, so no persistent paper account change was recorded.',
        );
      } finally {
        setPaperTradeSignalId(null);
      }
    })();
  }

  return (
    <>
      <AppShell
        marketFilter={marketFilter}
        onMarketFilterChange={setMarketFilter}
        backendStatus={backendStatus}
        backendErrorMessage={backendErrorMessage}
        symbols={displaySymbols}
        onSelectSymbol={handleSelectSymbol}
      >
        <Suspense fallback={<LoadingSkeleton chart rows={6} />}>
          <Routes>
            <Route
              path="/"
              element={
                <DashboardScreen
                  state={screenState}
                  symbols={filteredSymbols}
                  signals={filteredSignals}
                  watchlistIds={watchlistIds}
                  paperAccount={paperAccount}
                  marketCorridorItems={marketCorridorItems}
                  marketCorridorRefreshing={marketCorridorRefreshing}
                  onRefreshMarketCorridor={refreshMarketCorridor}
                  onOpenSymbol={handleSelectSymbol}
                  onOpenSignal={handleOpenSignal}
                  onRunBacktest={handleRunBacktest}
                />
              }
            />
            <Route
              path="/symbol/:symbolId"
              element={
                <SymbolDetailScreen
                  state={screenState}
                  symbols={displaySymbols}
                  signals={signalRecords}
                  news={newsItems}
                  watchlistIds={watchlistIds}
                  marketCorridorItems={marketCorridorItems}
                  marketCandlesByKey={marketCandlesByKey}
                  marketCorridorRefreshing={marketCorridorRefreshing}
                  onRefreshMarketCorridor={refreshMarketCorridor}
                  onToggleWatchlist={handleToggleWatchlist}
                  onOpenSignal={handleOpenSignal}
                  onOpenAlertModal={handleOpenAlertModal}
                  onRunBacktest={handleRunBacktest}
                />
              }
            />
            <Route
              path="/signals"
              element={
                <SignalsScreen
                  state={screenState}
                  symbols={displaySymbols}
                  signals={signalRecords}
                  marketFilter={marketFilter}
                  onOpenSymbol={handleSelectSymbol}
                  onOpenSignal={handleOpenSignal}
                  onOpenPaperTrade={(signalId) => {
                    setPaperTradeSignalId(signalId);
                    const record = signalRecords.find((entry) => entry.id === signalId);
                    setPaperTradeSide(record?.signal.signal === 'SELL' ? 'short' : 'long');
                    setPaperTradeQty(1);
                  }}
                />
              }
            />
            <Route
              path="/backtest"
              element={<BacktestScreen state={screenState} presets={backtestPresets} symbols={displaySymbols} minBacktestSample={minBacktestSample} marketCorridorItems={marketCorridorItems} onSaveStrategy={handleSaveStrategy} />}
            />
            <Route
              path="/watchlist"
              element={
                <WatchlistScreen
                  state={screenState}
                  symbols={filteredSymbols}
                  watchlistIds={watchlistIds}
                  signals={signalRecords}
                  ranking={marketRanking}
                  onToggleWatchlist={handleToggleWatchlist}
                  onOpenSymbol={handleSelectSymbol}
                  onOpenAlertModal={handleOpenAlertModal}
                />
              }
            />
            <Route
              path="/alerts"
              element={
                <AlertsScreen
                  state={screenState}
                  alerts={alerts}
                  history={alertHistory}
                  symbols={displaySymbols}
                  onOpenAlertModal={handleOpenAlertModal}
                />
              }
            />
            <Route
              path="/settings"
              element={
                <SettingsScreen
                  state={screenState}
                  providerSettings={providerSettings}
                  providerRegistry={providerRegistry}
                  extensionRegistry={extensionRegistry}
                  apiKeys={apiKeys}
                  aiSettings={aiSettings}
                  tradingMode={tradingMode}
                  minBacktestSample={minBacktestSample}
                  savedStrategies={savedStrategies}
                  onSaveApiKey={persistApiKey}
                  onTestNotification={sendNotificationTest}
                  onRequestLiveTrading={() => setLiveConfirmOpen(true)}
                  onChangeProviderView={(viewMode) => {
                    persistProviderSettings({ ...providerSettings, viewMode });
                    pushToast('Provider view updated', `Settings switched to ${viewMode} mode.`);
                  }}
                  onUpdateProviderSetting={(key, value) => {
                    persistProviderSettings({ ...providerSettings, [key]: value });
                  }}
                  onSetTradingMode={(mode) => persistProviderSettings(providerSettings, mode, minBacktestSample)}
                  onSetMinBacktestSample={(value) => persistProviderSettings(providerSettings, tradingMode, value)}
                  onUpdateAiSettings={(settings) => persistAiSettings(settings)}
                />
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AppShell>

      <SignalDetailDrawer
        state={screenState}
        open={Boolean(signalRecord)}
        signalRecord={signalRecord}
        symbol={signalSymbol}
        onClose={() => setSignalDrawerId(null)}
        onPaperTrade={() => {
          if (!signalRecord) return;
          setPaperTradeSignalId(signalRecord.id);
          setPaperTradeSide(signalRecord.signal.signal === 'SELL' ? 'short' : 'long');
          setPaperTradeQty(1);
        }}
        onCreateAlert={() => {
          if (!signalRecord) return;
          handleOpenAlertModal(signalRecord.symbolId, signalRecord.id);
        }}
        onCopyJson={handleCopySignal}
      />

      <Modal
        open={Boolean(paperTradeRecord)}
        title={isLiveTradingMode ? 'Live trade ticket' : 'Paper trade ticket'}
        description={
          isLiveTradingMode
            ? 'Live trades are submitted immediately to the configured broker route. Alpaca must be selected and configured for live mode to succeed.'
            : 'Paper trades are queued immediately and executed by the backend scheduler on closed-candle data.'
        }
        onClose={() => setPaperTradeSignalId(null)}
      >
        {paperTradeRecord ? (
          <div className="space-y-5">
            <div className="rounded-3xl border border-border bg-white/[0.03] p-4 text-sm text-muted">
              <p className="font-medium text-ink">{paperTradeRecord.signal.symbol}</p>
              <p className="mt-2">Entry zone {paperTradeRecord.signal.entry_zone.map((level) => formatCurrency(level)).join(' - ')}</p>
              <p className="mt-1">Stop loss {formatCurrency(paperTradeRecord.signal.stop_loss)} · TP ladder {paperTradeRecord.signal.take_profit.map((level) => formatCurrency(level)).join(', ')}</p>
              <p className="mt-1">Risk / reward {paperTradeRecord.signal.risk_reward.toFixed(1)} · {paperTradeRecord.signal.fees_slippage_assumed}</p>
              <p className="mt-1">Invalidation {paperTradeRecord.signal.invalidation}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm text-muted">
                <span className="block text-xs font-semibold uppercase tracking-[0.18em]">Side</span>
                <select className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none" value={paperTradeSide} onChange={(event) => setPaperTradeSide(event.target.value as 'long' | 'short')}>
                  <option value="long">Long</option>
                  <option value="short">Short</option>
                </select>
              </label>
              <label className="space-y-2 text-sm text-muted">
                <span className="block text-xs font-semibold uppercase tracking-[0.18em]">Quantity</span>
                <input className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none" type="number" min="0.01" step="0.01" value={paperTradeQty} onChange={(event) => setPaperTradeQty(Number(event.target.value))} />
              </label>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button onClick={handleConfirmPaperTrade}>
                {isLiveTradingMode ? 'Submit live trade' : 'Confirm paper trade'}
              </Button>
              <button
                type="button"
                title={isLiveTradingMode ? 'Live mode is enabled. The configured broker route will be used for this order.' : 'Enable in Settings → Risk & Safety to submit live trades through the configured broker route.'}
                className="rounded-2xl border border-border bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-muted"
              >
                {isLiveTradingMode ? 'Live mode enabled' : 'Switch to live in Settings'}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={alertModal.open}
        title={alertModal.alertId ? 'Edit alert' : 'New alert'}
        description="Configure backend-persisted alerts. Telegram requires a saved bot token and chat ID, and email uses the saved SMTP delivery settings from API Keys."
        onClose={() => setAlertModal({ open: false, symbolId: alertModal.symbolId })}
      >
        <div className="space-y-5">
          <div className="rounded-3xl border border-border bg-white/[0.03] p-4 text-sm text-muted">
            Symbol <span className="font-medium text-ink">{symbolById[alertModal.symbolId]?.symbol}</span>
            {alertModal.signalId ? <span> · Prefilled from the selected signal drawer.</span> : null}
          </div>
          <label className="space-y-2 text-sm text-muted">
            <span className="block text-xs font-semibold uppercase tracking-[0.18em]">Condition</span>
            <textarea className="min-h-32 w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none" value={alertCondition} onChange={(event) => setAlertCondition(event.target.value)} />
          </label>
          <label className="space-y-2 text-sm text-muted">
            <span className="block text-xs font-semibold uppercase tracking-[0.18em]">Channel</span>
            <select className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none" value={alertChannel} onChange={(event) => setAlertChannel(event.target.value as AlertRecord['channel'])}>
              <option value="desktop">Desktop</option>
              <option value="telegram">Telegram</option>
              <option value="email">Email</option>
            </select>
          </label>
          <p className="text-xs text-muted">Telegram delivery uses the saved Bot Token and Chat ID from Settings → API Keys. Email delivery uses the saved SMTP host, credentials, and recipient settings from the same tab.</p>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setAlertModal({ open: false, symbolId: alertModal.symbolId })}>
              Cancel
            </Button>
            <Button onClick={handleSaveAlert}>Save alert</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={liveConfirmOpen}
        title="Enable live trading mode"
        description="This safety gate switches trade submission to the configured live broker route. Alpaca credentials and provider routing must be set correctly before live orders will succeed."
        confirmLabel="Acknowledge and switch setting"
        onClose={() => setLiveConfirmOpen(false)}
        onConfirm={() => {
          persistProviderSettings(providerSettings, 'live', minBacktestSample);
          setLiveConfirmOpen(false);
          pushToast('Trading mode updated', 'Settings now use the live broker route. Confirm each trade carefully and verify Alpaca credentials before submitting orders.');
        }}
      />

      <ToastLayer toasts={toasts} />
    </>
  );
}
