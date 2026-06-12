// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import type {
  AiSettings,
  ApiKeyItemResponse,
  ApiKeySettingsResponse,
  ApiKeyUpdateRequest,
  AiModelListRequest,
  AiModelListResponse,
  AiProviderTestRequest,
  AiProviderTestResponse,
  AiSettingsResponse,
  AlertHistoryListResponse,
  AlertItemResponse,
  AlertsListResponse,
  AlertUpsertRequest,
  BacktestPresetListResponse,
  BacktestRunRequest,
  BacktestRunResponse,
  BackendHealthResponse,
  CorridorIngestResponse,
  CustomProviderDeleteResponse,
  CustomProviderItemResponse,
  CustomProviderListResponse,
  CustomProviderUpsertRequest,
  ExtensionRegistryResponse,
  ExtensionSurfaceRegistryResponse,
  ExtensionSettingsResponse,
  IndicatorRegistryResponse,
  MarketCandlesResponse,
  MarketRankingResponse,
  NewsListResponse,
  NotificationTestChannel,
  NotificationTestResponse,
  PaperAccount,
  PaperClosureRecord,
  PaperAccountResponse,
  PaperTradeIntentListResponse,
  PaperTradeIntentRequest,
  PaperTradeIntentResponse,
  ProviderRegistryResponse,
  ProviderSettingsResponse,
  ProviderSettingsUpdateRequest,
  StrategyRegistryResponse,
  SavedStrategyCreateRequest,
  SavedStrategyDeleteResponse,
  SavedStrategyItemResponse,
  SavedStrategyListResponse,
  SignalsListResponse,
  WatchlistCreateRequest,
  WatchlistDeleteResponse,
  WatchlistListResponse,
  AnswerRequest,
  ExerciseResult,
  LearnCatalogResponse,
  LearnMomentsResponse,
  LearnReadiness,
  TradeReviewResponse,
  MissionsResponse,
  DrillDetail,
  DrillGradeResponse,
  JournalResponse,
  JournalAnnotation,
  CoachResponse,
  ConstitutionResponse,
  ConstitutionRules,
  ConstitutionCompliance,
  ScenariosResponse,
  ScenarioDetail,
  ScenarioGradeResponse,
  GlossaryResponse,
  ReferenceResponse,
  ContextSignal,
  RiskSignal,
  CoachNarrative,
  TutorResponse,
  MasteryResponse,
  ReviewQueueResponse,
  LearnAnalytics,
  LearnCertificate,
  Assessment,
  AssessmentResult,
  LiveExercise,
  LiveExerciseResult,
  LearnProgress,
  LessonRecord,
} from '@quantglass/contracts';
import type { Candle, ProviderSettings } from '../types';

const DEFAULT_BACKEND_BASE_URL = 'http://127.0.0.1:8000';
const DEFAULT_REQUEST_TIMEOUT_MS = 12_000;

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
  lm_studio: 'LM Studio',
  ollama: 'Ollama',
  openai: 'OpenAI',
  openai_compatible: 'OpenAI-Compatible',
  polygon: 'Polygon',
  twelvedata: 'Twelve Data',
  yahoo_public: 'Yahoo Finance',
};

const providerIdByLabel: Record<string, string> = Object.fromEntries(
  Object.entries(providerLabelById).map(([providerId, label]) => [label, providerId]),
);

