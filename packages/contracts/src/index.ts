// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

export type MarketType = 'crypto' | 'stocks';
export type Timeframe = '15m' | '1h' | '4h' | '1d';
export type SignalType = 'BUY_ZONE' | 'SELL' | 'HOLD' | 'WAIT' | 'WATCH';
export type RiskLevel = 'low' | 'medium' | 'high';
export type TradingMode = 'paper' | 'live';
export type ViewMode = 'simple' | 'advanced';
export type ProviderCapability = 'ohlcv' | 'order_book' | 'news' | 'trading';
export type AlertChannel = 'desktop' | 'telegram' | 'email';
export type AlertStatus = 'armed' | 'paused' | 'fired';
export type PaperTradeSide = 'long' | 'short';
export type SignalStatus = 'active' | 'invalidated' | 'closed';

export interface ConfidenceBasis {
  trend_alignment: number;
  volume_confirmation: number;
  volatility_regime: 'compressed' | 'normal' | 'expanded';
  setup_type: string;
  backtested_winrate: number;
  backtested_expectancy_R: number;
  backtest_sample_size: number;
  out_of_sample_validated: boolean;
  // Engine v2 additions (optional for backward compatibility).
  market_regime?: 'trending' | 'ranging' | 'volatile' | 'transitional';
  out_of_sample_sample_size?: number;
  out_of_sample_expectancy_R?: number;
  pooled_sample_size?: number;
  pooled_winrate?: number;
  pooled_expectancy_R?: number;
  confluence_score?: number;
}

export interface CanonicalSignal {
  symbol: string;
  timeframe: Timeframe;
  signal: SignalType;
  risk_level: RiskLevel;
  confidence: number;
  confidence_basis: ConfidenceBasis;
  entry_zone: [number, number];
  stop_loss: number;
  take_profit: number[];
  risk_reward: number;
  fees_slippage_assumed: string;
  reasons: string[];
  invalidation: string;
  candle_status: 'closed';
  data_source: string;
  generated_at_utc: string;
  ai_explanation: string;
  disclaimer: string;
  // Engine v2 freshness + provenance additions (optional).
  data_age_seconds?: number;
  last_candle_close_at?: string;
  ingested_at?: string;
  narration_source?: string;
}

export interface ProviderRoute {
  primary: string;
  secondary?: string | null;
  fallback?: string | null;
}

export interface ProviderRoutes {
  crypto: ProviderRoute;
  stocks: ProviderRoute;
  news: ProviderRoute;
  ai: ProviderRoute;
  trading: ProviderRoute;
}

export interface SafetySettings {
  trading_mode: TradingMode;
  act_on_partial_candles: boolean;
  min_backtest_sample: number;
}

export interface RateLimitSettings {
  crypto_per_minute: number;
  stocks_per_minute: number;
}

export interface ProviderSettingsResponse {
  view_mode: ViewMode;
  routes: ProviderRoutes;
  rate_limits: RateLimitSettings;
  safety: SafetySettings;
}

export interface ProviderRegistryEntry {
  name: string;
  capabilities: ProviderCapability[];
  configured?: boolean;
  transport?: 'public' | 'keyed' | 'internal';
}

export interface ProviderRegistryResponse {
  providers: ProviderRegistryEntry[];
}

export interface WatchlistEntry {
  symbol: string;
  market_type: string;
  notes: string | null;
  created_at: string;
}

export interface WatchlistListResponse {
  items: WatchlistEntry[];
}

export interface WatchlistCreateRequest {
  symbol: string;
  market_type: string;
  notes?: string | null;
}

export interface WatchlistItemResponse {
  item: WatchlistEntry;
}

export interface WatchlistDeleteResponse {
  deleted: boolean;
  symbol: string;
}

export interface AlertRecord {
  id: string;
  symbolId: string;
  condition: string;
  channel: AlertChannel;
  status: AlertStatus;
  lastFired: string | null;
}

export interface AlertHistoryItem {
  id: string;
  symbolId: string;
  message: string;
  firedAt: string;
  channel: AlertChannel;
}

export interface AlertsListResponse {
  items: AlertRecord[];
}

export interface AlertHistoryListResponse {
  items: AlertHistoryItem[];
}

export interface AlertUpsertRequest {
  symbolId: string;
  condition: string;
  channel: AlertChannel;
  status?: AlertStatus;
}

export interface AlertItemResponse {
  item: AlertRecord;
}

export interface AiSettings {
  model: string;
  cloudEnabled: boolean;
}

export interface AiSettingsResponse {
  ai: AiSettings;
}

export interface ApiKeyField {
  id: string;
  label: string;
  value: string;
  note: string;
  tradeEnabled: boolean;
  secret: boolean;
}

export interface ApiKeySettingsResponse {
  items: ApiKeyField[];
}

export interface ApiKeyUpdateRequest {
  value: string;
}

export interface ApiKeyItemResponse {
  item: ApiKeyField;
}

export type NotificationTestChannel = 'telegram' | 'email';

