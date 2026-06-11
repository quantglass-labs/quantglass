# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Shared HTTP plumbing, fallback catalogs, ranking, and labels."""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from app.services.model_gateway.models import (
    LOCAL_OPENAI_COMPATIBLE_PROVIDERS,
)


class GatewayHelpersMixin:
    @staticmethod
    def _catalog_runtime_status(provider: str) -> str:
        if provider in LOCAL_OPENAI_COMPATIBLE_PROVIDERS:
            return "loaded"
        return "available"

    def _catalog_runtime_detail(self, provider: str) -> str:
        if provider in LOCAL_OPENAI_COMPATIBLE_PROVIDERS:
            return f"{self._provider_label(provider)} reports this model from /models; the runtime is serving it."
        return f"{self._provider_label(provider)} reports this model as available to the configured account."

    def _fallback_models(self, provider: str) -> list[str]:
        return [item["id"] for item in self._fallback_model_items(provider)]

    def _fallback_model_items(self, provider: str) -> list[dict[str, Any]]:
        if provider == "ollama":
            models = ["qwen3:14b-q4_K_M", "llama3.1", "mistral", "gemma3"]
        elif provider == "lm_studio":
            models = ["local-model", "qwen3", "llama3.1"]
        elif provider == "openai":
            models = ["gpt-5.5", "gpt-5.2", "gpt-5.1", "gpt-5", "gpt-4.1-mini"]
        elif provider == "anthropic":
            models = [
                "claude-sonnet-4-20250514",
                "claude-opus-4-20250514",
                "claude-3-5-haiku-latest",
            ]
        elif provider == "google_gemini":
            models = ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.5-pro"]
        elif provider == "vllm":
            models = ["meta-llama/Llama-3.1-8B-Instruct", "Qwen/Qwen2.5-7B-Instruct"]
        elif provider == "llama_cpp":
            models = ["local-gguf"]
        elif provider == "deepseek":
            models = ["deepseek-chat", "deepseek-reasoner"]
        elif provider == "mistral":
            models = ["mistral-large-latest", "codestral-latest", "ministral-8b-latest"]
        elif provider == "groq":
            models = ["llama-3.3-70b-versatile", "mixtral-8x7b-32768"]
        elif provider == "openrouter":
            models = ["openai/gpt-5.5", "anthropic/claude-sonnet-4", "google/gemini-2.5-flash"]
        elif provider == "together":
            models = ["meta-llama/Llama-3.3-70B-Instruct-Turbo", "Qwen/Qwen2.5-72B-Instruct-Turbo"]
        elif provider == "azure_openai":
            models = ["your-deployment"]
        elif provider == "bedrock":
            models = ["anthropic.claude-3-5-sonnet", "amazon.nova-pro"]
        elif provider == "vertex":
            models = ["gemini-2.5-pro", "gemini-2.5-flash"]
        elif provider == "openai_compatible":
            models = [
                "local-model",
                "openai/gpt-5.5",
                "openai/gpt-5.2",
                "anthropic/claude-sonnet-4",
                "google/gemini-2.5-flash",
            ]
        else:
            models = ["deterministic-template"]
        return [
            {
                "id": model,
                "label": model,
                "description": "Fallback suggestion. Use Fetch latest models for account-specific availability.",
            }
            for model in models
        ]

    @staticmethod
    def _model_source(provider: str) -> str:
        return {
            "ollama": "ollama:/api/tags",
            "lm_studio": "openai-compatible:/models",
            "openai": "openai:/models",
            "anthropic": "anthropic:/models",
            "google_gemini": "gemini:models.list",
            "vllm": "vllm:/models",
            "llama_cpp": "llama.cpp:/models",
            "deepseek": "deepseek:/models",
            "mistral": "mistral:/models",
            "groq": "groq:/models",
            "openrouter": "openrouter:/models",
            "together": "together:/models",
            "azure_openai": "azure-openai:deployment",
            "bedrock": "bedrock:foundation-models",
            "vertex": "vertex:publisher-models",
            "openai_compatible": "openai-compatible:/models",
        }.get(provider, "unknown")

    @staticmethod
    def _provider_label(provider: str) -> str:
        return {
            "template": "Deterministic template",
            "ollama": "Ollama",
            "lm_studio": "LM Studio",
            "vllm": "vLLM",
            "llama_cpp": "llama.cpp",
            "openai": "OpenAI",
            "anthropic": "Anthropic",
            "google_gemini": "Google Gemini",
            "deepseek": "DeepSeek",
            "mistral": "Mistral AI",
            "groq": "Groq",
            "openrouter": "OpenRouter",
            "together": "Together AI",
            "azure_openai": "Azure OpenAI",
            "bedrock": "Amazon Bedrock",
            "vertex": "Google Vertex AI",
            "openai_compatible": "OpenAI-compatible endpoint",
        }.get(provider, provider)

    @staticmethod
    def _looks_like_text_model(model_id: str) -> bool:
        lowered = model_id.lower()
        excluded = (
            "embedding",
            "moderation",
            "whisper",
            "tts",
            "transcribe",
            "dall",
            "image",
            "sora",
            "realtime",
            "audio",
            "search-preview",
        )
        if any(token in lowered for token in excluded):
            return False
        return lowered.startswith(("gpt-", "o1", "o3", "o4", "chatgpt-", "gpt-oss"))

    def _rank_model_items(self, items: list[dict[str, Any]], provider: str) -> list[dict[str, Any]]:
        def score(item: dict[str, Any]) -> tuple[int, int, str]:
            model_id = str(item.get("id", "")).lower()
            priority = 0
            if provider == "openai":
                if model_id.startswith("gpt-5.5"):
                    priority += 800
                elif model_id.startswith("gpt-5.2"):
                    priority += 700
                elif model_id.startswith("gpt-5.1"):
                    priority += 650
                elif model_id.startswith("gpt-5"):
                    priority += 600
                elif model_id.startswith("gpt-4.1"):
                    priority += 400
                elif model_id.startswith(("o3", "o4")):
                    priority += 300
            elif provider == "google_gemini":
                if "3.5" in model_id:
                    priority += 700
                elif "2.5" in model_id:
                    priority += 600
                if "flash" in model_id:
                    priority += 50
            elif provider == "openai_compatible":
                if any(
                    token in model_id for token in ("gpt-5", "claude", "gemini", "qwen", "llama")
                ):
                    priority += 200
            created = item.get("created")
            created_score = created if isinstance(created, int) else 0
            return (-priority, -created_score, model_id)

        return sorted(self._dedupe_items(items), key=score)

    @staticmethod
    def _dedupe_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        seen: set[str] = set()
        deduped: list[dict[str, Any]] = []
        for item in items:
            model_id = str(item.get("id", "")).strip()
            if not model_id or model_id in seen:
                continue
            seen.add(model_id)
            deduped.append(item)
        return deduped

    def _get_json(
        self,
        url: str,
        timeout: float,
        headers: dict[str, str] | None = None,
    ) -> dict[str, object] | None:
        request = urllib.request.Request(
            url=url,
            headers={"Accept": "application/json", **(headers or {})},
            method="GET",
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                body = json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, ValueError, OSError):
            return None
        if not isinstance(body, dict):
            return None
        return body

    def _post_json(
        self,
        url: str,
        payload: dict[str, object],
        timeout: float,
        headers: dict[str, str] | None = None,
    ) -> dict[str, object] | None:
        request = urllib.request.Request(
            url=url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", **(headers or {})},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                body = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            self.last_error = f"HTTP {exc.code}: {exc.reason}"
            return None
        except urllib.error.URLError as exc:
            self.last_error = f"Request failed: {exc.reason}"
            return None
        except TimeoutError:
            self.last_error = "Request timed out before the provider returned text."
            return None
        except (ValueError, OSError) as exc:
            self.last_error = f"Request failed: {exc}"
            return None
        if not isinstance(body, dict):
            return None
        return body
