// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from 'react';

import type { JSX } from 'react';

import { Button, EmptyState, PillTabs } from '../../components/ui';
import { providerLabelById } from '../../lib/backend';
import type {
  AiSettings,
  CustomProviderProfile,
  CustomProviderUpsertRequest,
  ProviderCapability,
  ProviderRegistryEntry,
  ProviderSettings,
  TradingMode,
  ViewMode,
} from '../../types';
import { aiProviderProfiles } from './aiProviderMeta';

type ProviderCapabilityName = ProviderRegistryEntry['capabilities'][number];

const blankCustomProviderDraft: CustomProviderUpsertRequest = {
  label: '',
  baseUrl: '',
  authType: 'bearer',
  apiKeyId: null,
  apiKeyHeader: 'Authorization',
  apiKeyQueryParam: 'apikey',
  capabilities: ['ohlcv'],
  enabled: true,
  notes: '',
};

export function ProvidersTab({
  providerSettings,
  providerRegistry,
  customProviders,
  aiSettings,
  onChangeProviderView,
  onUpdateProviderSetting,
  onSaveCustomProvider,
  onDeleteCustomProvider,
  providerStatus,
  goToProviderSetup,
  providerDisplayName,
  renderProviderMeta,
  routeSetupRequired,
  providerInventory,
  tradingMode,
  liveTradingConfirmed,
}: {
  providerSettings: ProviderSettings;
  providerRegistry: ProviderRegistryEntry[];
  customProviders: CustomProviderProfile[];
  aiSettings: AiSettings;
  onChangeProviderView: (viewMode: ViewMode) => void;
  onUpdateProviderSetting: <K extends keyof ProviderSettings>(
    key: K,
    value: ProviderSettings[K],
  ) => void;
  onSaveCustomProvider: (provider: CustomProviderUpsertRequest, providerId?: string) => void;
  onDeleteCustomProvider: (providerId: string) => void;
  providerStatus: (entry: ProviderRegistryEntry) => {
    label: string;
    tone: string;
    detail: string;
  };
  goToProviderSetup: (providerId?: string) => void;
  providerDisplayName: (value: string) => string;
  renderProviderMeta: (label: string, preferredCapability?: ProviderCapabilityName) => JSX.Element;
  routeSetupRequired: Array<{
    label: string;
    entry: ProviderRegistryEntry;
    detail: string;
    setupText: string;
  }>;
  providerInventory: ProviderRegistryEntry[];
  tradingMode: TradingMode;
  liveTradingConfirmed: boolean;
}) {
  const cryptoRouteLabels = [
    providerSettings.cryptoPrimary,
    providerSettings.cryptoSecondary,
    providerSettings.cryptoFallback,
  ].filter(Boolean);
  const stocksRouteLabels = [
    providerSettings.stocksPrimary,
    providerSettings.stocksSecondary,
    providerSettings.stocksFallback,
  ].filter(Boolean);
  const ohlcvCustomProviderOptions = providerRegistry
    .filter((entry) => entry.source === 'custom' && entry.capabilities.includes('ohlcv'))
    .map((entry) => ({ value: entry.name, label: entry.label ?? entry.name }));
  const [draftCustomProvider, setDraftCustomProvider] =
    useState<CustomProviderUpsertRequest>(blankCustomProviderDraft);
  const [editingCustomProviderId, setEditingCustomProviderId] = useState<string | null>(null);

  function toggleCustomProviderCapability(capability: ProviderCapability) {
    setDraftCustomProvider((current) => {
      const capabilities = new Set(current.capabilities);
      if (capabilities.has(capability)) {
        capabilities.delete(capability);
      } else {
        capabilities.add(capability);
      }
      return {
        ...current,
        capabilities: Array.from(
          capabilities.size ? capabilities : new Set<ProviderCapability>(['ohlcv']),
        ),
      };
    });
  }

  function editCustomProvider(provider: CustomProviderProfile) {
    setEditingCustomProviderId(provider.id);
    setDraftCustomProvider({
      id: provider.id,
      label: provider.label,
      baseUrl: provider.baseUrl,
      authType: provider.authType,
      apiKeyId: provider.apiKeyId ?? null,
      apiKeyHeader: provider.apiKeyHeader ?? 'Authorization',
      apiKeyQueryParam: provider.apiKeyQueryParam ?? 'apikey',
      capabilities: provider.capabilities,
      enabled: provider.enabled,
      notes: provider.notes ?? '',
    });
  }

  function resetCustomProviderDraft() {
    setEditingCustomProviderId(null);
    setDraftCustomProvider(blankCustomProviderDraft);
  }

  function saveCustomProviderDraft() {
    if (!draftCustomProvider.label.trim()) return;
    onSaveCustomProvider(draftCustomProvider, editingCustomProviderId ?? undefined);
    resetCustomProviderDraft();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 rounded-3xl border border-border bg-white/[0.03] p-4">
        <div>
          <p className="font-medium text-ink">Provider mode</p>
          <p className="text-sm text-muted">
            Choose between a simplified UI and explicit provider priority routing.
          </p>
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
        US build defaults only expose US-compliant venues and data providers. Binance.com global,
        OKX, and Bybit are intentionally excluded; use Coinbase, Kraken, Gemini, Alpaca, Finnhub,
        and cached metadata providers in this build.
      </div>
      {providerSettings.viewMode === 'simple' ? (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Crypto route
              </p>
              <p className="mt-3 text-lg font-medium text-ink">
                {cryptoRouteLabels.map(providerDisplayName).join(' -> ') || 'No route selected'}
              </p>
              <p className="mt-2 text-sm text-muted">
                The app tries the primary exchange first, then secondary/fallback providers only
                when the previous route cannot return usable market data.
              </p>
            </div>
            <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Stocks route
              </p>
              <p className="mt-3 text-lg font-medium text-ink">
                {stocksRouteLabels.map(providerDisplayName).join(' -> ') || 'No route selected'}
              </p>
              <p className="mt-2 text-sm text-muted">
                Public providers work without keys. Keyed providers are used only after their
                credentials are saved.
              </p>
            </div>
            <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">AI</p>
              <p className="mt-3 text-lg font-medium text-ink">
                {aiProviderProfiles[aiSettings.provider].label}
              </p>
              <p className="mt-2 text-sm text-muted">
                Configure local or API model gateways from the AI tab; deterministic narration
                remains the fallback.
              </p>
            </div>
            <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Trading
              </p>
              <p className="mt-3 text-lg font-medium text-ink">
                {tradingMode === 'live' && liveTradingConfirmed
                  ? 'Live confirmed'
                  : 'Paper guarded'}
              </p>
              <p className="mt-2 text-sm text-muted">
                Live execution is controlled from Risk & Safety and requires saved Alpaca
                credentials plus explicit confirmation.
              </p>
            </div>
          </div>
          <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                  Provider setup
                </p>
                <p className="mt-2 text-sm text-muted">
                  Only selected keyed routes appear here. Use Advanced for full provider
                  diagnostics.
                </p>
              </div>
              <Button variant="secondary" onClick={() => goToProviderSetup()}>
                API Keys
              </Button>
            </div>
            {routeSetupRequired.length ? (
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {routeSetupRequired.map((item) => (
                  <div
                    key={`${item.entry.name}-${item.label}`}
                    className="rounded-2xl border border-border bg-surface/40 p-4"
                  >
                    <p className="font-medium text-ink">{item.label}</p>
                    <p className="mt-2 text-sm text-muted">{item.detail}</p>
                    <p className="mt-2 text-xs text-muted">{item.setupText}</p>
                    <Button
                      variant="ghost"
                      className="mt-3"
                      onClick={() => goToProviderSetup(item.entry.name)}
                    >
                      Set up keys
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-buy">
                Selected routes are available with the current credential setup.
              </p>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Crypto routing
              </p>
              <div className="mt-4 grid gap-3 text-sm text-muted">
                <label className="space-y-2">
                  <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
                    Primary
                  </span>
                  <select
                    className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                    value={providerSettings.cryptoPrimary}
                    onChange={(event) =>
                      onUpdateProviderSetting('cryptoPrimary', event.target.value)
                    }
                  >
                    <option value="Coinbase">Coinbase</option>
                    <option value="Kraken">Kraken</option>
                    <option value="Gemini">Gemini</option>
                    {ohlcvCustomProviderOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {renderProviderMeta(providerSettings.cryptoPrimary, 'ohlcv')}
                </label>
                <label className="space-y-2">
                  <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
                    Secondary exchange
                  </span>
                  <select
                    className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                    value={providerSettings.cryptoSecondary}
                    onChange={(event) =>
                      onUpdateProviderSetting('cryptoSecondary', event.target.value)
                    }
                  >
                    <option value="">None</option>
                    <option value="Kraken">Kraken</option>
                    <option value="Coinbase">Coinbase</option>
                    <option value="Gemini">Gemini</option>
                    {ohlcvCustomProviderOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {renderProviderMeta(providerSettings.cryptoSecondary, 'ohlcv')}
                </label>
                <label className="space-y-2">
                  <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
                    Fallback exchange
                  </span>
                  <select
                    className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                    value={providerSettings.cryptoFallback}
                    onChange={(event) =>
                      onUpdateProviderSetting('cryptoFallback', event.target.value)
                    }
                  >
                    <option value="">None</option>
                    <option value="Kraken">Kraken</option>
                    <option value="Coinbase">Coinbase</option>
                    <option value="Gemini">Gemini</option>
                    {ohlcvCustomProviderOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {renderProviderMeta(providerSettings.cryptoFallback, 'ohlcv')}
                </label>
                <label className="space-y-2">
                  <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
                    Rate limit per minute
                  </span>
                  <input
                    className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                    type="number"
                    min="1"
                    max="240"
                    value={providerSettings.cryptoRateLimitPerMinute}
                    onChange={(event) =>
                      onUpdateProviderSetting(
                        'cryptoRateLimitPerMinute',
                        Number(event.target.value),
                      )
                    }
                  />
                </label>
                <p className="text-xs text-muted">
                  Exchange-native candles and quotes come from the primary/fallback exchange. Broad
                  discovery metadata stays on the secondary provider to match the cost-controlled
                  adapter design.
                </p>
              </div>
            </div>
            <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Stocks routing
              </p>
              <div className="mt-4 grid gap-3 text-sm text-muted">
                <label className="space-y-2">
                  <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
                    Primary
                  </span>
                  <select
                    className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                    value={providerSettings.stocksPrimary}
                    onChange={(event) =>
                      onUpdateProviderSetting('stocksPrimary', event.target.value)
                    }
                  >
                    <option value="Yahoo Finance">Yahoo Finance</option>
                    <option value="Alpaca">Alpaca</option>
                    <option value="Finnhub">Finnhub</option>
                    <option value="Polygon">Polygon</option>
                    <option value="Twelve Data">Twelve Data</option>
                    {ohlcvCustomProviderOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {renderProviderMeta(providerSettings.stocksPrimary, 'ohlcv')}
                </label>
                <label className="space-y-2">
                  <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
                    Secondary
                  </span>
                  <select
                    className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                    value={providerSettings.stocksSecondary}
                    onChange={(event) =>
                      onUpdateProviderSetting('stocksSecondary', event.target.value)
                    }
                  >
                    <option value="">None</option>
                    <option value="Yahoo Finance">Yahoo Finance</option>
                    <option value="Finnhub">Finnhub</option>
                    <option value="Alpaca">Alpaca</option>
                    <option value="Polygon">Polygon</option>
                    <option value="Twelve Data">Twelve Data</option>
                    {ohlcvCustomProviderOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {renderProviderMeta(providerSettings.stocksSecondary, 'ohlcv')}
                </label>
                <label className="space-y-2">
                  <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
                    Fallback
                  </span>
                  <select
                    className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                    value={providerSettings.stocksFallback}
                    onChange={(event) =>
                      onUpdateProviderSetting('stocksFallback', event.target.value)
                    }
                  >
                    <option value="">None</option>
                    <option value="Yahoo Finance">Yahoo Finance</option>
                    <option value="Twelve Data">Twelve Data</option>
                    <option value="Finnhub">Finnhub</option>
                    <option value="Alpaca">Alpaca</option>
                    <option value="Polygon">Polygon</option>
                    {ohlcvCustomProviderOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {renderProviderMeta(providerSettings.stocksFallback, 'ohlcv')}
                </label>
                <label className="space-y-2">
                  <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
                    Rate limit per minute
                  </span>
                  <input
                    className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                    type="number"
                    min="1"
                    max="240"
                    value={providerSettings.stocksRateLimitPerMinute}
                    onChange={(event) =>
                      onUpdateProviderSetting(
                        'stocksRateLimitPerMinute',
                        Number(event.target.value),
                      )
                    }
                  />
                </label>
              </div>
            </div>
          </div>
          <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                  Custom provider profiles
                </p>
                <p className="mt-2 text-sm text-muted">
                  Add provider identities and credentials for community adapters. Profiles appear in
                  routing, but live market-data execution still requires an extension adapter for
                  that provider.
                </p>
              </div>
              <Button variant="secondary" onClick={resetCustomProviderDraft}>
                New profile
              </Button>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-border bg-surface/40 p-4">
                <p className="font-medium text-ink">
                  {editingCustomProviderId ? 'Edit custom provider' : 'Add custom provider'}
                </p>
                <div className="mt-4 grid gap-3 text-sm text-muted">
                  <label className="space-y-2">
                    <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
                      Name
                    </span>
                    <input
                      className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                      value={draftCustomProvider.label}
                      placeholder="OpenRouter market data, Internal feed, etc."
                      onChange={(event) =>
                        setDraftCustomProvider({
                          ...draftCustomProvider,
                          label: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
                      Base URL
                    </span>
                    <input
                      className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                      value={draftCustomProvider.baseUrl}
                      placeholder="https://api.example.com/v1"
                      onChange={(event) =>
                        setDraftCustomProvider({
                          ...draftCustomProvider,
                          baseUrl: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
                      Auth mode
                    </span>
                    <select
                      className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                      value={draftCustomProvider.authType}
                      onChange={(event) =>
                        setDraftCustomProvider({
                          ...draftCustomProvider,
                          authType: event.target.value as CustomProviderUpsertRequest['authType'],
                        })
                      }
                    >
                      <option value="none">No key</option>
                      <option value="bearer">Bearer token</option>
                      <option value="api_key_header">API key header</option>
                      <option value="api_key_query">API key query param</option>
                    </select>
                  </label>
                  {draftCustomProvider.authType === 'api_key_header' ? (
                    <label className="space-y-2">
                      <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
                        Header name
                      </span>
                      <input
                        className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                        value={draftCustomProvider.apiKeyHeader ?? ''}
                        placeholder="X-API-Key"
                        onChange={(event) =>
                          setDraftCustomProvider({
                            ...draftCustomProvider,
                            apiKeyHeader: event.target.value,
                          })
                        }
                      />
                    </label>
                  ) : null}
                  {draftCustomProvider.authType === 'api_key_query' ? (
                    <label className="space-y-2">
                      <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
                        Query param
                      </span>
                      <input
                        className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                        value={draftCustomProvider.apiKeyQueryParam ?? ''}
                        placeholder="apikey"
                        onChange={(event) =>
                          setDraftCustomProvider({
                            ...draftCustomProvider,
                            apiKeyQueryParam: event.target.value,
                          })
                        }
                      />
                    </label>
                  ) : null}
                  <label className="space-y-2">
                    <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
                      Notes
                    </span>
                    <textarea
                      className="min-h-24 w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                      value={draftCustomProvider.notes ?? ''}
                      placeholder="Adapter package, docs URL, supported symbols, rate-limit notes..."
                      onChange={(event) =>
                        setDraftCustomProvider({
                          ...draftCustomProvider,
                          notes: event.target.value,
                        })
                      }
                    />
                  </label>
                  <div className="space-y-2">
                    <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
                      Capabilities
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {(
                        ['ohlcv', 'order_book', 'news', 'trading', 'ai'] as ProviderCapability[]
                      ).map((capability) => (
                        <button
                          key={capability}
                          type="button"
                          className={`rounded-full border border-border px-3 py-1.5 text-xs ${draftCustomProvider.capabilities.includes(capability) ? 'bg-accent/15 text-accent' : 'bg-white/[0.03] text-muted'}`}
                          onClick={() => toggleCustomProviderCapability(capability)}
                        >
                          {capability.replace('_', ' ')}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-border bg-white/[0.03] px-4 py-3">
                    <span>Enabled</span>
                    <button
                      type="button"
                      className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${draftCustomProvider.enabled ? 'bg-buy/12 text-buy' : 'bg-white/8 text-muted'}`}
                      onClick={() =>
                        setDraftCustomProvider({
                          ...draftCustomProvider,
                          enabled: !draftCustomProvider.enabled,
                        })
                      }
                    >
                      {draftCustomProvider.enabled ? 'On' : 'Off'}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      disabled={!draftCustomProvider.label.trim()}
                      onClick={saveCustomProviderDraft}
                    >
                      {editingCustomProviderId ? 'Save profile' : 'Add provider'}
                    </Button>
                    <Button variant="secondary" onClick={resetCustomProviderDraft}>
                      Reset
                    </Button>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                {customProviders.length ? (
                  customProviders.map((provider) => (
                    <div
                      key={provider.id}
                      className="rounded-2xl border border-border bg-surface/40 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-ink">{provider.label}</p>
                          <p className="mt-1 text-xs text-muted">{provider.id}</p>
                        </div>
                        <span
                          className={`rounded-full border border-border px-2.5 py-1 text-xs ${provider.enabled ? 'text-buy' : 'text-muted'}`}
                        >
                          {provider.enabled ? 'enabled' : 'disabled'}
                        </span>
                      </div>
                      <p className="mt-3 text-xs text-muted">
                        Capabilities: {provider.capabilities.join(', ')}
                      </p>
                      <p className="mt-2 text-xs text-muted">
                        Auth: {provider.authType}
                        {provider.apiKeyId ? ` / key id ${provider.apiKeyId}` : ''}
                      </p>
                      <p className="mt-2 text-xs text-muted">
                        Adapter: profile saved, extension adapter required for market-data
                        execution.
                      </p>
                      {provider.notes ? (
                        <p className="mt-2 text-xs text-muted">{provider.notes}</p>
                      ) : null}
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={() => editCustomProvider(provider)}>
                          Edit
                        </Button>
                        {provider.apiKeyId ? (
                          <Button variant="ghost" onClick={() => goToProviderSetup(provider.id)}>
                            API key
                          </Button>
                        ) : null}
                        <Button
                          variant="danger"
                          onClick={() => onDeleteCustomProvider(provider.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyState
                    title="No custom providers"
                    description="Add a provider profile to prepare credentials and routing for a community adapter."
                  />
                )}
              </div>
            </div>
          </div>
          <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              Provider registry status
            </p>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {providerInventory.length ? (
                providerInventory.map((entry) => {
                  const status = providerStatus(entry);
                  return (
                    <div
                      key={entry.name}
                      className="rounded-2xl border border-border bg-surface/40 px-4 py-3 text-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span className="font-medium text-ink">
                            {entry.label ?? providerLabelById[entry.name] ?? entry.name}
                          </span>
                          <p className="mt-1 text-xs text-muted">
                            Capabilities: {entry.capabilities.join(', ') || 'none'}
                          </p>
                        </div>
                        <div className="flex flex-wrap justify-end gap-2 text-xs">
                          <span
                            className={`rounded-full border border-border px-2.5 py-1 ${status.tone}`}
                          >
                            {status.label}
                          </span>
                          <span className="rounded-full border border-border px-2.5 py-1 text-muted">
                            {entry.transport ?? 'internal'}
                          </span>
                        </div>
                      </div>
                      <p className="mt-3 text-xs text-muted">{status.detail}</p>
                      {entry.transport === 'keyed' && !entry.configured ? (
                        <button
                          type="button"
                          className="mt-2 text-xs text-accent underline-offset-4 hover:underline"
                          onClick={() => goToProviderSetup(entry.name)}
                        >
                          Set up keys
                        </button>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-muted">
                  Registry metadata is unavailable while the backend is offline.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
