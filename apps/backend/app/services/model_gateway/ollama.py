# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Ollama local model discovery, runtime detail, and generation."""

from __future__ import annotations

from typing import Any

from app.core.config import AiSettings
from app.services.model_gateway.models import (
    ModelResponse,
)


class OllamaProviderMixin:
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