async function requestJson<T>(
  path: string,
  init?: RequestInit,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<T> {
  const baseUrl = await getBackendBaseUrl();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      ...init,
      signal: init?.signal ?? controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Backend request timed out after ${Math.round(timeoutMs / 1000)}s: ${path}`, {
        cause: error,
      });
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }

  if (!response.ok) {
    let detailText = '';
    try {
      const body = (await response.json()) as { detail?: unknown };
      const detail = body?.detail;
      if (typeof detail === 'string') {
        detailText = detail;
      } else if (detail && typeof detail === 'object') {
        const { message, violations } = detail as { message?: string; violations?: string[] };
        detailText = [message, ...(violations ?? [])].filter(Boolean).join(' ');
      }
    } catch {
      // Non-JSON error body; fall through to the generic message.
    }
    throw new Error(
      detailText || `Backend request failed: ${response.status} ${response.statusText}`,
    );
  }

  return response.json() as Promise<T>;
}

export const backendClient = {
  getHealth() {
    return requestJson<BackendHealthResponse>('/health');
  },
  getSignals() {
    // Heavier than other endpoints: first call after new candles re-runs
    // detection across every series before the cache warms.
    return requestJson<SignalsListResponse>('/api/signals', undefined, 45_000);
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
    return requestJson<CorridorIngestResponse>(
      '/api/market/corridor/refresh',
      {
        method: 'POST',
      },
      60_000,
    );
  },
  getMarketCandles(symbol: string, timeframe: string) {
    return requestJson<MarketCandlesResponse>(
      `/api/market/corridor/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`,
    );
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
  getCustomProviders() {
    return requestJson<CustomProviderListResponse>('/api/providers/custom');
  },
  createCustomProvider(payload: CustomProviderUpsertRequest) {
    return requestJson<CustomProviderItemResponse>('/api/providers/custom', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateCustomProvider(providerId: string, payload: CustomProviderUpsertRequest) {
    return requestJson<CustomProviderItemResponse>(
      `/api/providers/custom/${encodeURIComponent(providerId)}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
    );
  },
  deleteCustomProvider(providerId: string) {
    return requestJson<CustomProviderDeleteResponse>(
      `/api/providers/custom/${encodeURIComponent(providerId)}`,
      {
        method: 'DELETE',
      },
    );
  },
  getExtensionRegistry() {
    return requestJson<ExtensionRegistryResponse>('/api/extensions/registry');
  },
  getExtensionSurfaces() {
    return requestJson<ExtensionSurfaceRegistryResponse>('/api/extensions/surfaces');
  },
  getExtensionStrategies() {
    return requestJson<StrategyRegistryResponse>('/api/extensions/strategies');
  },
  getExtensionIndicators() {
    return requestJson<IndicatorRegistryResponse>('/api/extensions/indicators');
  },
  getExtensionSettings(extensionId: string) {
    return requestJson<ExtensionSettingsResponse>(
      `/api/extensions/registry/${encodeURIComponent(extensionId)}/settings`,
    );
  },
  updateExtensionSettings(extensionId: string, settings: Record<string, unknown>) {
    return requestJson<ExtensionSettingsResponse>(
      `/api/extensions/registry/${encodeURIComponent(extensionId)}/settings`,
      {
        method: 'PUT',
        body: JSON.stringify({ settings }),
      },
    );
  },
  updateExtensionEnabled(extensionId: string, enabled: boolean) {
    return requestJson<ExtensionSettingsResponse>(
      `/api/extensions/registry/${encodeURIComponent(extensionId)}/enabled`,
      {
        method: 'PUT',
        body: JSON.stringify({ enabled }),
      },
    );
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
  getAiModels(payload: AiModelListRequest) {
    return requestJson<AiModelListResponse>('/api/settings/ai/models', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  testAiProvider(payload: AiProviderTestRequest) {
    return requestJson<AiProviderTestResponse>(
      '/api/settings/ai/test',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      Math.max(DEFAULT_REQUEST_TIMEOUT_MS, (payload.requestTimeoutSeconds ?? 8) * 1000 + 3_000),
    );
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
    return requestJson<NotificationTestResponse>(
      `/api/settings/notifications/test/${encodeURIComponent(channel)}`,
      {
        method: 'POST',
      },
    );
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
  deleteSavedStrategy(strategyId: string) {
    return requestJson<SavedStrategyDeleteResponse>(
      `/api/strategies/${encodeURIComponent(strategyId)}`,
      {
        method: 'DELETE',
      },
    );
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
      if (
        socket &&
        (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
      ) {
        socket.close();
      }
    };
  },

  // Interactive Learning Platform
  getLearnCatalog() {
    return requestJson<LearnCatalogResponse>('/api/learn/catalog');
  },
  getLearnLesson(lessonId: string) {
    return requestJson<LessonRecord>(`/api/learn/lesson/${encodeURIComponent(lessonId)}`);
  },
  checkLessonAnswer(lessonId: string, answer: AnswerRequest) {
    return requestJson<ExerciseResult>(`/api/learn/lesson/${encodeURIComponent(lessonId)}/check`, {
      method: 'POST',
      body: JSON.stringify(answer),
    });
  },
  getLiveExercise(lessonId: string) {
    return requestJson<LiveExercise>(
      `/api/learn/lesson/${encodeURIComponent(lessonId)}/live-exercise`,
    );
  },
  checkLiveAnswer(lessonId: string, body: { answer: string; params: Record<string, unknown> }) {
    return requestJson<LiveExerciseResult>(
      `/api/learn/lesson/${encodeURIComponent(lessonId)}/live-check`,
      { method: 'POST', body: JSON.stringify(body) },
    );
  },
  getAssessment(level: string) {
    return requestJson<Assessment>(`/api/learn/assessment/${encodeURIComponent(level)}`);
  },
  submitAssessment(level: string, answers: Record<string, number>) {
    return requestJson<AssessmentResult>(`/api/learn/assessment/${encodeURIComponent(level)}`, {
      method: 'POST',
      body: JSON.stringify({ answers }),
    });
  },
  getMissions() {
    return requestJson<MissionsResponse>('/api/learn/missions');
  },
  acceptMission(missionId: string) {
    return requestJson<{ ok: boolean }>(`/api/learn/missions/${missionId}/accept`, {
      method: 'POST',
    });
  },
  abandonMission(missionId: string) {
    return requestJson<{ ok: boolean }>(`/api/learn/missions/${missionId}/abandon`, {
      method: 'POST',
    });
  },
  getDrill(category: string) {
    return requestJson<DrillDetail>(`/api/learn/missions/drills/${category}`);
  },
  gradeDrill(category: string, answers: Record<string, string>) {
    return requestJson<DrillGradeResponse>(`/api/learn/missions/drills/${category}/grade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers }),
    });
  },
  getPaperClosures() {
    return requestJson<{ items: PaperClosureRecord[] }>('/api/paper-trades/closures');
  },
  cancelPaperTrade(intentId: string) {
    return requestJson<{ ok: boolean }>(`/api/paper-trades/${intentId}/cancel`, {
      method: 'POST',
    });
  },
  closePaperPosition(symbolId: string) {
    return requestJson<{ closure: Record<string, unknown>; account: PaperAccount }>(
      `/api/paper-positions/${symbolId}/close`,
      { method: 'POST' },
    );
  },
  getTradeReview() {
    return requestJson<TradeReviewResponse>('/api/paper-trades/review');
  },
  getJournal() {
    return requestJson<JournalResponse>('/api/journal');
  },
  annotateTrade(intentId: string, annotation: JournalAnnotation) {
    return requestJson<JournalAnnotation & { intent_id: string }>(`/api/journal/${intentId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(annotation),
    });
  },
  parseNlAlert(text: string) {
    return requestJson<{
      ok: boolean;
      symbol?: string;
      condition?: string;
      preview?: string;
      source?: string;
      error?: string;
    }>(
      '/api/alerts/parse-nl',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      },
      30_000,
    );
  },
  getSurfaceInsight(surface: string) {
    return requestJson<{ summary: string; source: string }>(
      `/api/ai/insight/${surface}`,
      undefined,
      120_000,
    );
  },
  getDailyBrief() {
    return requestJson<{ summary: string; source: string }>(
      '/api/dashboard/brief',
      undefined,
      30_000,
    );
  },
  getCoachNarrative() {
    return requestJson<CoachNarrative>('/api/review/coach/narrative');
  },
  askTutor(lessonId: string, question: string) {
    return requestJson<TutorResponse>(`/api/learn/lesson/${lessonId}/tutor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
  },
  getReviewCoach() {
    return requestJson<CoachResponse>('/api/review/coach');
  },
  getConstitution() {
    return requestJson<ConstitutionResponse>('/api/constitution');
  },
  saveConstitution(rules: ConstitutionRules) {
    return requestJson<ConstitutionResponse>('/api/constitution', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rules),
    });
  },
  getConstitutionCompliance() {
    return requestJson<ConstitutionCompliance>('/api/constitution/compliance');
  },
  getMastery() {
    return requestJson<MasteryResponse>('/api/learn/mastery');
  },
  getLearnAnalytics() {
    return requestJson<LearnAnalytics>('/api/learn/analytics');
  },
  getCertificate(level: string) {
    return requestJson<LearnCertificate>(`/api/learn/certificate/${level}`);
  },
  getReviewQueue() {
    return requestJson<ReviewQueueResponse>('/api/learn/review-queue');
  },
  gradeReviewCard(term: string, grade: 'again' | 'good' | 'easy') {
    return requestJson<{ term: string; interval_days: number }>('/api/learn/review-grade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ term, grade }),
    });
  },
  narrateSignal(symbol: string, timeframe: string) {
    return requestJson<{ ai_explanation: string; narration_source: string }>(
      `/api/signals/narrate?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`,
      undefined,
      30_000,
    );
  },
  getContextSignals() {
    return requestJson<{ items: ContextSignal[] }>('/api/signals/context');
  },
  getRiskSignals() {
    return requestJson<{ items: RiskSignal[] }>('/api/signals/risk');
  },
  getGlossary() {
    return requestJson<GlossaryResponse>('/api/learn/glossary');
  },
  getReference() {
    return requestJson<ReferenceResponse>('/api/learn/reference');
  },
  getScenarios() {
    return requestJson<ScenariosResponse>('/api/learn/scenarios');
  },
  getScenario(scenarioId: string) {
    return requestJson<ScenarioDetail>(`/api/learn/scenarios/${scenarioId}`);
  },
  gradeScenario(scenarioId: string, answers: Record<string, string>) {
    return requestJson<ScenarioGradeResponse>(`/api/learn/scenarios/${scenarioId}/grade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers }),
    });
  },
  getLearnReadiness() {
    return requestJson<LearnReadiness>('/api/learn/readiness');
  },
  getLearnMoments() {
    return requestJson<LearnMomentsResponse>('/api/learn/moments');
  },
  getLearnProgress() {
    return requestJson<LearnProgress>('/api/learn/progress');
  },
  markLessonComplete(lessonId: string) {
    return requestJson<{ ok: boolean; lesson_id: string }>(
      `/api/learn/progress/${encodeURIComponent(lessonId)}/complete`,
      { method: 'POST' },
    );
  },
};

