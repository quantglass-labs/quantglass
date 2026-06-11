// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

export type MarketType = 'crypto' | 'stocks';
export type Timeframe = '15m' | '1h' | '4h' | '1d';
export type SignalType = 'BUY_ZONE' | 'SELL' | 'HOLD' | 'WAIT' | 'WATCH';
export type RiskLevel = 'low' | 'medium' | 'high';
export type TradingMode = 'paper' | 'live';
export type ViewMode = 'simple' | 'advanced';
export type ProviderCapability = 'ohlcv' | 'order_book' | 'news' | 'trading' | 'ai';
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
  conformal_coverage?: number | null;
  conformal_lower_r?: number | null;
  conformal_upper_r?: number | null;
  conformal_sample_size?: number;
  conformal_guaranteed?: boolean;
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
  live_trading_confirmed: boolean;
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
  label?: string;
  source?: 'builtin' | 'custom' | 'extension';
  baseUrl?: string;
  authType?: CustomProviderAuthType;
  profileConfigured?: boolean;
  adapterStatus?: 'available' | 'profile_only';
  notes?: string;
}

export interface ProviderRegistryResponse {
  providers: ProviderRegistryEntry[];
}

export type CustomProviderAuthType = 'none' | 'bearer' | 'api_key_header' | 'api_key_query';

export interface CustomProviderProfile {
  id: string;
  label: string;
  baseUrl: string;
  authType: CustomProviderAuthType;
  apiKeyId?: string | null;
  apiKeyHeader?: string | null;
  apiKeyQueryParam?: string | null;
  capabilities: ProviderCapability[];
  enabled: boolean;
  notes?: string;
}

export interface CustomProviderListResponse {
  providers: CustomProviderProfile[];
}

export interface CustomProviderItemResponse {
  provider: CustomProviderProfile;
}

export interface CustomProviderUpsertRequest extends Omit<CustomProviderProfile, 'id' | 'apiKeyId'> {
  id?: string | null;
  apiKeyId?: string | null;
}

export interface CustomProviderDeleteResponse {
  deleted: boolean;
  providerId: string;
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
  provider:
    | 'template'
    | 'ollama'
    | 'lm_studio'
    | 'vllm'
    | 'llama_cpp'
    | 'openai'
    | 'anthropic'
    | 'google_gemini'
    | 'deepseek'
    | 'mistral'
    | 'groq'
    | 'openrouter'
    | 'together'
    | 'azure_openai'
    | 'bedrock'
    | 'vertex'
    | 'openai_compatible';
  baseUrl: string;
  apiKeyId?: string | null;
  temperature: number;
  maxTokens: number;
  requestTimeoutSeconds: number;
}

export interface AiSettingsResponse {
  ai: AiSettings;
}

export interface AiModelListRequest {
  provider: AiSettings['provider'];
  baseUrl: string;
  apiKeyId?: string | null;
  requestTimeoutSeconds?: number;
}

