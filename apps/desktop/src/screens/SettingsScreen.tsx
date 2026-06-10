// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  Bot,
  Brain,
  Cloud,
  CloudOff,
  Cpu,
  Download,
  ExternalLink,
  KeyRound,
  Plug,
  Plus,
  Rocket,
  Route,
  Save,
  Scale,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  Upload,
  Wind,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { formatDateTime } from '../lib/format';
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
  Timeframe,
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
type AiProviderCategory = 'local' | 'cloud' | 'router' | 'enterprise';
type AiProviderTemplate = {
  id: string;
  label: string;
  category: AiProviderCategory;
  provider: AiSettings['provider'];
  baseUrl: string;
  apiKeyId: string | null;
  tier: string;
  description: string;
  authMode: string;
  adapterStatus: 'native' | 'compatible' | 'adapter_required';
  defaultModel?: string;
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
  const [draftAiSettings, setDraftAiSettings] = useState<AiSettings>(aiSettings);
  const [draftExtensionSettings, setDraftExtensionSettings] = useState<
    Record<string, Record<string, unknown>>
  >({});
  const [draftCustomProvider, setDraftCustomProvider] =
    useState<CustomProviderUpsertRequest>(blankCustomProviderDraft);
  const [editingCustomProviderId, setEditingCustomProviderId] = useState<string | null>(null);
  const [customAiModelEnabled, setCustomAiModelEnabled] = useState(false);
  const [activeAiProviderId, setActiveAiProviderId] = useState('anthropic');
  const [aiProviderSearch, setAiProviderSearch] = useState('');
  const [strategyTransferStatus, setStrategyTransferStatus] = useState('');
  const [selectedStrategyIds, setSelectedStrategyIds] = useState<Set<string>>(new Set());
  const strategyImportRef = useRef<HTMLInputElement | null>(null);
  const keyFieldRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const retryMockView = () => window.location.reload();
  const notificationTestFieldMap: Partial<Record<string, NotificationTestChannel>> = {
    'telegram-chat-id': 'telegram',
    'smtp-to-email': 'email',
  };
  const apiKeySections = useMemo(() => {
    const telegramIds = new Set(['telegram-bot-token', 'telegram-chat-id']);
    const emailIds = new Set([
      'smtp-host',
      'smtp-port',
      'smtp-username',
      'smtp-password',
      'smtp-from-email',
      'smtp-to-email',
    ]);
    const aiIds = new Set([
      'openai-api-key',
      'openai-compatible-api-key',
      'anthropic-api-key',
      'google-gemini-api-key',
      'deepseek-api-key',
      'mistral-api-key',
      'groq-api-key',
      'openrouter-api-key',
      'together-api-key',
      'azure-openai-api-key',
      'aws-access-key-id',
      'aws-secret-access-key',
      'aws-session-token',
      'vertex-ai-access-token',
    ]);

    return [
      {
        id: 'providers',
        title: 'Provider credentials',
        description:
          'Market data and trading-provider credentials that affect registry availability and keyed transports.',
        items: apiKeys.filter(
          (field) => !telegramIds.has(field.id) && !emailIds.has(field.id) && !aiIds.has(field.id),
        ),
      },
      {
        id: 'ai',
        title: 'AI model gateways',
        description:
          'Optional keys for OpenAI or OpenAI-compatible model routers. Local Ollama and LM Studio do not need a key by default.',
        items: apiKeys.filter((field) => aiIds.has(field.id)),
      },
      {
        id: 'telegram',
        title: 'Telegram delivery',
        description:
          'Saved bot token and chat destination for Telegram alert delivery and test sends.',
        items: apiKeys.filter((field) => telegramIds.has(field.id)),
      },
      {
        id: 'email',
        title: 'Email delivery',
        description:
          'SMTP host, authentication, sender, and recipients used for email alerts and test sends.',
        items: apiKeys.filter((field) => emailIds.has(field.id)),
      },
    ].filter((section) => section.items.length > 0);
  }, [apiKeys]);
  const hasAlpacaCredentials = useMemo(() => {
    const keyId = apiKeys.find((field) => field.id === 'alpaca-market-data-key-id')?.configured;
    const secretKey = apiKeys.find(
      (field) => field.id === 'alpaca-market-data-secret-key',
    )?.configured;
    return Boolean(keyId && secretKey);
  }, [apiKeys]);
  const extensionSurfaceGroups = useMemo(() => {
    const groups = new Map<ExtensionSurfaceEntry['category'], ExtensionSurfaceEntry[]>();
    extensionSurfaces.forEach((surface) => {
      groups.set(surface.category, [...(groups.get(surface.category) ?? []), surface]);
    });
    return Array.from(groups.entries()).sort(([left], [right]) => left.localeCompare(right));
  }, [extensionSurfaces]);
  const extensionIndicatorGroups = useMemo(() => {
    const groups = new Map<string, IndicatorRegistryEntry[]>();
    extensionIndicators.forEach((indicator) => {
      groups.set(indicator.category, [...(groups.get(indicator.category) ?? []), indicator]);
    });
    return Array.from(groups.entries()).sort(([left], [right]) => left.localeCompare(right));
  }, [extensionIndicators]);
  const computedIndicatorCount = useMemo(
    () => extensionIndicators.filter((indicator) => indicator.maturity === 'computed').length,
    [extensionIndicators],
  );
  const aiApiKeyOptions = useMemo(
    () =>
      apiKeys.filter((field) =>
        [
          'openai-api-key',
          'openai-compatible-api-key',
          'anthropic-api-key',
          'google-gemini-api-key',
          'deepseek-api-key',
          'mistral-api-key',
          'groq-api-key',
          'openrouter-api-key',
          'together-api-key',
          'azure-openai-api-key',
          'aws-access-key-id',
          'aws-secret-access-key',
          'aws-session-token',
          'vertex-ai-access-token',
        ].includes(field.id),
      ),
    [apiKeys],
  );
  const selectedAiApiKey = useMemo(
    () => aiApiKeyOptions.find((field) => field.id === draftAiSettings.apiKeyId) ?? null,
    [aiApiKeyOptions, draftAiSettings.apiKeyId],
  );
  const aiModelById = useMemo(
    () => new Map(aiModelItems.map((item) => [item.id, item])),
    [aiModelItems],
  );
  const selectedAiModelInfo = draftAiSettings.model
    ? (aiModelById.get(draftAiSettings.model) ?? null)
    : null;
  const aiCatalogStatus = aiModelsLoading
    ? 'Fetching latest models'
    : aiModelsFetched
      ? `Live catalog${aiModelFetchedAt ? ` - ${formatDateTime(aiModelFetchedAt)} UTC` : ''}`
      : 'Fallback suggestions';
  const aiProviderTemplates: AiProviderTemplate[] = [
    {
      id: 'template',
      label: 'Deterministic template',
      category: 'local',
      provider: 'template',
      baseUrl: '',
      apiKeyId: null,
      tier: 'Built-in',
      description: 'Offline deterministic narration fallback. No model call is made.',
      authMode: 'No authentication',
      adapterStatus: 'native',
      defaultModel: 'deterministic-template',
    },
    {
      id: 'ollama',
      label: 'Ollama',
      category: 'local',
      provider: 'ollama',
      baseUrl: 'http://127.0.0.1:11434',
      apiKeyId: null,
      tier: 'Free · Local',
      description: 'Run open models locally with zero server cost.',
      authMode: 'No authentication',
      adapterStatus: 'native',
    },
    {
      id: 'lm_studio',
      label: 'LM Studio',
      category: 'local',
      provider: 'lm_studio',
      baseUrl: 'http://127.0.0.1:1234/v1',
      apiKeyId: null,
      tier: 'Free · Local',
      description: 'On-device GGUF models through the LM Studio server.',
      authMode: 'No key by default',
      adapterStatus: 'compatible',
    },
    {
      id: 'vllm',
      label: 'vLLM',
      category: 'local',
      provider: 'vllm',
      baseUrl: 'http://127.0.0.1:8000/v1',
      apiKeyId: null,
      tier: 'Free · Self-host',
      description: 'High-throughput self-hosted OpenAI-compatible inference.',
      authMode: 'Optional bearer token',
      adapterStatus: 'compatible',
    },
    {
      id: 'llamacpp',
      label: 'llama.cpp',
      category: 'local',
      provider: 'llama_cpp',
      baseUrl: 'http://127.0.0.1:8080/v1',
      apiKeyId: null,
      tier: 'Free · Local',
      description: 'Lightweight local inference server when launched with OpenAI-compatible API.',
      authMode: 'No key by default',
      adapterStatus: 'compatible',
    },
    {
      id: 'anthropic',
      label: 'Anthropic Claude',
      category: 'cloud',
      provider: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1',
      apiKeyId: 'anthropic-api-key',
      tier: 'Paid · API',
      description: 'Claude models via the native Messages API.',
      authMode: 'Anthropic API key',
      adapterStatus: 'native',
    },
    {
      id: 'openai',
      label: 'OpenAI GPT',
      category: 'cloud',
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKeyId: 'openai-api-key',
      tier: 'Paid · API',
      description: 'GPT-class models and reasoning models from the OpenAI API.',
      authMode: 'OpenAI API key',
      adapterStatus: 'native',
    },
    {
      id: 'gemini',
      label: 'Google Gemini',
      category: 'cloud',
      provider: 'google_gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      apiKeyId: 'google-gemini-api-key',
      tier: 'Free tier · Paid',
      description: 'Gemini models through native generateContent.',
      authMode: 'Google Gemini API key',
      adapterStatus: 'native',
    },
    {
      id: 'deepseek',
      label: 'DeepSeek',
      category: 'cloud',
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKeyId: 'deepseek-api-key',
      tier: 'Paid · Low cost',
      description: 'Cost-efficient chat and reasoning models through an OpenAI-compatible API.',
      authMode: 'DeepSeek API key',
      adapterStatus: 'compatible',
    },
    {
      id: 'mistral',
      label: 'Mistral AI',
      category: 'cloud',
      provider: 'mistral',
      baseUrl: 'https://api.mistral.ai/v1',
      apiKeyId: 'mistral-api-key',
      tier: 'Free tier · Paid',
      description: 'Mistral and Codestral model families.',
      authMode: 'Mistral API key',
      adapterStatus: 'compatible',
    },
    {
      id: 'groq',
      label: 'Groq',
      category: 'cloud',
      provider: 'groq',
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKeyId: 'groq-api-key',
      tier: 'Free tier · Fast',
      description: 'Low-latency hosted open model inference.',
      authMode: 'Groq API key',
      adapterStatus: 'compatible',
    },
    {
      id: 'openrouter',
      label: 'OpenRouter',
      category: 'router',
      provider: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKeyId: 'openrouter-api-key',
      tier: 'Pay as you go',
      description: 'One API key for many hosted model providers.',
      authMode: 'OpenRouter API key',
      adapterStatus: 'compatible',
    },
    {
      id: 'together',
      label: 'Together AI',
      category: 'router',
      provider: 'together',
      baseUrl: 'https://api.together.xyz/v1',
      apiKeyId: 'together-api-key',
      tier: 'Pay as you go',
      description: 'Hosted open-source models at scale.',
      authMode: 'Together API key',
      adapterStatus: 'compatible',
    },
    {
      id: 'azure',
      label: 'Azure OpenAI',
      category: 'enterprise',
      provider: 'azure_openai',
      baseUrl: 'https://your-resource.openai.azure.com/openai/deployments/your-deployment',
      apiKeyId: 'azure-openai-api-key',
      tier: 'Enterprise',
      description:
        'Azure-hosted OpenAI deployments. Configure the deployment endpoint and API version if needed.',
      authMode: 'Azure API key',
      adapterStatus: 'compatible',
      defaultModel: 'your-deployment',
    },
    {
      id: 'bedrock',
      label: 'Amazon Bedrock',
      category: 'enterprise',
      provider: 'bedrock',
      baseUrl: 'bedrock-runtime.us-east-1.amazonaws.com',
      apiKeyId: 'aws-access-key-id',
      tier: 'Enterprise',
      description: 'AWS-managed foundation models through signed Bedrock Runtime requests.',
      authMode: 'AWS access key + secret',
      adapterStatus: 'native',
    },
    {
      id: 'vertex',
      label: 'Google Vertex AI',
      category: 'enterprise',
      provider: 'vertex',
      baseUrl:
        'https://us-central1-aiplatform.googleapis.com/v1/projects/your-project/locations/us-central1',
      apiKeyId: 'vertex-ai-access-token',
      tier: 'Enterprise',
      description: 'GCP-hosted Gemini publisher models through Vertex AI REST.',
      authMode: 'Vertex OAuth token',
      adapterStatus: 'native',
    },
    {
      id: 'custom',
      label: 'Custom endpoint',
      category: 'enterprise',
      provider: 'openai_compatible',
      baseUrl: 'https://',
      apiKeyId: 'openai-compatible-api-key',
      tier: 'Self-defined',
      description: 'Any OpenAI-compatible model endpoint.',
      authMode: 'Bearer token',
      adapterStatus: 'compatible',
    },
  ];
  const activeAiProviderTemplate =
    aiProviderTemplates.find((template) => template.id === activeAiProviderId) ??
    aiProviderTemplates[0];
  const filteredAiProviderTemplates = aiProviderTemplates.filter((template) => {
    const query = aiProviderSearch.trim().toLowerCase();
    if (!query) return true;
    return `${template.label} ${template.description} ${template.baseUrl}`
      .toLowerCase()
      .includes(query);
  });
  const aiProviderGroups: Array<{
    category: AiProviderCategory;
    label: string;
    items: AiProviderTemplate[];
  }> = [
    {
      category: 'local',
      label: 'Local runtimes',
      items: filteredAiProviderTemplates.filter((template) => template.category === 'local'),
    },
    {
      category: 'cloud',
      label: 'Cloud APIs',
      items: filteredAiProviderTemplates.filter((template) => template.category === 'cloud'),
    },
    {
      category: 'router',
      label: 'Model routers',
      items: filteredAiProviderTemplates.filter((template) => template.category === 'router'),
    },
    {
      category: 'enterprise',
      label: 'Enterprise',
      items: filteredAiProviderTemplates.filter((template) => template.category === 'enterprise'),
    },
  ];
  const aiProviderProfiles: Record<
    AiSettings['provider'],
    { label: string; endpoint: string; keyMode: string; modelSource: string }
  > = {
    template: {
      label: 'Deterministic template',
      endpoint: 'No endpoint',
      keyMode: 'No key',
      modelSource: 'Built-in deterministic narration',
    },
    ollama: {
      label: 'Ollama native',
      endpoint: 'http://127.0.0.1:11434',
      keyMode: 'No key by default',
      modelSource: 'Fetched from /api/tags',
    },
    lm_studio: {
      label: 'LM Studio',
      endpoint: 'http://127.0.0.1:1234/v1',
      keyMode: 'No key by default',
      modelSource: 'Fetched from OpenAI-compatible /models',
    },
    vllm: {
      label: 'vLLM',
      endpoint: 'http://127.0.0.1:8000/v1',
      keyMode: 'Optional bearer key',
      modelSource: 'Fetched from OpenAI-compatible /models',
    },
    llama_cpp: {
      label: 'llama.cpp',
      endpoint: 'http://127.0.0.1:8080/v1',
      keyMode: 'No key by default',
      modelSource: 'Fetched from OpenAI-compatible /models',
    },
    openai: {
      label: 'OpenAI / ChatGPT',
      endpoint: 'https://api.openai.com/v1',
      keyMode: 'OpenAI API key required',
      modelSource: 'Fetched from /models with bearer auth',
    },
    anthropic: {
      label: 'Anthropic Claude',
      endpoint: 'https://api.anthropic.com/v1',
      keyMode: 'Anthropic API key required',
      modelSource: 'Fetched from /models with x-api-key auth',
    },
    google_gemini: {
      label: 'Google Gemini',
      endpoint: 'https://generativelanguage.googleapis.com/v1beta',
      keyMode: 'Google Gemini API key required',
      modelSource: 'Fetched from /models and filtered for generateContent',
    },
    deepseek: {
      label: 'DeepSeek',
      endpoint: 'https://api.deepseek.com/v1',
      keyMode: 'DeepSeek API key required',
      modelSource: 'Fetched from /models with bearer auth',
    },
    mistral: {
      label: 'Mistral AI',
      endpoint: 'https://api.mistral.ai/v1',
      keyMode: 'Mistral API key required',
      modelSource: 'Fetched from /models with bearer auth',
    },
    groq: {
      label: 'Groq',
      endpoint: 'https://api.groq.com/openai/v1',
      keyMode: 'Groq API key required',
      modelSource: 'Fetched from OpenAI-compatible /models',
    },
    openrouter: {
      label: 'OpenRouter',
      endpoint: 'https://openrouter.ai/api/v1',
      keyMode: 'OpenRouter API key required',
      modelSource: 'Fetched from OpenAI-compatible /models',
    },
    together: {
      label: 'Together AI',
      endpoint: 'https://api.together.xyz/v1',
      keyMode: 'Together API key required',
      modelSource: 'Fetched from OpenAI-compatible /models',
    },
    azure_openai: {
      label: 'Azure OpenAI',
      endpoint: 'Deployment endpoint',
      keyMode: 'Azure API key required',
      modelSource: 'Uses configured deployment name',
    },
    bedrock: {
      label: 'Amazon Bedrock',
      endpoint: 'AWS Bedrock runtime',
      keyMode: 'AWS access key and secret required',
      modelSource: 'Fetched from Bedrock foundation-models',
    },
    vertex: {
      label: 'Google Vertex AI',
      endpoint: 'Vertex project/location endpoint',
      keyMode: 'OAuth bearer token required',
      modelSource: 'Fetched from Vertex publisher models',
    },
    openai_compatible: {
      label: 'OpenAI-compatible',
      endpoint: 'Custom /v1 endpoint',
      keyMode: 'Optional bearer key',
      modelSource: 'Fetched from /models',
    },
  };

  useEffect(() => {
    setDraftApiKeys(
      Object.fromEntries(apiKeys.map((field) => [field.id, field.secret ? '' : field.value])),
    );
  }, [apiKeys]);

  useEffect(() => {
    setSelectedStrategyIds((current) => {
      const availableIds = new Set(savedStrategies.map((strategy) => strategy.id));
      const retainedIds = Array.from(current).filter((id) => availableIds.has(id));
      if (current.size === 0 || retainedIds.length === 0) {
        return new Set(savedStrategies.map((strategy) => strategy.id));
      }
      return new Set(retainedIds);
    });
  }, [savedStrategies]);

  useEffect(() => {
    setDraftAiSettings(aiSettings);
    setCustomAiModelEnabled(false);
    const matchingTemplate =
      aiProviderTemplates.find(
        (template) =>
          template.provider === aiSettings.provider &&
          (aiSettings.provider !== 'openai_compatible' ||
            template.baseUrl === aiSettings.baseUrl ||
            template.apiKeyId === aiSettings.apiKeyId),
      ) ??
      aiProviderTemplates.find((template) => template.provider === aiSettings.provider) ??
      aiProviderTemplates[0];
    setActiveAiProviderId(matchingTemplate.id);
  }, [aiSettings]);

  useEffect(() => {
    if (!aiModelOptions.length) return;
    if (
      aiModelsFetched &&
      !customAiModelEnabled &&
      !aiModelOptions.includes(draftAiSettings.model)
    ) {
      setDraftAiSettings((current) => ({ ...current, model: aiModelOptions[0] }));
    }
  }, [aiModelOptions, aiModelsFetched, customAiModelEnabled, draftAiSettings.model]);

  useEffect(() => {
    setDraftExtensionSettings(
      Object.fromEntries(
        extensionRegistry.map((extension) => [
          extension.id,
          {
            ...Object.fromEntries(
              extension.settings
                .filter((setting) => setting.key !== 'enabled')
                .map((setting) => [setting.key, setting.default ?? '']),
            ),
            ...Object.fromEntries(
              Object.entries(extensionSettingsById[extension.id] ?? {}).filter(
                ([key]) => key !== 'enabled',
              ),
            ),
          },
        ]),
      ),
    );
  }, [extensionRegistry, extensionSettingsById]);

  function normalizeTimeframe(value: unknown): Timeframe | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    const validTimeframes: Timeframe[] = ['15m', '1h', '4h', '1d'];
    return validTimeframes.includes(normalized as Timeframe) ? (normalized as Timeframe) : null;
  }

  function normalizeSavedStrategy(value: unknown, index: number): SavedStrategy | null {
    if (!value || typeof value !== 'object') return null;
    const candidate = value as Partial<SavedStrategy> & {
      symbol?: unknown;
      symbol_id?: unknown;
      setup?: unknown;
      setup_type?: unknown;
      strategy?: unknown;
      saved_at?: unknown;
    };
    const symbolId =
      typeof candidate.symbolId === 'string'
        ? candidate.symbolId
        : typeof candidate.symbol_id === 'string'
          ? candidate.symbol_id
          : typeof candidate.symbol === 'string'
            ? candidate.symbol
            : '';
    const setupType =
      typeof candidate.setupType === 'string'
        ? candidate.setupType
        : typeof candidate.setup_type === 'string'
          ? candidate.setup_type
          : typeof candidate.setup === 'string'
            ? candidate.setup
            : typeof candidate.strategy === 'string'
              ? candidate.strategy
              : '';
    const timeframe = normalizeTimeframe(candidate.timeframe);
    if (!symbolId.trim() || !setupType.trim() || !timeframe) return null;

    const savedAt =
      typeof candidate.savedAt === 'string' && candidate.savedAt.trim()
        ? candidate.savedAt
        : typeof candidate.saved_at === 'string' && candidate.saved_at.trim()
          ? candidate.saved_at
          : new Date().toISOString();
    const id =
      typeof candidate.id === 'string' && candidate.id.trim()
        ? candidate.id.trim()
        : `${symbolId}-${setupType}-${timeframe}-${Date.now()}-${index}`
            .toLowerCase()
            .replace(/[^a-z0-9_-]+/g, '-')
            .slice(0, 96);
    const name =
      typeof candidate.name === 'string' && candidate.name.trim()
        ? candidate.name.trim()
        : `${symbolId.trim()} ${setupType.trim()}`;
    return {
      id,
      name,
      symbolId: symbolId.trim().toUpperCase(),
      setupType: setupType.trim(),
      timeframe,
      savedAt,
    };
  }

  async function exportSavedStrategies() {
    const strategiesToExport = savedStrategies.filter((strategy) =>
      selectedStrategyIds.has(strategy.id),
    );
    if (!strategiesToExport.length) {
      setStrategyTransferStatus('Select at least one strategy before exporting.');
      return;
    }
    const filename = `quantglass-strategies-${new Date().toISOString().slice(0, 10)}.json`;
    const contents = JSON.stringify(
      {
        schema: 'quantglass.saved-strategies.v1',
        exportedAt: new Date().toISOString(),
        items: strategiesToExport,
      },
      null,
      2,
    );
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const selectedPath = await save({
        defaultPath: filename,
        filters: [{ name: 'QuantGlass strategy JSON', extensions: ['json'] }],
        title: 'Export QuantGlass strategies',
      });
      if (!selectedPath) {
        setStrategyTransferStatus('Export canceled.');
        return;
      }
      const { invoke } = await import('@tauri-apps/api/core');
      const path = await invoke<string>('save_json_export', { path: selectedPath, contents });
      setStrategyTransferStatus(
        `Exported ${strategiesToExport.length} selected strateg${strategiesToExport.length === 1 ? 'y' : 'ies'} to ${path}`,
      );
      return;
    } catch {
      // Browser fallback for non-Tauri preview sessions.
    }

    const blob = new Blob([contents], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStrategyTransferStatus(
      `Exported ${strategiesToExport.length} selected strateg${strategiesToExport.length === 1 ? 'y' : 'ies'} through browser download.`,
    );
  }

  async function importSavedStrategies(file: File | null) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const candidates = Array.isArray(parsed)
        ? parsed
        : parsed &&
            typeof parsed === 'object' &&
            Array.isArray((parsed as { items?: unknown }).items)
          ? (parsed as { items: unknown[] }).items
          : parsed &&
              typeof parsed === 'object' &&
              Array.isArray((parsed as { strategies?: unknown }).strategies)
            ? (parsed as { strategies: unknown[] }).strategies
            : parsed && typeof parsed === 'object'
              ? [parsed]
              : [];
      const strategies = candidates
        .map((candidate, index) => normalizeSavedStrategy(candidate, index))
        .filter((strategy): strategy is SavedStrategy => Boolean(strategy));
      setStrategyTransferStatus(
        strategies.length
          ? `Importing ${strategies.length} strateg${strategies.length === 1 ? 'y' : 'ies'}...`
          : 'No valid strategies found in the selected file.',
      );
      onImportSavedStrategies(strategies);
    } catch {
      setStrategyTransferStatus('Import failed because the selected file is not valid JSON.');
      onImportSavedStrategies([]);
    } finally {
      if (strategyImportRef.current) {
        strategyImportRef.current.value = '';
      }
    }
  }

  async function openExternalLink(url: string) {
    try {
      const { open } = await import('@tauri-apps/plugin-shell');
      await open(url);
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  function providerSetupId(providerId: string) {
    const requirement = providerCredentialRequirements[providerId];
    const matchingGroup = providerSetupGroups.find((group) => {
      if (group.id === providerId) return true;
      return requirement ? group.keyIds.join('|') === requirement.keyIds.join('|') : false;
    });
    return matchingGroup?.id ?? providerId;
  }

  function scrollToProviderKeyFields(providerId: string) {
    const setupId = providerSetupId(providerId);
    const group = providerSetupGroups.find((candidate) => candidate.id === setupId);
    const firstKeyId = group?.keyIds[0];
    if (!firstKeyId) return;
    window.setTimeout(() => {
      keyFieldRefs.current[firstKeyId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 75);
  }

  function goToProviderSetup(providerId?: string) {
    setSearchParams(
      providerId ? { tab: 'keys', setup: providerSetupId(providerId) } : { tab: 'keys' },
    );
    if (providerId) {
      scrollToProviderKeyFields(providerId);
    }
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

  function aiTemplateIcon(template: AiProviderTemplate) {
    if (template.id === 'template') return <Bot className="size-4" />;
    if (template.id === 'ollama') return <Server className="size-4" />;
    if (template.id === 'lm_studio') return <Cpu className="size-4" />;
    if (template.id === 'vllm') return <Zap className="size-4" />;
    if (template.id === 'llamacpp') return <Terminal className="size-4" />;
    if (template.id === 'anthropic') return <Sparkles className="size-4" />;
    if (template.id === 'openai') return <Brain className="size-4" />;
    if (template.id === 'gemini') return <Cloud className="size-4" />;
    if (template.id === 'deepseek') return <Brain className="size-4" />;
    if (template.id === 'mistral') return <Wind className="size-4" />;
    if (template.id === 'groq') return <Rocket className="size-4" />;
    if (template.id === 'openrouter') return <Route className="size-4" />;
    if (template.id === 'together') return <Plug className="size-4" />;
    if (template.id === 'azure') return <Cloud className="size-4" />;
    if (template.id === 'bedrock' || template.id === 'vertex')
      return <ShieldCheck className="size-4" />;
    return <Plug className="size-4" />;
  }

  function aiTemplateTone(template: AiProviderTemplate) {
    if (template.category === 'local') return 'border-buy/25 bg-buy/10 text-buy';
    if (template.category === 'cloud') return 'border-accent/25 bg-accent/10 text-accent';
    if (template.category === 'router') return 'border-watch/25 bg-watch/10 text-watch';
    return 'border-border bg-white/[0.04] text-muted';
  }

  function aiTemplateStatus(template: AiProviderTemplate) {
    if (template.adapterStatus === 'adapter_required') {
      return {
        label: 'Adapter required',
        tone: 'text-hold',
        dot: 'bg-hold',
        detail:
          'This provider needs a native adapter extension before it can fetch models or run narration.',
      };
    }
    if (template.provider === 'template') {
      return {
        label: 'Built-in',
        tone: 'text-buy',
        dot: 'bg-buy',
        detail: 'Always available as the deterministic fallback.',
      };
    }
    if (!template.apiKeyId) {
      return {
        label: template.category === 'local' ? 'Local endpoint' : 'No key selected',
        tone: 'text-buy',
        dot: 'bg-buy',
        detail: 'No saved API key is required by default.',
      };
    }
    const field = apiKeysById.get(template.apiKeyId);
    if (field?.configured) {
      return {
        label: 'Connected',
        tone: 'text-buy',
        dot: 'bg-buy',
        detail: `${field.label} is saved.`,
      };
    }
    return {
      label: 'Needs setup',
      tone: 'text-hold',
      dot: 'bg-hold',
      detail: `${field?.label ?? template.authMode} is not saved yet.`,
    };
  }

  function aiRuntimeStatusMeta(status?: string | null) {
    if (status === 'available') {
      return { label: 'Available', tone: 'border-buy/25 bg-buy/10 text-buy' };
    }
    if (status === 'loaded') {
      return { label: 'Loaded', tone: 'border-buy/25 bg-buy/10 text-buy' };
    }
    if (status === 'not_loaded') {
      return { label: 'Installed', tone: 'border-watch/25 bg-watch/10 text-watch' };
    }
    if (status === 'loading') {
      return { label: 'Loading', tone: 'border-watch/25 bg-watch/10 text-watch' };
    }
    if (status === 'busy') {
      return { label: 'Busy', tone: 'border-hold/25 bg-hold/10 text-hold' };
    }
    if (status === 'not_installed') {
      return { label: 'Not installed', tone: 'border-sell/25 bg-sell/10 text-sell' };
    }
    if (status === 'unavailable') {
      return { label: 'Runtime unavailable', tone: 'border-hold/25 bg-hold/10 text-hold' };
    }
    return { label: 'Runtime unknown', tone: 'border-border bg-white/[0.04] text-muted' };
  }

  function applyAiProviderTemplate(template: AiProviderTemplate, shouldFetch = true) {
    const nextSettings = {
      ...draftAiSettings,
      provider: template.provider,
      baseUrl: template.baseUrl,
      apiKeyId: template.apiKeyId,
      model: template.defaultModel ?? '',
      cloudEnabled: template.provider !== 'template',
    };
    setActiveAiProviderId(template.id);
    setCustomAiModelEnabled(false);
    setDraftAiSettings(nextSettings);
    if (shouldFetch && template.adapterStatus !== 'adapter_required') {
      onRefreshAiModels(nextSettings);
    }
  }

  function saveDraftAiKeyIfNeeded() {
    if (!selectedAiApiKey) return false;
    const value = draftApiKeys[selectedAiApiKey.id]?.trim() ?? '';
    if (!value) return false;
    onSaveApiKey(selectedAiApiKey.id, value);
    return true;
  }

  function testDraftAiProvider() {
    const savedDraftKey = saveDraftAiKeyIfNeeded();
    window.setTimeout(
      () => {
        onRefreshAiModels(draftAiSettings);
        onTestAiProvider(draftAiSettings);
      },
      savedDraftKey ? 300 : 0,
    );
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

  useEffect(() => {
    if (tab !== 'keys' || !focusedProviderSetup) return;
    const firstKeyId = focusedProviderSetup.keyIds[0];
    window.setTimeout(() => {
      keyFieldRefs.current[firstKeyId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 75);
  }, [focusedProviderSetup?.id, tab]);

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
                <div className="space-y-4">
                  <div className="rounded-3xl border border-border bg-white/[0.03] p-4 text-sm text-muted">
                    Notification tests use saved backend values for Telegram and email. Save changes
                    first, then test each delivery path.
                    <div className="mt-4">
                      <Button variant="secondary" onClick={() => onTestNotification('desktop')}>
                        Send Desktop test
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                          Provider setup map
                        </p>
                        <p className="mt-2 text-sm text-muted">
                          These are the same keyed providers shown in Advanced Providers. Save the
                          listed keys below to move a provider from needs setup to configured.
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        onClick={() => setSearchParams({ tab: 'providers' })}
                      >
                        Advanced Providers
                      </Button>
                    </div>
                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                      {providerSetupRows.map((row) => {
                        const isFocused = row === focusedProviderSetup;
                        const registryName = row.entry?.name ?? row.id;
                        const status = row.status ?? {
                          label: 'registry offline',
                          tone: 'text-muted',
                          detail:
                            'Provider registry metadata is unavailable while the backend is offline.',
                        };
                        return (
                          <div
                            key={row.id}
                            className={`rounded-2xl border p-4 text-sm ${isFocused ? 'border-accent/70 bg-accent/10' : 'border-border bg-surface/40'}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-medium text-ink">{row.label}</p>
                                <p className="mt-1 text-xs text-muted">{row.description}</p>
                              </div>
                              <span
                                className={`rounded-full border border-border px-2.5 py-1 text-xs ${status.tone}`}
                              >
                                {status.label}
                              </span>
                            </div>
                            <p className="mt-3 text-xs text-muted">
                              Registry entry: {registryName}
                            </p>
                            <p className="mt-2 text-xs text-muted">
                              Required keys:{' '}
                              {row.fields.map((field) => field.label).join(', ') ||
                                row.keyIds.join(', ')}
                            </p>
                            <p className="mt-2 text-xs text-muted">{status.detail}</p>
                            {row.missingFields.length ? (
                              <p className="mt-2 text-xs text-hold">
                                Missing: {row.missingFields.map((field) => field.label).join(', ')}
                              </p>
                            ) : (
                              <p className="mt-2 text-xs text-buy">All required keys are saved.</p>
                            )}
                            <Button
                              variant="ghost"
                              className="mt-3"
                              onClick={() => goToProviderSetup(row.id)}
                            >
                              Show key fields
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {apiKeySections.map((section) => (
                    <div key={section.id} className="space-y-4">
                      <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                          {section.title}
                        </p>
                        <p className="mt-2 text-sm text-muted">{section.description}</p>
                      </div>
                      {section.items.map((field) => {
                        const isFocusedKey = focusedProviderKeyIds.has(field.id);
                        const draftValue = draftApiKeys[field.id] ?? '';
                        const canSaveKey = !field.secret || Boolean(draftValue.trim());
                        return (
                          <div
                            key={field.id}
                            ref={(element) => {
                              keyFieldRefs.current[field.id] = element;
                            }}
                            className={`rounded-3xl border p-4 ${isFocusedKey ? 'border-accent/70 bg-accent/10' : 'border-border bg-white/[0.03]'}`}
                          >
                            <div className="flex items-center justify-between gap-4">
                              <div>
                                <p className="font-medium text-ink">{field.label}</p>
                                <p className="text-sm text-muted">{field.note}</p>
                              </div>
                              <KeyRound className="size-5 text-accent" />
                            </div>
                            <div className="mt-4 rounded-2xl border border-border bg-surface/40 px-4 py-3 metric-text text-sm text-ink">
                              {field.secret
                                ? field.configured
                                  ? 'Configured'
                                  : 'Not configured'
                                : field.value || 'Not configured'}
                            </div>
                            <label className="mt-4 block space-y-2 text-sm text-muted">
                              <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
                                {field.secret && field.configured ? 'New value' : 'Stored value'}
                              </span>
                              <input
                                className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                                type={field.secret ? 'password' : 'text'}
                                autoComplete="off"
                                placeholder={
                                  field.secret && field.configured
                                    ? 'Leave blank to keep current saved key'
                                    : ''
                                }
                                value={draftValue}
                                onChange={(event) =>
                                  setDraftApiKeys((current) => ({
                                    ...current,
                                    [field.id]: event.target.value,
                                  }))
                                }
                              />
                            </label>
                            <div className="mt-4 flex flex-wrap items-center gap-3">
                              <Button
                                disabled={!canSaveKey}
                                onClick={() => onSaveApiKey(field.id, draftValue)}
                              >
                                Save key
                              </Button>
                              {field.secret && field.configured ? (
                                <Button variant="danger" onClick={() => onSaveApiKey(field.id, '')}>
                                  Clear key
                                </Button>
                              ) : null}
                              {notificationTestFieldMap[field.id] ? (
                                <Button
                                  variant="ghost"
                                  onClick={() =>
                                    onTestNotification(
                                      notificationTestFieldMap[field.id] as NotificationTestChannel,
                                    )
                                  }
                                >
                                  Send{' '}
                                  {notificationTestFieldMap[field.id] === 'telegram'
                                    ? 'Telegram'
                                    : 'Email'}{' '}
                                  test
                                </Button>
                              ) : null}
                              <Button
                                variant="secondary"
                                onClick={() =>
                                  setDraftApiKeys((current) => ({
                                    ...current,
                                    [field.id]: field.secret ? '' : field.value,
                                  }))
                                }
                              >
                                Reset
                              </Button>
                            </div>
                            {field.tradeEnabled ? (
                              <p className="mt-2 text-xs text-hold">Trade-enabled key</p>
                            ) : (
                              <p className="mt-2 text-xs text-muted">
                                Provider, notification, or delivery-scope setting
                              </p>
                            )}
                          </div>
                        );
                      })}
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
                        <p className="text-sm text-muted">
                          Default is paper. Live mode is gated behind saved Alpaca credentials,
                          explicit confirmation, and backend live-order safety checks.
                        </p>
                      </div>
                      <ShieldCheck className="size-5 text-accent" />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <Button
                        variant={tradingMode === 'paper' ? 'primary' : 'secondary'}
                        onClick={() => onSetTradingMode('paper')}
                      >
                        paper
                      </Button>
                      <button
                        type="button"
                        title={
                          hasAlpacaCredentials
                            ? 'Enable live broker routing'
                            : 'Save Alpaca key ID and secret before enabling live mode'
                        }
                        disabled={!hasAlpacaCredentials}
                        className={`rounded-2xl border border-border px-4 py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${tradingMode === 'live' ? 'bg-sell/15 text-sell' : 'bg-white/[0.03] text-muted'}`}
                        onClick={onRequestLiveTrading}
                      >
                        live
                      </button>
                      <Button variant="ghost" onClick={() => setSearchParams({ tab: 'keys' })}>
                        Go to API Keys
                      </Button>
                    </div>
                    <p className="mt-3 text-xs text-muted">
                      Live confirmation:{' '}
                      {tradingMode === 'live' && liveTradingConfirmed
                        ? 'enabled for the current backend settings'
                        : 'not enabled'}
                      .
                      {hasAlpacaCredentials
                        ? ' Alpaca credentials are saved.'
                        : ' Alpaca credentials are missing.'}
                    </p>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
                      <p className="font-medium text-ink">Partial candles</p>
                      <p className="mt-2 text-sm text-muted">
                        `act_on_partial_candles = false` is enforced in the current build. Signals
                        use closed candles only.
                      </p>
                    </div>
                    <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
                      <p className="font-medium text-ink">Minimum backtest sample</p>
                      <input
                        className="mt-4 w-full"
                        type="range"
                        min="20"
                        max="150"
                        step="5"
                        value={minBacktestSample}
                        onChange={(event) => onSetMinBacktestSample(Number(event.target.value))}
                      />
                      <p className="mt-2 text-sm text-muted">
                        {minBacktestSample} trades. Strategies below this threshold show a warning
                        badge in Backtesting.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              {tab === 'ai' ? (
                <div className="space-y-5">
                  <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <p className="font-medium text-ink">Model providers</p>
                        <p className="text-sm text-muted">
                          Connect local, cloud, router, and enterprise LLMs. Model lists are fetched
                          from the selected provider when possible.
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        onClick={() =>
                          applyAiProviderTemplate(
                            aiProviderTemplates.find((template) => template.id === 'custom') ??
                              activeAiProviderTemplate,
                            false,
                          )
                        }
                      >
                        <Plus className="size-4" />
                        Add provider
                      </Button>
                    </div>
                    <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-surface/40">
                      <div className="grid min-h-[34rem] lg:grid-cols-[18rem_minmax(0,1fr)]">
                        <div className="border-b border-border p-3 lg:border-b-0 lg:border-r">
                          <label className="relative block">
                            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                            <input
                              className="w-full rounded-2xl border border-border bg-white/[0.04] py-2.5 pl-9 pr-3 text-sm text-ink outline-none"
                              value={aiProviderSearch}
                              placeholder="Search providers"
                              onChange={(event) => setAiProviderSearch(event.target.value)}
                            />
                          </label>
                          <div className="mt-3 space-y-4">
                            {aiProviderGroups.map((group) =>
                              group.items.length ? (
                                <div key={group.category}>
                                  <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                                    {group.label}
                                  </p>
                                  <div className="mt-2 space-y-1">
                                    {group.items.map((template) => {
                                      const status = aiTemplateStatus(template);
                                      const active = template.id === activeAiProviderTemplate.id;
                                      return (
                                        <button
                                          key={template.id}
                                          type="button"
                                          className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-sm transition hover:bg-white/[0.06] ${active ? 'bg-accent/10 text-ink' : 'text-muted'}`}
                                          onClick={() => applyAiProviderTemplate(template)}
                                        >
                                          <span
                                            className={`flex size-8 shrink-0 items-center justify-center rounded-xl border ${aiTemplateTone(template)}`}
                                          >
                                            {aiTemplateIcon(template)}
                                          </span>
                                          <span className="min-w-0 flex-1 truncate">
                                            {template.label}
                                          </span>
                                          <span
                                            className={`size-2 shrink-0 rounded-full ${status.dot}`}
                                            title={status.label}
                                          />
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : null,
                            )}
                          </div>
                        </div>

                        <div className="p-4">
                          {(() => {
                            const activeStatus = aiTemplateStatus(activeAiProviderTemplate);
                            return (
                              <div className="space-y-4">
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                  <div className="flex min-w-0 items-start gap-3">
                                    <span
                                      className={`flex size-12 shrink-0 items-center justify-center rounded-2xl border ${aiTemplateTone(activeAiProviderTemplate)}`}
                                    >
                                      {aiTemplateIcon(activeAiProviderTemplate)}
                                    </span>
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <p className="font-medium text-ink">
                                          {activeAiProviderTemplate.label}
                                        </p>
                                        <span className="rounded-full border border-border bg-white/[0.04] px-2.5 py-1 text-xs text-muted">
                                          {activeAiProviderTemplate.tier}
                                        </span>
                                        <span className="rounded-full border border-border bg-white/[0.04] px-2.5 py-1 text-xs text-muted">
                                          {activeAiProviderTemplate.adapterStatus.replace('_', ' ')}
                                        </span>
                                      </div>
                                      <p className="mt-1 text-sm text-muted">
                                        {activeAiProviderTemplate.description}
                                      </p>
                                    </div>
                                  </div>
                                  <span
                                    className={`inline-flex items-center gap-2 rounded-full border border-border bg-white/[0.04] px-3 py-1.5 text-xs ${activeStatus.tone}`}
                                  >
                                    <span className={`size-2 rounded-full ${activeStatus.dot}`} />
                                    {activeStatus.label}
                                  </span>
                                </div>

                                <div className="rounded-2xl border border-border bg-white/[0.03] p-4 text-sm text-muted">
                                  <div className="grid gap-3 md:grid-cols-4">
                                    <div>
                                      <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                                        Provider
                                      </p>
                                      <p className="mt-1 text-ink">
                                        {aiProviderProfiles[draftAiSettings.provider].label}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                                        Auth
                                      </p>
                                      <p className="mt-1 text-ink">
                                        {activeAiProviderTemplate.authMode}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                                        Models
                                      </p>
                                      <p
                                        className={`mt-1 ${aiModelsFetched ? 'text-buy' : 'text-hold'}`}
                                      >
                                        {aiCatalogStatus}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                                        Source
                                      </p>
                                      <p className="mt-1 text-ink">{aiModelSource}</p>
                                    </div>
                                  </div>
                                  <p className="mt-3 text-xs text-muted">{activeStatus.detail}</p>
                                </div>

                                <div className="grid gap-4 lg:grid-cols-2">
                                  <label className="space-y-2 text-sm text-muted lg:col-span-2">
                                    <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
                                      {activeAiProviderTemplate.category === 'enterprise'
                                        ? 'Endpoint / deployment URL'
                                        : 'Base URL'}
                                    </span>
                                    <input
                                      className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 font-mono text-sm text-ink outline-none"
                                      value={draftAiSettings.baseUrl}
                                      disabled={
                                        draftAiSettings.provider === 'template' ||
                                        activeAiProviderTemplate.adapterStatus ===
                                          'adapter_required'
                                      }
                                      placeholder="https://api.openai.com/v1, http://127.0.0.1:11434, or any /v1 compatible endpoint"
                                      onChange={(event) =>
                                        setDraftAiSettings({
                                          ...draftAiSettings,
                                          baseUrl: event.target.value,
                                        })
                                      }
                                    />
                                  </label>

                                  <label className="space-y-2 text-sm text-muted">
                                    <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
                                      API key slot
                                    </span>
                                    <select
                                      className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                                      value={draftAiSettings.apiKeyId ?? ''}
                                      disabled={
                                        draftAiSettings.provider === 'template' ||
                                        activeAiProviderTemplate.adapterStatus ===
                                          'adapter_required'
                                      }
                                      onChange={(event) =>
                                        setDraftAiSettings({
                                          ...draftAiSettings,
                                          apiKeyId: event.target.value || null,
                                        })
                                      }
                                    >
                                      <option value="">No key</option>
                                      {aiApiKeyOptions.map((field) => (
                                        <option key={field.id} value={field.id}>
                                          {field.label}
                                        </option>
                                      ))}
                                    </select>
                                    <span className="block text-xs text-muted">
                                      {selectedAiApiKey
                                        ? `${selectedAiApiKey.label}: ${selectedAiApiKey.configured ? 'Configured' : draftApiKeys[selectedAiApiKey.id]?.trim() ? 'Draft key entered' : 'Not configured'}`
                                        : 'Local runtimes and public test gateways may not need a key.'}
                                    </span>
                                  </label>

                                  <label className="space-y-2 text-sm text-muted">
                                    <span className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.18em]">
                                      <span>Default model</span>
                                      <span className={aiModelsFetched ? 'text-buy' : 'text-hold'}>
                                        {aiModelsLoading
                                          ? 'Fetching'
                                          : aiModelsFetched
                                            ? 'Live'
                                            : 'Fallback'}
                                      </span>
                                    </span>
                                    <select
                                      className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                                      value={
                                        customAiModelEnabled
                                          ? '__custom__'
                                          : draftAiSettings.model
                                            ? aiModelOptions.includes(draftAiSettings.model)
                                              ? draftAiSettings.model
                                              : '__custom__'
                                            : '__none__'
                                      }
                                      disabled={
                                        aiModelsLoading ||
                                        activeAiProviderTemplate.adapterStatus ===
                                          'adapter_required'
                                      }
                                      onChange={(event) => {
                                        if (event.target.value === '__none__') {
                                          setDraftAiSettings({ ...draftAiSettings, model: '' });
                                          return;
                                        }
                                        if (event.target.value === '__custom__') {
                                          setCustomAiModelEnabled(true);
                                          return;
                                        }
                                        setCustomAiModelEnabled(false);
                                        setDraftAiSettings({
                                          ...draftAiSettings,
                                          model: event.target.value,
                                        });
                                      }}
                                    >
                                      <option value="__none__">
                                        {aiModelsLoading
                                          ? 'Fetching latest models...'
                                          : 'Select a fetched model'}
                                      </option>
                                      {aiModelOptions.map((model) => {
                                        const item = aiModelById.get(model);
                                        const label =
                                          item?.label && item.label !== model
                                            ? `${item.label} (${model})`
                                            : model;
                                        const runtimeLabel = item?.runtimeStatus
                                          ? ` - ${aiRuntimeStatusMeta(item.runtimeStatus).label}`
                                          : '';
                                        return (
                                          <option key={model} value={model}>
                                            {aiModelsFetched
                                              ? `${label}${runtimeLabel}`
                                              : `${label} - fallback`}
                                          </option>
                                        );
                                      })}
                                      <option value="__custom__">Custom model id...</option>
                                    </select>
                                    {customAiModelEnabled ? (
                                      <input
                                        className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 font-mono text-sm text-ink outline-none"
                                        value={draftAiSettings.model}
                                        placeholder="provider/model-name or deployment id"
                                        onChange={(event) =>
                                          setDraftAiSettings({
                                            ...draftAiSettings,
                                            model: event.target.value,
                                          })
                                        }
                                      />
                                    ) : null}
                                    <span className="block text-xs text-muted">
                                      {aiModelsLoading ? 'Fetching models...' : aiModelDetail}
                                    </span>
                                  </label>

                                  {selectedAiApiKey ? (
                                    <div className="rounded-2xl border border-border bg-white/[0.03] p-4 lg:col-span-2">
                                      <div className="flex items-start justify-between gap-4">
                                        <div>
                                          <p className="font-medium text-ink">
                                            {selectedAiApiKey.label}
                                          </p>
                                          <p className="text-sm text-muted">
                                            {selectedAiApiKey.note}
                                          </p>
                                        </div>
                                        <KeyRound className="size-5 text-accent" />
                                      </div>
                                      <label className="mt-4 block space-y-2 text-sm text-muted">
                                        <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
                                          Stored value
                                        </span>
                                        <input
                                          className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 font-mono text-sm text-ink outline-none"
                                          type="password"
                                          autoComplete="off"
                                          placeholder={
                                            selectedAiApiKey.configured
                                              ? 'Leave blank to keep current saved key'
                                              : 'Paste API key'
                                          }
                                          value={draftApiKeys[selectedAiApiKey.id] ?? ''}
                                          onChange={(event) =>
                                            setDraftApiKeys((current) => ({
                                              ...current,
                                              [selectedAiApiKey.id]: event.target.value,
                                            }))
                                          }
                                        />
                                      </label>
                                      <div className="mt-4 flex flex-wrap gap-3">
                                        <Button
                                          disabled={!draftApiKeys[selectedAiApiKey.id]?.trim()}
                                          onClick={() =>
                                            onSaveApiKey(
                                              selectedAiApiKey.id,
                                              draftApiKeys[selectedAiApiKey.id] ?? '',
                                            )
                                          }
                                        >
                                          Save key
                                        </Button>
                                        {selectedAiApiKey.configured ? (
                                          <Button
                                            variant="danger"
                                            onClick={() => onSaveApiKey(selectedAiApiKey.id, '')}
                                          >
                                            Clear key
                                          </Button>
                                        ) : null}
                                        <Button
                                          variant="secondary"
                                          onClick={() =>
                                            setDraftApiKeys((current) => ({
                                              ...current,
                                              [selectedAiApiKey.id]: '',
                                            }))
                                          }
                                        >
                                          Reset key field
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          onClick={() => setSearchParams({ tab: 'keys' })}
                                        >
                                          All API keys
                                        </Button>
                                      </div>
                                    </div>
                                  ) : null}

                                  {selectedAiModelInfo ? (
                                    <div className="rounded-2xl border border-border bg-white/[0.03] p-4 text-sm text-muted lg:col-span-2">
                                      <div className="grid gap-3 md:grid-cols-5">
                                        <div>
                                          <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                                            Selected model
                                          </p>
                                          <p className="mt-1 text-ink">
                                            {selectedAiModelInfo.label ?? selectedAiModelInfo.id}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                                            Owner / date
                                          </p>
                                          <p className="mt-1 text-ink">
                                            {selectedAiModelInfo.ownedBy ??
                                              selectedAiModelInfo.createdAt ??
                                              (selectedAiModelInfo.created
                                                ? new Date(selectedAiModelInfo.created * 1000)
                                                    .toISOString()
                                                    .slice(0, 10)
                                                : 'Provider catalog')}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                                            Input limit
                                          </p>
                                          <p className="mt-1 text-ink">
                                            {selectedAiModelInfo.inputTokenLimit
                                              ? selectedAiModelInfo.inputTokenLimit.toLocaleString()
                                              : 'Provider default'}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                                            Output limit
                                          </p>
                                          <p className="mt-1 text-ink">
                                            {selectedAiModelInfo.outputTokenLimit
                                              ? selectedAiModelInfo.outputTokenLimit.toLocaleString()
                                              : 'Provider default'}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                                            Runtime
                                          </p>
                                          <span
                                            className={`mt-1 inline-flex rounded-full border px-2.5 py-1 text-xs ${aiRuntimeStatusMeta(selectedAiModelInfo.runtimeStatus).tone}`}
                                          >
                                            {
                                              aiRuntimeStatusMeta(selectedAiModelInfo.runtimeStatus)
                                                .label
                                            }
                                          </span>
                                        </div>
                                      </div>
                                      {selectedAiModelInfo.description ? (
                                        <p className="mt-3 text-xs text-muted">
                                          {selectedAiModelInfo.description}
                                        </p>
                                      ) : null}
                                      {selectedAiModelInfo.runtimeDetail ? (
                                        <p className="mt-2 text-xs text-muted">
                                          {selectedAiModelInfo.runtimeDetail}
                                        </p>
                                      ) : null}
                                    </div>
                                  ) : null}

                                  <label className="space-y-2 text-sm text-muted">
                                    <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
                                      Temperature
                                    </span>
                                    <input
                                      className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                                      type="number"
                                      min="0"
                                      max="2"
                                      step="0.1"
                                      value={draftAiSettings.temperature}
                                      onChange={(event) =>
                                        setDraftAiSettings({
                                          ...draftAiSettings,
                                          temperature: Number(event.target.value),
                                        })
                                      }
                                    />
                                  </label>
                                  <label className="space-y-2 text-sm text-muted">
                                    <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
                                      Max tokens
                                    </span>
                                    <input
                                      className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                                      type="number"
                                      min="32"
                                      max="4096"
                                      step="16"
                                      value={draftAiSettings.maxTokens}
                                      onChange={(event) =>
                                        setDraftAiSettings({
                                          ...draftAiSettings,
                                          maxTokens: Number(event.target.value),
                                        })
                                      }
                                    />
                                  </label>
                                  <label className="space-y-2 text-sm text-muted">
                                    <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
                                      Timeout seconds
                                    </span>
                                    <input
                                      className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                                      type="number"
                                      min="1"
                                      max="120"
                                      step="1"
                                      value={draftAiSettings.requestTimeoutSeconds}
                                      onChange={(event) =>
                                        setDraftAiSettings({
                                          ...draftAiSettings,
                                          requestTimeoutSeconds: Number(event.target.value),
                                        })
                                      }
                                    />
                                    <span className="block text-xs text-muted">
                                      Use 60-120 seconds for cold-starting large local models.
                                    </span>
                                  </label>
                                </div>

                                {aiProviderTestResult ? (
                                  <div
                                    className={`rounded-2xl border p-4 text-sm ${aiProviderTestResult.ok ? 'border-buy/25 bg-buy/10 text-buy' : 'border-hold/25 bg-hold/10 text-hold'}`}
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <p className="font-medium">
                                          {aiProviderTestResult.ok
                                            ? 'Provider test passed'
                                            : 'Provider test failed'}
                                        </p>
                                        <span
                                          className={`rounded-full border px-2.5 py-1 text-xs ${aiRuntimeStatusMeta(aiProviderTestResult.runtimeStatus).tone}`}
                                        >
                                          {
                                            aiRuntimeStatusMeta(aiProviderTestResult.runtimeStatus)
                                              .label
                                          }
                                        </span>
                                      </div>
                                      <span className="rounded-full border border-current/20 px-2.5 py-1 text-xs">
                                        {aiProviderTestResult.elapsedMs.toLocaleString()} ms
                                      </span>
                                    </div>
                                    <p className="mt-2">{aiProviderTestResult.detail}</p>
                                    {aiProviderTestResult.runtimeDetail ? (
                                      <p className="mt-2 text-xs opacity-80">
                                        {aiProviderTestResult.runtimeDetail}
                                      </p>
                                    ) : null}
                                    {aiProviderTestResult.source ? (
                                      <p className="mt-2 text-xs opacity-80">
                                        Source: {aiProviderTestResult.source}
                                      </p>
                                    ) : null}
                                    {aiProviderTestResult.sample ? (
                                      <p className="mt-3 rounded-2xl border border-current/20 bg-black/10 p-3 text-ink">
                                        {aiProviderTestResult.sample}
                                      </p>
                                    ) : null}
                                  </div>
                                ) : null}

                                <div className="flex flex-wrap gap-3">
                                  <Button
                                    disabled={
                                      activeAiProviderTemplate.adapterStatus === 'adapter_required'
                                    }
                                    onClick={() => {
                                      saveDraftAiKeyIfNeeded();
                                      onUpdateAiSettings(draftAiSettings);
                                    }}
                                  >
                                    <Save className="size-4" />
                                    Save provider
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    onClick={testDraftAiProvider}
                                    disabled={
                                      aiModelsLoading ||
                                      aiProviderTestLoading ||
                                      activeAiProviderTemplate.adapterStatus ===
                                        'adapter_required' ||
                                      (draftAiSettings.provider !== 'template' &&
                                        !draftAiSettings.model.trim())
                                    }
                                  >
                                    <Plug className="size-4" />
                                    {aiProviderTestLoading
                                      ? 'Testing provider...'
                                      : 'Test / fetch models'}
                                  </Button>
                                  <Button
                                    variant="secondary"
                                    onClick={() => {
                                      setDraftAiSettings(aiSettings);
                                      setCustomAiModelEnabled(false);
                                    }}
                                  >
                                    Reset
                                  </Button>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-medium text-ink">Model narration</p>
                        <p className="text-sm text-muted">
                          When on, the selected local or API model rewrites the summary. Failed
                          calls and failed fact checks fall back to the deterministic template.
                        </p>
                      </div>
                      <CloudOff className="size-5 text-muted" />
                    </div>
                    <div className="mt-4 flex items-center justify-between rounded-2xl border border-border bg-surface/40 px-4 py-3 text-sm text-muted">
                      <span>
                        Narration:{' '}
                        {draftAiSettings.provider === 'template'
                          ? 'deterministic template'
                          : draftAiSettings.cloudEnabled
                            ? `${draftAiSettings.provider} (fact-checked)`
                            : 'deterministic template'}
                      </span>
                      <button
                        type="button"
                        disabled={draftAiSettings.provider === 'template'}
                        className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] disabled:cursor-not-allowed disabled:opacity-50 ${draftAiSettings.cloudEnabled ? 'bg-buy/12 text-buy' : 'bg-white/8 text-muted'}`}
                        onClick={() =>
                          setDraftAiSettings({
                            ...draftAiSettings,
                            cloudEnabled: !draftAiSettings.cloudEnabled,
                          })
                        }
                      >
                        {draftAiSettings.cloudEnabled ? 'On' : 'Off'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {tab === 'extensions' ? (
                <div className="space-y-5">
                  <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium text-ink">Extension registry</p>
                        <p className="mt-2 text-sm text-muted">
                          Installed Python entry-point extensions can register providers, model
                          gateways, indicators, strategies, and notification channels. External
                          extension loading is opt-in from the backend environment.
                        </p>
                      </div>
                      <Plug className="size-5 text-accent" />
                    </div>
                  </div>
                  {extensionRegistry.length ? (
                    <div className="grid gap-4 lg:grid-cols-2">
                      {extensionRegistry.map((extension) => {
                        const extensionSettings = extension.settings.filter(
                          (setting) => setting.key !== 'enabled',
                        );
                        const isLoaderNotice =
                          extension.id === 'python-entry-points' && !extension.loaded;
                        return (
                          <div
                            key={extension.id}
                            className="rounded-3xl border border-border bg-white/[0.03] p-4"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <p className="font-medium text-ink">{extension.name}</p>
                                <p className="mt-1 text-xs text-muted">
                                  {extension.id} · v{extension.version}
                                </p>
                              </div>
                              <span
                                className={`rounded-full border border-border px-2.5 py-1 text-xs ${extension.loaded ? 'text-buy' : 'text-muted'}`}
                              >
                                {extension.loaded ? 'loaded' : 'inactive'}
                              </span>
                            </div>
                            <p className="mt-3 text-sm text-muted">{extension.description}</p>
                            <p className="mt-3 text-xs text-muted">
                              Capabilities: {extension.capabilities.join(', ') || 'none'}
                            </p>
                            <p className="mt-2 text-xs text-muted">
                              Permissions: {extension.permissions.join(', ') || 'none'}
                            </p>
                            <p className="mt-2 text-xs text-muted">
                              Settings:{' '}
                              {extensionSettings.length
                                ? extensionSettings.map((setting) => setting.key).join(', ')
                                : 'none'}
                            </p>
                            {isLoaderNotice ? (
                              <div className="mt-4 rounded-2xl border border-hold/30 bg-hold/10 px-4 py-3 text-sm text-hold">
                                Extension code loading is off. Restart the backend with{' '}
                                <code className="rounded-md bg-black/20 px-1.5 py-0.5 text-xs">
                                  npm run backend:dev:extensions
                                </code>{' '}
                                to discover trusted local packs and installed entry points.
                              </div>
                            ) : (
                              <div className="mt-4 flex items-center justify-between rounded-2xl border border-border bg-surface/40 px-4 py-3 text-sm text-muted">
                                <span>
                                  {extension.enabled ? 'Enabled after backend restart' : 'Disabled'}
                                </span>
                                <button
                                  type="button"
                                  className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${extension.enabled ? 'bg-buy/12 text-buy' : 'bg-white/8 text-muted'}`}
                                  onClick={() =>
                                    onUpdateExtensionEnabled(extension.id, !extension.enabled)
                                  }
                                >
                                  {extension.enabled ? 'On' : 'Off'}
                                </button>
                              </div>
                            )}
                            {extensionSettings.length ? (
                              <div className="mt-4 space-y-3">
                                {extensionSettings.map((setting) => (
                                  <label
                                    key={setting.key}
                                    className="block space-y-2 text-sm text-muted"
                                  >
                                    <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
                                      {setting.label}
                                    </span>
                                    {setting.type === 'boolean' ? (
                                      <select
                                        className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                                        value={String(
                                          draftExtensionSettings[extension.id]?.[setting.key] ??
                                            setting.default ??
                                            false,
                                        )}
                                        onChange={(event) =>
                                          setDraftExtensionSettings((current) => ({
                                            ...current,
                                            [extension.id]: {
                                              ...(current[extension.id] ?? {}),
                                              [setting.key]: event.target.value === 'true',
                                            },
                                          }))
                                        }
                                      >
                                        <option value="false">false</option>
                                        <option value="true">true</option>
                                      </select>
                                    ) : setting.type === 'select' ? (
                                      <select
                                        className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                                        value={String(
                                          draftExtensionSettings[extension.id]?.[setting.key] ??
                                            setting.default ??
                                            '',
                                        )}
                                        onChange={(event) =>
                                          setDraftExtensionSettings((current) => ({
                                            ...current,
                                            [extension.id]: {
                                              ...(current[extension.id] ?? {}),
                                              [setting.key]: event.target.value,
                                            },
                                          }))
                                        }
                                      >
                                        {setting.options.map((option) => (
                                          <option key={option} value={option}>
                                            {option}
                                          </option>
                                        ))}
                                      </select>
                                    ) : (
                                      <input
                                        className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                                        type={
                                          setting.type === 'secret'
                                            ? 'password'
                                            : setting.type === 'number'
                                              ? 'number'
                                              : 'text'
                                        }
                                        value={String(
                                          draftExtensionSettings[extension.id]?.[setting.key] ??
                                            setting.default ??
                                            '',
                                        )}
                                        onChange={(event) =>
                                          setDraftExtensionSettings((current) => ({
                                            ...current,
                                            [extension.id]: {
                                              ...(current[extension.id] ?? {}),
                                              [setting.key]:
                                                setting.type === 'number'
                                                  ? Number(event.target.value)
                                                  : event.target.value,
                                            },
                                          }))
                                        }
                                      />
                                    )}
                                    {setting.description ? (
                                      <span className="block text-xs text-muted">
                                        {setting.description}
                                      </span>
                                    ) : null}
                                  </label>
                                ))}
                                <Button
                                  onClick={() =>
                                    onUpdateExtensionSettings(
                                      extension.id,
                                      draftExtensionSettings[extension.id] ?? {},
                                    )
                                  }
                                >
                                  Save extension settings
                                </Button>
                              </div>
                            ) : null}
                            {extension.diagnostics.length ? (
                              <p className="mt-3 text-xs text-hold">
                                {extension.diagnostics.join(' ')}
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <EmptyState
                      title="No extensions reported"
                      description="The backend did not return extension registry metadata."
                    />
                  )}
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-medium text-ink">Registered strategies</p>
                          <p className="mt-2 text-sm text-muted">
                            Backtesting uses this registry. Extension strategies appear here and can
                            contribute matching setup presets.
                          </p>
                        </div>
                        <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted">
                          {extensionStrategies.length}
                        </span>
                      </div>
                      <div className="mt-4 space-y-3">
                        {extensionStrategies.map((strategy) => (
                          <div
                            key={strategy.id}
                            className="rounded-2xl border border-border bg-surface/40 p-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-medium text-ink">{strategy.name}</p>
                              <div className="flex flex-wrap gap-1">
                                {strategy.executable ? (
                                  <span className="rounded-full border border-buy/30 bg-buy/10 px-2 py-0.5 text-[11px] text-buy">
                                    executable
                                  </span>
                                ) : null}
                                <span
                                  className={`rounded-full border border-border px-2 py-0.5 text-[11px] ${strategy.source === 'extension' ? 'text-accent' : 'text-muted'}`}
                                >
                                  {strategy.source}
                                </span>
                              </div>
                            </div>
                            <p className="mt-2 text-xs text-muted">{strategy.description}</p>
                            <p className="mt-2 text-xs text-muted">
                              Setups: {strategy.setup_types.join(', ')}
                            </p>
                            <p className="mt-1 text-xs text-muted">
                              Markets: {strategy.market_types.join(', ')} / Timeframes:{' '}
                              {strategy.timeframes.join(', ')}
                            </p>
                            {strategy.extension_id ? (
                              <p className="mt-1 text-xs text-accent">
                                Extension: {strategy.extension_id}
                              </p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-medium text-ink">Indicator catalog</p>
                          <p className="mt-2 text-sm text-muted">
                            Computed indicators feed signals and backtests now. Catalog indicators
                            are documented contribution targets for community packs and future chart
                            overlays.
                          </p>
                        </div>
                        <div className="flex flex-wrap justify-end gap-2">
                          <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted">
                            {extensionIndicators.length} total
                          </span>
                          <span className="rounded-full border border-buy/30 bg-buy/10 px-2.5 py-1 text-xs text-buy">
                            {computedIndicatorCount} computed
                          </span>
                          <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted">
                            {extensionIndicators.length - computedIndicatorCount} catalog
                          </span>
                        </div>
                      </div>
                      <div className="mt-4 space-y-4">
                        {extensionIndicatorGroups.map(([category, indicators]) => (
                          <div
                            key={category}
                            className="rounded-2xl border border-border bg-surface/40 p-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                                {category.replaceAll('_', ' ')}
                              </p>
                              <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
                                {indicators.length}
                              </span>
                            </div>
                            <div className="mt-3 grid gap-3">
                              {indicators.map((indicator) => (
                                <div
                                  key={indicator.id}
                                  className="rounded-2xl border border-border bg-white/[0.03] p-3"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-sm font-medium text-ink">{indicator.name}</p>
                                    <div className="flex flex-wrap gap-1">
                                      <span
                                        className={`rounded-full border px-2 py-0.5 text-[11px] ${indicator.maturity === 'computed' ? 'border-buy/30 bg-buy/10 text-buy' : 'border-border text-muted'}`}
                                      >
                                        {indicator.maturity ?? 'catalog'}
                                      </span>
                                      <span
                                        className={`rounded-full border border-border px-2 py-0.5 text-[11px] ${indicator.source === 'extension' ? 'text-accent' : 'text-muted'}`}
                                      >
                                        {indicator.source}
                                      </span>
                                    </div>
                                  </div>
                                  <p className="mt-2 text-xs text-muted">{indicator.description}</p>
                                  <p className="mt-2 text-xs text-muted">
                                    Inputs: {indicator.inputs.join(', ') || 'none'} / Outputs:{' '}
                                    {indicator.outputs.join(', ') || 'none'}
                                  </p>
                                  {indicator.families?.length ? (
                                    <p className="mt-1 text-xs text-muted">
                                      Families: {indicator.families.join(', ')}
                                    </p>
                                  ) : null}
                                  {indicator.extension_id ? (
                                    <p className="mt-1 text-xs text-accent">
                                      Extension: {indicator.extension_id}
                                    </p>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
                    <p className="font-medium text-ink">Contribution surfaces</p>
                    <p className="mt-2 text-sm text-muted">
                      Backend-declared extension points that contributors can target with providers,
                      execution adapters, notifications, import/export flows, data-quality checks,
                      and UI panels.
                    </p>
                    {extensionSurfaceGroups.length ? (
                      <div className="mt-4 grid gap-4 lg:grid-cols-2">
                        {extensionSurfaceGroups.map(([category, surfaces]) => (
                          <div
                            key={category}
                            className="rounded-2xl border border-border bg-surface/40 p-4"
                          >
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                              {category.replace('_', ' ')}
                            </p>
                            <div className="mt-3 space-y-3">
                              {surfaces.map((surface) => (
                                <div
                                  key={surface.id}
                                  className="rounded-2xl border border-border bg-white/[0.03] p-3"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <p className="text-sm font-medium text-ink">{surface.name}</p>
                                    <span
                                      className={`rounded-full border border-border px-2 py-0.5 text-[11px] ${surface.maturity === 'available' ? 'text-buy' : 'text-hold'}`}
                                    >
                                      {surface.maturity}
                                    </span>
                                  </div>
                                  <p className="mt-2 text-xs text-muted">{surface.description}</p>
                                  <p className="mt-2 text-xs text-muted">
                                    Source: {surface.source}
                                    {surface.extension_id ? ` / ${surface.extension_id}` : ''}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState
                        title="No contribution surfaces reported"
                        description="The backend did not return extension surface metadata."
                      />
                    )}
                  </div>
                </div>
              ) : null}

              {tab === 'strategies' ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border bg-white/[0.03] p-4">
                    <div>
                      <p className="font-medium text-ink">Strategy library</p>
                      <p className="text-sm text-muted">
                        Persisted backtest strategies can be exported, imported, or removed from
                        backend storage.
                      </p>
                      {savedStrategies.length ? (
                        <p className="mt-2 text-xs text-muted">
                          {
                            savedStrategies.filter((strategy) =>
                              selectedStrategyIds.has(strategy.id),
                            ).length
                          }{' '}
                          of {savedStrategies.length} selected for export.
                        </p>
                      ) : null}
                      {strategyTransferStatus ? (
                        <p className="mt-2 text-xs text-accent">{strategyTransferStatus}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <input
                        ref={strategyImportRef}
                        type="file"
                        accept="application/json,.json"
                        className="hidden"
                        onChange={(event) =>
                          void importSavedStrategies(event.target.files?.[0] ?? null)
                        }
                      />
                      <Button
                        variant="secondary"
                        onClick={() => strategyImportRef.current?.click()}
                      >
                        <Upload className="size-4" />
                        Import
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={
                          !savedStrategies.length ||
                          !savedStrategies.some((strategy) => selectedStrategyIds.has(strategy.id))
                        }
                        onClick={() => void exportSavedStrategies()}
                      >
                        <Download className="size-4" />
                        Export
                      </Button>
                    </div>
                  </div>
                  {savedStrategies.length ? (
                    <div className="space-y-4">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="ghost"
                          onClick={() =>
                            setSelectedStrategyIds(
                              new Set(savedStrategies.map((strategy) => strategy.id)),
                            )
                          }
                        >
                          Select all
                        </Button>
                        <Button variant="ghost" onClick={() => setSelectedStrategyIds(new Set())}>
                          Clear selection
                        </Button>
                      </div>
                      {savedStrategies.map((strategy) => (
                        <div
                          key={strategy.id}
                          className="rounded-3xl border border-border bg-white/[0.03] p-4"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <label className="flex min-w-0 flex-1 items-start gap-3">
                              <input
                                type="checkbox"
                                className="mt-1 size-4 accent-accent"
                                checked={selectedStrategyIds.has(strategy.id)}
                                onChange={(event) => {
                                  setSelectedStrategyIds((current) => {
                                    const next = new Set(current);
                                    if (event.target.checked) {
                                      next.add(strategy.id);
                                    } else {
                                      next.delete(strategy.id);
                                    }
                                    return next;
                                  });
                                }}
                              />
                              <span className="min-w-0">
                                <span className="block font-medium text-ink">{strategy.name}</span>
                                <span className="mt-2 block text-sm text-muted">
                                  {strategy.symbolId} · {strategy.setupType} · {strategy.timeframe}
                                </span>
                                <span className="mt-2 block text-xs text-muted">
                                  Saved {formatDateTime(strategy.savedAt)} UTC
                                </span>
                              </span>
                            </label>
                            <div>
                              <Button
                                variant="danger"
                                title={`Delete ${strategy.name}`}
                                onClick={() => onDeleteSavedStrategy(strategy.id)}
                              >
                                <Trash2 className="size-4" />
                                Delete
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      title="No strategies saved"
                      description="Use Backtesting → Save strategy to populate this tab or import a QuantGlass strategy JSON file."
                    />
                  )}
                </div>
              ) : null}

              {tab === 'legal' ? (
                <div className="space-y-5">
                  <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium text-ink">QuantGlass Community Edition</p>
                        <p className="mt-2 text-sm text-muted">
                          Licensed under AGPL-3.0-or-later. You may use, study, modify, and
                          redistribute this software under the AGPL. Commercial licenses are
                          available for proprietary embedding, closed-source redistribution, hosted
                          products, and enterprise support.
                        </p>
                      </div>
                      <Scale className="size-5 text-accent" />
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
                      <p className="font-medium text-ink">Source code</p>
                      <p className="mt-2 text-sm text-muted">
                        The complete corresponding source for this build is available from the
                        public repository.
                      </p>
                      <button
                        type="button"
                        className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-accent hover:text-ink"
                        onClick={() =>
                          void openExternalLink('https://github.com/quantglass-labs/quantglass')
                        }
                      >
                        GitHub repository
                        <ExternalLink className="size-4" />
                      </button>
                    </div>
                    <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
                      <p className="font-medium text-ink">Legal documents</p>
                      <div className="mt-3 grid gap-2 text-sm">
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 text-accent hover:text-ink"
                          onClick={() =>
                            void openExternalLink(
                              'https://github.com/quantglass-labs/quantglass/blob/main/LICENSE',
                            )
                          }
                        >
                          AGPL license <ExternalLink className="size-4" />
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 text-accent hover:text-ink"
                          onClick={() =>
                            void openExternalLink(
                              'https://github.com/quantglass-labs/quantglass/blob/main/COMMERCIAL-LICENSE.md',
                            )
                          }
                        >
                          Commercial licensing <ExternalLink className="size-4" />
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 text-accent hover:text-ink"
                          onClick={() =>
                            void openExternalLink(
                              'https://github.com/quantglass-labs/quantglass/blob/main/DISCLAIMER.md',
                            )
                          }
                        >
                          Financial disclaimer <ExternalLink className="size-4" />
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 text-accent hover:text-ink"
                          onClick={() =>
                            void openExternalLink(
                              'https://github.com/quantglass-labs/quantglass/blob/main/THIRD-PARTY-NOTICES.md',
                            )
                          }
                        >
                          Third-party notices <ExternalLink className="size-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-watch/25 bg-watch/10 p-4 text-sm text-muted">
                    QuantGlass is research and decision-support software. It is not financial
                    advice, an investment adviser, a broker-dealer, or a promise of trading
                    performance.
                  </div>
                </div>
              ) : null}
            </>
          }
        />
      </Panel>
    </div>
  );
}