export function maskApiKeyValue(value: string): string {
  if (!value) return 'Not configured';
  if (value.length <= 4) return 'Configured';
  return `•••• •••• •••• ${value.slice(-4)}`;
}

function labelForProviderId(providerId: string | null | undefined, fallback: string): string {
  if (providerId === null) return '';
  if (providerId === undefined) return fallback;
  return providerLabelById[providerId] ?? providerId;
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
  liveTradingConfirmed = false,
): ProviderSettingsUpdateRequest {
  function providerIdOrNull(value: string) {
    return value ? (providerIdByLabel[value] ?? value) : null;
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
      live_trading_confirmed: tradingMode === 'live' && liveTradingConfirmed,
    },
  };
}

export function mapMarketCandlesToChartSeries(candles: MarketCandlesResponse['items']): Candle[] {
  return candles
    .map((candle) => {
      const timestamp =
        candle.open_time_utc.endsWith('Z') || candle.open_time_utc.includes('+')
          ? candle.open_time_utc
          : `${candle.open_time_utc}Z`;
      return {
        time: Math.floor(new Date(timestamp).getTime() / 1000),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
      };
    })
    .filter(
      (candle) =>
        Number.isFinite(candle.time) &&
        Number.isFinite(candle.open) &&
        Number.isFinite(candle.high) &&
        Number.isFinite(candle.low) &&
        Number.isFinite(candle.close) &&
        candle.high >= candle.low &&
        candle.time > 0,
    )
    .sort((left, right) => left.time - right.time);
}

