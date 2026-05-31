import { CloudOff, KeyRound, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, DataStateView, EmptyState, ErrorState, LoadingSkeleton, Panel, PillTabs, SectionHeading } from '../components/ui';
import { maskApiKeyValue, providerLabelById } from '../lib/backend';
import { formatDateTime } from '../lib/format';
import type { AiSettings, ApiKeyField, NotificationTestChannel, ProviderRegistryEntry, ProviderSettings, SavedStrategy, ScreenState, TradingMode, ViewMode } from '../types';

type SettingsTab = 'providers' | 'keys' | 'risk' | 'ai' | 'strategies';

export function SettingsScreen({
  state,
  providerSettings,
  providerRegistry,
  apiKeys,
  aiSettings,
  tradingMode,
  minBacktestSample,
  savedStrategies,
  onSaveApiKey,
  onTestNotification,
  onRequestLiveTrading,
  onChangeProviderView,
  onUpdateProviderSetting,
  onSetTradingMode,
  onSetMinBacktestSample,
  onSetAiModel,
  onSetCloudEnabled,
}: {
  state: ScreenState;
  providerSettings: ProviderSettings;
  providerRegistry: ProviderRegistryEntry[];
  apiKeys: ApiKeyField[];
  aiSettings: AiSettings;
  tradingMode: TradingMode;
  minBacktestSample: number;
  savedStrategies: SavedStrategy[];
  onSaveApiKey: (keyId: string, value: string) => void;
  onTestNotification: (channel: NotificationTestChannel) => void;
  onRequestLiveTrading: () => void;
  onChangeProviderView: (viewMode: ViewMode) => void;
  onUpdateProviderSetting: <K extends keyof ProviderSettings>(key: K, value: ProviderSettings[K]) => void;
  onSetTradingMode: (mode: TradingMode) => void;
  onSetMinBacktestSample: (value: number) => void;
  onSetAiModel: (model: string) => void;
  onSetCloudEnabled: (enabled: boolean) => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = (searchParams.get('tab') as SettingsTab | null) ?? 'providers';
  const tab = useMemo<SettingsTab>(() => {
    if (['providers', 'keys', 'risk', 'ai', 'strategies'].includes(currentTab)) {
      return currentTab as SettingsTab;
    }
    return 'providers';
  }, [currentTab]);
  const providerRegistryByLabel = useMemo(
    () => new Map(providerRegistry.map((entry) => [providerLabelById[entry.name] ?? entry.name, entry])),
    [providerRegistry],
  );
  const [draftApiKeys, setDraftApiKeys] = useState<Record<string, string>>({});
  const retryMockView = () => window.location.reload();
  const notificationTestFieldMap: Partial<Record<string, NotificationTestChannel>> = {
    'telegram-chat-id': 'telegram',
    'smtp-to-email': 'email',
  };
  const apiKeySections = useMemo(() => {
    const telegramIds = new Set(['telegram-bot-token', 'telegram-chat-id']);
    const emailIds = new Set(['smtp-host', 'smtp-port', 'smtp-username', 'smtp-password', 'smtp-from-email', 'smtp-to-email']);

    return [
      {
        id: 'providers',
        title: 'Provider credentials',
        description: 'Market data and trading-provider credentials that affect registry availability and keyed transports.',
        items: apiKeys.filter((field) => !telegramIds.has(field.id) && !emailIds.has(field.id)),
      },
      {
        id: 'telegram',
        title: 'Telegram delivery',
        description: 'Saved bot token and chat destination for Telegram alert delivery and test sends.',
        items: apiKeys.filter((field) => telegramIds.has(field.id)),
      },
      {
        id: 'email',
        title: 'Email delivery',
        description: 'SMTP host, authentication, sender, and recipients used for email alerts and test sends.',
        items: apiKeys.filter((field) => emailIds.has(field.id)),
      },
    ].filter((section) => section.items.length > 0);
  }, [apiKeys]);

  useEffect(() => {
    setDraftApiKeys(Object.fromEntries(apiKeys.map((field) => [field.id, field.value])));
  }, [apiKeys]);

  function renderProviderMeta(label: string) {
    if (!label) {
      return <p className="text-xs text-muted">No provider selected.</p>;
    }

    const entry = providerRegistryByLabel.get(label);
    if (!entry) {
      return <p className="text-xs text-muted">Registry metadata unavailable for {label}.</p>;
    }

    const configuredLabel = entry.configured ? 'configured' : 'needs setup';
    const configuredTone = entry.configured ? 'text-buy' : 'text-hold';
    const transportLabel = entry.transport ?? 'internal';

    return (
      <div className="flex flex-wrap gap-2 text-xs">
        <span className={`rounded-full border border-border px-2.5 py-1 ${configuredTone}`}>{configuredLabel}</span>
        <span className="rounded-full border border-border px-2.5 py-1 text-muted">{transportLabel}</span>
      </div>
    );
  }

  const providerInventory = useMemo(
    () => providerRegistry.filter((entry) => entry.capabilities.includes('ohlcv') || entry.capabilities.includes('news') || entry.capabilities.includes('trading')),
    [providerRegistry],
  );

  return (
    <div className="space-y-8">
      <SectionHeading
        eyebrow="Settings"
        title="Provider, safety, AI, and strategy controls"
        description="Simple/Advanced provider routing, masked API keys, paper/live safety controls, model selection, and saved strategies from the backtest screen."
      />

      <PillTabs
        value={tab}
        onChange={(value) => setSearchParams({ tab: value })}
        options={[
          { value: 'providers', label: 'Providers' },
          { value: 'keys', label: 'API Keys' },
          { value: 'risk', label: 'Risk & Safety' },
          { value: 'ai', label: 'AI' },
          { value: 'strategies', label: 'Strategies' },
        ]}
      />

      <Panel>
        <DataStateView
          state={state}
          loading={<LoadingSkeleton rows={5} />}
          error={<ErrorState title="Settings unavailable" description="The settings surface could not be loaded." onRetry={retryMockView} />}
          populated={
            <>
              {tab === 'providers' ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between gap-4 rounded-3xl border border-border bg-white/[0.03] p-4">
                    <div>
                      <p className="font-medium text-ink">Provider mode</p>
                      <p className="text-sm text-muted">Choose between a simplified UI and explicit provider priority routing.</p>
                    </div>
                    <PillTabs
                      value={providerSettings.viewMode}
                      onChange={onChangeProviderView}
                      options={[
                        { value: 'simple', label: 'Simple' },
                        { value: 'advanced', label: 'Advanced' },
                      ]}
                    />
                  </div>
                  <div className="rounded-3xl border border-watch/25 bg-watch/10 p-4 text-sm text-muted">
                    US build defaults only expose US-compliant venues and data providers. Binance.com global, OKX, and Bybit are intentionally excluded; use Coinbase, Kraken, Gemini, Alpaca, Finnhub, and cached metadata providers in this build.
                  </div>
                  <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Provider registry status</p>
                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                      {providerInventory.length ? providerInventory.map((entry) => (
                        <div key={entry.name} className="rounded-2xl border border-border bg-surface/40 px-4 py-3 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium text-ink">{providerLabelById[entry.name] ?? entry.name}</span>
                            <div className="flex flex-wrap gap-2 text-xs">
                              <span className={`rounded-full border border-border px-2.5 py-1 ${entry.configured ? 'text-buy' : 'text-hold'}`}>{entry.configured ? 'configured' : 'needs setup'}</span>
                              <span className="rounded-full border border-border px-2.5 py-1 text-muted">{entry.transport ?? 'internal'}</span>
                            </div>
                          </div>
                          <p className="mt-2 text-xs text-muted">Capabilities: {entry.capabilities.join(', ') || 'none'}</p>
                        </div>
                      )) : <p className="text-sm text-muted">Registry metadata is unavailable while the backend is offline.</p>}
                    </div>
                  </div>
                  {providerSettings.viewMode === 'simple' ? (
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Crypto provider</p>
                        <p className="mt-3 text-lg font-medium text-ink">Auto</p>
                        <p className="mt-2 text-sm text-muted">Uses {providerSettings.cryptoPrimary} for exchange-native candles and quotes, {providerSettings.cryptoSecondary} for broad metadata, and falls back to {providerSettings.cryptoFallback} if needed.</p>
                      </div>
                      <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Stocks provider</p>
                        <p className="mt-3 text-lg font-medium text-ink">Auto</p>
                        <p className="mt-2 text-sm text-muted">Uses {providerSettings.stocksPrimary} first, then {providerSettings.stocksSecondary}, then {providerSettings.stocksFallback}. Paid APIs remain off unless you switch to advanced mode.</p>
                      </div>
                      <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">AI</p>
                        <p className="mt-3 text-lg font-medium text-ink">Local Ollama</p>
                        <p className="mt-2 text-sm text-muted">Cloud narration stays off by default in simple mode to preserve the local-first hot path.</p>
                      </div>
                      <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Trading</p>
                        <p className="mt-3 text-lg font-medium text-ink">Paper only</p>
                        <p className="mt-2 text-sm text-muted">Live execution remains disabled by default and still requires the Risk & Safety confirm gate.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Crypto routing</p>
                        <div className="mt-4 grid gap-3 text-sm text-muted">
                          <label className="space-y-2">
                            <span className="block text-xs font-semibold uppercase tracking-[0.18em]">Primary</span>
                            <select className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none" value={providerSettings.cryptoPrimary} onChange={(event) => onUpdateProviderSetting('cryptoPrimary', event.target.value)}>
                              <option value="Coinbase">Coinbase</option>
                              <option value="Kraken">Kraken</option>
                              <option value="Gemini">Gemini</option>
                            </select>
                            {renderProviderMeta(providerSettings.cryptoPrimary)}
                          </label>
                          <label className="space-y-2">
                            <span className="block text-xs font-semibold uppercase tracking-[0.18em]">Secondary metadata</span>
                            <select className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none" value={providerSettings.cryptoSecondary} onChange={(event) => onUpdateProviderSetting('cryptoSecondary', event.target.value)}>
                              <option value="">None</option>
                              <option value="CoinGecko">CoinGecko</option>
                              <option value="CoinMarketCap">CoinMarketCap</option>
                            </select>
                            {renderProviderMeta(providerSettings.cryptoSecondary)}
                          </label>
                          <label className="space-y-2">
                            <span className="block text-xs font-semibold uppercase tracking-[0.18em]">Fallback exchange</span>
                            <select className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none" value={providerSettings.cryptoFallback} onChange={(event) => onUpdateProviderSetting('cryptoFallback', event.target.value)}>
                              <option value="">None</option>
                              <option value="Kraken">Kraken</option>
                              <option value="Coinbase">Coinbase</option>
                              <option value="Gemini">Gemini</option>
                            </select>
                            {renderProviderMeta(providerSettings.cryptoFallback)}
                          </label>
                          <label className="space-y-2">
                            <span className="block text-xs font-semibold uppercase tracking-[0.18em]">Rate limit per minute</span>
                            <input className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none" type="number" min="1" max="240" value={providerSettings.cryptoRateLimitPerMinute} onChange={(event) => onUpdateProviderSetting('cryptoRateLimitPerMinute', Number(event.target.value))} />
                          </label>
                          <p className="text-xs text-muted">Exchange-native candles and quotes come from the primary/fallback exchange. Broad discovery metadata stays on the secondary provider to match the cost-controlled adapter design.</p>
                        </div>
                      </div>
                      <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Stocks routing</p>
                        <div className="mt-4 grid gap-3 text-sm text-muted">
                          <label className="space-y-2">
                            <span className="block text-xs font-semibold uppercase tracking-[0.18em]">Primary</span>
                            <select className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none" value={providerSettings.stocksPrimary} onChange={(event) => onUpdateProviderSetting('stocksPrimary', event.target.value)}>
                              <option value="Yahoo Finance">Yahoo Finance</option>
                              <option value="Alpaca">Alpaca</option>
                              <option value="Finnhub">Finnhub</option>
                              <option value="Polygon">Polygon</option>
                              <option value="Twelve Data">Twelve Data</option>
                            </select>
                            {renderProviderMeta(providerSettings.stocksPrimary)}
                          </label>
                          <label className="space-y-2">
                            <span className="block text-xs font-semibold uppercase tracking-[0.18em]">Secondary</span>
                            <select className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none" value={providerSettings.stocksSecondary} onChange={(event) => onUpdateProviderSetting('stocksSecondary', event.target.value)}>
                              <option value="">None</option>
                              <option value="Yahoo Finance">Yahoo Finance</option>
                              <option value="Finnhub">Finnhub</option>
                              <option value="Alpaca">Alpaca</option>
                              <option value="Polygon">Polygon</option>
                              <option value="Twelve Data">Twelve Data</option>
                            </select>
                            {renderProviderMeta(providerSettings.stocksSecondary)}
                          </label>
                          <label className="space-y-2">
                            <span className="block text-xs font-semibold uppercase tracking-[0.18em]">Fallback</span>
                            <select className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none" value={providerSettings.stocksFallback} onChange={(event) => onUpdateProviderSetting('stocksFallback', event.target.value)}>
                              <option value="">None</option>
                              <option value="Yahoo Finance">Yahoo Finance</option>
                              <option value="Twelve Data">Twelve Data</option>
                              <option value="Finnhub">Finnhub</option>
                              <option value="Alpaca">Alpaca</option>
                              <option value="Polygon">Polygon</option>
                            </select>
                            {renderProviderMeta(providerSettings.stocksFallback)}
                          </label>
                          <label className="space-y-2">
                            <span className="block text-xs font-semibold uppercase tracking-[0.18em]">Rate limit per minute</span>
                            <input className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none" type="number" min="1" max="240" value={providerSettings.stocksRateLimitPerMinute} onChange={(event) => onUpdateProviderSetting('stocksRateLimitPerMinute', Number(event.target.value))} />
                          </label>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              {tab === 'keys' ? (
                <div className="space-y-4">
                  <div className="rounded-3xl border border-border bg-white/[0.03] p-4 text-sm text-muted">
                    Notification tests use the saved backend values below. Save changes first, then use the Telegram or Email test action on the corresponding delivery field.
                  </div>
                  {apiKeySections.map((section) => (
                    <div key={section.id} className="space-y-4">
                      <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{section.title}</p>
                        <p className="mt-2 text-sm text-muted">{section.description}</p>
                      </div>
                      {section.items.map((field) => (
                        <div key={field.id} className="rounded-3xl border border-border bg-white/[0.03] p-4">
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <p className="font-medium text-ink">{field.label}</p>
                              <p className="text-sm text-muted">{field.note}</p>
                            </div>
                            <KeyRound className="size-5 text-accent" />
                          </div>
                          <div className="mt-4 rounded-2xl border border-border bg-surface/40 px-4 py-3 metric-text text-sm text-ink">{field.secret ? maskApiKeyValue(field.value) : (field.value || 'Not configured')}</div>
                          <label className="mt-4 block space-y-2 text-sm text-muted">
                            <span className="block text-xs font-semibold uppercase tracking-[0.18em]">Stored value</span>
                            <input
                              className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                              type={field.secret ? 'password' : 'text'}
                              autoComplete="off"
                              value={draftApiKeys[field.id] ?? ''}
                              onChange={(event) =>
                                setDraftApiKeys((current) => ({
                                  ...current,
                                  [field.id]: event.target.value,
                                }))
                              }
                            />
                          </label>
                          <div className="mt-4 flex flex-wrap items-center gap-3">
                            <Button onClick={() => onSaveApiKey(field.id, draftApiKeys[field.id] ?? '')}>Save key</Button>
                            {notificationTestFieldMap[field.id] ? (
                              <Button variant="ghost" onClick={() => onTestNotification(notificationTestFieldMap[field.id] as NotificationTestChannel)}>
                                Send {notificationTestFieldMap[field.id] === 'telegram' ? 'Telegram' : 'Email'} test
                              </Button>
                            ) : null}
                            <Button
                              variant="secondary"
                              onClick={() =>
                                setDraftApiKeys((current) => ({
                                  ...current,
                                  [field.id]: field.value,
                                }))
                              }
                            >
                              Reset
                            </Button>
                          </div>
                          {field.tradeEnabled ? <p className="mt-2 text-xs text-hold">Trade-enabled key</p> : <p className="mt-2 text-xs text-muted">Provider, notification, or delivery-scope setting</p>}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : null}

              {tab === 'risk' ? (
                <div className="space-y-5">
                  <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium text-ink">Trading mode</p>
                        <p className="text-sm text-muted">Default is paper. Live mode is gated behind an explicit confirm dialog, and only paper execution is implemented today.</p>
                      </div>
                      <ShieldCheck className="size-5 text-accent" />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <Button variant={tradingMode === 'paper' ? 'primary' : 'secondary'} onClick={() => onSetTradingMode('paper')}>paper</Button>
                      <button type="button" title="Enable in Settings → Risk & Safety; paper trading only by default" className="rounded-2xl border border-border bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-muted" onClick={onRequestLiveTrading}>
                        live
                      </button>
                      <Button variant="ghost" onClick={() => setSearchParams({ tab: 'keys' })}>Go to API Keys</Button>
                    </div>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
                      <p className="font-medium text-ink">Partial candles</p>
                      <p className="mt-2 text-sm text-muted">`act_on_partial_candles = false` is enforced in the current build. Signals use closed candles only.</p>
                    </div>
                    <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
                      <p className="font-medium text-ink">Minimum backtest sample</p>
                      <input className="mt-4 w-full" type="range" min="20" max="150" step="5" value={minBacktestSample} onChange={(event) => onSetMinBacktestSample(Number(event.target.value))} />
                      <p className="mt-2 text-sm text-muted">{minBacktestSample} trades. Strategies below this threshold show a warning badge in Backtesting.</p>
                    </div>
                  </div>
                </div>
              ) : null}

              {tab === 'ai' ? (
                <div className="space-y-5">
                  <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-medium text-ink">Ollama model</p>
                        <p className="text-sm text-muted">Narration only. The deterministic engine remains the source of truth.</p>
                      </div>
                      <SlidersHorizontal className="size-5 text-accent" />
                    </div>
                    <select className="mt-4 w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none" value={aiSettings.model} onChange={(event) => onSetAiModel(event.target.value)}>
                      <option value="qwen3:14b-q4_K_M">qwen3:14b-q4_K_M</option>
                      <option value="llama3.3:8b-instruct">llama3.3:8b-instruct</option>
                      <option value="mistral-small:24b">mistral-small:24b</option>
                    </select>
                  </div>
                  <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-medium text-ink">Optional cloud LLM</p>
                        <p className="text-sm text-muted">Disabled by default in the current build.</p>
                      </div>
                      <CloudOff className="size-5 text-muted" />
                    </div>
                    <div className="mt-4 flex items-center justify-between rounded-2xl border border-border bg-surface/40 px-4 py-3 text-sm text-muted">
                      <span>Cloud narration: {aiSettings.cloudEnabled ? 'enabled' : 'off by default'}</span>
                      <button type="button" className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${aiSettings.cloudEnabled ? 'bg-buy/12 text-buy' : 'bg-white/8 text-muted'}`} onClick={() => onSetCloudEnabled(!aiSettings.cloudEnabled)}>
                        {aiSettings.cloudEnabled ? 'On' : 'Off'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {tab === 'strategies' ? (
                savedStrategies.length ? (
                  <div className="space-y-4">
                    {savedStrategies.map((strategy) => (
                      <div key={strategy.id} className="rounded-3xl border border-border bg-white/[0.03] p-4">
                        <p className="font-medium text-ink">{strategy.name}</p>
                        <p className="mt-2 text-sm text-muted">{strategy.symbolId} · {strategy.setupType} · {strategy.timeframe}</p>
                        <p className="mt-2 text-xs text-muted">Saved {formatDateTime(strategy.savedAt)} UTC</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="No strategies saved" description="Use Backtesting → Save strategy to populate this tab." />
                )
              ) : null}
            </>
          }
        />
      </Panel>
    </div>
  );
}