# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from __future__ import annotations

import json
import urllib.error
import urllib.request
from dataclasses import dataclass

from app.core.config import AiSettings


@dataclass(frozen=True)
class ModelResponse:
    text: str
    source: str


class ModelGateway:
    """Small, dependency-free gateway for local and OpenAI-compatible models."""

    def __init__(self, api_key_provider=lambda _key_id: "") -> None:
        self._api_key_provider = api_key_provider

    def complete(self, settings: AiSettings, prompt: str) -> ModelResponse | None:
        if settings.provider == "template":
            return None
        if settings.provider == "ollama":
            return self._call_ollama_generate(settings, prompt)
        return self._call_openai_compatible(settings, prompt)

    def _call_ollama_generate(self, settings: AiSettings, prompt: str) -> ModelResponse | None:
        payload = {
            "model": settings.model,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": settings.temperature},
        }
        body = self._post_json(
            f"{settings.base_url.rstrip('/')}/api/generate",
            payload,
            timeout=settings.request_timeout_seconds,
        )
        if not body:
            return None
        text = body.get("response")
        if not isinstance(text, str) or not text.strip():
            return None
        return ModelResponse(text=text, source=f"ollama:{settings.model}")

    def _call_openai_compatible(self, settings: AiSettings, prompt: str) -> ModelResponse | None:
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
        except (urllib.error.URLError, TimeoutError, ValueError, OSError):
            return None
        if not isinstance(body, dict):
            return None
        return body
