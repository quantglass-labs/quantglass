# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Mission engine (MSN-3): behavioral certifications over real paper trading.

Missions are declarative JSON (app/content/missions) — objectives plus typed
criteria evaluated over the trade-review data (process scores, first-touch
outcomes, the 2x2). Completion is persisted, and the readiness ladder reads
it: trade-count bars mature into conduct bars. Educational only.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

_MISSIONS_FILE = Path(__file__).resolve().parent.parent / "content" / "missions" / "missions.json"


@lru_cache(maxsize=1)
def _load_missions() -> tuple[dict[str, Any], ...]:
    with open(_MISSIONS_FILE, encoding="utf-8") as handle:
        return tuple(json.load(handle))


class MissionService:
    def __init__(self, state_store: Any, trade_review_service: Any) -> None:
        self._store = state_store
        self._review = trade_review_service

    def list_missions(self) -> dict[str, Any]:
        review = self._review.review()
        items = review["items"]
        completed = self._store.get_completed_missions()

        missions = []
        for mission in _load_missions():
            criteria = [self._evaluate(criterion, items) for criterion in mission["criteria"]]
            done = all(criterion["met"] for criterion in criteria)
            if done and mission["id"] not in completed:
                self._store.record_mission_complete(mission["id"])
                completed = self._store.get_completed_missions()
            missions.append(
                {
                    "id": mission["id"],
                    "title": mission["title"],
                    "level": mission["level"],
                    "description": mission["description"],
                    "lesson_links": mission.get("lesson_links", []),
                    "criteria": criteria,
                    "completed": mission["id"] in completed,
                    "completed_at": completed.get(mission["id"]),
                }
            )
        return {"items": missions}

    # ------------------------------------------------------------------
    # Typed criteria over the review items
    # ------------------------------------------------------------------

    def _evaluate(self, criterion: dict[str, Any], items: list[dict[str, Any]]) -> dict[str, Any]:
        kind = criterion["type"]
        label = criterion["label"]

        if kind == "min_trades":
            current = len(items)
            return self._result(label, current >= criterion["value"], current, criterion["value"])

        if kind == "all_have_stops":
            stopless = sum(
                1 for item in items if any("No stop" in note for note in item["process_notes"])
            )
            return self._result(label, len(items) > 0 and stopless == 0, stopless, 0)

        if kind == "max_risk_percent_each":
            violations = sum(
                1
                for item in items
                if any("exceeds" in note or "double" in note for note in item["process_notes"])
            )
            return self._result(label, len(items) > 0 and violations == 0, violations, 0)

        if kind == "max_dangerous_success":
            count = sum(1 for item in items if item["classification"] == "dangerous_success")
            return self._result(label, count <= criterion["value"], count, criterion["value"])

        if kind == "min_classification":
            count = sum(
                1 for item in items if item["classification"] == criterion["classification"]
            )
            return self._result(label, count >= criterion["value"], count, criterion["value"])

        if kind == "consecutive_process_scores":
            best = 0
            run = 0
            # review items are newest-first; chronological order for streaks
            for item in reversed(items):
                if item["process_score"] >= criterion["min_score"]:
                    run += 1
                    best = max(best, run)
                else:
                    run = 0
            return self._result(label, best >= criterion["value"], best, criterion["value"])

        return self._result(label, False, 0, 0)

    @staticmethod
    def _result(label: str, met: bool, current: Any, target: Any) -> dict[str, Any]:
        return {"label": label, "met": met, "current": current, "target": target}
