// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { AppShell } from './components/layout';
import { ConfirmDialog, Modal, ToastLayer, Button, LoadingSkeleton } from './components/ui';
import type { ToastMessage } from './components/ui';
import { symbolCatalog, symbolById } from './data/symbolCatalog';
import { SignalDetailDrawer } from './screens/SignalDetailDrawer';
import {
  backendClient,
  mapMarketCandlesToChartSeries,
  mapProviderSettingsResponseToUi,
  mapUiSettingsToProviderRequest,
} from './lib/backend';
import { formatCurrency } from './lib/format';
import {
  classifyPaperTradeError,
  computePlanRiskPercent,
  isPaperPlanComplete,
} from './lib/paperPlan';
import { sendNativeNotification } from './lib/nativeNotifications';
import type {
  AlertHistoryItem,
  AlertRecord,
  AiModelInfo,
  AiProviderTestResponse,
  AiSettings,
  ApiKeyField,
  BackendStatus,
  Candle,
  CorridorIngestResult,
  CustomProviderProfile,
  CustomProviderUpsertRequest,
  ExtensionRegistryEntry,
  ExtensionSurfaceEntry,
  IndicatorRegistryEntry,
  MarketType,
  NewsItem,
  NotificationTestChannel,
  PaperAccount,
  ProviderRegistryEntry,
  ProviderSettings,
  RelativeStrengthRanking,
  SavedStrategy,
  ScreenState,
  SignalRecord,
  StrategyPreset,
  StrategyRegistryEntry,
  TradingMode,
} from './types';

const DashboardScreen = lazy(async () =>
  import('./screens/DashboardScreen').then((module) => ({ default: module.DashboardScreen })),
);
const SymbolDetailScreen = lazy(async () =>
  import('./screens/SymbolDetailScreen').then((module) => ({ default: module.SymbolDetailScreen })),
);
const SignalsScreen = lazy(async () =>
  import('./screens/SignalsScreen').then((module) => ({ default: module.SignalsScreen })),
);
const BacktestScreen = lazy(async () =>
  import('./screens/BacktestScreen').then((module) => ({ default: module.BacktestScreen })),
);
const WatchlistScreen = lazy(async () =>
  import('./screens/WatchlistScreen').then((module) => ({ default: module.WatchlistScreen })),
);
const AlertsScreen = lazy(async () =>
  import('./screens/AlertsScreen').then((module) => ({ default: module.AlertsScreen })),
);
const SettingsScreen = lazy(async () =>
  import('./screens/SettingsScreen').then((module) => ({ default: module.SettingsScreen })),
);
const LearnScreen = lazy(async () =>
  import('./screens/LearnScreen').then((module) => ({ default: module.LearnScreen })),
);
const MissionsScreen = lazy(async () =>
  import('./screens/MissionsScreen').then((module) => ({ default: module.MissionsScreen })),
);
const JournalScreen = lazy(async () =>
  import('./screens/JournalScreen').then((module) => ({ default: module.JournalScreen })),
);
const PortfolioScreen = lazy(async () =>
  import('./screens/PortfolioScreen').then((module) => ({ default: module.PortfolioScreen })),
);
const ReviewScreen = lazy(async () =>
  import('./screens/ReviewScreen').then((module) => ({ default: module.ReviewScreen })),
);

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

