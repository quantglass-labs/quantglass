# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from __future__ import annotations

import hashlib
import hmac
import json
import re
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from app.core.config import AiSettings

OPENAI_COMPATIBLE_PROVIDERS = {
    "lm_studio",
    "vllm",
    "llama_cpp",
    "openai",
    "deepseek",
    "mistral",
    "groq",
    "openrouter",
    "together",
    "openai_compatible",
}
LOCAL_OPENAI_COMPATIBLE_PROVIDERS = {"lm_studio", "vllm", "llama_cpp"}
KEY_REQUIRED_PROVIDERS = {
    "openai",
    "anthropic",
    "google_gemini",
    "deepseek",
    "mistral",
    "groq",
    "openrouter",
    "together",
    "azure_openai",
    "vertex",
}


@dataclass(frozen=True)
class ModelResponse:
    text: str
    source: str


@dataclass(frozen=True)
class ModelCatalog:
    models: list[str]
    fetched: bool
    detail: str
    items: list[dict[str, Any]]
    source: str
    fetched_at_utc: str


class ModelGateway:
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

    def _call_ollama_generate(self, settings: AiSettings, prompt: str) -> ModelResponse | None:
        payload = {
            "model": settings.model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": settings.temperature,
                "num_predict": settings.max_tokens,
            },
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

    def _call_bedrock_invoke_model(self, settings: AiSettings, prompt: str) -> ModelResponse | None:
        credentials = self._bedrock_credentials(settings)
        if not credentials:
            self.last_error = (
                "Amazon Bedrock requires saved AWS Access Key ID and AWS Secret Access Key."
            )
            return None
        model_id = settings.model.strip()
        if not model_id:
            self.last_error = "Amazon Bedrock requires a model ID."
            return None
        payload = self._bedrock_payload(settings, prompt)
        url = f"https://{self._bedrock_runtime_host(settings)}/model/{urllib.parse.quote(model_id, safe='')}/invoke"
        body_bytes = json.dumps(payload).encode("utf-8")
        headers = self._aws_sigv4_headers(
            method="POST",
            url=url,
            body=body_bytes,
            region=self._bedrock_region(settings),
            service="bedrock",
            access_key=credentials["access_key"],
            secret_key=credentials["secret_key"],
            session_token=credentials.get("session_token"),
            extra_headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
        )
        body = self._post_json(
            url,
            payload,
            timeout=settings.request_timeout_seconds,
            headers=headers,
        )
        if not body:
            return None
        text = self._extract_bedrock_text(settings.model, body)
        if not text:
            return None
        return ModelResponse(text=text, source=f"bedrock:{settings.model}")

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

    def _list_ollama_models(self, settings: AiSettings) -> list[str]:
        return [item["id"] for item in self._list_ollama_model_items(settings)]

    def _list_ollama_model_items(self, settings: AiSettings) -> list[dict[str, Any]]:
        body = self._get_json(
            f"{settings.base_url.rstrip('/')}/api/tags",
            timeout=settings.request_timeout_seconds,
        )
        if not body:
            return []
        models = body.get("models")
        if not isinstance(models, list):
            return []
        loaded_models = self._ollama_loaded_models(settings)
        items: list[dict[str, Any]] = []
        for item in models:
            if isinstance(item, dict) and isinstance(item.get("name"), str):
                model_name = item["name"]
                details = item.get("details")
                parameter_size = (
                    details.get("parameter_size")
                    if isinstance(details, dict) and isinstance(details.get("parameter_size"), str)
                    else None
                )
                quantization = (
                    details.get("quantization_level")
                    if isinstance(details, dict)
                    and isinstance(details.get("quantization_level"), str)
                    else None
                )
                description_parts = ["Local Ollama model"]
                if parameter_size:
                    description_parts.append(parameter_size)
                if quantization:
                    description_parts.append(quantization)
                runtime_status = "unknown" if loaded_models is None else "not_loaded"
                runtime_detail = (
                    "Ollama runtime status was unavailable."
                    if loaded_models is None
                    else "Installed locally. Not currently loaded; first use may take longer."
                )
                if loaded_models and model_name in loaded_models:
                    runtime_status = "loaded"
                    runtime_detail = self._ollama_loaded_model_detail(
                        model_name, loaded_models[model_name]
                    )
                items.append(
                    {
                        "id": model_name,
                        "label": model_name,
                        "description": " · ".join(description_parts),
                        "runtimeStatus": runtime_status,
                        "runtimeDetail": runtime_detail,
                        "createdAt": item.get("modified_at")
                        if isinstance(item.get("modified_at"), str)
                        else None,
                    }
                )
        return self._dedupe_items(items)

    def _ollama_runtime_detail(self, settings: AiSettings) -> str | None:
        return self.provider_runtime_state(settings).get("runtimeDetail")

    def _ollama_loaded_models(self, settings: AiSettings) -> dict[str, dict[str, Any]] | None:
        body = self._get_json(
            f"{settings.base_url.rstrip('/')}/api/ps",
            timeout=min(max(settings.request_timeout_seconds, 1), 3),
        )
        if not body:
            return None
        models = body.get("models")
        if not isinstance(models, list):
            return None
        loaded: dict[str, dict[str, Any]] = {}
        for item in models:
            if not isinstance(item, dict):
                continue
            model_name = (
                item.get("name") if isinstance(item.get("name"), str) else item.get("model")
            )
            if isinstance(model_name, str) and model_name:
                loaded[model_name] = item
        return loaded

    def _ollama_installed_model_names(self, settings: AiSettings) -> set[str]:
        body = self._get_json(
            f"{settings.base_url.rstrip('/')}/api/tags",
            timeout=min(max(settings.request_timeout_seconds, 1), 5),
        )
        models = body.get("models") if body else None
        if not isinstance(models, list):
            return set()
        return {
            item["name"]
            for item in models
            if isinstance(item, dict) and isinstance(item.get("name"), str)
        }

    @staticmethod
    def _ollama_loaded_model_detail(model_name: str, item: dict[str, Any]) -> str:
        details = item.get("details")
        parameter_size = (
            details.get("parameter_size")
            if isinstance(details, dict) and isinstance(details.get("parameter_size"), str)
            else None
        )
        quantization = (
            details.get("quantization_level")
            if isinstance(details, dict) and isinstance(details.get("quantization_level"), str)
            else None
        )
        context_length = (
            item.get("context_length") if isinstance(item.get("context_length"), int) else None
        )
        size_vram = item.get("size_vram") if isinstance(item.get("size_vram"), int) else None
        parts = [f"Ollama currently has {model_name} loaded"]
        if parameter_size:
            parts.append(parameter_size)
        if quantization:
            parts.append(quantization)
        if context_length:
            parts.append(f"context {context_length}")
        if size_vram:
            parts.append(f"VRAM {size_vram / (1024**3):.1f} GiB")
        return f"{', '.join(parts)}."

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

    def _bedrock_runtime_state(self, settings: AiSettings) -> dict[str, str]:
        if not self._bedrock_credentials(settings):
            return {
                "runtimeStatus": "unavailable",
                "runtimeDetail": "Amazon Bedrock requires AWS Access Key ID and AWS Secret Access Key in API Keys.",
            }
        region = self._bedrock_region(settings)
        model = settings.model.strip()
        return {
            "runtimeStatus": "available" if model else "unknown",
            "runtimeDetail": (
                f"Amazon Bedrock is configured for {region}; live test will invoke {model}."
                if model
                else f"Amazon Bedrock credentials are configured for {region}. Select a model before testing."
            ),
        }

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
    def _catalog_runtime_status(provider: str) -> str:
        if provider in LOCAL_OPENAI_COMPATIBLE_PROVIDERS:
            return "loaded"
        return "available"

    def _catalog_runtime_detail(self, provider: str) -> str:
        if provider in LOCAL_OPENAI_COMPATIBLE_PROVIDERS:
            return f"{self._provider_label(provider)} reports this model from /models; the runtime is serving it."
        return f"{self._provider_label(provider)} reports this model as available to the configured account."

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

    def _bedrock_credentials(self, settings: AiSettings) -> dict[str, str] | None:
        access_key_id = self._api_key_provider(settings.api_key_id or "aws-access-key-id").strip()
        secret_access_key = self._api_key_provider("aws-secret-access-key").strip()
        session_token = self._api_key_provider("aws-session-token").strip()
        if not access_key_id or not secret_access_key:
            return None
        credentials = {"access_key": access_key_id, "secret_key": secret_access_key}
        if session_token:
            credentials["session_token"] = session_token
        return credentials

    @staticmethod
    def _bedrock_region(settings: AiSettings) -> str:
        base = settings.base_url.strip()
        parsed = urllib.parse.urlparse(base if "://" in base else f"https://{base}")
        host = parsed.netloc or parsed.path
        match = re.search(r"bedrock(?:-runtime)?[.-]([a-z0-9-]+)\.amazonaws\.com", host)
        return match.group(1) if match else "us-east-1"

    def _bedrock_runtime_host(self, settings: AiSettings) -> str:
        base = settings.base_url.strip()
        parsed = urllib.parse.urlparse(base if "://" in base else f"https://{base}")
        host = parsed.netloc or parsed.path
        if "bedrock-runtime" in host:
            return host
        return f"bedrock-runtime.{self._bedrock_region(settings)}.amazonaws.com"

    def _bedrock_payload(self, settings: AiSettings, prompt: str) -> dict[str, object]:
        model_id = settings.model.lower()
        system = "You are a disciplined trading assistant. You only restate verified facts and never provide financial advice."
        if model_id.startswith("anthropic."):
            return {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": settings.max_tokens,
                "temperature": settings.temperature,
                "system": system,
                "messages": [{"role": "user", "content": [{"type": "text", "text": prompt}]}],
            }
        if model_id.startswith("amazon.nova"):
            return {
                "system": [{"text": system}],
                "messages": [{"role": "user", "content": [{"text": prompt}]}],
                "inferenceConfig": {
                    "maxTokens": settings.max_tokens,
                    "temperature": settings.temperature,
                },
            }
        return {
            "prompt": prompt,
            "temperature": settings.temperature,
            "max_tokens": settings.max_tokens,
        }

    @staticmethod
    def _extract_bedrock_text(model_id: str, body: dict[str, object]) -> str:
        content = body.get("content")
        if isinstance(content, list):
            text = "\n".join(
                item.get("text", "")
                for item in content
                if isinstance(item, dict) and isinstance(item.get("text"), str)
            ).strip()
            if text:
                return text
        output = body.get("output")
        message = output.get("message") if isinstance(output, dict) else None
        parts = message.get("content") if isinstance(message, dict) else None
        if isinstance(parts, list):
            text = "\n".join(
                item.get("text", "")
                for item in parts
                if isinstance(item, dict) and isinstance(item.get("text"), str)
            ).strip()
            if text:
                return text
        for key in ("generation", "completion", "outputText"):
            value = body.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return ""

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

    @staticmethod
    def _aws_sigv4_headers(
        *,
        method: str,
        url: str,
        body: bytes,
        region: str,
        service: str,
        access_key: str,
        secret_key: str,
        session_token: str | None = None,
        extra_headers: dict[str, str] | None = None,
    ) -> dict[str, str]:
        parsed = urllib.parse.urlparse(url)
        now = datetime.now(UTC)
        amz_date = now.strftime("%Y%m%dT%H%M%SZ")
        date_stamp = now.strftime("%Y%m%d")
        headers = {
            "Host": parsed.netloc,
            "X-Amz-Date": amz_date,
            "X-Amz-Content-Sha256": hashlib.sha256(body).hexdigest(),
            **(extra_headers or {}),
        }
        if session_token:
            headers["X-Amz-Security-Token"] = session_token
        canonical_headers = {
            key.lower(): " ".join(value.strip().split()) for key, value in headers.items()
        }
        signed_headers = ";".join(sorted(canonical_headers))
        canonical_header_text = "".join(
            f"{key}:{canonical_headers[key]}\n" for key in sorted(canonical_headers)
        )
        query_pairs = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
        canonical_query = "&".join(
            f"{urllib.parse.quote(key, safe='-_.~')}={urllib.parse.quote(value, safe='-_.~')}"
            for key, value in sorted(query_pairs)
        )
        canonical_uri = urllib.parse.quote(parsed.path or "/", safe="/-_.~")
        canonical_request = "\n".join(
            [
                method.upper(),
                canonical_uri,
                canonical_query,
                canonical_header_text,
                signed_headers,
                hashlib.sha256(body).hexdigest(),
            ]
        )
        scope = f"{date_stamp}/{region}/{service}/aws4_request"
        string_to_sign = "\n".join(
            [
                "AWS4-HMAC-SHA256",
                amz_date,
                scope,
                hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
            ]
        )

        def sign(key: bytes, message: str) -> bytes:
            return hmac.new(key, message.encode("utf-8"), hashlib.sha256).digest()

        signing_key = sign(
            sign(sign(sign(f"AWS4{secret_key}".encode(), date_stamp), region), service),
            "aws4_request",
        )
        signature = hmac.new(
            signing_key, string_to_sign.encode("utf-8"), hashlib.sha256
        ).hexdigest()
        headers["Authorization"] = (
            f"AWS4-HMAC-SHA256 Credential={access_key}/{scope}, "
            f"SignedHeaders={signed_headers}, Signature={signature}"
        )
        return headers

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

    def _list_bedrock_model_items(self, settings: AiSettings) -> list[dict[str, Any]]:
        credentials = self._bedrock_credentials(settings)
        if not credentials:
            return []
        region = self._bedrock_region(settings)
        url = f"https://bedrock.{region}.amazonaws.com/foundation-models"
        headers = self._aws_sigv4_headers(
            method="GET",
            url=url,
            body=b"",
            region=region,
            service="bedrock",
            access_key=credentials["access_key"],
            secret_key=credentials["secret_key"],
            session_token=credentials.get("session_token"),
        )
        body = self._get_json(url, timeout=settings.request_timeout_seconds, headers=headers)
        summaries = body.get("modelSummaries") if body else None
        if not isinstance(summaries, list):
            return []
        items: list[dict[str, Any]] = []
        for item in summaries:
            if not isinstance(item, dict) or not isinstance(item.get("modelId"), str):
                continue
            output_modalities = item.get("outputModalities")
            if (
                isinstance(output_modalities, list)
                and output_modalities
                and "TEXT" not in output_modalities
            ):
                continue
            model_id = item["modelId"]
            provider = (
                item.get("providerName")
                if isinstance(item.get("providerName"), str)
                else "Amazon Bedrock"
            )
            model_name = (
                item.get("modelName") if isinstance(item.get("modelName"), str) else model_id
            )
            items.append(
                {
                    "id": model_id,
                    "label": model_name,
                    "description": provider,
                    "runtimeStatus": "available",
                    "runtimeDetail": f"Amazon Bedrock reports {model_id} as available in {region}.",
                    "inputModalities": item.get("inputModalities")
                    if isinstance(item.get("inputModalities"), list)
                    else [],
                    "outputModalities": output_modalities
                    if isinstance(output_modalities, list)
                    else [],
                    "responseStreamingSupported": item.get("responseStreamingSupported")
                    if isinstance(item.get("responseStreamingSupported"), bool)
                    else None,
                }
            )
        return self._rank_model_items(items, settings.provider)

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
