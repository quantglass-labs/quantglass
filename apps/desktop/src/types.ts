import type {
  AiSettings,
  ApiKeyField,
  AlertHistoryItem,
  AlertRecord,
  BacktestMetrics,
  CanonicalSignal,
  ConfidenceBasis,
  CorridorIngestResult,
  MarketRankingResponse,
  MarketType,
  NewsItem,
  NotificationTestChannel,
  NotificationTestResponse,
  PaperAccount,
  PaperPosition,
  ProviderRegistryEntry,
  RelativeStrengthRanking,
  RiskLevel,
  SavedStrategy,
  SignalRecord,
  SignalStatus,
  SignalType,
  StrategyPreset,
  Timeframe,
  TradingMode,
  ViewMode,
} from '@alphaterminal/contracts';

export type {
  AiSettings,
  ApiKeyField,
  AlertHistoryItem,
  AlertRecord,
  BacktestMetrics,
  CanonicalSignal,
  ConfidenceBasis,
  CorridorIngestResult,
  MarketRankingResponse,
  MarketType,
  NewsItem,
  NotificationTestChannel,
  NotificationTestResponse,
  PaperAccount,
  PaperPosition,
  ProviderRegistryEntry,
  RelativeStrengthRanking,
  RiskLevel,
  SavedStrategy,
  SignalRecord,
  SignalStatus,
  SignalType,
  StrategyPreset,
  Timeframe,
  TradingMode,
  ViewMode,
} from '@alphaterminal/contracts';

export type ScreenState = 'loading' | 'ready' | 'error';
export type BackendStatus = 'connecting' | 'online' | 'offline';

export interface SymbolRecord {
  id: string;
  symbol: string;
  name: string;
  marketType: MarketType;
  venue: string;
  lastPrice: number;
  changePercent: number;
  sparkline: number[];
  sector?: string;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ProviderSettings {
  viewMode: ViewMode;
  cryptoPrimary: string;
  cryptoSecondary: string;
  cryptoFallback: string;
  stocksPrimary: string;
  stocksSecondary: string;
  stocksFallback: string;
  cryptoRateLimitPerMinute: number;
  stocksRateLimitPerMinute: number;
}