function notificationChannelLabel(channel: NotificationTestChannel) {
  if (channel === 'telegram') return 'Telegram';
  if (channel === 'email') return 'Email';
  return 'Desktop';
}

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
  const [signalsError, setSignalsError] = useState<string | null>(null);
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [marketRanking, setMarketRanking] = useState<RelativeStrengthRanking[]>([]);
  const [backtestPresets, setBacktestPresets] = useState<StrategyPreset[]>([]);
  const [providerSettings, setProviderSettings] = useState(defaultProviderSettings);
  const [providerRegistry, setProviderRegistry] = useState<ProviderRegistryEntry[]>([]);
  const [customProviders, setCustomProviders] = useState<CustomProviderProfile[]>([]);
  const [extensionRegistry, setExtensionRegistry] = useState<ExtensionRegistryEntry[]>([]);
  const [extensionSurfaces, setExtensionSurfaces] = useState<ExtensionSurfaceEntry[]>([]);
  const [extensionStrategies, setExtensionStrategies] = useState<StrategyRegistryEntry[]>([]);
  const [extensionIndicators, setExtensionIndicators] = useState<IndicatorRegistryEntry[]>([]);
  const [extensionSettingsById, setExtensionSettingsById] = useState<
    Record<string, Record<string, unknown>>
  >({});
  const [aiSettings, setAiSettings] = useState(defaultAiSettings);
  const [aiModelOptions, setAiModelOptions] = useState<string[]>([defaultAiSettings.model]);
  const [aiModelItems, setAiModelItems] = useState<AiModelInfo[]>([]);
  const [aiModelDetail, setAiModelDetail] = useState('Suggested default model.');
  const [aiModelsFetched, setAiModelsFetched] = useState(false);
  const [aiModelSource, setAiModelSource] = useState('fallback');
  const [aiModelFetchedAt, setAiModelFetchedAt] = useState<string | null>(null);
  const [aiModelsLoading, setAiModelsLoading] = useState(false);
  const [aiProviderTestLoading, setAiProviderTestLoading] = useState(false);
  const [aiProviderTestResult, setAiProviderTestResult] = useState<AiProviderTestResponse | null>(
    null,
  );
  const [apiKeys, setApiKeys] = useState<ApiKeyField[]>(defaultApiKeys);
  const [marketCorridorItems, setMarketCorridorItems] = useState<CorridorIngestResult[]>([]);
  const [marketCandlesByKey, setMarketCandlesByKey] = useState<Record<string, Candle[]>>({});
  const [marketCorridorRefreshing, setMarketCorridorRefreshing] = useState(false);
  const [minBacktestSample, setMinBacktestSample] = useState(50);
  const [liveTradingConfirmed, setLiveTradingConfirmed] = useState(false);
  const [signalDrawerId, setSignalDrawerId] = useState<string | null>(null);
  const [paperTradeSignalId, setPaperTradeSignalId] = useState<string | null>(null);
  const [alertModal, setAlertModal] = useState<AlertModalState>({
    open: false,
    symbolId: 'BTCUSD',
  });
  const [alertCondition, setAlertCondition] = useState('');
  const [nlAlertText, setNlAlertText] = useState('');
  const [nlParsing, setNlParsing] = useState(false);
  const [nlAlertNotice, setNlAlertNotice] = useState<string | null>(null);

  async function parseNlAlert() {
    if (!nlAlertText.trim() || nlParsing) return;
    setNlParsing(true);
    setNlAlertNotice(null);
    try {
      const result = await backendClient.parseNlAlert(nlAlertText);
      if (result.ok && result.condition) {
        setAlertCondition(result.condition);
        setNlAlertNotice(
          `Parsed (${result.source}): ${result.preview} — the deterministic grammar validated it; review and save.`,
        );
      } else {
        setNlAlertNotice(result.error ?? 'Could not parse that request.');
      }
    } catch {
      setNlAlertNotice('The parse request failed. Type the condition directly below.');
    } finally {
      setNlParsing(false);
    }
  }
  const [alertChannel, setAlertChannel] = useState<AlertRecord['channel']>('desktop');
  const [paperTradeQty, setPaperTradeQty] = useState(1);
  const [paperTradeSide, setPaperTradeSide] = useState<'long' | 'short'>('long');
  const [planStop, setPlanStop] = useState('');
  const [planTarget, setPlanTarget] = useState('');
  const [planReason, setPlanReason] = useState('');
  const [planEmotion, setPlanEmotion] = useState('calm');
  const [orderType, setOrderType] = useState<'market' | 'limit' | 'stop'>('market');
  const [orderTrigger, setOrderTrigger] = useState('');
  const [orderTif, setOrderTif] = useState<'day' | 'gtc' | 'gtd'>('gtc');
  const [orderExpiry, setOrderExpiry] = useState('');
  const [trailPercent, setTrailPercent] = useState('');
  // Advanced order types unlock with the Order Types lesson (novice-10).
  const [orderTypesUnlocked, setOrderTypesUnlocked] = useState(false);
  useEffect(() => {
    if (backendStatus !== 'online') return;
    backendClient
      .getLearnLesson('novice-10-order-types')
      .then((lesson) => setOrderTypesUnlocked(Boolean(lesson.completed)))
      .catch(() => setOrderTypesUnlocked(false));
  }, [backendStatus]);
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

        const liveCandles =
          marketCandlesByKey[corridorKey(liveItem.symbol, liveItem.timeframe)] ?? [];
        const latestClose = liveCandles.at(-1)?.close ?? liveItem.latest_close;
        const previousClose = liveCandles.at(-2)?.close;

        return {
          ...symbol,
          lastPrice: latestClose,
          changePercent: previousClose
            ? ((latestClose - previousClose) / previousClose) * 100
            : symbol.changePercent,
          sparkline:
            liveCandles.length >= 2
              ? liveCandles.slice(-24).map((candle) => candle.close)
              : symbol.sparkline,
        };
      }),
    [corridorBySymbol, marketCandlesByKey],
  );
  const filteredSymbols = useMemo(
    () =>
      marketFilter === 'all'
        ? displaySymbols
        : displaySymbols.filter((symbol) => symbol.marketType === marketFilter),
    [displaySymbols, marketFilter],
  );
  const filteredSignals = useMemo(
    () =>
      marketFilter === 'all'
        ? signalRecords
        : signalRecords.filter((record) => record.marketType === marketFilter),
    [marketFilter, signalRecords],
  );
  const signalRecord = signalDrawerId
    ? (signalRecords.find((record) => record.id === signalDrawerId) ?? null)
    : null;
  const signalSymbol = signalRecord
    ? (displaySymbols.find((entry) => entry.id === signalRecord.symbolId) ??
      symbolById[signalRecord.symbolId])
    : null;
  const paperTradeRecord = paperTradeSignalId
    ? (signalRecords.find((record) => record.id === paperTradeSignalId) ?? null)
    : null;

  // Prefill the trade plan from the signal whenever the ticket opens (MSN-1).
  // State adjusts during render (React's documented pattern) instead of in an
  // effect, so the prefill never causes a second cascading render pass.
  const [prefilledTicketId, setPrefilledTicketId] = useState<string | null>(null);
  if (paperTradeRecord && paperTradeRecord.id !== prefilledTicketId) {
    setPrefilledTicketId(paperTradeRecord.id);
    setPlanStop(String(paperTradeRecord.signal.stop_loss));
    setPlanTarget(String(paperTradeRecord.signal.take_profit[1] ?? ''));
    setPlanReason('');
    setPlanEmotion('calm');
  }
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

      async function loadWithFallback<T>(loader: () => Promise<T>, fallback: T): Promise<T> {
        try {
          return await loader();
        } catch {
          return fallback;
        }
      }

      async function loadMarketCorridor(refreshIfEmpty: boolean) {
        return loadWithFallback(
          async () => {
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
          },
          { items: [] as CorridorIngestResult[], candleSeries: {} as Record<string, Candle[]> },
        );
      }

      try {
        const [
          health,
          providerResponse,
          providerRegistryResponse,
          customProviderResponse,
          extensionRegistryResponse,
          extensionSurfacesResponse,
          extensionStrategiesResponse,
          extensionIndicatorsResponse,
          watchlistResponse,
          marketCorridorResponse,
        ] = await Promise.all([
          backendClient.getHealth(),
          backendClient.getProviderSettings(),
          backendClient.getProviderRegistry(),
          backendClient.getCustomProviders(),
          backendClient.getExtensionRegistry(),
          backendClient.getExtensionSurfaces(),
          backendClient.getExtensionStrategies(),
          backendClient.getExtensionIndicators(),
          backendClient.getWatchlist(),
          loadMarketCorridor(true),
        ]);

        const [
          aiResponse,
          apiKeysResponse,
          alertsResponse,
          alertHistoryResponse,
          paperAccountResponse,
          signalsResponse,
          newsResponse,
          backtestsResponse,
        ] = await Promise.all([
          backendClient.getAiSettings(),
          backendClient.getApiKeys(),
          loadWithFallback(() => backendClient.getAlerts(), { items: [] }),
          loadWithFallback(() => backendClient.getAlertHistory(), { items: [] }),
          loadWithFallback(() => backendClient.getPaperAccount(), { account: defaultPaperAccount }),
          loadWithFallback(() => backendClient.getSignals(), { items: [] }),
          loadWithFallback(() => backendClient.getNews(), { items: [] }),
          loadWithFallback(() => backendClient.getBacktestPresets(), { items: [] }),
        ]);

        const savedStrategiesResponse = await loadWithFallback(
          () => backendClient.getSavedStrategies(),
          { items: [] },
        );
        const extensionSettingsResponses = await Promise.all(
          extensionRegistryResponse.extensions.map((extension) =>
            backendClient.getExtensionSettings(extension.id).catch(() => ({
              extensionId: extension.id,
              settings: {} as Record<string, unknown>,
              schema: [],
            })),
          ),
        );

        const marketRankingResponse = await backendClient
          .getMarketRanking()
          .catch(() => ({ generated_at_utc: '', items: [] as RelativeStrengthRanking[] }));

        if (cancelled) return;

        setBackendStatus(health.status === 'ok' ? 'online' : 'offline');
        setScreenState('ready');
        setProviderSettings((current) =>
          mapProviderSettingsResponseToUi(providerResponse, current),
        );
        setProviderRegistry(providerRegistryResponse.providers);
        setCustomProviders(customProviderResponse.providers);
        setExtensionRegistry(extensionRegistryResponse.extensions);
        setExtensionSurfaces(extensionSurfacesResponse.surfaces);
        setExtensionStrategies(extensionStrategiesResponse.strategies);
        setExtensionIndicators(extensionIndicatorsResponse.indicators);
        setExtensionSettingsById(
          Object.fromEntries(
            extensionSettingsResponses.map((response) => [response.extensionId, response.settings]),
          ),
        );
        setMarketCorridorItems(marketCorridorResponse.items);
        setMarketCandlesByKey(marketCorridorResponse.candleSeries);
        setTradingMode(providerResponse.safety.trading_mode);
        setMinBacktestSample(providerResponse.safety.min_backtest_sample);
        setLiveTradingConfirmed(providerResponse.safety.live_trading_confirmed);
        setAiSettings(aiResponse.ai);
        void refreshAiModels(aiResponse.ai);
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
    // refreshAiModels is intentionally excluded: bootstrap runs once and the
    // helper is stable for the app's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (backendStatus === 'offline') {
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
          pushToast(
            'Realtime sync failed',
            'The backend emitted an event, but the follow-up refresh failed.',
          );
        }
      }
    }

    const unsubscribe = backendClient.subscribeEvents((event) => {
      if (cancelled) return;

      if (event.type === 'alert.fired') {
        const message =
          typeof event.payload.message === 'string'
            ? event.payload.message
            : 'A backend alert fired.';
        if (event.payload.channel === 'desktop') {
          void sendNativeNotification('QuantGlass alert', message);
        }
        pushToast('Alert fired', message);
        void refreshExecutionState();
        return;
      }

      if (event.type === 'alert.delivery_failed') {
        const symbolId =
          typeof event.payload.symbolId === 'string' ? event.payload.symbolId : 'Alert';
        const channel =
          typeof event.payload.channel === 'string' ? event.payload.channel : 'notification';
        const message =
          typeof event.payload.message === 'string'
            ? event.payload.message
            : 'Alert delivery failed.';
        pushToast(`${symbolId} ${channel} delivery failed`, message);
        void refreshExecutionState();
        return;
      }

      if (event.type === 'paper.trade.executed') {
        const symbolId =
          typeof event.payload.symbolId === 'string' ? event.payload.symbolId : 'Position';
        pushToast(
          'Paper trade executed',
          `${symbolId} was filled by the backend execution scheduler.`,
        );
        void refreshExecutionState();
        return;
      }

      if (event.type === 'paper.account.updated') {
        void refreshExecutionState();
        return;
      }

      if (event.type === 'scheduler.job_error') {
        const message =
          typeof event.payload.message === 'string'
            ? event.payload.message
            : 'A scheduler job reported an error.';
        pushToast('Backend scheduler warning', message);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [backendStatus]);

  // Signals are generated continuously from corridor ingests; a one-shot
  // bootstrap fetch races the first ingest and leaves every screen empty.
  // Poll while online - fast until signals first appear, then relaxed.
  useEffect(() => {
    if (backendStatus !== 'online') return;
    const delay = signalRecords.length === 0 ? 10_000 : 60_000;
    const id = window.setInterval(() => {
      void backendClient
        .getSignals()
        .then((response) => {
          setSignalRecords(response.items);
          setSignalsError(null);
          // Presets derive from signals; refresh them once signals exist.
          if (response.items.length && backtestPresets.length === 0) {
            void backendClient
              .getBacktestPresets()
              .then((presetsResponse) => setBacktestPresets(presetsResponse.items))
              .catch(() => undefined);
          }
        })
        .catch((error: unknown) => {
          // A failing signals endpoint must never read as "no signals".
          setSignalsError(
            error instanceof Error ? error.message : 'The signals endpoint is failing.',
          );
        });
    }, delay);
    return () => window.clearInterval(id);
  }, [backendStatus, signalRecords.length, backtestPresets.length]);

  function refreshMarketCorridor() {
    if (marketCorridorRefreshing) {
      return;
    }

    setMarketCorridorRefreshing(true);
    void (async () => {
      try {
        if (backendStatus !== 'online') {
          const health = await backendClient.getHealth();
          if (health.status !== 'ok') {
            throw new Error('Backend health check did not return ok.');
          }
          setBackendStatus('online');
          setBackendErrorMessage(null);
        }

        const refreshed = await backendClient.refreshMarketCorridor();
        const candleResponses = await Promise.all(
          refreshed.items.map((item) =>
            backendClient.getMarketCandles(item.symbol, item.timeframe),
          ),
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
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'The backend refresh request failed.';
        pushToast('Market corridor refresh failed', `${message} Existing corridor data was kept.`);
      } finally {
        setMarketCorridorRefreshing(false);
      }
    })();
  }

  function persistProviderSettings(
    nextProviderSettings: typeof providerSettings,
    nextTradingMode: TradingMode = tradingMode,
    nextMinBacktestSample: number = minBacktestSample,
    nextLiveTradingConfirmed: boolean = nextTradingMode === 'live' ? liveTradingConfirmed : false,
  ) {
    if (backendStatus === 'offline') {
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
            nextLiveTradingConfirmed,
          ),
        );
        setProviderSettings((current) => mapProviderSettingsResponseToUi(response, current));
        setTradingMode(response.safety.trading_mode);
        setMinBacktestSample(response.safety.min_backtest_sample);
        setLiveTradingConfirmed(response.safety.live_trading_confirmed);
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

  function refreshAiModels(nextAiSettings: AiSettings) {
    if (backendStatus === 'offline') {
      setAiModelOptions([nextAiSettings.model].filter(Boolean));
      setAiModelItems([]);
      setAiModelsFetched(false);
      setAiModelSource('offline');
      setAiModelFetchedAt(null);
      setAiModelDetail('Backend is offline, so model discovery cannot run.');
      return;
    }

    setAiModelsLoading(true);
    setAiModelsFetched(false);
    setAiModelOptions(nextAiSettings.model ? [nextAiSettings.model] : []);
    setAiModelItems([]);
    setAiModelSource('fetching');
    setAiModelFetchedAt(null);
    setAiModelDetail('Fetching models from the selected provider...');
    void (async () => {
      try {
        const response = await backendClient.getAiModels({
          provider: nextAiSettings.provider,
          baseUrl: nextAiSettings.baseUrl,
          apiKeyId: nextAiSettings.apiKeyId,
          requestTimeoutSeconds: nextAiSettings.requestTimeoutSeconds,
        });
        const options = response.models.length
          ? response.models
          : [nextAiSettings.model].filter(Boolean);
        setAiModelOptions(options);
        setAiModelItems(response.modelItems ?? response.models.map((model) => ({ id: model })));
        setAiModelsFetched(response.fetched);
        setAiModelSource(
          response.source ?? (response.fetched ? nextAiSettings.provider : 'fallback'),
        );
        setAiModelFetchedAt(response.fetchedAtUtc ?? null);
        setAiModelDetail(response.detail);
      } catch {
        setAiModelOptions([nextAiSettings.model].filter(Boolean));
        setAiModelItems([]);
        setAiModelsFetched(false);
        setAiModelSource('failed');
        setAiModelFetchedAt(null);
        setAiModelDetail('Model discovery failed for the selected provider.');
      } finally {
        setAiModelsLoading(false);
      }
    })();
  }

  function testAiProvider(nextAiSettings: AiSettings) {
    if (backendStatus === 'offline') {
      setAiProviderTestResult({
        provider: nextAiSettings.provider,
        model: nextAiSettings.model,
        ok: false,
        detail: 'Backend is offline, so the AI provider cannot be tested.',
        elapsedMs: 0,
        testedAtUtc: new Date().toISOString(),
      });
      return;
    }

    setAiProviderTestLoading(true);
    setAiProviderTestResult(null);
    void (async () => {
      try {
        const response = await backendClient.testAiProvider({
          provider: nextAiSettings.provider,
          baseUrl: nextAiSettings.baseUrl,
          apiKeyId: nextAiSettings.apiKeyId,
          requestTimeoutSeconds: nextAiSettings.requestTimeoutSeconds,
          model: nextAiSettings.model,
          temperature: nextAiSettings.temperature,
          maxTokens: Math.min(nextAiSettings.maxTokens, 160),
        });
        setAiProviderTestResult(response);
        pushToast(
          response.ok ? 'AI provider test passed' : 'AI provider test failed',
          response.detail,
        );
      } catch {
        setAiProviderTestResult({
          provider: nextAiSettings.provider,
          model: nextAiSettings.model,
          ok: false,
          detail: 'The AI provider test request failed before a result was returned.',
          elapsedMs: 0,
          testedAtUtc: new Date().toISOString(),
        });
        pushToast('AI provider test failed', 'The backend did not return a provider test result.');
      } finally {
        setAiProviderTestLoading(false);
      }
    })();
  }

  function persistExtensionSettings(extensionId: string, settings: Record<string, unknown>) {
    if (backendStatus !== 'online') {
      pushToast(
        'Extension settings unavailable',
        'The backend is offline, so extension settings cannot be updated right now.',
      );
      return;
    }

    void (async () => {
      try {
        const response = await backendClient.updateExtensionSettings(extensionId, {
          ...(extensionSettingsById[extensionId] ?? {}),
          ...settings,
        });
        setExtensionSettingsById((current) => ({
          ...current,
          [extensionId]: response.settings,
        }));
        pushToast(
          'Extension settings saved',
          response.requiresRestart
            ? 'Restart the backend to apply extension activation changes.'
            : 'The extension settings were persisted.',
        );
      } catch {
        pushToast(
          'Extension settings update failed',
          'The backend rejected the extension settings update.',
        );
      }
    })();
  }

  function persistExtensionEnabled(extensionId: string, enabled: boolean) {
    if (backendStatus !== 'online') {
      pushToast(
        'Extension settings unavailable',
        'The backend is offline, so extension settings cannot be updated right now.',
      );
      return;
    }

    void (async () => {
      try {
        const response = await backendClient.updateExtensionEnabled(extensionId, enabled);
        setExtensionRegistry((current) =>
          current.map((extension) =>
            extension.id === extensionId ? { ...extension, enabled } : extension,
          ),
        );
        setExtensionSettingsById((current) => ({
          ...current,
          [extensionId]: response.settings,
        }));
        pushToast(
          enabled ? 'Extension enabled' : 'Extension disabled',
          response.requiresRestart
            ? 'Restart the backend for the registry changes to take effect.'
            : undefined,
        );
      } catch {
        pushToast(
          'Extension enablement failed',
          'The backend rejected the extension enablement change.',
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
        if (channel === 'desktop' && response.delivered) {
          const sent = await sendNativeNotification('QuantGlass desktop test', response.detail);
          if (!sent) {
            pushToast(
              'Desktop test needs permission',
              'The backend test succeeded, but the OS notification was blocked or unavailable.',
            );
            return;
          }
        }
        pushToast(
          response.delivered
            ? `${notificationChannelLabel(channel)} test sent`
            : `${notificationChannelLabel(channel)} test failed`,
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
        setWatchlistIds((current) =>
          current.includes(symbolId) ? current : [...current, symbolId],
        );
        pushToast('Added to watchlist', `${symbolId} saved to the backend watchlist.`);
      } catch {
        pushToast(
          'Watchlist update failed',
          'The backend rejected the watchlist update, so no change was applied.',
        );
      }
    })();
  }

  function handleTrackCustomSymbol(rawSymbol: string, marketType: 'crypto' | 'stocks') {
    let symbol = rawSymbol.trim().toUpperCase().replace(/[/-]/g, '');
    if (!symbol) return;
    // Crypto needs a quote currency; default to USD so "DOGE" -> "DOGEUSD".
    if (marketType === 'crypto' && !/(USD|USDT|USDC)$/.test(symbol)) {
      symbol = `${symbol}USD`;
    }

    if (backendStatus !== 'online') {
      pushToast(
        'Watchlist unavailable',
        'The backend is offline, so a new symbol cannot be tracked right now.',
      );
      return;
    }

    void (async () => {
      try {
        await backendClient.addWatchlistItem({ symbol, market_type: marketType });
        setWatchlistIds((current) => (current.includes(symbol) ? current : [...current, symbol]));
        pushToast(
          `Now tracking ${symbol}`,
          'It joins the market corridor — price, signals, and backtests appear after the next market refresh.',
        );
      } catch {
        pushToast(
          'Could not track symbol',
          'The backend rejected the request, so no symbol was added. Check the ticker and try again.',
        );
      }
    })();
  }

  function handleOpenAlertModal(symbolId: string, signalId?: string, alertId?: string) {
    const record = alertId ? alerts.find((entry) => entry.id === alertId) : undefined;
    setAlertModal({ open: true, symbolId, signalId, alertId });
    setAlertCondition(
      record?.condition ?? (signalId ? 'Alert when this setup reappears on a closed candle' : ''),
    );
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
      pushToast(
        'Alert save unavailable',
        'The backend is offline, so alerts cannot be saved right now.',
      );
      return;
    }

    void (async () => {
      try {
        if (alertModal.alertId) {
          const response = await backendClient.updateAlert(alertModal.alertId, nextAlert);
          setAlerts((current) =>
            current.map((entry) => (entry.id === alertModal.alertId ? response.item : entry)),
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
      pushToast(
        'Strategy save unavailable',
        'The backend is offline, so strategies cannot be saved right now.',
      );
      return;
    }

    void (async () => {
      try {
        const response = await backendClient.createSavedStrategy(strategy);
        setSavedStrategies((current) => [
          response.item,
          ...current.filter((entry) => entry.id !== response.item.id),
        ]);
        pushToast(
          'Strategy saved',
          'The strategy now appears in Settings → Strategies and is persisted in the backend.',
        );
      } catch {
        pushToast(
          'Strategy save failed',
          'The backend strategy save failed, so no change was applied.',
        );
      }
    })();
  }

  function handleDeleteSavedStrategy(strategyId: string) {
    if (backendStatus !== 'online') {
      pushToast(
        'Strategy delete unavailable',
        'The backend is offline, so saved strategies cannot be deleted right now.',
      );
      return;
    }

    void (async () => {
      try {
        const response = await backendClient.deleteSavedStrategy(strategyId);
        if (response.deleted) {
          setSavedStrategies((current) => current.filter((entry) => entry.id !== strategyId));
          pushToast('Strategy deleted', 'The saved strategy was removed from backend storage.');
        } else {
          pushToast('Strategy not found', 'The backend did not find that saved strategy.');
        }
      } catch {
        pushToast(
          'Strategy delete failed',
          'The backend strategy delete failed, so no change was applied.',
        );
      }
    })();
  }

  function handleImportSavedStrategies(strategies: SavedStrategy[]) {
    if (strategies.length === 0) {
      pushToast(
        'No valid strategies found',
        'Import a JSON array or { items: [...] } file with complete QuantGlass saved strategy records.',
      );
      return;
    }
    if (backendStatus !== 'online') {
      pushToast(
        'Strategy import unavailable',
        'The backend is offline, so saved strategies cannot be imported right now.',
      );
      return;
    }

    void (async () => {
      try {
        const responses = await Promise.all(
          strategies.map((strategy) => backendClient.createSavedStrategy(strategy)),
        );
        const imported = responses.map((response) => response.item);
        setSavedStrategies((current) => [
          ...imported,
          ...current.filter((entry) => !imported.some((strategy) => strategy.id === entry.id)),
        ]);
        pushToast(
          'Strategies imported',
          `${imported.length} saved strategy${imported.length === 1 ? '' : 'ies'} persisted in backend storage.`,
        );
      } catch {
        pushToast(
          'Strategy import failed',
          'The backend rejected one or more imported strategies.',
        );
      }
    })();
  }

  function persistCustomProvider(payload: CustomProviderUpsertRequest, providerId?: string) {
    if (backendStatus !== 'online') {
      pushToast(
        'Provider save unavailable',
        'The backend is offline, so custom provider changes cannot be saved right now.',
      );
      return;
    }

    void (async () => {
      try {
        const response = providerId
          ? await backendClient.updateCustomProvider(providerId, payload)
          : await backendClient.createCustomProvider(payload);
        const [registryResponse, customProviderResponse, apiKeysResponse] = await Promise.all([
          backendClient.getProviderRegistry(),
          backendClient.getCustomProviders(),
          backendClient.getApiKeys(),
        ]);
        setProviderRegistry(registryResponse.providers);
        setCustomProviders(customProviderResponse.providers);
        setApiKeys(apiKeysResponse.items);
        pushToast(
          'Custom provider saved',
          `${response.provider.label} was saved as a custom provider profile.`,
        );
      } catch {
        pushToast(
          'Custom provider save failed',
          'The backend rejected the custom provider profile.',
        );
      }
    })();
  }

  function deleteCustomProvider(providerId: string) {
    if (backendStatus !== 'online') {
      pushToast(
        'Provider delete unavailable',
        'The backend is offline, so custom provider changes cannot be saved right now.',
      );
      return;
    }

    void (async () => {
      try {
        await backendClient.deleteCustomProvider(providerId);
        const [registryResponse, customProviderResponse, apiKeysResponse] = await Promise.all([
          backendClient.getProviderRegistry(),
          backendClient.getCustomProviders(),
          backendClient.getApiKeys(),
        ]);
        setProviderRegistry(registryResponse.providers);
        setCustomProviders(customProviderResponse.providers);
        setApiKeys(apiKeysResponse.items);
        pushToast('Custom provider deleted', 'The custom provider profile was removed.');
      } catch {
        pushToast(
          'Custom provider delete failed',
          'The backend rejected the custom provider delete request.',
        );
      }
    })();
  }

  function requestLiveTradingMode() {
    const alpacaKeyId = apiKeys.find(
      (field) => field.id === 'alpaca-market-data-key-id',
    )?.configured;
    const alpacaSecret = apiKeys.find(
      (field) => field.id === 'alpaca-market-data-secret-key',
    )?.configured;
    if (!alpacaKeyId || !alpacaSecret) {
      pushToast(
        'Live credentials required',
        'Save Alpaca key ID and secret in Settings -> API Keys before enabling live mode.',
      );
      return;
    }
    setLiveConfirmOpen(true);
  }

  function handleConfirmPaperTrade() {
    if (!paperTradeRecord) return;
    if (!isPaperPlanComplete(planReason, planStop)) return;

    const entryPrice =
      (paperTradeRecord.signal.entry_zone[0] + paperTradeRecord.signal.entry_zone[1]) / 2;
    const stopValue = Number(planStop);
    const planRiskPercent = computePlanRiskPercent(
      entryPrice,
      stopValue,
      paperTradeQty,
      paperAccount.balance,
    );

    if (backendStatus !== 'online') {
      pushToast(
        'Trade submission unavailable',
        'The backend is offline, so this trade cannot be submitted right now.',
      );
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
          planStop: stopValue,
          planTarget: Number(planTarget) > 0 ? Number(planTarget) : undefined,
          planRiskPercent: Number(planRiskPercent.toFixed(3)),
          planReason: planReason.trim(),
          planEmotion,
          orderType,
          limitPrice:
            orderType !== 'market' && Number(orderTrigger) > 0 ? Number(orderTrigger) : undefined,
          tif: orderType !== 'market' ? orderTif : undefined,
          expiresAt: orderTif === 'gtd' && orderExpiry ? `${orderExpiry}T23:59:59Z` : undefined,
          trailPercent: Number(trailPercent) > 0 ? Number(trailPercent) : undefined,
        });
        setPaperAccount(response.account);
        pushToast(
          response.tradingMode === 'live' ? 'Live trade submitted' : 'Paper trade queued',
          response.tradingMode === 'live'
            ? `${paperTradeRecord.signal.symbol} ${paperTradeSide} x ${paperTradeQty} was submitted to the configured live broker route.`
            : `${paperTradeRecord.signal.symbol} ${paperTradeSide} x ${paperTradeQty} was queued for backend execution.`,
        );
      } catch (error) {
        const detail = error instanceof Error ? error.message : '';
        const classified = classifyPaperTradeError(detail, { isLive: isLiveTradingMode });
        pushToast(classified.title, classified.message);
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
        aiStatusLabel={
          aiSettings?.cloudEnabled && aiSettings.model
            ? `${aiSettings.model}${aiSettings.provider === 'ollama' || aiSettings.provider === 'lm_studio' || aiSettings.provider === 'vllm' || aiSettings.provider === 'llama_cpp' ? ' · local' : ''}`
            : null
        }
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
                  onClosePosition={(symbolId) => {
                    void backendClient
                      .closePaperPosition(symbolId)
                      .then((response) => {
                        setPaperAccount(response.account);
                        pushToast(
                          'Position closed',
                          `${symbolId} closed at the latest market price (manual exit).`,
                        );
                      })
                      .catch((error: unknown) => {
                        pushToast(
                          'Close failed',
                          error instanceof Error ? error.message : 'The close request failed.',
                        );
                      });
                  }}
                  symbols={filteredSymbols}
                  signals={filteredSignals}
                  watchlistIds={watchlistIds}
                  paperAccount={paperAccount}
                  marketCorridorItems={marketCorridorItems}
                  marketCandlesByKey={marketCandlesByKey}
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
                  extensionIndicators={extensionIndicators}
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
                  signalsError={signalsError}
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
              element={
                <BacktestScreen
                  state={screenState}
                  presets={backtestPresets}
                  savedStrategies={savedStrategies}
                  symbols={displaySymbols}
                  minBacktestSample={minBacktestSample}
                  marketCorridorItems={marketCorridorItems}
                  onSaveStrategy={handleSaveStrategy}
                />
              }
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
                  onTrackCustomSymbol={handleTrackCustomSymbol}
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
                  customProviders={customProviders}
                  extensionRegistry={extensionRegistry}
                  extensionSurfaces={extensionSurfaces}
                  extensionStrategies={extensionStrategies}
                  extensionIndicators={extensionIndicators}
                  extensionSettingsById={extensionSettingsById}
                  apiKeys={apiKeys}
                  aiSettings={aiSettings}
                  aiModelOptions={aiModelOptions}
                  aiModelItems={aiModelItems}
                  aiModelDetail={aiModelDetail}
                  aiModelsFetched={aiModelsFetched}
                  aiModelSource={aiModelSource}
                  aiModelFetchedAt={aiModelFetchedAt}
                  aiModelsLoading={aiModelsLoading}
                  aiProviderTestLoading={aiProviderTestLoading}
                  aiProviderTestResult={aiProviderTestResult}
                  tradingMode={tradingMode}
                  liveTradingConfirmed={liveTradingConfirmed}
                  minBacktestSample={minBacktestSample}
                  savedStrategies={savedStrategies}
                  onSaveApiKey={persistApiKey}
                  onTestNotification={sendNotificationTest}
                  onRequestLiveTrading={requestLiveTradingMode}
                  onChangeProviderView={(viewMode) => {
                    persistProviderSettings({ ...providerSettings, viewMode });
                    pushToast('Provider view updated', `Settings switched to ${viewMode} mode.`);
                  }}
                  onUpdateProviderSetting={(key, value) => {
                    persistProviderSettings({ ...providerSettings, [key]: value });
                  }}
                  onSaveCustomProvider={persistCustomProvider}
                  onDeleteCustomProvider={deleteCustomProvider}
                  onSetTradingMode={(mode) =>
                    persistProviderSettings(
                      providerSettings,
                      mode,
                      minBacktestSample,
                      mode === 'live' ? liveTradingConfirmed : false,
                    )
                  }
                  onSetMinBacktestSample={(value) =>
                    persistProviderSettings(providerSettings, tradingMode, value)
                  }
                  onUpdateAiSettings={(settings) => persistAiSettings(settings)}
                  onRefreshAiModels={refreshAiModels}
                  onTestAiProvider={testAiProvider}
                  onUpdateExtensionSettings={persistExtensionSettings}
                  onUpdateExtensionEnabled={persistExtensionEnabled}
                  onDeleteSavedStrategy={handleDeleteSavedStrategy}
                  onImportSavedStrategies={handleImportSavedStrategies}
                />
              }
            />
            <Route
              path="/learn"
              element={
                <LearnScreen backendStatus={backendStatus} onNavigate={(path) => navigate(path)} />
              }
            />
            <Route path="/missions" element={<MissionsScreen backendStatus={backendStatus} />} />
            <Route path="/portfolio" element={<PortfolioScreen backendStatus={backendStatus} />} />
            <Route path="/journal" element={<JournalScreen backendStatus={backendStatus} />} />
            <Route path="/review" element={<ReviewScreen backendStatus={backendStatus} />} />
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
              <p className="mt-2">
                Entry zone{' '}
                {paperTradeRecord.signal.entry_zone
                  .map((level) => formatCurrency(level))
                  .join(' - ')}
              </p>
              <p className="mt-1">
                Stop loss {formatCurrency(paperTradeRecord.signal.stop_loss)} · TP ladder{' '}
                {paperTradeRecord.signal.take_profit
                  .map((level) => formatCurrency(level))
                  .join(', ')}
              </p>
              <p className="mt-1">
                Risk / reward {paperTradeRecord.signal.risk_reward.toFixed(1)} ·{' '}
                {paperTradeRecord.signal.fees_slippage_assumed}
              </p>
              <p className="mt-1">Invalidation {paperTradeRecord.signal.invalidation}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm text-muted">
                <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
                  Side
                </span>
                <select
                  className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                  value={paperTradeSide}
                  onChange={(event) => setPaperTradeSide(event.target.value as 'long' | 'short')}
                >
                  <option value="long">Long</option>
                  <option value="short">Short</option>
                </select>
              </label>
              <label className="space-y-2 text-sm text-muted">
                <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
                  Quantity
                </span>
                <input
                  className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={paperTradeQty}
                  onChange={(event) => setPaperTradeQty(Number(event.target.value))}
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm text-muted">
                <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
                  Stop loss (required)
                </span>
                <input
                  className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                  type="number"
                  min="0"
                  step="any"
                  value={planStop}
                  onChange={(event) => setPlanStop(event.target.value)}
                />
              </label>
              <label className="space-y-2 text-sm text-muted">
                <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
                  Target
                </span>
                <input
                  className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                  type="number"
                  min="0"
                  step="any"
                  value={planTarget}
                  onChange={(event) => setPlanTarget(event.target.value)}
                />
              </label>
            </div>

            <label className="block space-y-2 text-sm text-muted">
              <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
                Why this trade? (required)
              </span>
              <input
                className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                placeholder="One sentence: the setup, the regime, the reason."
                maxLength={280}
                value={planReason}
                onChange={(event) => setPlanReason(event.target.value)}
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm text-muted">
                <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
                  Emotional state
                </span>
                <select
                  className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                  value={planEmotion}
                  onChange={(event) => setPlanEmotion(event.target.value)}
                >
                  <option value="calm">Calm</option>
                  <option value="confident">Confident</option>
                  <option value="anxious">Anxious</option>
                  <option value="fomo">FOMO</option>
                  <option value="frustrated">Frustrated</option>
                  <option value="tired">Tired</option>
                </select>
              </label>
              {paperTradeRecord ? (
                <div className="rounded-3xl border border-border bg-white/[0.03] p-4 text-sm text-muted">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                    Account context
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <span>
                      Buying power:{' '}
                      <span className="text-ink">{formatCurrency(paperAccount.buyingPower)}</span>
                    </span>
                    <span>
                      Balance:{' '}
                      <span className="text-ink">{formatCurrency(paperAccount.balance)}</span>
                    </span>
                    <span>
                      This order:{' '}
                      <span
                        className={
                          paperTradeQty *
                            ((paperTradeRecord.signal.entry_zone[0] +
                              paperTradeRecord.signal.entry_zone[1]) /
                              2) >
                          paperAccount.buyingPower
                            ? 'text-sell'
                            : 'text-ink'
                        }
                      >
                        {formatCurrency(
                          paperTradeQty *
                            ((paperTradeRecord.signal.entry_zone[0] +
                              paperTradeRecord.signal.entry_zone[1]) /
                              2),
                        )}
                      </span>
                    </span>
                    <span>
                      {(() => {
                        const held = paperAccount.openPositions.find(
                          (position) => position.symbolId === paperTradeRecord.symbolId,
                        );
                        return held
                          ? `Held: ${held.side.toUpperCase()} ${held.quantity} @ ${formatCurrency(held.averagePrice)}`
                          : 'No open position in this symbol';
                      })()}
                    </span>
                  </div>
                  <p className="mt-2 text-xs">
                    Orders above buying power are rejected. Opposing positions must be closed first
                    — the venue does not net them. Shorts reserve full notional as margin.
                  </p>
                </div>
              ) : null}
              {paperTradeRecord && Number(planStop) > 0 ? (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span className="font-semibold uppercase tracking-[0.18em]">Size from risk:</span>
                  {[0.5, 1, 2].map((riskPct) => {
                    const entryMid =
                      (paperTradeRecord.signal.entry_zone[0] +
                        paperTradeRecord.signal.entry_zone[1]) /
                      2;
                    const stopDistance = Math.abs(entryMid - Number(planStop));
                    const sized =
                      stopDistance > 0 ? (paperAccount.balance * riskPct) / 100 / stopDistance : 0;
                    return (
                      <button
                        key={riskPct}
                        type="button"
                        disabled={sized <= 0}
                        onClick={() => setPaperTradeQty(Number(sized.toFixed(4)))}
                        className="rounded-full border border-border px-3 py-1 transition hover:text-ink disabled:opacity-40"
                        title={`qty = (balance × ${riskPct}%) / stop distance`}
                      >
                        {riskPct}% → {sized > 0 ? sized.toFixed(4) : '—'}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              <label className="space-y-2 text-sm text-muted">
                <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
                  Order type
                  {!orderTypesUnlocked ? (
                    <span className="ml-2 normal-case tracking-normal">
                      — limit/stop unlock with the Order Types lesson
                    </span>
                  ) : null}
                </span>
                <div className="flex gap-2">
                  <select
                    className="flex-1 rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                    value={orderType}
                    onChange={(event) => setOrderType(event.target.value as typeof orderType)}
                  >
                    <option value="market">Market — fill at next tick</option>
                    <option value="limit" disabled={!orderTypesUnlocked}>
                      Limit — fill at my price or better
                    </option>
                    <option value="stop" disabled={!orderTypesUnlocked}>
                      Stop — fill when price breaks through
                    </option>
                  </select>
                  {orderType !== 'market' ? (
                    <input
                      type="number"
                      min={0}
                      step="any"
                      placeholder={orderType === 'limit' ? 'Limit price' : 'Trigger price'}
                      className="w-36 rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                      value={orderTrigger}
                      onChange={(event) => setOrderTrigger(event.target.value)}
                    />
                  ) : null}
                </div>
                {orderType !== 'market' ? (
                  <div className="flex gap-2">
                    <select
                      aria-label="Time in force"
                      className="flex-1 rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                      value={orderTif}
                      onChange={(event) => setOrderTif(event.target.value as typeof orderTif)}
                    >
                      <option value="gtc">GTC — good till cancelled</option>
                      <option value="day">Day — dies at end of day (UTC)</option>
                      <option value="gtd">GTD — good till date</option>
                    </select>
                    {orderTif === 'gtd' ? (
                      <input
                        type="date"
                        className="rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                        value={orderExpiry}
                        onChange={(event) => setOrderExpiry(event.target.value)}
                      />
                    ) : null}
                  </div>
                ) : null}
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={50}
                    step="0.5"
                    placeholder="Trailing stop % (optional)"
                    disabled={!orderTypesUnlocked}
                    className="w-56 shrink-0 rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none disabled:opacity-40"
                    value={trailPercent}
                    onChange={(event) => setTrailPercent(event.target.value)}
                  />
                  <span className="text-xs">
                    Ratchets your stop from the best closed price — only ever tightens.
                  </span>
                </div>
                <span className="block text-xs">
                  {orderType === 'market'
                    ? 'Executes on the next backend tick at the latest closed price.'
                    : orderType === 'limit'
                      ? 'Waits until price reaches your limit (long: at or below; short: at or above).'
                      : 'Waits for a breakout through the trigger (long: at or above; short: at or below).'}{' '}
                  Your stop and target act as a live OCO bracket: the position closes automatically
                  when either level trades. Stop-limit is deliberately not simulated — its
                  unfilled-leg failure mode can't be modeled honestly on closed candles.
                </span>
              </label>
              <div className="space-y-2 text-sm text-muted">
                <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
                  Planned risk
                </span>
                <p className="rounded-2xl border border-border bg-white/[0.03] px-4 py-3 text-ink">
                  {(() => {
                    const entry =
                      (paperTradeRecord.signal.entry_zone[0] +
                        paperTradeRecord.signal.entry_zone[1]) /
                      2;
                    const stop = Number(planStop);
                    if (!(stop > 0) || paperAccount.balance <= 0) return '—';
                    const pct =
                      (Math.abs(entry - stop) * paperTradeQty * 100) / paperAccount.balance;
                    return `≈ ${pct.toFixed(2)}% of paper balance`;
                  })()}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                disabled={!planReason.trim() || !(Number(planStop) > 0)}
                onClick={handleConfirmPaperTrade}
              >
                {isLiveTradingMode ? 'Submit live trade' : 'Confirm paper trade'}
              </Button>
              <button
                type="button"
                title={
                  isLiveTradingMode
                    ? 'Live mode is enabled. The configured broker route will be used for this order.'
                    : 'Enable in Settings → Risk & Safety to submit live trades through the configured broker route.'
                }
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
        description="Configure backend-persisted alerts. Desktop uses OS notifications, Telegram requires a saved bot token and chat ID, and email uses saved SMTP settings."
        onClose={() => setAlertModal({ open: false, symbolId: alertModal.symbolId })}
      >
        <div className="space-y-5">
          <div className="rounded-3xl border border-border bg-white/[0.03] p-4 text-sm text-muted">
            Symbol{' '}
            <span className="font-medium text-ink">{symbolById[alertModal.symbolId]?.symbol}</span>
            {alertModal.signalId ? (
              <span> · Prefilled from the selected signal drawer.</span>
            ) : null}
          </div>
          <div className="space-y-2 text-sm text-muted">
            <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
              Describe it (AI)
            </span>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder='e.g. "alert me when BTC crosses 100k"'
                className="flex-1 rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                value={nlAlertText}
                onChange={(event) => setNlAlertText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void parseNlAlert();
                }}
              />
              <Button variant="secondary" onClick={() => void parseNlAlert()} disabled={nlParsing}>
                {nlParsing ? 'Parsing…' : 'Parse'}
              </Button>
            </div>
            {nlAlertNotice ? <p className="text-xs">{nlAlertNotice}</p> : null}
          </div>
          <label className="space-y-2 text-sm text-muted">
            <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
              Condition
            </span>
            <textarea
              className="min-h-24 w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
              value={alertCondition}
              onChange={(event) => setAlertCondition(event.target.value)}
              placeholder="e.g. crosses above 50000"
            />
            <div className="flex flex-wrap gap-2">
              {['crosses above ', 'crosses below ', 'above ', 'below '].map((snippet) => (
                <button
                  key={snippet}
                  type="button"
                  onClick={() => setAlertCondition(snippet)}
                  className="rounded-full border border-border px-3 py-1 text-xs text-muted transition hover:text-ink"
                >
                  {snippet.trim()} …
                </button>
              ))}
            </div>
            <p className="text-xs text-muted">
              Supported conditions (evaluated on each closed candle of this symbol's stored series):{' '}
              <span className="text-ink">crosses above N</span>,{' '}
              <span className="text-ink">crosses below N</span>,{' '}
              <span className="text-ink">above N</span> (also "&gt;= N" / "over N"),{' '}
              <span className="text-ink">below N</span> (also "&lt;= N" / "under N") — where N is a
              price. "Crosses" fires once when price moves through N; "above/below" fires while
              price is beyond it.
            </p>
          </label>
          <label className="space-y-2 text-sm text-muted">
            <span className="block text-xs font-semibold uppercase tracking-[0.18em]">Channel</span>
            <select
              className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
              value={alertChannel}
              onChange={(event) => setAlertChannel(event.target.value as AlertRecord['channel'])}
            >
              <option value="desktop">Desktop</option>
              <option value="telegram">Telegram</option>
              <option value="email">Email</option>
            </select>
          </label>
          <p className="text-xs text-muted">
            Desktop delivery uses the local notification permission from your OS. Telegram and email
            delivery use saved values from Settings → API Keys.
          </p>
          <div className="flex justify-end gap-3">
            <Button
              variant="ghost"
              onClick={() => setAlertModal({ open: false, symbolId: alertModal.symbolId })}
            >
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
          persistProviderSettings(providerSettings, 'live', minBacktestSample, true);
          setLiveConfirmOpen(false);
          pushToast(
            'Trading mode updated',
            'Settings now use the live broker route. Confirm each trade carefully and verify Alpaca credentials before submitting orders.',
          );
        }}
      />

      <ToastLayer toasts={toasts} />
    </>
  );
}
