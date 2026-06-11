// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import {} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Button,
  DataStateView,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  Panel,
  PillTabs,
  SectionHeading,
} from '../components/ui';
import { providerLabelById } from '../lib/backend';
import { aiProviderProfiles } from './settings/aiProviderMeta';
import { AiTab } from './settings/AiTab';
import { ExtensionsTab } from './settings/ExtensionsTab';
import { KeysTab } from './settings/KeysTab';
import { LegalTab } from './settings/LegalTab';
import { RiskTab } from './settings/RiskTab';
import { StrategiesTab } from './settings/StrategiesTab';
import type {
  AiModelInfo,
  AiProviderTestResponse,
  AiSettings,
  ApiKeyField,
  CustomProviderProfile,
  CustomProviderUpsertRequest,
  ExtensionRegistryEntry,
  ExtensionSurfaceEntry,
  IndicatorRegistryEntry,
  NotificationTestChannel,
  ProviderCapability,
  ProviderRegistryEntry,
  ProviderSettings,
  SavedStrategy,
  ScreenState,
  StrategyRegistryEntry,
  TradingMode,
  ViewMode,
} from '../types';

type SettingsTab = 'providers' | 'keys' | 'risk' | 'ai' | 'extensions' | 'strategies' | 'legal';
type ProviderCapabilityName = ProviderRegistryEntry['capabilities'][number];
type ProviderCredentialRequirement = {
  keyIds: string[];
  setupText: string;
};
type ProviderSetupGroup = ProviderCredentialRequirement & {
  id: string;
  label: string;
  capability: ProviderCapabilityName;
  description: string;
};

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

const providerCredentialRequirements: Record<string, ProviderCredentialRequirement> = {
  alpaca: {
    keyIds: ['alpaca-market-data-key-id', 'alpaca-market-data-secret-key'],
    setupText: 'Save Alpaca Key ID and Alpaca Secret Key in API Keys.',
  },
  finnhub: {
    keyIds: ['finnhub-api-key'],
    setupText: 'Save a Finnhub API key in API Keys.',
  },
  finnhub_news: {
    keyIds: ['finnhub-api-key'],
    setupText: 'Save a Finnhub API key in API Keys.',
  },
  polygon: {
    keyIds: ['polygon-api-key'],
    setupText: 'Save a Polygon API key in API Keys.',
  },
  twelvedata: {
    keyIds: ['twelvedata-api-key'],
    setupText: 'Save a Twelve Data API key in API Keys.',
  },
  openai: {
    keyIds: ['openai-api-key'],
    setupText: 'Save an OpenAI API key in API Keys or the AI tab.',
  },
  openai_compatible: {
    keyIds: ['openai-compatible-api-key'],
    setupText:
      'Save an OpenAI-compatible bearer key in API Keys or the AI tab when your gateway requires one.',
  },
  bedrock: {
    keyIds: ['aws-access-key-id', 'aws-secret-access-key', 'aws-session-token'],
    setupText:
      'Save AWS Access Key ID and AWS Secret Access Key in API Keys. Add AWS Session Token when using temporary credentials.',
  },
  vertex: {
    keyIds: ['vertex-ai-access-token'],
    setupText:
      'Save a Vertex AI OAuth access token in API Keys, then use a project/location Vertex endpoint.',
  },
};

const providerSetupGroups: ProviderSetupGroup[] = [
  {
    id: 'alpaca',
    label: 'Alpaca',
    capability: 'ohlcv',
    description: 'Keyed stock market data and live broker credentials.',
    ...providerCredentialRequirements.alpaca,
  },
  {
    id: 'finnhub',
    label: 'Finnhub',
    capability: 'ohlcv',
    description: 'Keyed stock candles, quotes, and news.',
    ...providerCredentialRequirements.finnhub,
  },
  {
    id: 'polygon',
    label: 'Polygon',
    capability: 'ohlcv',
    description: 'Keyed stock market data.',
    ...providerCredentialRequirements.polygon,
  },
  {
    id: 'twelvedata',
    label: 'Twelve Data',
    capability: 'ohlcv',
    description: 'Keyed stock candle fallback data.',
    ...providerCredentialRequirements.twelvedata,
  },
  {
    id: 'bedrock',
    label: 'Amazon Bedrock',
    capability: 'ai',
    description: 'AWS Bedrock model discovery and signed invoke-model requests.',
    ...providerCredentialRequirements.bedrock,
  },
  {
    id: 'vertex',
    label: 'Google Vertex AI',
    capability: 'ai',
    description: 'Vertex AI publisher model discovery and generateContent calls.',
    ...providerCredentialRequirements.vertex,
  },
];

