// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import type {
  AiSettings,
  ApiKeyField,
  ApiKeyItemResponse,
  ApiKeySettingsResponse,
  ApiKeyUpdateRequest,
  AiSettingsResponse,
  AlertHistoryListResponse,
  AlertItemResponse,
  AlertRecord,
  AlertsListResponse,
  AlertUpsertRequest,
  BacktestPresetListResponse,
  BacktestRunRequest,
  BacktestRunResponse,
  BackendHealthResponse,
  CorridorIngestResponse,
  MarketCandlesResponse,
  MarketRankingResponse,
  NewsListResponse,
  NotificationTestChannel,
  NotificationTestResponse,
  PaperAccount,
  PaperAccountResponse,
  PaperTradeIntentListResponse,
  PaperTradeIntentRequest,
  PaperTradeIntentResponse,
  ProviderRoute,
  ProviderRegistryResponse,
  ProviderSettingsResponse,
  ProviderSettingsUpdateRequest,
  SavedStrategy,
  SavedStrategyCreateRequest,
  SavedStrategyItemResponse,
  SavedStrategyListResponse,
  SignalsListResponse,
  WatchlistCreateRequest,
  WatchlistDeleteResponse,
  WatchlistListResponse,
} from '@quantglass/contracts';
import type { Candle, ProviderSettings } from '../types';

const DEFAULT_BACKEND_BASE_URL = 'http://127.0.0.1:8000';

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

let backendBaseUrlPromise: Promise<string> | null = null;

async function resolveBackendBaseUrl(): Promise<string> {
  const configuredUrl = import.meta.env.VITE_BACKEND_BASE_URL;
  if (configuredUrl) {
    return configuredUrl;
  }
  if (isTauriRuntime()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const url = await invoke<string>('backend_base_url');
      if (url) {
        return url;
      }
    } catch {
      // Fall back to the conventional local port if the command is unavailable.
    }
  }
  return DEFAULT_BACKEND_BASE_URL;
}

function getBackendBaseUrl(): Promise<string> {
  if (!backendBaseUrlPromise) {
    backendBaseUrlPromise = resolveBackendBaseUrl();
  }
  return backendBaseUrlPromise;
}

export interface BackendEventMessage {
  type: string;
  payload: Record<string, unknown>;
}

export const providerLabelById: Record<string, string> = {
  alpaca: 'Alpaca',
  alpaca_paper: 'Alpaca Paper',
  ccxt_coinbase: 'Coinbase',
  ccxt_kraken: 'Kraken',
  ccxt_trade: 'CCXT Trade',
  finnhub: 'Finnhub',
  finnhub_news: 'Finnhub',
  gemini: 'Gemini',
  ollama: 'Ollama',
  openai: 'OpenAI',
  polygon: 'Polygon',
  twelvedata: 'Twelve Data',
  yahoo_public: 'Yahoo Finance',
};

