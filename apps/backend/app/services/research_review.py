# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""AI research review of backtest runs (AI-1).

The workbench's AI panel, built on the narration covenant: the verdict and
every gating decision are computed deterministically from the run's own
metrics; the model only writes the prose around facts it is handed, behind
the same fact guard as signal narration. With no model configured, the
deterministic template carries the whole review. The review judges research
quality and paper-readiness — it never recommends real trades.
"""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from typing import Any

from app.core.config import AiSettings
from app.services.locale import language_directive
from app.services.model_gateway import ModelGateway

_NUMBER_PATTERN = re.compile(r"-?\d+(?:\.\d+)?")
_ALWAYS_ALLOWED = {0.0, 1.0, 2.0, 3.0, 100.0}

REVIEW_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "summary": {
            "type": "string",
            "description": "Three to five sentences reviewing research quality, using only provided facts.",
        }
    },
    "required": ["summary"],
}


def deterministic_verdict(
    backtest: dict[str, Any], gates: list[dict[str, Any]], monte_carlo: dict[str, Any]
) -> dict[str, str]:
    """The verdict is arithmetic, not opinion — the model never decides it."""
    failed = [gate for gate in gates if gate["status"] == "fail"]
    warned = [gate for gate in gates if gate["status"] == "warn"]
    if failed or not backtest["out_of_sample_validated"]:
        verdict = "Not approved"
        next_action = "Fix failed gates and re-run; expectancy must survive out-of-sample."
    elif warned:
        verdict = "Paper candidate (with cautions)"
        next_action = "Forward-test on paper while addressing the warned gates."
    else:
        verdict = "Paper candidate"
        next_action = "Forward-test on paper; compare realized vs backtested expectancy."

    if backtest["trade_count"] < 30:
        overfit = "Unknown — sample too thin to judge"
    elif backtest["in_sample_expectancy"] > 0 and backtest["out_of_sample_expectancy"] <= 0:
        overfit = "High — edge vanished out-of-sample"
    elif backtest["out_of_sample_expectancy"] < backtest["in_sample_expectancy"] * 0.5:
        overfit = "Moderate — OOS keeps under half the IS edge"
    else:
        overfit = "Low-moderate — OOS edge holds"

    return {
        "verdict": verdict,
        "overfit_risk": overfit,
        "next_action": next_action,
        "live_readiness": "Not approved — paper trading is the supported path.",
    }


class ResearchReviewService:
    def __init__(
        self,
        ai_settings_provider: Callable[[], AiSettings],
        model_gateway: ModelGateway | None = None,
    ) -> None:
        self._ai_settings_provider = ai_settings_provider
        self._model_gateway = model_gateway or ModelGateway()

    def review(
        self,
        backtest: dict[str, Any],
        gates: list[dict[str, Any]],
        monte_carlo: dict[str, Any],
        stress: list[dict[str, Any]],
    ) -> dict[str, Any]:
        verdict = deterministic_verdict(backtest, gates, monte_carlo)
        facts = {
            "expectancy_r": round(backtest["expectancy"], 3),
            "win_rate_pct": round(backtest["win_rate"] * 100, 1),
            "trade_count": backtest["trade_count"],
            "oos_expectancy_r": round(backtest["out_of_sample_expectancy"], 3),
            "oos_trade_count": backtest["out_of_sample_trade_count"],
            "oos_validated": backtest["out_of_sample_validated"],
            "max_drawdown_r": round(backtest.get("max_drawdown", 0.0), 2),
            "profit_factor": round(backtest.get("profit_factor", 0.0), 2),
            "mc_p95_drawdown_r": monte_carlo.get("p95_max_drawdown_r"),
            "stress_worst_expectancy_r": min((row["expectancy_r"] for row in stress), default=None),
            "gates_warned": [gate["label"] for gate in gates if gate["status"] == "warn"],
            "gates_failed": [gate["label"] for gate in gates if gate["status"] == "fail"],
            **verdict,
        }

        summary, source = self._narrate(facts)
        return {**verdict, "summary": summary, "source": source}

    # ------------------------------------------------------------------

    def _narrate(self, facts: dict[str, Any]) -> tuple[str, str]:
        settings = self._ai_settings_provider()
        if not settings.cloud_enabled:
            return self._template(facts), "template"
        response = self._model_gateway.complete(
            settings, self._build_prompt(facts), response_schema=REVIEW_SCHEMA
        )
        if response is None:
            return self._template(facts), "template-fallback"
        text = self._extract_summary(response.text)
        if not text or not self._passes_fact_guard(text, facts):
            return self._template(facts), "template-guarded"
        return text, response.source

    @staticmethod
    def _extract_summary(raw: str) -> str:
        text = raw.strip()
        try:
            parsed = json.loads(text)
            if isinstance(parsed, dict) and isinstance(parsed.get("summary"), str):
                return parsed["summary"].strip()
        except (ValueError, TypeError):
            pass
        return text

    def _build_prompt(self, facts: dict[str, Any]) -> str:
        facts_json = json.dumps(facts, indent=2, default=str)
        return (
            "You are a quantitative research reviewer. Write a 3-5 sentence review of this "
            "backtest run's research quality for a paper-trading decision. Strict rules:\n"
            "1. Only state facts present in the JSON below.\n"
            "2. Do NOT invent numbers, statistics, or market claims not in the JSON.\n"
            "3. Never recommend real trades; this reviews research quality only.\n"
            "4. Mention the most important warned/failed gates by name if any.\n"
            "Return only the review text.\n\n"
            f"FACTS:\n{facts_json}\n"
            f"{language_directive()}"
        )

    def _passes_fact_guard(self, text: str, facts: dict[str, Any]) -> bool:
        allowed: set[float] = set(_ALWAYS_ALLOWED)
        for token in _NUMBER_PATTERN.findall(json.dumps(facts, default=str)):
            allowed.add(float(token))
        for token in _NUMBER_PATTERN.findall(text):
            value = float(token)
            if value in _ALWAYS_ALLOWED:
                continue
            tolerance_match = any(
                value == candidate or abs(value - candidate) <= max(abs(candidate) * 0.01, 0.05)
                for candidate in allowed
            )
            if not tolerance_match:
                return False
        return True

    @staticmethod
    def _template(facts: dict[str, Any]) -> str:
        gates = facts["gates_failed"] + facts["gates_warned"]
        gate_text = f" Gates needing attention: {', '.join(gates)}." if gates else ""
        mc = facts.get("mc_p95_drawdown_r")
        mc_text = f" Monte Carlo p95 drawdown: {mc}R." if mc is not None else ""
        return (
            f"{facts['verdict']}: expectancy {facts['expectancy_r']}R over "
            f"{facts['trade_count']} trades ({facts['win_rate_pct']}% win rate), "
            f"out-of-sample {facts['oos_expectancy_r']}R across {facts['oos_trade_count']} "
            f"trades. Overfit risk: {facts['overfit_risk']}.{mc_text}{gate_text} "
            f"Next action: {facts['next_action']}"
        )
