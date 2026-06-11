# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""OpenAI-compatible chat completions (OpenAI, DeepSeek, Mistral, Groq, OpenRouter, Together, LM Studio, vLLM, llama.cpp, and generic gateways)."""

from __future__ import annotations

from typing import Any

from app.core.config import AiSettings
from app.services.model_gateway.models import (
    LOCAL_OPENAI_COMPATIBLE_PROVIDERS,
    ModelResponse,
)


class OpenAICompatibleProviderMixin:
    def _call_openai_compatible(
        self,
        settings: AiSettings,
        prompt: str,
        response_schema: dict | None = None,
    ) -> ModelResponse | None:
        payload = {
            "model": settings.model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are a disciplined trading assistant. You only restate verified "
                        "facts and never provide financial advice."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            "temperature": settings.temperature,
            "max_tokens": settings.max_tokens,
            "stream": False,
        }
        if response_schema is not None:
            payload["response_format"] = {
                "type": "json_schema",
                "json_schema": {
                    "name": "quantglass_narration",
                    "schema": response_schema,
                    "strict": True,
                },
            }
        headers = {}
        api_key = self._api_key_provider(settings.api_key_id)
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        body = self._post_json(
            f"{settings.base_url.rstrip('/')}/chat/completions",
            payload,
            timeout=settings.request_timeout_seconds,
            headers=headers,
        )
        if not body:
            return None

        choices = body.get("choices")
        if not isinstance(choices, list) or not choices:
            return None
        first_choice = choices[0]
        if not isinstance(first_choice, dict):
            return None
        message = first_choice.get("message")
        if not isinstance(message, dict):
            return None
        text = message.get("content")
        if not isinstance(text, str) or not text.strip():
            return None
        return ModelResponse(text=text, source=f"{settings.provider}:{settings.model}")

    def _openai_compatible_runtime_state(self, settings: AiSettings) -> dict[str, str]:
        selected_model = settings.model.strip()
        if not selected_model:
            return {"runtimeStatus": "unknown", "runtimeDetail": "No model is selected."}
        items = self._list_openai_compatible_model_items(settings)
        if not items:
            return {
                "runtimeStatus": "unavailable",
                "runtimeDetail": f"{self._provider_label(settings.provider)} /models endpoint is unavailable or returned no models.",
            }
        if any(item.get("id") == selected_model for item in items):
            return {
                "runtimeStatus": self._catalog_runtime_status(settings.provider),
                "runtimeDetail": self._catalog_runtime_detail(settings.provider),
            }
        status = (
            "not_installed"
            if settings.provider in LOCAL_OPENAI_COMPATIBLE_PROVIDERS
            else "unavailable"
        )
        return {
            "runtimeStatus": status,
            "runtimeDetail": f"{selected_model} was not returned by {self._provider_label(settings.provider)} /models.",
        }

    def _list_openai_compatible_models(self, settings: AiSettings) -> list[str]:
        return [item["id"] for item in self._list_openai_compatible_model_items(settings)]

    def _list_openai_compatible_model_items(self, settings: AiSettings) -> list[dict[str, Any]]:
        headers = {}
        api_key = self._api_key_provider(settings.api_key_id)
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        body = self._get_json(
            f"{settings.base_url.rstrip('/')}/models",
            timeout=settings.request_timeout_seconds,
            headers=headers,
        )
        if not body:
            return []
        data = body.get("data")
        if not isinstance(data, list):
            return []
        items: list[dict[str, Any]] = []
        for item in data:
            if isinstance(item, dict) and isinstance(item.get("id"), str):
                model_id = item["id"]
                if settings.provider == "openai" and not self._looks_like_text_model(model_id):
                    continue
                items.append(
                    {
                        "id": model_id,
                        "label": model_id,
                        "description": self._provider_label(settings.provider),
                        "runtimeStatus": self._catalog_runtime_status(settings.provider),
                        "runtimeDetail": self._catalog_runtime_detail(settings.provider),
                        "created": item.get("created")
                        if isinstance(item.get("created"), int)
                        else None,
                        "ownedBy": item.get("owned_by")
                        if isinstance(item.get("owned_by"), str)
                        else None,
                    }
                )
        return self._rank_model_items(items, settings.provider)
