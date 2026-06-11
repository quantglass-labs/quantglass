# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Interactive Learning Platform service.

Serves a structured curriculum across four tiers (novice -> intermediate ->
advanced -> expert). Lesson content lives in JSON files under
``app/content/lessons`` so curriculum contributions are pure-content changes;
this module only loads the catalog and evaluates exercises.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.storage.state_store import StateStore

_CONTENT_DIR = Path(__file__).resolve().parent.parent / "content" / "lessons"


@lru_cache(maxsize=1)
def _load_catalog_meta() -> dict[str, Any]:
    with open(_CONTENT_DIR / "modules.json", encoding="utf-8") as handle:
        return json.load(handle)


@lru_cache(maxsize=1)
def _load_lessons() -> tuple[dict[str, Any], ...]:
    lessons: list[dict[str, Any]] = []
    for tier in _load_catalog_meta()["tier_order"]:
        with open(_CONTENT_DIR / f"{tier}.json", encoding="utf-8") as handle:
            lessons.extend(json.load(handle))
    return tuple(lessons)


def _tier_order() -> list[str]:
    return _load_catalog_meta()["tier_order"]


def _module_meta() -> dict[str, dict[str, str]]:
    return _load_catalog_meta()["modules"]


# ---------------------------------------------------------------------------
# LearnService
# ---------------------------------------------------------------------------


class LearnService:
    def __init__(self, state_store: StateStore) -> None:
        self._store = state_store

    def get_catalog(self) -> dict[str, Any]:
        progress = self._store.get_learn_progress()
        completed_ids = {lid for lid, data in progress.items() if data.get("completed_at")}
        modules = []
        for tier in _tier_order():
            meta = _module_meta()[tier]
            tier_lessons = sorted(
                [les for les in _load_lessons() if les["module_id"] == tier],
                key=lambda les: les["order"],
            )
            module_completed = sum(1 for les in tier_lessons if les["id"] in completed_ids)
            modules.append(
                {
                    **meta,
                    "lessons": [self._lesson_stub(les, completed_ids) for les in tier_lessons],
                    "completed": module_completed,
                    "total": len(tier_lessons),
                }
            )
        total = len(_load_lessons())
        done = len(completed_ids & {les["id"] for les in _load_lessons()})
        return {
            "modules": modules,
            "progress": {
                "total": total,
                "completed": done,
                "by_tier": {
                    tier: {
                        "total": sum(1 for les in _load_lessons() if les["module_id"] == tier),
                        "completed": sum(
                            1
                            for les in _load_lessons()
                            if les["module_id"] == tier and les["id"] in completed_ids
                        ),
                    }
                    for tier in _tier_order()
                },
            },
        }

    def get_lesson(self, lesson_id: str) -> dict[str, Any] | None:
        lesson = next((les for les in _load_lessons() if les["id"] == lesson_id), None)
        if lesson is None:
            return None
        progress = self._store.get_learn_progress()
        completed_ids = {lid for lid, data in progress.items() if data.get("completed_at")}
        return {**lesson, "completed": lesson_id in completed_ids}

    def check_answer(self, lesson_id: str, answer: str) -> dict[str, Any]:
        lesson = next((les for les in _load_lessons() if les["id"] == lesson_id), None)
        if lesson is None:
            return {"correct": False, "explanation": "Lesson not found.", "score": 0}

        self._store.record_lesson_attempt(lesson_id)
        ex = lesson["exercise"]

        if ex["type"] == "multiple_choice":
            try:
                chosen_index = int(answer)
            except (ValueError, TypeError):
                chosen_index = -1
            correct = chosen_index == ex["correct_index"]

        elif ex["type"] == "numeric_input":
            try:
                given = float(answer.replace(",", "").strip())
                expected = float(ex["correct_answer"].replace(",", "").strip())
                tolerance = abs(expected) * (ex.get("tolerance_percent", 1.0) / 100)
                correct = abs(given - expected) <= tolerance
            except (ValueError, TypeError):
                correct = False

        else:
            correct = False

        if correct:
            self._store.mark_lesson_complete(lesson_id)

        return {
            "correct": correct,
            "explanation": ex["explanation"],
            "score": 10 if correct else 0,
        }

    def get_progress(self) -> dict[str, Any]:
        progress = self._store.get_learn_progress()
        completed_ids = {lid for lid, data in progress.items() if data.get("completed_at")}
        total = len(_load_lessons())
        done = len(completed_ids & {les["id"] for les in _load_lessons()})
        return {
            "total": total,
            "completed": done,
            "by_tier": {
                tier: {
                    "total": sum(1 for les in _load_lessons() if les["module_id"] == tier),
                    "completed": sum(
                        1
                        for les in _load_lessons()
                        if les["module_id"] == tier and les["id"] in completed_ids
                    ),
                }
                for tier in _tier_order()
            },
        }

    # ------------------------------------------------------------------

    @staticmethod
    def _lesson_stub(lesson: dict[str, Any], completed_ids: set[str]) -> dict[str, Any]:
        return {
            "id": lesson["id"],
            "order": lesson["order"],
            "title": lesson["title"],
            "summary": lesson["summary"],
            "tier": lesson["tier"],
            "completed": lesson["id"] in completed_ids,
        }
