// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { AiSettings } from '../../types';

export const aiProviderProfiles: Record<
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
