// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from 'react';

import type { JSX } from 'react';

import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
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
          <p className="font-medium text-ink">{t('settings.providers.providerMode')}</p>
          <p className="text-sm text-muted">{t('settings.providers.providerModeDesc')}</p>
        </div>
        <PillTabs
          value={providerSettings.viewMode}
          onChange={onChangeProviderView}
          options={[
            { value: 'simple', label: t('settings.providers.simple') },
            { value: 'advanced', label: t('settings.providers.advanced') },
          ]}
        />
      </div>
      <div className="rounded-3xl border border-watch/25 bg-watch/10 p-4 text-sm text-muted">
        {t('settings.providers.usBuildNotice')}
      </div>
      {providerSettings.viewMode === 'simple' ? (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                {t('settings.providers.cryptoRoute')}
              </p>
              <p className="mt-3 text-lg font-medium text-ink">
                {cryptoRouteLabels.map(providerDisplayName).join(' -> ') ||
                  t('settings.providers.noRouteSelected')}
              </p>
              <p className="mt-2 text-sm text-muted">{t('settings.providers.cryptoRouteDesc')}</p>
            </div>
            <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                {t('settings.providers.stocksRoute')}
              </p>
              <p className="mt-3 text-lg font-medium text-ink">
                {stocksRouteLabels.map(providerDisplayName).join(' -> ') ||
                  t('settings.providers.noRouteSelected')}
              </p>
              <p className="mt-2 text-sm text-muted">{t('settings.providers.stocksRouteDesc')}</p>
            </div>
            <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                {t('settings.providers.ai')}
              </p>
              <p className="mt-3 text-lg font-medium text-ink">
                {aiProviderProfiles[aiSettings.provider].label}
              </p>
              <p className="mt-2 text-sm text-muted">{t('settings.providers.aiDesc')}</p>
            </div>
            <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                {t('settings.providers.trading')}
              </p>
              <p className="mt-3 text-lg font-medium text-ink">
                {tradingMode === 'live' && liveTradingConfirmed
                  ? t('settings.providers.liveConfirmed')
                  : t('settings.providers.paperGuarded')}
              </p>
              <p className="mt-2 text-sm text-muted">{t('settings.providers.tradingDesc')}</p>
            </div>
          </div>
          <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                  {t('settings.providers.providerSetup')}
                </p>
                <p className="mt-2 text-sm text-muted">
                  {t('settings.providers.providerSetupDesc')}
                </p>
              </div>
              <Button variant="secondary" onClick={() => goToProviderSetup()}>
                {t('settings.providers.apiKeysBtn')}
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
                      {t('settings.providers.setupKeys')}
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-buy">{t('settings.providers.routesAvailable')}</p>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                {t('settings.providers.cryptoRouting')}
              </p>
              <div className="mt-4 grid gap-3 text-sm text-muted">
                <label className="space-y-2">
                  <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
                    {t('settings.providers.primary')}
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
                    {t('settings.providers.secondaryExchange')}
                  </span>
                  <select
                    className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                    value={providerSettings.cryptoSecondary}
                    onChange={(event) =>
                      onUpdateProviderSetting('cryptoSecondary', event.target.value)
                    }
                  >
                    <option value="">{t('settings.providers.noneOption')}</option>
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
                    {t('settings.providers.fallbackExchange')}
                  </span>
                  <select
                    className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                    value={providerSettings.cryptoFallback}
                    onChange={(event) =>
                      onUpdateProviderSetting('cryptoFallback', event.target.value)
                    }
                  >
                    <option value="">{t('settings.providers.noneOption')}</option>
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
                    {t('settings.providers.rateLimitPerMinute')}
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
                <p className="text-xs text-muted">{t('settings.providers.cryptoRoutingNote')}</p>
              </div>
            </div>
            <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                {t('settings.providers.stocksRouting')}
              </p>
              <div className="mt-4 grid gap-3 text-sm text-muted">
                <label className="space-y-2">
                  <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
                    {t('settings.providers.primary')}
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
                    {t('settings.providers.secondary')}
                  </span>
                  <select
                    className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                    value={providerSettings.stocksSecondary}
                    onChange={(event) =>
                      onUpdateProviderSetting('stocksSecondary', event.target.value)
                    }
                  >
                    <option value="">{t('settings.providers.noneOption')}</option>
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
                    {t('settings.providers.fallback')}
                  </span>
                  <select
                    className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                    value={providerSettings.stocksFallback}
                    onChange={(event) =>
                      onUpdateProviderSetting('stocksFallback', event.target.value)
                    }
                  >
                    <option value="">{t('settings.providers.noneOption')}</option>
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
                    {t('settings.providers.rateLimitPerMinute')}
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
                  {t('settings.providers.customProfiles')}
                </p>
                <p className="mt-2 text-sm text-muted">
                  {t('settings.providers.customProfilesDesc')}
                </p>
              </div>
              <Button variant="secondary" onClick={resetCustomProviderDraft}>
                {t('settings.providers.newProfile')}
              </Button>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-border bg-surface/40 p-4">
                <p className="font-medium text-ink">
                  {editingCustomProviderId
                    ? t('settings.providers.editCustomProvider')
                    : t('settings.providers.addCustomProvider')}
                </p>
                <div className="mt-4 grid gap-3 text-sm text-muted">
                  <label className="space-y-2">
                    <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
                      {t('settings.providers.name')}
                    </span>
                    <input
                      className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                      value={draftCustomProvider.label}
                      placeholder={t('settings.providers.phName')}
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
                      {t('settings.providers.baseUrl')}
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
                      {t('settings.providers.authMode')}
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
                      <option value="none">{t('settings.providers.authNone')}</option>
                      <option value="bearer">{t('settings.providers.authBearer')}</option>
                      <option value="api_key_header">
                        {t('settings.providers.authKeyHeader')}
                      </option>
                      <option value="api_key_query">{t('settings.providers.authKeyQuery')}</option>
                    </select>
                  </label>
                  {draftCustomProvider.authType === 'api_key_header' ? (
                    <label className="space-y-2">
                      <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
                        {t('settings.providers.headerName')}
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
                        {t('settings.providers.queryParam')}
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
                      {t('settings.providers.notes')}
                    </span>
                    <textarea
                      className="min-h-24 w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                      value={draftCustomProvider.notes ?? ''}
                      placeholder={t('settings.providers.phNotes')}
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
                      {t('settings.providers.capabilitiesLabel')}
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
                    <span>{t('settings.providers.enabled')}</span>
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
                      {draftCustomProvider.enabled
                        ? t('settings.providers.on')
                        : t('settings.providers.off')}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      disabled={!draftCustomProvider.label.trim()}
                      onClick={saveCustomProviderDraft}
                    >
                      {editingCustomProviderId
                        ? t('settings.providers.saveProfile')
                        : t('settings.providers.addProvider')}
                    </Button>
                    <Button variant="secondary" onClick={resetCustomProviderDraft}>
                      {t('settings.providers.reset')}
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
                          {provider.enabled
                            ? t('settings.providers.enabledStatus')
                            : t('settings.providers.disabledStatus')}
                        </span>
                      </div>
                      <p className="mt-3 text-xs text-muted">
                        {t('settings.providers.capabilities', {
                          list: provider.capabilities.join(', '),
                        })}
                      </p>
                      <p className="mt-2 text-xs text-muted">
                        {t('settings.providers.auth', { auth: provider.authType })}
                        {provider.apiKeyId
                          ? t('settings.providers.keyIdSuffix', { id: provider.apiKeyId })
                          : ''}
                      </p>
                      <p className="mt-2 text-xs text-muted">
                        {t('settings.providers.adapterNote')}
                      </p>
                      {provider.notes ? (
                        <p className="mt-2 text-xs text-muted">{provider.notes}</p>
                      ) : null}
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={() => editCustomProvider(provider)}>
                          {t('settings.providers.edit')}
                        </Button>
                        {provider.apiKeyId ? (
                          <Button variant="ghost" onClick={() => goToProviderSetup(provider.id)}>
                            {t('settings.providers.apiKey')}
                          </Button>
                        ) : null}
                        <Button
                          variant="danger"
                          onClick={() => onDeleteCustomProvider(provider.id)}
                        >
                          {t('settings.providers.delete')}
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyState
                    title={t('settings.providers.emptyCustomTitle')}
                    description={t('settings.providers.emptyCustomDesc')}
                  />
                )}
              </div>
            </div>
          </div>
          <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              {t('settings.providers.registryStatus')}
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
                            {t('settings.providers.capabilities', {
                              list: entry.capabilities.join(', ') || t('settings.providers.none'),
                            })}
                          </p>
                        </div>
                        <div className="flex flex-wrap justify-end gap-2 text-xs">
                          <span
                            className={`rounded-full border border-border px-2.5 py-1 ${status.tone}`}
                          >
                            {status.label}
                          </span>
                          <span className="rounded-full border border-border px-2.5 py-1 text-muted">
                            {entry.transport ?? t('settings.providers.internalTransport')}
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
                          {t('settings.providers.setupKeys')}
                        </button>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-muted">{t('settings.providers.registryOffline')}</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
