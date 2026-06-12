# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""QuantGlass Copilot (AI2-5): grounded Q&A over the read-only engine tools.

The flagship AI surface, on the same covenant as everything else. The model
never invents facts: it first proposes which read-only tools to consult
(model proposes, engine disposes - unknown tools are dropped), the engine
executes them deterministically, and the model narrates only those results
behind the numeric fact guard. With no model configured the Copilot still
answers, deterministically, from the same facts - labeled "template".
Educational decision support, never financial advice.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any

from app.core.config import AiSettings
from app.services.ai_coach import AiCoachService
from app.services.model_gateway import ModelGateway

MAX_QUESTION_LENGTH = 500
MAX_TOOLS_PER_QUESTION = 3
MAX_ITEMS_PER_RESULT = 12

TOOL_SELECTION_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "tools": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Names of the read-only tools needed to answer the question.",
        }
    },
    "required": ["tools"],
}

ANSWER_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "answer": {
            "type": "string",
            "description": "A direct answer grounded only in the provided tool results.",
        }
    },
    "required": ["answer"],
}

# Deterministic tool routing for when no model is configured (or its proposal
# is unusable). Order matters: first match wins, multiple groups can match.
_KEYWORD_ROUTES: list[tuple[tuple[str, ...], str]] = [
    (("signal", "setup", "entry", "trade idea", "long", "short"), "list_signals"),
    (("backtest", "win rate", "expectancy", "sharpe", "strategy"), "list_backtest_presets"),
    (("account", "balance", "buying power", "position", "exposure"), "get_paper_account"),
    (("watchlist", "watching", "symbols"), "list_watchlist"),
    (("closed", "closure", "history", "exit", "pnl", "p&l"), "list_paper_closures"),
    (("review", "process", "mistake", "discipline", "grade", "pattern"), "get_trade_review"),
]
_DEFAULT_TOOLS = ["list_signals", "get_paper_account"]


class CopilotService:
    def __init__(
        self,
        ai_settings_provider: Callable[[], AiSettings],
        model_gateway: ModelGateway | None = None,
    ) -> None:
        self._ai_settings_provider = ai_settings_provider
        self._model_gateway = model_gateway or ModelGateway()

    def ask(
        self,
        question: str,
        tools: dict[str, Callable[[], Any]],
        descriptions: dict[str, str],
    ) -> dict[str, Any]:
        cleaned = (question or "").strip()
        if not cleaned:
            return {"answer": "", "source": "error", "toolsUsed": [], "error": "Ask a question."}
        if len(cleaned) > MAX_QUESTION_LENGTH:
            return {
                "answer": "",
                "source": "error",
                "toolsUsed": [],
                "error": f"Keep questions under {MAX_QUESTION_LENGTH} characters.",
            }

        selected = self._select_tools(cleaned, descriptions)[:MAX_TOOLS_PER_QUESTION]
        facts: dict[str, Any] = {}
        for name in selected:
            try:
                facts[name] = _trim_result(tools[name]())
            except Exception as exc:  # a tool failure is a fact, not a crash
                facts[name] = {"error": str(exc)}

        answer, source = self._answer(cleaned, facts)
        return {"answer": answer, "source": source, "toolsUsed": selected}

    # ------------------------------------------------------------------

    def _select_tools(self, question: str, descriptions: dict[str, str]) -> list[str]:
        settings = self._ai_settings_provider()
        if settings.cloud_enabled:
            catalog = "\n".join(f"- {name}: {text}" for name, text in descriptions.items())
            prompt = (
                "Pick which read-only tools are needed to answer the user's question "
                "about their own trading workstation. Return only JSON: "
                '{"tools": ["name", ...]}. Available tools:\n'
                f"{catalog}\n\nQuestion: {question}\n"
            )
            response = self._model_gateway.complete(
                settings, prompt, response_schema=TOOL_SELECTION_SCHEMA
            )
            if response is not None:
                proposed = _parse_tool_names(response.text)
                # Engine disposes: only tools that actually exist survive.
                valid = [name for name in proposed if name in descriptions]
                if valid:
                    return valid
        matched = [
            tool
            for keywords, tool in _KEYWORD_ROUTES
            if any(keyword in question.lower() for keyword in keywords)
        ]
        return matched or list(_DEFAULT_TOOLS)

    def _answer(self, question: str, facts: dict[str, Any]) -> tuple[str, str]:
        settings = self._ai_settings_provider()
        if settings.cloud_enabled:
            prompt = (
                "Answer the user's question about their own trading workstation using "
                "ONLY the tool results below. Strict rules: never invent numbers or "
                "facts not present in the results; if the results cannot answer the "
                "question, say so; never give financial advice or predictions. "
                'Return only JSON: {"answer": "..."}.\n\n'
                f"Question: {question}\n\nTOOL RESULTS:\n"
                f"{json.dumps(facts, indent=2, default=str)}\n"
            )
            response = self._model_gateway.complete(settings, prompt, response_schema=ANSWER_SCHEMA)
            if response is not None:
                text = response.text.strip()
                try:
                    parsed = json.loads(text)
                    if isinstance(parsed, dict) and isinstance(parsed.get("answer"), str):
                        text = parsed["answer"].strip()
                except (ValueError, TypeError):
                    pass
                if text and AiCoachService._passes_fact_guard(text, facts):
                    return text, response.source
                return _template_answer(facts), "template-guarded"
            return _template_answer(facts), "template-fallback"
        return _template_answer(facts), "template"


