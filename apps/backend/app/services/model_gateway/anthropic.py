# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Anthropic Messages API model discovery and narration."""

from __future__ import annotations

from typing import Any

from app.core.config import AiSettings
from app.services.model_gateway.models import (
    ModelResponse,
)


class AnthropicProviderMixin:
    def _call_anthropic_messages(self, settings: AiSettings, prompt: str) -> ModelResponse | None:
        api_key = self._api_key_provider(settings.api_key_id)
        if not api_key:
            return None
        payload = {
            "model": settings.model,
            "max_tokens": settings.max_tokens,
            "temperature": settings.temperature,
            "system": "You are a disciplined trading assistant. You only restate verified facts and never provide financial advice.",
            "messages": [{"role": "user", "content": prompt}],
        }
        body = self._post_json(
            f"{settings.base_url.rstrip('/')}/messages",
            payload,
            timeout=settings.request_timeout_seconds,
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
            },
        )
        if not body:
            return None
        content = body.get("content")
        if not isinstance(content, list):
            return None
        text_parts = [
            item.get("text", "")
            for item in content
            if isinstance(item, dict)
            and item.get("type") == "text"
            and isinstance(item.get("text"), str)
        ]
        text = "\n".join(part for part in text_parts if part.strip()).strip()
        if not text:
            return None
        return ModelResponse(text=text, source=f"anthropic:{settings.model}")

    def _list_anthropic_models(self, settings: AiSettings) -> list[str]:
        return [item["id"] for item in self._list_anthropic_model_items(settings)]

    def _list_anthropic_model_items(self, settings: AiSettings) -> list[dict[str, Any]]:
        api_key = self._api_key_provider(settings.api_key_id)
        if not api_key:
            return []
        body = self._get_json(
            f"{settings.base_url.rstrip('/')}/models?limit=1000",
            timeout=settings.request_timeout_seconds,
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
            },
        )
        if not body:
            return []
        data = body.get("data")
        if not isinstance(data, list):
            return []
        items: list[dict[str, Any]] = []
        for item in data:
            if isinstance(item, dict) and isinstance(item.get("id"), str):
                items.append(
                    {
                        "id": item["id"],
                        "label": item.get("display_name")
                        if isinstance(item.get("display_name"), str)
                        else item["id"],
                        "createdAt": item.get("created_at")
                        if isinstance(item.get("created_at"), str)
                        else None,
                    }
                )
        return items
