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
