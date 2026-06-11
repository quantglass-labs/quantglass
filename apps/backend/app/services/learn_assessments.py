# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Level assessments: exams assembled from a level's own lesson exercises.

The exam samples multiple-choice questions from the level's lessons, serves
them without answers, grades server-side against the lesson content, and
persists the best result. A passed assessment is what hardens the readiness
ladder's level gates (docs/academy.md §11-12).
"""

from __future__ import annotations

import random
from typing import Any

from app.services.learn_service import _load_lessons, _tier_order

QUESTION_COUNT = 8
PASS_PERCENT = 80


class LearnAssessmentService:
    def __init__(self, state_store: Any) -> None:
        self._store = state_store

    def supports(self, level: str) -> bool:
        return level in _tier_order()

    def build_assessment(self, level: str) -> dict[str, Any]:
        pool = [
            lesson
            for lesson in _load_lessons()
            if lesson["tier"] == level and lesson["exercise"]["type"] == "multiple_choice"
        ]
        count = min(QUESTION_COUNT, len(pool))
        sampled = random.sample(pool, count)
        return {
            "level": level,
            "pass_percent": PASS_PERCENT,
            "questions": [
                {
                    "lesson_id": lesson["id"],
                    "title": lesson["title"],
                    "question": lesson["exercise"]["question"],
                    "options": lesson["exercise"]["options"],
                }
                for lesson in sampled
            ],
        }

    def grade(self, level: str, answers: dict[str, int]) -> dict[str, Any]:
        by_id = {lesson["id"]: lesson for lesson in _load_lessons() if lesson["tier"] == level}
        results = []
        correct = 0
        for lesson_id, chosen in answers.items():
            lesson = by_id.get(lesson_id)
            if lesson is None or lesson["exercise"]["type"] != "multiple_choice":
                continue
            is_correct = int(chosen) == lesson["exercise"]["correct_index"]
            correct += is_correct
            results.append(
                {
                    "lesson_id": lesson_id,
                    "correct": is_correct,
                    "explanation": lesson["exercise"]["explanation"],
                }
            )
        total = len(results)
        score = round(100 * correct / total) if total else 0
        passed = total > 0 and score >= PASS_PERCENT
        self._store.record_assessment(level, score, passed)
        return {
            "level": level,
            "score": score,
            "passed": passed,
            "pass_percent": PASS_PERCENT,
            "results": results,
        }
