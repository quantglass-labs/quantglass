# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Azure OpenAI deployment-based chat completions."""

from __future__ import annotations

import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from app.core.config import AiSettings
from app.services.model_gateway.models import (
    ModelResponse,
)


class AzureOpenAIProviderMixin:
    def _call_azure_openai(self, settings: AiSettings, prompt: str) -> ModelResponse | None:
        api_key = self._api_key_provider(settings.api_key_id)
        if not api_key:
            self.last_error = "Azure OpenAI requires a saved Azure API key."
            return None
        payload = {
            "messages": [
                {
                    "role": "system",
                    "content": "You are a disciplined trading assistant. You only restate verified facts and never provide financial advice.",
                },
                {"role": "user", "content": prompt},
            ],
            "temperature": settings.temperature,
            "max_tokens": settings.max_tokens,
            "stream": False,
        }
        body = self._post_json(
            self._azure_chat_completions_url(settings),
            payload,
            timeout=settings.request_timeout_seconds,
            headers={"api-key": api_key},
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
        return ModelResponse(text=text, source=f"azure_openai:{settings.model}")

    def _azure_openai_runtime_state(self, settings: AiSettings) -> dict[str, str]:
        deployment = self._azure_deployment_name(settings)
        if not deployment:
            return {
                "runtimeStatus": "unavailable",
                "runtimeDetail": "Azure OpenAI requires a deployment name. Use the model field or include /deployments/{deployment} in the endpoint URL.",
            }
        return {
            "runtimeStatus": "available",
            "runtimeDetail": f"Azure OpenAI deployment {deployment} is configured. The live test will call its chat completions endpoint.",
        }

    def _azure_deployment_name(self, settings: AiSettings) -> str:
        if settings.model.strip():
            return settings.model.strip()
        parsed = urllib.parse.urlparse(settings.base_url)
        parts = [part for part in parsed.path.split("/") if part]
        if "deployments" in parts:
            index = parts.index("deployments")
            if index + 1 < len(parts):
                return urllib.parse.unquote(parts[index + 1])
        return ""

    def _azure_chat_completions_url(self, settings: AiSettings) -> str:
        base_url = settings.base_url.rstrip("/")
        parsed = urllib.parse.urlparse(base_url)
        query = urllib.parse.parse_qs(parsed.query)
        api_version = query.get("api-version", ["2024-10-21"])[0]
        clean_base = urllib.parse.urlunparse(parsed._replace(query=""))
        if "/chat/completions" in clean_base:
            endpoint = clean_base
        elif "/deployments/" in clean_base:
            endpoint = f"{clean_base}/chat/completions"
        else:
            deployment = urllib.parse.quote(self._azure_deployment_name(settings), safe="")
            endpoint = f"{clean_base}/openai/deployments/{deployment}/chat/completions"
        separator = "&" if "?" in endpoint else "?"
        return f"{endpoint}{separator}api-version={urllib.parse.quote(api_version, safe='')}"

    def _list_azure_openai_model_items(self, settings: AiSettings) -> list[dict[str, Any]]:
        deployment = self._azure_deployment_name(settings)
        if not deployment:
            return []
        return [
            {
                "id": deployment,
                "label": deployment,
                "description": "Azure OpenAI deployment",
                "runtimeStatus": "available",
                "runtimeDetail": "Azure OpenAI deployment configured. Live test uses the deployment chat completions endpoint.",
            }
        ]