def _parse_tool_names(text: str) -> list[str]:
    try:
        parsed = json.loads(text.strip())
    except (ValueError, TypeError):
        return []
    names = parsed.get("tools") if isinstance(parsed, dict) else None
    if not isinstance(names, list):
        return []
    return [name for name in names if isinstance(name, str)]


def _trim_result(result: Any) -> Any:
    if isinstance(result, dict) and isinstance(result.get("items"), list):
        items = result["items"]
        if len(items) > MAX_ITEMS_PER_RESULT:
            return {**result, "items": items[:MAX_ITEMS_PER_RESULT], "truncated": len(items)}
    return result


def _template_answer(facts: dict[str, Any]) -> str:
    """Deterministic answer straight from the tool results - no model needed."""
    lines: list[str] = []
    for name, result in facts.items():
        if isinstance(result, dict) and result.get("error"):
            lines.append(f"{name} failed: {result['error']}")
            continue
        if name == "list_signals":
            items = result.get("items", [])
            top = ", ".join(
                f"{item.get('symbol_id', item.get('symbol', '?'))} "
                f"{item.get('display_name', item.get('name', ''))}".strip()
                for item in items[:3]
            )
            lines.append(f"{len(items)} active signals." + (f" Top: {top}." if top else ""))
        elif name == "get_paper_account":
            lines.append(
                f"Paper account: balance {result.get('balance')}, buying power "
                f"{result.get('buyingPower')}, realized PnL {result.get('realizedPnl')}, "
                f"{len(result.get('openPositions', []))} open positions."
            )
        elif name == "list_paper_closures":
            items = result.get("items", [])
            net = round(sum(float(item.get("pnl") or 0) for item in items), 2)
            lines.append(f"{len(items)} closed trades, net PnL {net}.")
        elif name == "list_watchlist":
            symbols = ", ".join(item.get("symbol", "?") for item in result.get("items", [])[:8])
            lines.append(f"Watchlist: {symbols or 'empty'}.")
        elif name == "list_backtest_presets":
            lines.append(f"{len(result.get('items', []))} backtest presets available.")
        elif name == "get_trade_review":
            summary = result.get("summary") or {}
            lines.append(
                f"Trade review: {summary.get('trades', 0)} trades, average process "
                f"score {summary.get('average_process_score', 0)}."
            )
    if not lines:
        return "I could not read any engine data for that question."
    return (
        " ".join(lines)
        + " (Deterministic read - configure a model in Settings → AI for a narrated answer.)"
    )