// ---------------------------------------------------------------------------
// Interactive Learning Platform
// ---------------------------------------------------------------------------

export async function getLearnCatalog(baseUrl: string): Promise<LearnCatalogResponse> {
  const res = await fetch(`${baseUrl}/api/learn/catalog`, {
    signal: AbortSignal.timeout(DEFAULT_REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`GET /api/learn/catalog → ${res.status}`);
  return res.json() as Promise<LearnCatalogResponse>;
}

export async function getLearnLesson(baseUrl: string, lessonId: string): Promise<LessonRecord> {
  const res = await fetch(`${baseUrl}/api/learn/lesson/${encodeURIComponent(lessonId)}`, {
    signal: AbortSignal.timeout(DEFAULT_REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`GET /api/learn/lesson/${lessonId} → ${res.status}`);
  return res.json() as Promise<LessonRecord>;
}

export async function checkLessonAnswer(
  baseUrl: string,
  lessonId: string,
  answer: AnswerRequest,
): Promise<ExerciseResult> {
  const res = await fetch(`${baseUrl}/api/learn/lesson/${encodeURIComponent(lessonId)}/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(answer),
    signal: AbortSignal.timeout(DEFAULT_REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`POST /api/learn/lesson/${lessonId}/check → ${res.status}`);
  return res.json() as Promise<ExerciseResult>;
}

export async function getLearnProgress(baseUrl: string): Promise<LearnProgress> {
  const res = await fetch(`${baseUrl}/api/learn/progress`, {
    signal: AbortSignal.timeout(DEFAULT_REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`GET /api/learn/progress → ${res.status}`);
  return res.json() as Promise<LearnProgress>;
}

export async function markLessonComplete(baseUrl: string, lessonId: string): Promise<void> {
  const res = await fetch(
    `${baseUrl}/api/learn/progress/${encodeURIComponent(lessonId)}/complete`,
    {
      method: 'POST',
      signal: AbortSignal.timeout(DEFAULT_REQUEST_TIMEOUT_MS),
    },
  );
  if (!res.ok) throw new Error(`POST /api/learn/progress/${lessonId}/complete → ${res.status}`);
}