export interface AiProviderTestRequest extends AiModelListRequest {
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AiModelInfo {
  id: string;
  label?: string | null;
  description?: string | null;
  runtimeStatus?: 'available' | 'loaded' | 'not_loaded' | 'loading' | 'busy' | 'not_installed' | 'unavailable' | 'unknown';
  runtimeDetail?: string | null;
  created?: number | null;
  createdAt?: string | null;
  ownedBy?: string | null;
  inputTokenLimit?: number | null;
  outputTokenLimit?: number | null;
  supportedGenerationMethods?: string[];
}

export interface AiModelListResponse {
  provider: AiSettings['provider'];
  models: string[];
  modelItems?: AiModelInfo[];
  fetched: boolean;
  detail: string;
  source?: string;
  fetchedAtUtc?: string;
}

export interface AiProviderTestResponse {
  provider: AiSettings['provider'];
  model: string;
  ok: boolean;
  detail: string;
  runtimeStatus?: 'available' | 'loaded' | 'not_loaded' | 'loading' | 'busy' | 'not_installed' | 'unavailable' | 'unknown';
  runtimeDetail?: string | null;
  source?: string;
  sample?: string;
  elapsedMs: number;
  testedAtUtc: string;
}

export interface ApiKeyField {
  id: string;
  label: string;
  value: string;
  note: string;
  tradeEnabled: boolean;
  secret: boolean;
  configured?: boolean;
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

export type NotificationTestChannel = AlertChannel;

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

export interface SavedStrategyDeleteResponse {
  deleted: boolean;
  id: string;
}

export interface PaperTradeIntentRequest {
  signalId: string;
  symbol: string;
  side: PaperTradeSide;
  quantity: number;
  entryPrice: number;
  planStop?: number;
  planTarget?: number;
  planRiskPercent?: number;
  planReason?: string;
  planEmotion?: string;
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
  strategyId?: string | null;
  strategyName?: string | null;
  strategySource?: 'built-in' | 'extension' | null;
  extensionId?: string | null;
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

export interface ExtensionRegistryEntry {
  id: string;
  name: string;
  version: string;
  description: string;
  capabilities: string[];
  permissions: string[];
  settings: ExtensionSettingDefinition[];
  homepage?: string | null;
  loaded: boolean;
  enabled: boolean;
  diagnostics: string[];
  health: Record<string, unknown>;
}

export interface ExtensionRegistryResponse {
  extensions: ExtensionRegistryEntry[];
}

export interface ExtensionSettingDefinition {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'secret';
  description: string;
  required: boolean;
  default?: string | number | boolean | null;
  options: string[];
}

export interface ExtensionSettingsResponse {
  extensionId: string;
  settings: Record<string, unknown>;
  schema: ExtensionSettingDefinition[];
  requiresRestart?: boolean;
}

export interface ExtensionHealthResponse {
  health: Record<string, unknown>;
}

export interface StrategyRegistryEntry {
  id: string;
  name: string;
  description: string;
  setup_types: string[];
  direction: 'long' | 'short' | 'both';
  market_types: string[];
  timeframes: string[];
  source: 'built-in' | 'extension';
  extension_id?: string | null;
  executable?: boolean;
}

export interface StrategyRegistryResponse {
  strategies: StrategyRegistryEntry[];
}

export interface IndicatorRegistryEntry {
  id: string;
  name: string;
  category: string;
  description: string;
  inputs: string[];
  outputs: string[];
  maturity?: 'computed' | 'catalog';
  families?: string[];
  source: 'built-in' | 'extension';
  extension_id?: string | null;
}

export interface IndicatorRegistryResponse {
  indicators: IndicatorRegistryEntry[];
}

export interface ExtensionSurfaceEntry {
  id: string;
  name: string;
  category: 'backtest' | 'execution' | 'notification' | 'import_export' | 'data_quality' | 'ui_panel';
  description: string;
  permissions: string[];
  maturity: 'available' | 'planned';
  source: 'built-in' | 'extension';
  extension_id?: string | null;
}

export interface ExtensionSurfaceRegistryResponse {
  surfaces: ExtensionSurfaceEntry[];
}

// ---------------------------------------------------------------------------
// Interactive Learning Platform
// ---------------------------------------------------------------------------

export type LessonTier = 'novice' | 'intermediate' | 'advanced' | 'expert';
export type ExerciseType = 'multiple_choice' | 'numeric_input' | 'identify_on_chart' | 'interpret_signal';

export interface LessonKeyTerm {
  term: string;
  definition: string;
}

export interface LessonExerciseMultipleChoice {
  type: 'multiple_choice';
  question: string;
  options: string[];
  /** The 0-based index of the correct option — omitted from client GET responses; used internally. */
  correct_index?: number;
  explanation: string;
}

export interface LessonExerciseNumericInput {
  type: 'numeric_input';
  question: string;
  hint?: string;
  explanation: string;
}

export type LessonExercise = LessonExerciseMultipleChoice | LessonExerciseNumericInput;

export interface LessonLiveApply {
  screen: string;
  cta: string;
}

/** Full lesson detail returned by GET /api/learn/lesson/:id */
export interface LessonRecord {
  id: string;
  module_id: string;
  tier: LessonTier;
  order: number;
  title: string;
  summary: string;
  concept: string;
  key_terms: LessonKeyTerm[];
  exercise: LessonExercise;
  live_apply: LessonLiveApply;
  live_exercise?: string;
  visuals?: { type: string; title?: string; params?: Record<string, unknown> }[];
  /** True when the authenticated user has completed this lesson. */
  completed: boolean;
}

/** Lightweight summary returned inside module listings */
export interface LessonStub {
  id: string;
  order: number;
  title: string;
  summary: string;
  tier: LessonTier;
  completed: boolean;
}

export interface TierProgress {
  total: number;
  completed: number;
}

export interface LearnProgress {
  total: number;
  completed: number;
  by_tier: Record<LessonTier, TierProgress>;
}

export interface LearnTrack {
  id: string;
  level: LessonTier;
  order: number;
  title: string;
  description: string;
  lessons: LessonStub[];
  completed: number;
  total: number;
}

export interface LearnLevel {
  id: LessonTier;
  title: string;
  description: string;
  tracks: LearnTrack[];
  completed: number;
  total: number;
}

export interface LearnCatalogResponse {
  levels: LearnLevel[];
  progress: LearnProgress;
}

export interface LearnMoment {
  id: string;
  type: string;
  lesson_id: string;
  severity: number;
  message: string;
  evidence: Record<string, unknown>;
  lesson_completed: boolean;
}

export interface AssessmentQuestion {
  lesson_id: string;
  title: string;
  question: string;
  options: string[];
}

export interface Assessment {
  level: LessonTier;
  pass_percent: number;
  questions: AssessmentQuestion[];
}

export interface AssessmentResult {
  level: LessonTier;
  score: number;
  passed: boolean;
  pass_percent: number;
  results: { lesson_id: string; correct: boolean; explanation: string }[];
}

export interface ReadinessRequirement {
  label: string;
  met: boolean;
}

export interface ReadinessLevel {
  id: LessonTier;
  unlocked: boolean;
  requirements: ReadinessRequirement[];
}

export interface LearnReadiness {
  scores: {
    knowledge: number;
    execution: number;
    risk: number;
    psychology: number;
    consistency: number;
  };
  levels: ReadinessLevel[];
  executed_trades: number;
  active_moments: string[];
}

export interface LearnMomentsResponse {
  items: LearnMoment[];
}

export interface AnswerRequest {
  answer: string;
}

export interface ExerciseResult {
  correct: boolean;
  explanation: string;
  score: number;
}

export interface LiveExercise {
  lesson_id: string;
  type: 'live_numeric';
  question: string;
  hint: string;
  params: Record<string, number | string>;
  tolerance_percent: number;
}

export interface LiveExerciseResult extends ExerciseResult {
  expected: number;
}
