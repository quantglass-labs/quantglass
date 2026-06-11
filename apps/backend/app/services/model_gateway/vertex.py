# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Google Vertex AI REST model discovery and generateContent."""

from __future__ import annotations

import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from app.core.config import AiSettings
from app.services.model_gateway.models import (
    ModelResponse,
)


class VertexProviderMixin:
    def _call_vertex_generate(self, settings: AiSettings, prompt: str) -> ModelResponse | None:
        api_key = self._api_key_provider(settings.api_key_id)
        if not api_key:
            self.last_error = "Google Vertex AI requires a saved OAuth access token."
            return None
        model = settings.model.strip()
        if not model:
            self.last_error = "Google Vertex AI requires a model ID."
            return None
        base = self._vertex_endpoint_base(settings)
        if not base:
            self.last_error = "Google Vertex AI base URL must include /v1/projects/{project}/locations/{location}."
            return None
        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": prompt}],
                }
            ],
            "systemInstruction": {
                "parts": [
                    {
                        "text": "You are a disciplined trading assistant. You only restate verified facts and never provide financial advice."
                    }
                ]
            },
            "generationConfig": {
                "temperature": settings.temperature,
                "maxOutputTokens": settings.max_tokens,
            },
        }
        body = self._post_json(
            f"{base}/publishers/google/models/{urllib.parse.quote(model, safe='')}:generateContent",
            payload,
            timeout=settings.request_timeout_seconds,
            headers={"Authorization": f"Bearer {api_key}"},
        )
        if not body:
            return None
        text = self._extract_gemini_text(body)
        if not text:
            return None
        return ModelResponse(text=text, source=f"vertex:{model}")

    def _vertex_runtime_state(self, settings: AiSettings) -> dict[str, str]:
        api_key = self._api_key_provider(settings.api_key_id)
        if not api_key:
            return {
                "runtimeStatus": "unavailable",
                "runtimeDetail": "Google Vertex AI requires a saved OAuth access token.",
            }
        if not self._vertex_endpoint_base(settings):
            return {
                "runtimeStatus": "unavailable",
                "runtimeDetail": "Google Vertex AI endpoint must include /v1/projects/{project}/locations/{location}.",
            }
        model = settings.model.strip()
        return {
            "runtimeStatus": "available" if model else "unknown",
            "runtimeDetail": (
                f"Google Vertex AI is configured; live test will call {model}."
                if model
                else "Google Vertex AI credentials are configured. Select a model before testing."
            ),
        }

    @staticmethod
    def _vertex_endpoint_base(settings: AiSettings) -> str:
        base = settings.base_url.strip().rstrip("/")
        if not base:
            return ""
        parsed = urllib.parse.urlparse(base if "://" in base else f"https://{base}")
        if not parsed.netloc:
            return ""
        path = parsed.path.rstrip("/")
        if "/v1/projects/" not in path or "/locations/" not in path:
            return ""
        return urllib.parse.urlunparse(parsed._replace(path=path, query="", fragment=""))

    def _list_vertex_model_items(self, settings: AiSettings) -> list[dict[str, Any]]:
        api_key = self._api_key_provider(settings.api_key_id)
        base = self._vertex_endpoint_base(settings)
        if not api_key or not base:
            return []
        body = self._get_json(
            f"{base}/publishers/google/models",
            timeout=settings.request_timeout_seconds,
            headers={"Authorization": f"Bearer {api_key}"},
        )
        models = body.get("publisherModels") if body else None
        if not isinstance(models, list):
            return []
        items: list[dict[str, Any]] = []
        for item in models:
            if not isinstance(item, dict):
                continue
            name = item.get("name") if isinstance(item.get("name"), str) else ""
            model_id = name.rsplit("/", 1)[-1] if name else item.get("id")
            if not isinstance(model_id, str) or not model_id:
                continue
            supported_actions = item.get("supportedActions")
            if (
                isinstance(supported_actions, list)
                and supported_actions
                and "generateContent" not in supported_actions
            ):
                continue
            items.append(
                {
                    "id": model_id,
                    "label": item.get("displayName")
                    if isinstance(item.get("displayName"), str)
                    else model_id,
                    "description": item.get("description")
                    if isinstance(item.get("description"), str)
                    else "Google Vertex AI publisher model",
                    "runtimeStatus": "available",
                    "runtimeDetail": f"Google Vertex AI reports {model_id} as available for the configured project/location.",
                    "supportedGenerationMethods": supported_actions
                    if isinstance(supported_actions, list)
                    else [],
                }
            )
        return self._rank_model_items(items, settings.provider)
