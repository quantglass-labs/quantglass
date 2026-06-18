# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from __future__ import annotations

import json
import re
from collections.abc import Callable
from typing import Any

from app.core.config import AiSettings
from app.services.locale import canonicalize_numerals, language_directive
from app.services.model_gateway import ModelGateway

_NUMBER_PATTERN = re.compile(r"-?\d+(?:\.\d+)?")
# Numbers that are structurally part of prose (rung counts, percentages-as-words, etc.)
# and never represent a fabricated price/stat.
_ALWAYS_ALLOWED = {0.0, 1.0, 2.0, 3.0, 100.0}


NARRATION_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "summary": {
            "type": "string",
            "description": "Two to three plain-English sentences restating only the provided facts.",
        }
    },
    "required": ["summary"],
}


class NarrationService:
    """Generates signal narration from local/API models with a strict fact guard.

    The model is only ever allowed to restate facts the engine computed. Any generated
    number that does not trace back to the provided facts is treated as a hallucination
    and the deterministic template is used instead. If the configured model endpoint is
    unreachable or model narration is disabled, narration silently degrades to the
    labeled offline template.
    """

    def __init__(
        self,
        ai_settings_provider: Callable[[], AiSettings],
        model_gateway: ModelGateway | None = None,
    ) -> None:
        self._ai_settings_provider = ai_settings_provider
        self._model_gateway = model_gateway or ModelGateway()

    def narrate(self, facts: dict[str, Any]) -> tuple[str, str]:
        settings = self._ai_settings_provider()
        if not settings.cloud_enabled:
            return self._template(facts), "template"

        response = self._model_gateway.complete(
            settings, self._build_prompt(facts), response_schema=NARRATION_SCHEMA
        )
        if response is None:
            return self._template(facts), "template-fallback"

        text = self._extract_summary(response.text)
        if not text:
            return self._template(facts), "template-fallback"

        if not self._passes_fact_guard(text, facts):
            return self._template(facts), "template-guarded"

        return text, response.source

    @staticmethod
    def _extract_summary(raw: str) -> str:
        """Unwrap the structured {"summary": ...} envelope; accept plain text from
        providers without schema support."""
        stripped = raw.strip()
        if stripped.startswith("{"):
            try:
                parsed = json.loads(stripped)
            except ValueError:
                return ""
            summary = parsed.get("summary") if isinstance(parsed, dict) else None
            return summary.strip() if isinstance(summary, str) else ""
        return stripped

    def _build_prompt(self, facts: dict[str, Any]) -> str:
        facts_json = json.dumps(facts, indent=2, default=str)
        return (
            "You are a disciplined trading assistant. Write a concise 2-3 sentence plain-English "
            "summary of the following signal. Strict rules:\n"
            "1. Only state facts present in the JSON below.\n"
            "2. Do NOT invent any numbers, prices, percentages, or statistics that are not in the JSON.\n"
            "3. Do NOT give financial advice or predict outcomes.\n"
            "4. If a metric is missing or zero-sample, say the sample is insufficient.\n"
            "Return only the summary text, no preamble.\n\n"
            f"FACTS:\n{facts_json}\n"
            f"{language_directive()}"
        )

    def _passes_fact_guard(self, text: str, facts: dict[str, Any]) -> bool:
        allowed = self._allowed_numbers(facts)
        # Canonicalize localized numerals (non-Latin digits, comma/dot separators)
        # so the guard reads the model's numbers regardless of answer language.
        text = canonicalize_numerals(text)
        for token in _NUMBER_PATTERN.findall(text):
            value = float(token)
            if value in _ALWAYS_ALLOWED:
                continue
            if not any(self._numbers_match(value, candidate) for candidate in allowed):
                return False
        return True

    def _allowed_numbers(self, facts: dict[str, Any]) -> set[float]:
        allowed: set[float] = set(_ALWAYS_ALLOWED)
        serialized = json.dumps(facts, default=str)
        for token in _NUMBER_PATTERN.findall(serialized):
            allowed.add(float(token))
        return allowed

    def _numbers_match(self, value: float, candidate: float) -> bool:
        if value == candidate:
            return True
        tolerance = max(abs(candidate) * 0.01, 0.05)
        return abs(value - candidate) <= tolerance

    def _template(self, facts: dict[str, Any]) -> str:
        reasons = facts.get("reasons") or ["", ""]
        lead = reasons[0] if len(reasons) > 0 else ""
        follow = reasons[1] if len(reasons) > 1 else ""
        if facts.get("backtest_sample_size"):
            validation = (
                "out-of-sample validated"
                if facts.get("out_of_sample_validated")
                else "not yet out-of-sample validated"
            )
            metrics_text = (
                f"This {facts.get('setup_type')} pattern backtests at "
                f"{facts.get('backtested_winrate_pct', 0):.0f}% win rate with "
                f"{facts.get('backtested_expectancy_R', 0):.2f}R expectancy across "
                f"{facts.get('backtest_sample_size')} samples ({validation})."
            )
        else:
            metrics_text = "Historical sample size is still too small to produce a reliable expectancy estimate."
        return (
            f"{facts.get('symbol')} is in a {str(facts.get('signal', '')).lower().replace('_', ' ')} state on the "
            f"closed {facts.get('timeframe')} candle ({facts.get('market_regime')} regime) with "
            f"{facts.get('confidence')}% confidence. {lead} {follow} {metrics_text}"
        )