export interface NotificationTestResponse {
  channel: NotificationTestChannel;
  delivered: boolean;
  detail: string;
}

export interface ProviderSettingsUpdateRequest extends ProviderSettingsResponse {}

export interface PaperPosition {
  symbolId: string;
  side: PaperTradeSide;
  quantity: number;
  averagePrice: number;
  pnl: number;
}

export interface PaperAccount {
  balance: number;
  buyingPower: number;
  openPositions: PaperPosition[];
  realizedPnl: number;
}

export interface PaperAccountResponse {
  account: PaperAccount;
}

export interface SavedStrategy {
  id: string;
  name: string;
  symbolId: string;
  setupType: string;
  timeframe: Timeframe;
  savedAt: string;
}

export interface SavedStrategyListResponse {
  items: SavedStrategy[];
}

export interface SavedStrategyCreateRequest extends SavedStrategy {}

export interface SavedStrategyItemResponse {
  item: SavedStrategy;
}

export interface PaperTradeIntentRequest {
  signalId: string;
  symbol: string;
  side: PaperTradeSide;
  quantity: number;
  entryPrice: number;
}

export interface PaperTradeIntentRecord {
  id: string;
  signalId: string;
  symbol: string;
  side: PaperTradeSide;
  quantity: number;
  entryPrice: number;
  tradingMode: TradingMode;
  submittedAt: string;
}

export interface PaperTradeIntentListResponse {
  items: PaperTradeIntentRecord[];
}

export interface PaperTradeIntentResponse {
  accepted: boolean;
  tradingMode: TradingMode;
  submittedAt: string;
  account: PaperAccount;
  trade: PaperTradeIntentRecord;
}

export interface SignalRecord {
  id: string;
  symbolId: string;
  marketType: MarketType;
  status: SignalStatus;
  signal: CanonicalSignal;
}

export interface SignalsListResponse {
  items: SignalRecord[];
}

export interface NewsItem {
  id: string;
  symbol: string;
  headline: string;
  source: string;
  publishedAt: string;
  summary: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  // True when the item is derived locally from market data rather than a live news provider.
  derived?: boolean;
}

export interface NewsListResponse {
  items: NewsItem[];
}

export interface BacktestMetrics {
  winRate: number;
  avgR: number;
  expectancy: number;
  maxDrawdown: number;
  sharpe: number;
  sortino: number;
  profitFactor: number;
  tradeCount: number;
  testPeriod: string;
  inSampleWinRate: number;
  outOfSampleWinRate: number;
}

export interface StrategyPreset {
  id: string;
  name: string;
  symbolId: string;
  setupType: string;
  timeframe: Timeframe;
  feesPercent: number;
  slippagePercent: number;
  trainTestSplit: number;
  walkForward: boolean;
  metrics: BacktestMetrics;
  equityCurve: number[];
  drawdownCurve: number[];
}

export interface BacktestPresetListResponse {
  items: StrategyPreset[];
}

export interface BacktestRunRequest {
  symbolId: string;
  marketType: MarketType;
  timeframe: Timeframe;
  setupType: string;
  feesPercent: number;
  slippagePercent: number;
  trainTestSplit: number;
  walkForward: boolean;
}

export interface BacktestRunResponse {
  item: StrategyPreset;
}

export interface MarketCandle {
  open_time_utc: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CorridorIngestResult {
  symbol: string;
  market_type: MarketType;
  timeframe: Timeframe | '1d';
  provider: string;
  candles_ingested: number;
  latest_close: number;
  latest_open_time_utc: string;
  diagnostics: string[];
}

export interface CorridorIngestResponse {
  refreshed_at_utc: string;
  items: CorridorIngestResult[];
}

export interface MarketIntegrityDiagnostic {
  symbol: string;
  market_type: MarketType;
  timeframe: Timeframe | '1d';
  provider: string;
  severity: 'warning' | 'error';
  code: string;
  detail: string;
  observed_at_utc: string;
}

export interface MarketIntegrityDiagnosticsResponse {
  items: MarketIntegrityDiagnostic[];
}

export interface MarketCandlesResponse {
  symbol: string;
  timeframe: Timeframe | '1d';
  source: string | null;
  items: MarketCandle[];
}

export interface RelativeStrengthRanking {
  symbol: string;
  market_type: string;
  timeframe: Timeframe | '1d';
  source: string | null;
  last_close: number;
  trailing_returns: Record<string, number>;
  momentum_score: number;
  trend: 'up' | 'down' | 'neutral';
  relative_strength_percentile: number;
  peer_group_size: number;
  peer_rank: number;
}

export interface MarketRankingResponse {
  generated_at_utc: string;
  items: RelativeStrengthRanking[];
}

export interface BackendHealthResponse {
  service: string;
  status: string;
  scheduler: {
    running: boolean;
    jobs: string[];
    last_heartbeat_utc: string | null;
  };
  storage: {
    sqlite_path: string;
    analytics: {
      duckdb_path: string;
      parquet_dir: string;
    };
  };
}