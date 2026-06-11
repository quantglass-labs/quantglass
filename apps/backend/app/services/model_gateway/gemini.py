# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Google Gemini API model discovery and generation."""

from __future__ import annotations

import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from app.core.config import AiSettings
from app.services.model_gateway.models import (
    ModelResponse,
)


class GeminiProviderMixin:
    def _call_gemini_generate(self, settings: AiSettings, prompt: str) -> ModelResponse | None:
        api_key = self._api_key_provider(settings.api_key_id)
        if not api_key:
            return None
        model = settings.model.removeprefix("models/")
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
            f"{settings.base_url.rstrip('/')}/models/{urllib.parse.quote(model, safe='')}:generateContent?key={urllib.parse.quote(api_key, safe='')}",
            payload,
            timeout=settings.request_timeout_seconds,
        )
        if not body:
            return None
        text = self._extract_gemini_text(body)
        if not text:
            return None
        return ModelResponse(text=text, source=f"google_gemini:{model}")

    @staticmethod
    def _extract_gemini_text(body: dict[str, object]) -> str:
        candidates = body.get("candidates")
        if not isinstance(candidates, list) or not candidates:
            return ""
        content = candidates[0].get("content") if isinstance(candidates[0], dict) else None
        parts = content.get("parts") if isinstance(content, dict) else None
        if not isinstance(parts, list):
            return ""
        return "\n".join(
            item.get("text", "")
            for item in parts
            if isinstance(item, dict) and isinstance(item.get("text"), str)
        ).strip()

    def _list_gemini_models(self, settings: AiSettings) -> list[str]:
        return [item["id"] for item in self._list_gemini_model_items(settings)]

    def _list_gemini_model_items(self, settings: AiSettings) -> list[dict[str, Any]]:
        api_key = self._api_key_provider(settings.api_key_id)
        if not api_key:
            return []
        body = self._get_json(
            f"{settings.base_url.rstrip('/')}/models?key={urllib.parse.quote(api_key, safe='')}&pageSize=1000",
            timeout=settings.request_timeout_seconds,
        )
        if not body:
            return []
        models = body.get("models")
        if not isinstance(models, list):
            return []
        items: list[dict[str, Any]] = []
        for item in models:
            if not isinstance(item, dict) or not isinstance(item.get("name"), str):
                continue
            methods = item.get("supportedGenerationMethods", [])
            if isinstance(methods, list) and "generateContent" not in methods:
                continue
            items.append(
                {
                    "id": item["name"].removeprefix("models/"),
                    "label": item.get("displayName")
                    if isinstance(item.get("displayName"), str)
                    else item["name"].removeprefix("models/"),
                    "description": item.get("description")
                    if isinstance(item.get("description"), str)
                    else None,
                    "inputTokenLimit": item.get("inputTokenLimit")
                    if isinstance(item.get("inputTokenLimit"), int)
                    else None,
                    "outputTokenLimit": item.get("outputTokenLimit")
                    if isinstance(item.get("outputTokenLimit"), int)
                    else None,
                    "supportedGenerationMethods": methods if isinstance(methods, list) else [],
                }
            )
        return self._rank_model_items(items, settings.provider)
