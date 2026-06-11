# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""The composed ModelGateway over the per-provider mixins."""

from __future__ import annotations

from datetime import UTC, datetime

from app.core.config import AiSettings
from app.services.model_gateway.anthropic import AnthropicProviderMixin
from app.services.model_gateway.azure import AzureOpenAIProviderMixin
from app.services.model_gateway.base import GatewayHelpersMixin
from app.services.model_gateway.bedrock import BedrockProviderMixin
from app.services.model_gateway.gemini import GeminiProviderMixin
from app.services.model_gateway.models import (
    KEY_REQUIRED_PROVIDERS,
    OPENAI_COMPATIBLE_PROVIDERS,
    ModelCatalog,
    ModelResponse,
)
from app.services.model_gateway.ollama import OllamaProviderMixin
from app.services.model_gateway.openai_compatible import OpenAICompatibleProviderMixin
from app.services.model_gateway.vertex import VertexProviderMixin


class ModelGateway(
    OllamaProviderMixin,
    OpenAICompatibleProviderMixin,
    AnthropicProviderMixin,
    GeminiProviderMixin,
    AzureOpenAIProviderMixin,
    BedrockProviderMixin,
    VertexProviderMixin,
    GatewayHelpersMixin,
):
    """Small, dependency-free gateway for local and OpenAI-compatible models."""

    def __init__(self, api_key_provider=lambda _key_id: "") -> None:
        self._api_key_provider = api_key_provider
        self.last_error: str | None = None

    def list_models(self, settings: AiSettings) -> tuple[list[str], bool, str]:
        catalog = self.list_model_catalog(settings)
        return catalog.models, catalog.fetched, catalog.detail

    def list_model_catalog(self, settings: AiSettings) -> ModelCatalog:
        fallback_items = self._fallback_model_items(settings.provider)
        fallback_models = [item["id"] for item in fallback_items]
        fetched_at_utc = datetime.now(UTC).isoformat()

        if settings.provider == "template":
            return ModelCatalog(
                fallback_models,
                False,
                "Template narration does not use a model endpoint.",
                fallback_items,
                "template",
                fetched_at_utc,
            )
        if not settings.base_url:
            return ModelCatalog(
                fallback_models,
                False,
                "No model endpoint base URL is configured.",
                fallback_items,
                "fallback",
                fetched_at_utc,
            )
        api_key = self._api_key_provider(settings.api_key_id)
        if settings.provider == "bedrock" and not self._bedrock_credentials(settings):
            return ModelCatalog(
                fallback_models,
                False,
                "Amazon Bedrock model discovery requires saved AWS Access Key ID and AWS Secret Access Key.",
                fallback_items,
                "fallback",
                fetched_at_utc,
            )
        if settings.provider == "vertex" and not api_key:
            return ModelCatalog(
                fallback_models,
                False,
                "Google Vertex AI model discovery requires a saved Vertex AI OAuth access token.",
                fallback_items,
                "fallback",
                fetched_at_utc,
            )
        if settings.provider in KEY_REQUIRED_PROVIDERS and not api_key:
            return ModelCatalog(
                fallback_models,
                False,
                f"{self._provider_label(settings.provider)} model discovery requires a saved {self._provider_label(settings.provider)} API key.",
                fallback_items,
                "fallback",
                fetched_at_utc,
            )
        if settings.provider == "openai_compatible" and settings.api_key_id and not api_key:
            return ModelCatalog(
                fallback_models,
                False,
                "The selected OpenAI-compatible API key is not saved yet.",
                fallback_items,
                "fallback",
                fetched_at_utc,
            )

        if settings.provider == "ollama":
            items = self._list_ollama_model_items(settings)
        elif settings.provider == "anthropic":
            items = self._list_anthropic_model_items(settings)
        elif settings.provider == "google_gemini":
            items = self._list_gemini_model_items(settings)
        elif settings.provider == "azure_openai":
            items = self._list_azure_openai_model_items(settings)
        elif settings.provider == "bedrock":
            items = self._list_bedrock_model_items(settings)
        elif settings.provider == "vertex":
            items = self._list_vertex_model_items(settings)
        elif settings.provider in OPENAI_COMPATIBLE_PROVIDERS:
            items = self._list_openai_compatible_model_items(settings)
        else:
            items = []
        if items:
            models = [str(item["id"]) for item in items if item.get("id")]
            return ModelCatalog(
                models,
                True,
                "Models fetched live from the configured provider endpoint.",
                items,
                self._model_source(settings.provider),
                fetched_at_utc,
            )
        return ModelCatalog(
            fallback_models,
            False,
            "Provider model endpoint was unavailable; showing fallback suggestions only.",
            fallback_items,
            "fallback",
            fetched_at_utc,
        )

    def provider_diagnostic_detail(self, settings: AiSettings) -> str | None:
        if settings.provider != "ollama":
            return None
        return self.provider_runtime_state(settings).get("runtimeDetail")

    def provider_runtime_state(self, settings: AiSettings) -> dict[str, str]:
        if settings.provider == "bedrock":
            return self._bedrock_runtime_state(settings)
        if settings.provider == "vertex":
            return self._vertex_runtime_state(settings)
        if settings.provider == "azure_openai":
            return self._azure_openai_runtime_state(settings)
        if settings.provider in OPENAI_COMPATIBLE_PROVIDERS:
            return self._openai_compatible_runtime_state(settings)
        if settings.provider != "ollama":
            return {
                "runtimeStatus": "unknown",
                "runtimeDetail": "Runtime status is not available for this provider.",
            }
        selected_model = settings.model.strip()
        if not selected_model:
            return {"runtimeStatus": "unknown", "runtimeDetail": "No model is selected."}
        loaded_models = self._ollama_loaded_models(settings)
        if loaded_models is None:
            return {
                "runtimeStatus": "unavailable",
                "runtimeDetail": "Ollama runtime status was unavailable.",
            }
        loaded_item = loaded_models.get(selected_model)
        if loaded_item is not None:
            return {
                "runtimeStatus": "loaded",
                "runtimeDetail": self._ollama_loaded_model_detail(selected_model, loaded_item),
            }
        installed_models = self._ollama_installed_model_names(settings)
        if selected_model in installed_models:
            return {
                "runtimeStatus": "not_loaded",
                "runtimeDetail": f"{selected_model} is installed but not loaded. The first test can take longer while Ollama loads it into memory.",
            }
        return {
            "runtimeStatus": "not_installed",
            "runtimeDetail": f"{selected_model} is not installed on the configured Ollama endpoint.",
        }

    def complete(self, settings: AiSettings, prompt: str) -> ModelResponse | None:
        self.last_error = None
        if settings.provider == "template":
            return None
        if settings.provider == "ollama":
            return self._call_ollama_generate(settings, prompt)
        if settings.provider == "anthropic":
            return self._call_anthropic_messages(settings, prompt)
        if settings.provider == "google_gemini":
            return self._call_gemini_generate(settings, prompt)
        if settings.provider == "azure_openai":
            return self._call_azure_openai(settings, prompt)
        if settings.provider == "bedrock":
            return self._call_bedrock_invoke_model(settings, prompt)
        if settings.provider == "vertex":
            return self._call_vertex_generate(settings, prompt)
        return self._call_openai_compatible(settings, prompt)
