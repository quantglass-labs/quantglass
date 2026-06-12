# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""AI coach narrative (AI-2) and lesson tutor (AI-3).

Two more surfaces for the configured model gateway, both on the narration
covenant. The coach narrates the Review page's own facts — weekly process
metrics, the 2x2 quadrants, repeated-mistake detections — behind the fact
guard, with a deterministic template fallback. The tutor answers questions
grounded in a lesson's own concept text and key terms; it is the one
surface that needs a configured model (there is no template that can
answer an open question), so it degrades to a clear "configure a model"
message instead. Education only, never financial advice.
"""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from typing import Any

from app.core.config import AiSettings
from app.services.model_gateway import ModelGateway

_NUMBER_PATTERN = re.compile(r"-?\d+(?:\.\d+)?")
_ALWAYS_ALLOWED = {0.0, 1.0, 2.0, 3.0, 100.0}

COACH_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "summary": {
            "type": "string",
            "description": "Four to six sentences of coaching grounded only in the provided facts.",
        }
    },
    "required": ["summary"],
}

TUTOR_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "answer": {
            "type": "string",
            "description": "A clear teaching answer grounded in the provided lesson content.",
        }
    },
    "required": ["answer"],
}

MAX_QUESTION_LENGTH = 500


class AiCoachService:
    def __init__(
        self,
        ai_settings_provider: Callable[[], AiSettings],
        review_coach_service: Any,
        learn_service: Any,
        model_gateway: ModelGateway | None = None,
    ) -> None:
        self._ai_settings_provider = ai_settings_provider
        self._review_coach = review_coach_service
        self._learn = learn_service
        self._model_gateway = model_gateway or ModelGateway()

    # ------------------------------------------------------------------
    # AI-2: weekly coach narrative over the Review page's own facts.
    # ------------------------------------------------------------------

    def weekly_narrative(self) -> dict[str, Any]:
        coach = self._review_coach.coach()
        summary = coach["summary"]
        facts = {
            "trades_this_week": coach["weekly"]["trades"],
            "weekly_process_average": coach["weekly"]["average_process_score"],
            "all_time_trades": summary.get("trades", 0),
            "all_time_process_average": summary.get("average_process_score", 0),
            "process_good_bar": summary.get("process_good_bar", 70),
            "quadrants": summary.get("quadrants", {}),
            "dangerous_successes": summary.get("dangerous_success_count", 0),
            "repeated_mistakes": [
                {"label": detection["label"], "count": detection["count"]}
                for detection in coach["detections"][:3]
            ],
        }
        if facts["all_time_trades"] == 0:
            return {
                "summary": (
                    "No executed trades to coach yet. Place planned paper trades and the "
                    "weekly narrative starts here."
                ),
                "source": "template",
            }
        text, source = self._narrate(
            facts,
            COACH_SCHEMA,
            "You are a trading process coach reviewing one trader's week. Write 4-6 "
            "sentences of direct, specific coaching. Strict rules:\n"
            "1. Only state facts present in the JSON below.\n"
            "2. Do NOT invent numbers or trades not in the JSON.\n"
            "3. Coach the process (planning, risk, journaling), never predict markets "
            "or give financial advice.\n"
            "4. Name the repeated mistakes if any, and acknowledge what went well.\n"
            "Return only the coaching text.",
            self._coach_template,
        )
        return {"summary": text, "source": source}

    @staticmethod
    def _coach_template(facts: dict[str, Any]) -> str:
        mistakes = facts["repeated_mistakes"]
        mistake_text = (
            " Repeated patterns to fix: "
            + "; ".join(f"{m['label']} (x{m['count']})" for m in mistakes)
            + "."
            if mistakes
            else " No repeated mistakes detected."
        )
        ds = facts["dangerous_successes"]
        ds_text = (
            f" {ds} dangerous success{'es' if ds != 1 else ''} on record — rewarded bad "
            "process is the pattern that bills accounts later."
            if ds
            else ""
        )
        return (
            f"This week: {facts['trades_this_week']} trades at an average process score of "
            f"{facts['weekly_process_average']} (bar: {facts['process_good_bar']}). All time: "
            f"{facts['all_time_trades']} trades averaging "
            f"{facts['all_time_process_average']}.{ds_text}{mistake_text}"
        )

    # ------------------------------------------------------------------
    # AI-3: lesson tutor — answers grounded in the lesson's own content.
    # ------------------------------------------------------------------

    def tutor(self, lesson_id: str, question: str) -> dict[str, Any]:
        question = question.strip()[:MAX_QUESTION_LENGTH]
        if not question:
            return {"answer": "", "source": "error", "error": "Ask a question first."}
        lesson = self._learn.get_lesson(lesson_id)
        if lesson is None:
            return {"answer": "", "source": "error", "error": "Unknown lesson."}
        settings = self._ai_settings_provider()
        if not settings.cloud_enabled:
            return {
                "answer": "",
                "source": "unconfigured",
                "error": (
                    "The tutor needs a configured AI model. Add one in Settings → AI "
                    "(a local Ollama model works fully offline)."
                ),
            }
        grounding = {
            "title": lesson["title"],
            "concept": lesson["concept"],
            "key_terms": lesson.get("key_terms", []),
            "common_mistakes": lesson.get("common_mistakes", []),
        }
        prompt = (
            "You are a patient trading tutor inside an educational app. Answer the "
            "student's question about this lesson. Strict rules:\n"
            "1. Ground your answer in the LESSON content below; you may rephrase, give "
            "analogies, and add standard textbook context for the same concept.\n"
            "2. Never give financial advice, price predictions, or trade recommendations.\n"
            "3. If the question is unrelated to trading education, redirect to the lesson.\n"
            "4. Keep it under 200 words.\n\n"
            f"LESSON:\n{json.dumps(grounding, ensure_ascii=False)}\n\n"
            f"QUESTION: {question}\n"
        )
        response = self._model_gateway.complete(settings, prompt, response_schema=TUTOR_SCHEMA)
        if response is None:
            return {
                "answer": "",
                "source": "error",
                "error": "The model did not respond. Check Settings → AI and retry.",
            }
        text = response.text.strip()
        try:
            parsed = json.loads(text)
            if isinstance(parsed, dict) and isinstance(parsed.get("answer"), str):
                text = parsed["answer"].strip()
        except (ValueError, TypeError):
            pass
        return {
            "answer": text,
            "source": response.source,
            "disclaimer": "Educational explanation only — never financial advice.",
        }

    # ------------------------------------------------------------------
    # AI2-1: natural-language alert parsing. The model proposes a symbol and
    # condition; the engine's deterministic parser is the only authority on
    # validity. Model proposes, parser disposes.
    # ------------------------------------------------------------------

    def parse_alert(self, text: str, known_symbols: list[str]) -> dict[str, Any]:
        text = text.strip()[:200]
        if not text:
            return {"ok": False, "error": "Describe the alert first."}
        settings = self._ai_settings_provider()
        if not settings.cloud_enabled:
            return {
                "ok": False,
                "error": (
                    "Natural-language alerts need a configured AI model "
                    "(Settings -> AI). You can always type the condition directly: "
                    "'crosses above 100000'."
                ),
            }
        prompt = (
            'Convert the user\'s alert request into JSON {"symbol": str, "condition": str}.\n'
            "Rules:\n"
            f"1. symbol must be one of: {', '.join(known_symbols[:40])}\n"
            "2. condition must use EXACTLY one of these grammars (N is a number):\n"
            "   'crosses above N' | 'crosses below N' | 'above N' | 'below N'\n"
            "3. Interpret k/m suffixes (100k -> 100000). No other text.\n\n"
            f"REQUEST: {text}\n"
        )
        response = self._model_gateway.complete(
            settings,
            prompt,
            response_schema={
                "type": "object",
                "properties": {"symbol": {"type": "string"}, "condition": {"type": "string"}},
                "required": ["symbol", "condition"],
            },
        )
        if response is None:
            return {"ok": False, "error": "The model did not respond; type the condition directly."}
        try:
            parsed = json.loads(response.text)
            symbol = str(parsed.get("symbol", "")).upper().replace("/", "")
            condition = str(parsed.get("condition", "")).strip().lower()
        except (ValueError, TypeError, AttributeError):
            return {
                "ok": False,
                "error": "Could not parse the model output; type the condition directly.",
            }
        from app.services.execution_engine import parse_condition_text

        spec = parse_condition_text(condition)
        if spec is None or symbol not in {s.upper() for s in known_symbols}:
            return {
                "ok": False,
                "error": (
                    f"The model proposed '{symbol}: {condition}', which the alert engine "
                    "rejected. Adjust and retry, or type the condition directly."
                ),
            }
        return {
            "ok": True,
            "symbol": symbol,
            "condition": condition,
            "preview": f"{symbol}: fires when price {spec.mode.replace('_', ' ')} {spec.threshold:g} (closed candles)",
            "source": response.source,
        }

    # ------------------------------------------------------------------
    # AI2-2: the daily brief - a morning narrative over the engine's own
    # context, signals, and risk reads.
    # ------------------------------------------------------------------

    def daily_brief(self, facts: dict[str, Any]) -> dict[str, Any]:
        text, source = self._narrate(
            facts,
            COACH_SCHEMA,
            "You are writing a trader's morning brief from their own engine's data. "
            "Write 4-6 sentences. Strict rules:\n"
            "1. Only state facts present in the JSON below.\n"
            "2. Do NOT invent numbers, symbols, or market claims.\n"
            "3. Never give financial advice or predictions - describe the environment "
            "the engine measured.\n"
            "4. Lead with regimes/risk warnings, then notable signals.\n"
            "Return only the brief.",
            self._brief_template,
        )
        return {"summary": text, "source": source}

    @staticmethod
    def _brief_template(facts: dict[str, Any]) -> str:
        regimes = facts.get("regimes", [])
        regime_text = (
            "; ".join(f"{r['symbol']} {r['timeframe']}: {r['state']}" for r in regimes[:4])
            or "no regime reads yet"
        )
        risk = facts.get("risk_warnings", [])
        risk_text = f" Risk: {'; '.join(risk)}." if risk else ""
        top = facts.get("top_signals", [])
        top_text = (
            " Top signals: "
            + "; ".join(f"{t['symbol']} {t['name']} (confidence {t['confidence']})" for t in top)
            + "."
            if top
            else " No active setups."
        )
        return f"Regimes - {regime_text}.{top_text}{risk_text}"

    # ------------------------------------------------------------------
    # Generic surface insight: one covenant-shaped narration per screen.
    # The route assembles the facts; this narrates them with per-surface
    # instructions and an honest template fallback.
    # ------------------------------------------------------------------

    SURFACE_INSTRUCTIONS = {
        "journal": (
            "You are reading one trader's journal. From the JSON facts (their own "
            "notes, mistake tags, and process scores), write 3-5 sentences about the "
            "patterns their own words reveal."
        ),
        "watchlist": (
            "Summarize the trader's watchlist from the JSON facts (regimes and any "
            "active signals on watched symbols) in 3-4 sentences."
        ),
        "missions": (
            "From the JSON facts about active missions and their objective progress, "
            "write 2-4 sentences on what to do next to advance them."
        ),
        "portfolio": (
            "From the JSON facts (open positions, exposure, risk warnings), write 3-4 "
            "sentences describing the book's current shape and concentration."
        ),
    }

    def surface_insight(self, surface: str, facts: dict[str, Any]) -> dict[str, Any]:
        instructions = self.SURFACE_INSTRUCTIONS.get(surface)
        if instructions is None:
            return {"summary": "", "source": "error", "error": "Unknown surface."}
        base_rules = (
            "\nStrict rules: only state facts present in the JSON; never invent "
            "numbers or symbols; never give financial advice or predictions. "
            "Return only the text."
        )
        text, source = self._narrate(
            facts,
            COACH_SCHEMA,
            instructions + base_rules,
            lambda f: self._surface_template(surface, f),
        )
        return {"summary": text, "source": source}

    @staticmethod
    def _surface_template(surface: str, facts: dict[str, Any]) -> str:
        highlights = facts.get("highlights", [])
        if not highlights:
            return "Nothing notable yet — this panel fills in as data accumulates."
        return " ".join(str(item) for item in highlights[:5])

    # ------------------------------------------------------------------
    # AI2-4: postmortems. The grade/review already computed every number;
    # the model writes the debrief a mentor would.
    # ------------------------------------------------------------------

    POSTMORTEM_INSTRUCTIONS = {
        "drill": (
            "A trader just finished a decision drill. From the JSON facts (their "
            "choices, per-dimension scores, severe violations), write a 3-4 sentence "
            "debrief a flight instructor would give - direct, specific, naming the "
            "decisive choice."
        ),
        "trade": (
            "Write a 3-4 sentence postmortem of one paper trade from the JSON facts "
            "(plan, process score and notes, outcome, classification). Grade the "
            "decision, not the outcome."
        ),
    }

    def postmortem(self, kind: str, facts: dict[str, Any]) -> dict[str, Any]:
        instructions = self.POSTMORTEM_INSTRUCTIONS.get(kind)
        if instructions is None:
            return {"summary": "", "source": "error", "error": "Unknown postmortem kind."}
        base_rules = (
            "\nStrict rules: only state facts present in the JSON; never invent "
            "numbers; never give financial advice or predictions. Return only the text."
        )
        text, source = self._narrate(
            facts, COACH_SCHEMA, instructions + base_rules, self._postmortem_template
        )
        return {"summary": text, "source": source}

    @staticmethod
    def _postmortem_template(facts: dict[str, Any]) -> str:
        if "scores" in facts:
            scores = facts["scores"]
            severe = facts.get("severe_violation")
            return (
                f"Process {scores.get('process')}, risk {scores.get('risk')}, discipline "
                f"{scores.get('discipline')}."
                + (" A severe choice failed the run - that habit ends accounts." if severe else "")
            )
        return (
            f"Process score {facts.get('process_score')} - "
            f"{facts.get('classification') or 'unresolved'}. "
            + " ".join(str(n) for n in (facts.get("process_notes") or [])[:2])
        )

    # ------------------------------------------------------------------

    def _narrate(
        self,
        facts: dict[str, Any],
        schema: dict,
        instructions: str,
        template: Callable[[dict[str, Any]], str],
    ) -> tuple[str, str]:
        settings = self._ai_settings_provider()
        if not settings.cloud_enabled:
            return template(facts), "template"
        prompt = f"{instructions}\n\nFACTS:\n{json.dumps(facts, indent=2, default=str)}\n"
        response = self._model_gateway.complete(settings, prompt, response_schema=schema)
        if response is None:
            return template(facts), "template-fallback"
        text = response.text.strip()
        try:
            parsed = json.loads(text)
            if isinstance(parsed, dict) and isinstance(parsed.get("summary"), str):
                text = parsed["summary"].strip()
        except (ValueError, TypeError):
            pass
        if not text or not self._passes_fact_guard(text, facts):
            return template(facts), "template-guarded"
        return text, response.source

    @staticmethod
    def _passes_fact_guard(text: str, facts: dict[str, Any]) -> bool:
        allowed: set[float] = set(_ALWAYS_ALLOWED)
        for token in _NUMBER_PATTERN.findall(json.dumps(facts, default=str)):
            allowed.add(float(token))
        for token in _NUMBER_PATTERN.findall(text):
            value = float(token)
            if value in _ALWAYS_ALLOWED:
                continue
            if not any(
                value == candidate or abs(value - candidate) <= max(abs(candidate) * 0.01, 0.05)
                for candidate in allowed
            ):
                return False
        return True
