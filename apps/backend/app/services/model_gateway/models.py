# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

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
