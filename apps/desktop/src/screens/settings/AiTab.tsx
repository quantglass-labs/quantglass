// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useMemo, useState } from 'react';

import {
  Bot,
  Brain,
  Cloud,
  CloudOff,
  Cpu,
  KeyRound,
  Plug,
  Plus,
  Rocket,
  Route,
  Save,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  Terminal,
  Wind,
  Zap,
} from 'lucide-react';

import { Button } from '../../components/ui';
import { formatDateTime } from '../../lib/format';
import { aiProviderProfiles } from './aiProviderMeta';
import type { AiModelInfo, AiProviderTestResponse, AiSettings, ApiKeyField } from '../../types';

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

export function AiTab({
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
  apiKeys,
  draftApiKeys,
  setDraftApiKeys,
  onUpdateAiSettings,
  onRefreshAiModels,
  onTestAiProvider,
  onSaveApiKey,
  onGoToKeys,
}: {
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
  apiKeys: ApiKeyField[];
  draftApiKeys: Record<string, string>;
  setDraftApiKeys: Dispatch<SetStateAction<Record<string, string>>>;
  onUpdateAiSettings: (settings: AiSettings) => void;
  onRefreshAiModels: (settings: AiSettings) => void;
  onTestAiProvider: (settings: AiSettings) => void;
  onSaveApiKey: (keyId: string, value: string) => void;
  onGoToKeys: () => void;
}) {
  const apiKeysById = useMemo(() => new Map(apiKeys.map((field) => [field.id, field])), [apiKeys]);
  const [draftAiSettings, setDraftAiSettings] = useState<AiSettings>(aiSettings);
  const [customAiModelEnabled, setCustomAiModelEnabled] = useState(false);
  const [activeAiProviderId, setActiveAiProviderId] = useState('anthropic');
  const [aiProviderSearch, setAiProviderSearch] = useState('');
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

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-medium text-ink">Model providers</p>
            <p className="text-sm text-muted">
              Connect local, cloud, router, and enterprise LLMs. Model lists are fetched from the
              selected provider when possible.
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
                              <span className="min-w-0 flex-1 truncate">{template.label}</span>
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
                            <p className="font-medium text-ink">{activeAiProviderTemplate.label}</p>
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
                          <p className="text-xs font-semibold uppercase tracking-[0.18em]">Auth</p>
                          <p className="mt-1 text-ink">{activeAiProviderTemplate.authMode}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                            Models
                          </p>
                          <p className={`mt-1 ${aiModelsFetched ? 'text-buy' : 'text-hold'}`}>
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
                            activeAiProviderTemplate.adapterStatus === 'adapter_required'
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
                            activeAiProviderTemplate.adapterStatus === 'adapter_required'
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
                            {aiModelsLoading ? 'Fetching' : aiModelsFetched ? 'Live' : 'Fallback'}
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
                            activeAiProviderTemplate.adapterStatus === 'adapter_required'
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
                              <p className="font-medium text-ink">{selectedAiApiKey.label}</p>
                              <p className="text-sm text-muted">{selectedAiApiKey.note}</p>
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
                            <Button variant="ghost" onClick={() => onGoToKeys()}>
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
                                {aiRuntimeStatusMeta(selectedAiModelInfo.runtimeStatus).label}
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
                              {aiRuntimeStatusMeta(aiProviderTestResult.runtimeStatus).label}
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
                        disabled={activeAiProviderTemplate.adapterStatus === 'adapter_required'}
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
                          activeAiProviderTemplate.adapterStatus === 'adapter_required' ||
                          (draftAiSettings.provider !== 'template' && !draftAiSettings.model.trim())
                        }
                      >
                        <Plug className="size-4" />
                        {aiProviderTestLoading ? 'Testing provider...' : 'Test / fetch models'}
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
              When on, the selected local or API model rewrites the summary. Failed calls and failed
              fact checks fall back to the deterministic template.
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
  );
}
