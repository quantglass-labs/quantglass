// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import {} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  DataStateView,
  ErrorState,
  LoadingSkeleton,
  Panel,
  PillTabs,
  SectionHeading,
} from '../components/ui';
import { LanguageSelect } from '../components/LanguageSelect';
import { providerLabelById } from '../lib/backend';
import { AiTab } from './settings/AiTab';
import { ProvidersTab } from './settings/ProvidersTab';
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
  const retryMockView = () => window.location.reload();
  const hasAlpacaCredentials = useMemo(() => {
    const keyId = apiKeys.find((field) => field.id === 'alpaca-market-data-key-id')?.configured;
    const secretKey = apiKeys.find(
      (field) => field.id === 'alpaca-market-data-secret-key',
    )?.configured;
    return Boolean(keyId && secretKey);
  }, [apiKeys]);

  const [prevApiKeys, setPrevApiKeys] = useState(apiKeys);
  if (prevApiKeys !== apiKeys) {
    setPrevApiKeys(apiKeys);
    setDraftApiKeys(
      Object.fromEntries(apiKeys.map((field) => [field.id, field.secret ? '' : field.value])),
    );
  }

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

      <LanguageSelect />

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
                <ProvidersTab
                  providerSettings={providerSettings}
                  providerRegistry={providerRegistry}
                  customProviders={customProviders}
                  aiSettings={aiSettings}
                  onChangeProviderView={onChangeProviderView}
                  onUpdateProviderSetting={onUpdateProviderSetting}
                  onSaveCustomProvider={onSaveCustomProvider}
                  onDeleteCustomProvider={onDeleteCustomProvider}
                  providerStatus={providerStatus}
                  goToProviderSetup={goToProviderSetup}
                  providerDisplayName={providerDisplayName}
                  renderProviderMeta={renderProviderMeta}
                  routeSetupRequired={routeSetupRequired}
                  providerInventory={providerInventory}
                  tradingMode={tradingMode}
                  liveTradingConfirmed={liveTradingConfirmed}
                />
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