const providerIdByLabel: Record<string, string> = Object.fromEntries(
  Object.entries(providerLabelById).map(([providerId, label]) => [label, providerId]),
);

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = await getBackendBaseUrl();
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    throw new Error(`Backend request failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export const backendClient = {
  getHealth() {
    return requestJson<BackendHealthResponse>('/health');
  },
  getSignals() {
    return requestJson<SignalsListResponse>('/api/signals');
  },
  getNews() {
    return requestJson<NewsListResponse>('/api/news');
  },
  getBacktestPresets() {
    return requestJson<BacktestPresetListResponse>('/api/backtests/presets');
  },
  runBacktest(payload: BacktestRunRequest) {
    return requestJson<BacktestRunResponse>('/api/backtests/run', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getMarketCorridorStatus() {
    return requestJson<CorridorIngestResponse>('/api/market/corridor');
  },
  refreshMarketCorridor() {
    return requestJson<CorridorIngestResponse>('/api/market/corridor/refresh', {
      method: 'POST',
    });
  },
  getMarketCandles(symbol: string, timeframe: string) {
    return requestJson<MarketCandlesResponse>(`/api/market/corridor/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`);
  },
  getMarketRanking() {
    return requestJson<MarketRankingResponse>('/api/market/ranking');
  },
  getProviderSettings() {
    return requestJson<ProviderSettingsResponse>('/api/providers/settings');
  },
  getProviderRegistry() {
    return requestJson<ProviderRegistryResponse>('/api/providers/registry');
  },
  updateProviderSettings(payload: ProviderSettingsUpdateRequest) {
    return requestJson<ProviderSettingsResponse>('/api/providers/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },
  getAiSettings() {
    return requestJson<AiSettingsResponse>('/api/settings/ai');
  },
  updateAiSettings(payload: AiSettings) {
    return requestJson<AiSettingsResponse>('/api/settings/ai', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },
  getApiKeys() {
    return requestJson<ApiKeySettingsResponse>('/api/settings/api-keys');
  },
  updateApiKey(keyId: string, payload: ApiKeyUpdateRequest) {
    return requestJson<ApiKeyItemResponse>(`/api/settings/api-keys/${encodeURIComponent(keyId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },
  testNotification(channel: NotificationTestChannel) {
    return requestJson<NotificationTestResponse>(`/api/settings/notifications/test/${encodeURIComponent(channel)}`, {
      method: 'POST',
    });
  },
  getPaperAccount() {
    return requestJson<PaperAccountResponse>('/api/paper-account');
  },
  updatePaperAccount(payload: PaperAccount) {
    return requestJson<PaperAccountResponse>('/api/paper-account', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },
  getPaperTrades() {
    return requestJson<PaperTradeIntentListResponse>('/api/paper-trades');
  },
  submitPaperTrade(payload: PaperTradeIntentRequest) {
    return requestJson<PaperTradeIntentResponse>('/api/paper-trades', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getWatchlist() {
    return requestJson<WatchlistListResponse>('/api/watchlist');
  },
  getSavedStrategies() {
    return requestJson<SavedStrategyListResponse>('/api/strategies');
  },
  createSavedStrategy(payload: SavedStrategyCreateRequest) {
    return requestJson<SavedStrategyItemResponse>('/api/strategies', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  addWatchlistItem(payload: WatchlistCreateRequest) {
    return requestJson<WatchlistListResponse['items'][number]>('/api/watchlist', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  removeWatchlistItem(symbol: string) {
    return requestJson<WatchlistDeleteResponse>(`/api/watchlist/${encodeURIComponent(symbol)}`, {
      method: 'DELETE',
    });
  },
  getAlerts() {
    return requestJson<AlertsListResponse>('/api/alerts');
  },
  getAlertHistory() {
    return requestJson<AlertHistoryListResponse>('/api/alerts/history');
  },
  createAlert(payload: AlertUpsertRequest) {
    return requestJson<AlertItemResponse>('/api/alerts', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateAlert(alertId: string, payload: AlertUpsertRequest) {
    return requestJson<AlertItemResponse>(`/api/alerts/${encodeURIComponent(alertId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },
  subscribeEvents(onEvent: (event: BackendEventMessage) => void) {
    let socket: WebSocket | null = null;
    let closed = false;

    void getBackendBaseUrl().then((baseUrl) => {
      if (closed) return;
      const url = new URL(baseUrl);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      url.pathname = '/ws/events';
      url.search = '';

      socket = new WebSocket(url.toString());
      socket.onmessage = (message) => {
        try {
          onEvent(JSON.parse(message.data) as BackendEventMessage);
        } catch {
          return;
        }
      };
    });

    return () => {
      closed = true;
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        socket.close();
      }
    };
  },
};

export function maskApiKeyValue(value: string): string {
  if (!value) return 'Not configured';
  if (value.length <= 4) return value;
  return `•••• •••• •••• ${value.slice(-4)}`;
}

function labelForProviderId(providerId: string | null | undefined, fallback: string): string {
  if (providerId === null) return '';
  if (providerId === undefined) return fallback;
  return providerLabelById[providerId] ?? providerId;
}

function providerRouteForLabel(
  primary: string,
  secondary: string,
  fallback: string,
): { primary: ProviderRoute; secondary: ProviderRoute; fallback: ProviderRoute } {
  return {
    primary: { primary: providerIdByLabel[primary] ?? primary },
    secondary: { primary: providerIdByLabel[secondary] ?? secondary },
    fallback: { primary: providerIdByLabel[fallback] ?? fallback },
  };
}

export function mapProviderSettingsResponseToUi(
  payload: ProviderSettingsResponse,
  fallback: ProviderSettings,
): ProviderSettings {
  return {
    viewMode: payload.view_mode,
    cryptoPrimary: labelForProviderId(payload.routes.crypto.primary, fallback.cryptoPrimary),
    cryptoSecondary: labelForProviderId(payload.routes.crypto.secondary, fallback.cryptoSecondary),
    cryptoFallback: labelForProviderId(payload.routes.crypto.fallback, fallback.cryptoFallback),
    stocksPrimary: labelForProviderId(payload.routes.stocks.primary, fallback.stocksPrimary),
    stocksSecondary: labelForProviderId(payload.routes.stocks.secondary, fallback.stocksSecondary),
    stocksFallback: labelForProviderId(payload.routes.stocks.fallback, fallback.stocksFallback),
    cryptoRateLimitPerMinute: payload.rate_limits.crypto_per_minute,
    stocksRateLimitPerMinute: payload.rate_limits.stocks_per_minute,
  };
}

export function mapUiSettingsToProviderRequest(
  providerSettings: ProviderSettings,
  tradingMode: 'paper' | 'live',
  minBacktestSample: number,
): ProviderSettingsUpdateRequest {
  function providerIdOrNull(value: string) {
    return value ? providerIdByLabel[value] ?? value : null;
  }

  return {
    view_mode: providerSettings.viewMode,
    routes: {
      crypto: {
        primary: providerIdOrNull(providerSettings.cryptoPrimary) ?? 'ccxt_coinbase',
        secondary: providerIdOrNull(providerSettings.cryptoSecondary),
        fallback: providerIdOrNull(providerSettings.cryptoFallback),
      },
      stocks: {
        primary: providerIdOrNull(providerSettings.stocksPrimary) ?? 'yahoo_public',
        secondary: providerIdOrNull(providerSettings.stocksSecondary),
        fallback: providerIdOrNull(providerSettings.stocksFallback),
      },
      news: {
        primary: 'finnhub_news',
        secondary: 'newsapi',
        fallback: null,
      },
      ai: {
        primary: 'ollama',
        secondary: 'openai',
        fallback: null,
      },
      trading: {
        primary: tradingMode === 'live' ? 'alpaca' : 'alpaca_paper',
        secondary: null,
        fallback: 'ccxt_trade',
      },
    },
    rate_limits: {
      crypto_per_minute: providerSettings.cryptoRateLimitPerMinute,
      stocks_per_minute: providerSettings.stocksRateLimitPerMinute,
    },
    safety: {
      trading_mode: tradingMode,
      act_on_partial_candles: false,
      min_backtest_sample: minBacktestSample,
    },
  };
}

export function mapMarketCandlesToChartSeries(candles: MarketCandlesResponse['items']): Candle[] {
  return candles.map((candle) => ({
    time: Math.floor(new Date(candle.open_time_utc).getTime() / 1000),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
  }));
}