export function SettingsScreen({
  state,
  providerSettings,
  providerRegistry,
  customProviders,
  extensionRegistry,
  extensionSurfaces,
  extensionStrategies,
  extensionIndicators,
  extensionSettingsById,
  apiKeys,
  aiSettings,
  aiModelOptions,
  aiModelItems,
  aiModelDetail,
  aiModelsFetched,
  aiModelSource,
  aiModelFetchedAt,
  aiModelsLoading,
  aiProviderTestLoading,
  aiProviderTestResult,
  tradingMode,
  liveTradingConfirmed,
  minBacktestSample,
  savedStrategies,
  onSaveApiKey,
  onTestNotification,
  onRequestLiveTrading,
  onChangeProviderView,
  onUpdateProviderSetting,
  onSaveCustomProvider,
  onDeleteCustomProvider,
  onSetTradingMode,
  onSetMinBacktestSample,
  onUpdateAiSettings,
  onRefreshAiModels,
  onTestAiProvider,
  onUpdateExtensionSettings,
  onUpdateExtensionEnabled,
  onDeleteSavedStrategy,
  onImportSavedStrategies,
}: {
  state: ScreenState;
  providerSettings: ProviderSettings;
  providerRegistry: ProviderRegistryEntry[];
  customProviders: CustomProviderProfile[];
  extensionRegistry: ExtensionRegistryEntry[];
  extensionSurfaces: ExtensionSurfaceEntry[];
  extensionStrategies: StrategyRegistryEntry[];
  extensionIndicators: IndicatorRegistryEntry[];
  extensionSettingsById: Record<string, Record<string, unknown>>;
  apiKeys: ApiKeyField[];
  aiSettings: AiSettings;
  aiModelOptions: string[];
  aiModelItems: AiModelInfo[];
  aiModelDetail: string;
  aiModelsFetched: boolean;
  aiModelSource: string;
  aiModelFetchedAt: string | null;
  aiModelsLoading: boolean;
  aiProviderTestLoading: boolean;
  aiProviderTestResult: AiProviderTestResponse | null;
  tradingMode: TradingMode;
  liveTradingConfirmed: boolean;
  minBacktestSample: number;
  savedStrategies: SavedStrategy[];
  onSaveApiKey: (keyId: string, value: string) => void;
  onTestNotification: (channel: NotificationTestChannel) => void;
  onRequestLiveTrading: () => void;
  onChangeProviderView: (viewMode: ViewMode) => void;
  onUpdateProviderSetting: <K extends keyof ProviderSettings>(
    key: K,
    value: ProviderSettings[K],
  ) => void;
  onSaveCustomProvider: (provider: CustomProviderUpsertRequest, providerId?: string) => void;
  onDeleteCustomProvider: (providerId: string) => void;
  onSetTradingMode: (mode: TradingMode) => void;
  onSetMinBacktestSample: (value: number) => void;
  onUpdateAiSettings: (settings: AiSettings) => void;
  onRefreshAiModels: (settings: AiSettings) => void;
  onTestAiProvider: (settings: AiSettings) => void;
  onUpdateExtensionSettings: (extensionId: string, settings: Record<string, unknown>) => void;
  onUpdateExtensionEnabled: (extensionId: string, enabled: boolean) => void;
  onDeleteSavedStrategy: (strategyId: string) => void;
  onImportSavedStrategies: (strategies: SavedStrategy[]) => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = (searchParams.get('tab') as SettingsTab | null) ?? 'providers';
  const tab = useMemo<SettingsTab>(() => {
    if (
      ['providers', 'keys', 'risk', 'ai', 'extensions', 'strategies', 'legal'].includes(currentTab)
    ) {
      return currentTab as SettingsTab;
    }
    return 'providers';
  }, [currentTab]);
  const selectedProviderSetup = searchParams.get('setup') ?? '';
  const providerRegistryByLabel = useMemo(
    () =>
      new Map(
        providerRegistry.map((entry) => [
          entry.label ?? providerLabelById[entry.name] ?? entry.name,
          entry,
        ]),
      ),
    [providerRegistry],
  );
  const apiKeysById = useMemo(() => new Map(apiKeys.map((field) => [field.id, field])), [apiKeys]);
  const [draftApiKeys, setDraftApiKeys] = useState<Record<string, string>>({});
  const [draftCustomProvider, setDraftCustomProvider] =
    useState<CustomProviderUpsertRequest>(blankCustomProviderDraft);
  const [editingCustomProviderId, setEditingCustomProviderId] = useState<string | null>(null);
  const retryMockView = () => window.location.reload();
  const hasAlpacaCredentials = useMemo(() => {
    const keyId = apiKeys.find((field) => field.id === 'alpaca-market-data-key-id')?.configured;
    const secretKey = apiKeys.find(
      (field) => field.id === 'alpaca-market-data-secret-key',
    )?.configured;
    return Boolean(keyId && secretKey);
  }, [apiKeys]);

  useEffect(() => {
    setDraftApiKeys(
      Object.fromEntries(apiKeys.map((field) => [field.id, field.secret ? '' : field.value])),
    );
  }, [apiKeys]);

  function providerSetupId(providerId: string) {
    const requirement = providerCredentialRequirements[providerId];
    const matchingGroup = providerSetupGroups.find((group) => {
      if (group.id === providerId) return true;
      return requirement ? group.keyIds.join('|') === requirement.keyIds.join('|') : false;
    });
    return matchingGroup?.id ?? providerId;
  }

  function goToProviderSetup(providerId?: string) {
    setSearchParams(
      providerId ? { tab: 'keys', setup: providerSetupId(providerId) } : { tab: 'keys' },
    );
  }

  function findProviderEntry(label: string, preferredCapability?: ProviderCapabilityName) {
    if (!label) return null;

    const matchingProviderIds = Object.entries(providerLabelById)
      .filter(([, mappedLabel]) => mappedLabel === label)
      .map(([providerId]) => providerId);
    const candidates = providerRegistry.filter((entry) => {
      const entryLabel = entry.label ?? providerLabelById[entry.name] ?? entry.name;
      return (
        entry.name === label || entryLabel === label || matchingProviderIds.includes(entry.name)
      );
    });

    if (!candidates.length) {
      return providerRegistryByLabel.get(label) ?? null;
    }
    if (preferredCapability) {
      const capabilityMatch = candidates.find((entry) =>
        entry.capabilities.includes(preferredCapability),
      );
      if (capabilityMatch) return capabilityMatch;
    }
    return candidates.find((entry) => entry.transport === 'keyed') ?? candidates[0];
  }

  function providerDisplayName(value: string) {
    if (!value) return '';
    const entry = findProviderEntry(value);
    return entry?.label ?? providerLabelById[value] ?? value;
  }

  function customProviderOptions(capability: ProviderCapabilityName) {
    return providerRegistry
      .filter((entry) => entry.source === 'custom' && entry.capabilities.includes(capability))
      .map((entry) => ({ value: entry.name, label: entry.label ?? entry.name }));
  }

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

  function missingCredentialFields(entry: ProviderRegistryEntry) {
    const requirement = providerCredentialRequirements[entry.name];
    if (!requirement) return [];
    return requirement.keyIds
      .map((keyId) => apiKeysById.get(keyId))
      .filter((field): field is ApiKeyField => Boolean(field && !field.configured));
  }

  function providerStatus(entry: ProviderRegistryEntry) {
    const missingFields = missingCredentialFields(entry);

    if (entry.transport === 'keyed') {
      if (entry.source === 'custom') {
        if (entry.profileConfigured) {
          return {
            label: 'adapter required',
            tone: 'text-hold',
            detail:
              'Profile credentials are saved, but execution needs a provider extension adapter.',
            missingFields,
          };
        }
        return {
          label: 'needs setup',
          tone: 'text-hold',
          detail:
            'Save this custom provider API key in API Keys, then install or enable an adapter extension.',
          missingFields,
        };
      }
      if (entry.configured) {
        return {
          label: 'configured',
          tone: 'text-buy',
          detail: 'Required credentials are saved.',
          missingFields,
        };
      }

      return {
        label: 'needs setup',
        tone: 'text-hold',
        detail: missingFields.length
          ? `Missing ${missingFields.map((field) => field.label).join(', ')}.`
          : (providerCredentialRequirements[entry.name]?.setupText ??
            'Save this provider credential in API Keys.'),
        missingFields,
      };
    }

    if (entry.transport === 'public') {
      return {
        label: 'available',
        tone: 'text-buy',
        detail: 'No API key required.',
        missingFields: [],
      };
    }

    return {
      label: 'built-in',
      tone: 'text-buy',
      detail: 'Local or backend-managed provider; no setup required here.',
      missingFields: [],
    };
  }

  function routeSetupItems(labels: string[], preferredCapability: ProviderCapabilityName) {
    const uniqueLabels = Array.from(new Set(labels.filter(Boolean)));
    return uniqueLabels.flatMap((label) => {
      const entry = findProviderEntry(label, preferredCapability);
      if (!entry || entry.transport !== 'keyed' || entry.configured) return [];
      const status = providerStatus(entry);
      return [
        {
          label,
          entry,
          detail: status.detail,
          setupText:
            providerCredentialRequirements[entry.name]?.setupText ??
            'Save this provider credential in API Keys.',
        },
      ];
    });
  }

  function renderProviderMeta(
    label: string,
    preferredCapability: ProviderCapabilityName = 'ohlcv',
  ) {
    if (!label) {
      return <p className="text-xs text-muted">No provider selected.</p>;
    }

    const entry = findProviderEntry(label, preferredCapability);
    if (!entry) {
      return <p className="text-xs text-muted">Registry metadata unavailable for {label}.</p>;
    }

    const transportLabel = entry.transport ?? 'internal';
    const status = providerStatus(entry);

    return (
      <div className="space-y-2 text-xs">
        <div className="flex flex-wrap gap-2">
          <span className={`rounded-full border border-border px-2.5 py-1 ${status.tone}`}>
            {status.label}
          </span>
          <span className="rounded-full border border-border px-2.5 py-1 text-muted">
            {transportLabel}
          </span>
        </div>
        <p className="text-muted">{status.detail}</p>
        {entry.transport === 'keyed' && !entry.configured ? (
          <button
            type="button"
            className="text-accent underline-offset-4 hover:underline"
            onClick={() => goToProviderSetup(entry.name)}
          >
            Set up keys
          </button>
        ) : null}
      </div>
    );
  }

  const providerInventory = useMemo(
    () =>
      providerRegistry.filter(
        (entry) =>
          entry.capabilities.includes('ohlcv') ||
          entry.capabilities.includes('news') ||
          entry.capabilities.includes('trading'),
      ),
    [providerRegistry],
  );
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
  const ohlcvCustomProviderOptions = customProviderOptions('ohlcv');
  const routeSetupRequired = [
    ...routeSetupItems(cryptoRouteLabels, 'ohlcv'),
    ...routeSetupItems(stocksRouteLabels, 'ohlcv'),
  ];
  const providerSetupRows = [
    ...providerSetupGroups.map((group) => {
      const entry = findProviderEntry(group.label, group.capability);
      const fields = group.keyIds
        .map((keyId) => apiKeysById.get(keyId))
        .filter((field): field is ApiKeyField => Boolean(field));
      const missingFields = fields.filter((field) => !field.configured);
      const status = entry ? providerStatus(entry) : null;
      return {
        ...group,
        entry,
        fields,
        missingFields,
        status,
      };
    }),
    ...customProviders
      .filter((provider) => provider.apiKeyId)
      .map((provider) => {
        const keyIds = [provider.apiKeyId as string];
        const fields = keyIds
          .map((keyId) => apiKeysById.get(keyId))
          .filter((field): field is ApiKeyField => Boolean(field));
        const missingFields = fields.filter((field) => !field.configured);
        const entry = findProviderEntry(provider.id);
        return {
          id: provider.id,
          label: provider.label,
          capability: provider.capabilities[0] ?? 'ohlcv',
          description:
            'Custom provider profile credential. Adapter execution still requires an extension.',
          keyIds,
          setupText: 'Save this generated custom provider API key in API Keys.',
          entry,
          fields,
          missingFields,
          status: entry ? providerStatus(entry) : null,
        };
      }),
  ];
  const focusedProviderSetup = providerSetupRows.find(
    (row) => row.id === selectedProviderSetup || row.entry?.name === selectedProviderSetup,
  );
  const focusedProviderKeyIds = new Set(focusedProviderSetup?.keyIds ?? []);

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
          { value: 'extensions', label: 'Extensions' },
          { value: 'strategies', label: 'Strategies' },
          { value: 'legal', label: 'Legal' },
        ]}
      />

      <Panel>
        <DataStateView
          state={state}
          loading={<LoadingSkeleton rows={5} />}
          error={
            <ErrorState
              title="Settings unavailable"
              description="The settings surface could not be loaded."
              onRetry={retryMockView}
            />
          }
          populated={
            <>
              {tab === 'providers' ? (
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
                    US build defaults only expose US-compliant venues and data providers.
                    Binance.com global, OKX, and Bybit are intentionally excluded; use Coinbase,
                    Kraken, Gemini, Alpaca, Finnhub, and cached metadata providers in this build.
                  </div>
                  {providerSettings.viewMode === 'simple' ? (
                    <div className="space-y-4">
                      <div className="grid gap-4 lg:grid-cols-2">
                        <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                            Crypto route
                          </p>
                          <p className="mt-3 text-lg font-medium text-ink">
                            {cryptoRouteLabels.map(providerDisplayName).join(' -> ') ||
                              'No route selected'}
                          </p>
                          <p className="mt-2 text-sm text-muted">
                            The app tries the primary exchange first, then secondary/fallback
                            providers only when the previous route cannot return usable market data.
                          </p>
                        </div>
                        <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                            Stocks route
                          </p>
                          <p className="mt-3 text-lg font-medium text-ink">
                            {stocksRouteLabels.map(providerDisplayName).join(' -> ') ||
                              'No route selected'}
                          </p>
                          <p className="mt-2 text-sm text-muted">
                            Public providers work without keys. Keyed providers are used only after
                            their credentials are saved.
                          </p>
                        </div>
                        <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                            AI
                          </p>
                          <p className="mt-3 text-lg font-medium text-ink">
                            {aiProviderProfiles[aiSettings.provider].label}
                          </p>
                          <p className="mt-2 text-sm text-muted">
                            Configure local or API model gateways from the AI tab; deterministic
                            narration remains the fallback.
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
                            Live execution is controlled from Risk & Safety and requires saved
                            Alpaca credentials plus explicit confirmation.
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
                              Exchange-native candles and quotes come from the primary/fallback
                              exchange. Broad discovery metadata stays on the secondary provider to
                              match the cost-controlled adapter design.
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
                              Add provider identities and credentials for community adapters.
                              Profiles appear in routing, but live market-data execution still
                              requires an extension adapter for that provider.
                            </p>
                          </div>
                          <Button variant="secondary" onClick={resetCustomProviderDraft}>
                            New profile
                          </Button>
                        </div>
                        <div className="mt-4 grid gap-4 lg:grid-cols-2">
                          <div className="rounded-2xl border border-border bg-surface/40 p-4">
                            <p className="font-medium text-ink">
                              {editingCustomProviderId
                                ? 'Edit custom provider'
                                : 'Add custom provider'}
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
                                      authType: event.target
                                        .value as CustomProviderUpsertRequest['authType'],
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
                                    [
                                      'ohlcv',
                                      'order_book',
                                      'news',
                                      'trading',
                                      'ai',
                                    ] as ProviderCapability[]
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
                                    Adapter: profile saved, extension adapter required for
                                    market-data execution.
                                  </p>
                                  {provider.notes ? (
                                    <p className="mt-2 text-xs text-muted">{provider.notes}</p>
                                  ) : null}
                                  <div className="mt-4 flex flex-wrap gap-2">
                                    <Button
                                      variant="secondary"
                                      onClick={() => editCustomProvider(provider)}
                                    >
                                      Edit
                                    </Button>
                                    {provider.apiKeyId ? (
                                      <Button
                                        variant="ghost"
                                        onClick={() => goToProviderSetup(provider.id)}
                                      >
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
              ) : null}

              {tab === 'keys' ? (
                <KeysTab
                  apiKeys={apiKeys}
                  draftApiKeys={draftApiKeys}
                  setDraftApiKeys={setDraftApiKeys}
                  providerSetupRows={providerSetupRows}
                  focusedProviderSetup={focusedProviderSetup}
                  focusedProviderKeyIds={focusedProviderKeyIds}
                  onSaveApiKey={onSaveApiKey}
                  onTestNotification={onTestNotification}
                  goToProviderSetup={goToProviderSetup}
                  onGoToProviders={() => setSearchParams({ tab: 'providers' })}
                />
              ) : null}

              {tab === 'risk' ? (
                <RiskTab
                  tradingMode={tradingMode}
                  liveTradingConfirmed={liveTradingConfirmed}
                  minBacktestSample={minBacktestSample}
                  hasAlpacaCredentials={hasAlpacaCredentials}
                  onSetTradingMode={onSetTradingMode}
                  onRequestLiveTrading={onRequestLiveTrading}
                  onSetMinBacktestSample={onSetMinBacktestSample}
                  onGoToKeys={() => setSearchParams({ tab: 'keys' })}
                />
              ) : null}

              {tab === 'ai' ? (
                <AiTab
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
                  apiKeys={apiKeys}
                  draftApiKeys={draftApiKeys}
                  setDraftApiKeys={setDraftApiKeys}
                  onUpdateAiSettings={onUpdateAiSettings}
                  onRefreshAiModels={onRefreshAiModels}
                  onTestAiProvider={onTestAiProvider}
                  onSaveApiKey={onSaveApiKey}
                  onGoToKeys={() => setSearchParams({ tab: 'keys' })}
                />
              ) : null}

              {tab === 'extensions' ? (
                <ExtensionsTab
                  extensionRegistry={extensionRegistry}
                  extensionSurfaces={extensionSurfaces}
                  extensionStrategies={extensionStrategies}
                  extensionIndicators={extensionIndicators}
                  extensionSettingsById={extensionSettingsById}
                  onUpdateExtensionSettings={onUpdateExtensionSettings}
                  onUpdateExtensionEnabled={onUpdateExtensionEnabled}
                />
              ) : null}

              {tab === 'strategies' ? (
                <StrategiesTab
                  savedStrategies={savedStrategies}
                  onDeleteSavedStrategy={onDeleteSavedStrategy}
                  onImportSavedStrategies={onImportSavedStrategies}
                />
              ) : null}

              {tab === 'legal' ? <LegalTab /> : null}
            </>
          }
        />
      </Panel>
    </div>
  );
}
