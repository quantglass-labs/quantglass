# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Replay missions (MSN-6): historical-episode scenarios with graded debriefs.

Each scenario is declarative JSON — a stylized recreation of a market episode
as embedded OHLC bars, with decision checkpoints at fixed bar indices. Every
option carries points and an engine-fact debrief, so the grade explains
itself. Best scores persist and feed the Academy. Educational only.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.services.content_locale import localize_scenarios
from app.services.locale import get_locale

_SCENARIOS_FILE = (
    Path(__file__).resolve().parent.parent / "content" / "scenarios" / "scenarios.json"
)


@lru_cache(maxsize=1)
def _load_scenarios_base() -> tuple[dict[str, Any], ...]:
    with open(_SCENARIOS_FILE, encoding="utf-8") as handle:
        return tuple(json.load(handle))


def _load_scenarios() -> tuple[dict[str, Any], ...]:
    """Replay scenarios localized to the active request locale (English fallback)."""
    return localize_scenarios(_load_scenarios_base(), get_locale())


class ScenarioService:
    def __init__(self, state_store: Any) -> None:
        self._store = state_store

    def list_scenarios(self) -> dict[str, Any]:
        results = self._store.get_scenario_results()
        items = []
        for scenario in _load_scenarios():
            best = results.get(scenario["id"])
            items.append(
                {
                    "id": scenario["id"],
                    "title": scenario["title"],
                    "level": scenario["level"],
                    "description": scenario["description"],
                    "lesson_links": scenario.get("lesson_links", []),
                    "checkpoints": len(scenario["checkpoints"]),
                    "pass_percent": scenario["pass_percent"],
                    "best_percent": best["best_percent"] if best else None,
                    "passed": bool(best and best["passed"]),
                }
            )
        return {"items": items}

    def get_scenario(self, scenario_id: str) -> dict[str, Any] | None:
        for scenario in _load_scenarios():
            if scenario["id"] != scenario_id:
                continue
            # The player gets candles and questions, but never the points or
            # debriefs — those come back only with the grade.
            return {
                "id": scenario["id"],
                "title": scenario["title"],
                "level": scenario["level"],
                "description": scenario["description"],
                "pass_percent": scenario["pass_percent"],
                "candles": scenario["candles"],
                "checkpoints": [
                    {
                        "at_bar": checkpoint["at_bar"],
                        "question": checkpoint["question"],
                        "options": [
                            {"id": option["id"], "label": option["label"]}
                            for option in checkpoint["options"]
                        ],
                    }
                    for checkpoint in scenario["checkpoints"]
                ],
            }
        return None

    def grade(self, scenario_id: str, answers: dict[str, str]) -> dict[str, Any] | None:
        scenario = next((s for s in _load_scenarios() if s["id"] == scenario_id), None)
        if scenario is None:
            return None

        debrief = []
        score = 0
        max_score = 0
        for index, checkpoint in enumerate(scenario["checkpoints"]):
            best_option = max(option["points"] for option in checkpoint["options"])
            max_score += best_option
            chosen_id = answers.get(str(index))
            chosen = next(
                (option for option in checkpoint["options"] if option["id"] == chosen_id),
                None,
            )
            points = chosen["points"] if chosen else 0
            score += points
            best = next(
                option for option in checkpoint["options"] if option["points"] == best_option
            )
            debrief.append(
                {
                    "question": checkpoint["question"],
                    "chosen": chosen["label"] if chosen else None,
                    "points": points,
                    "max_points": best_option,
                    "debrief": chosen["debrief"] if chosen else "No answer was given.",
                    "best_choice": best["label"] if points < best_option else None,
                }
            )

        percent = round(100 * score / max_score) if max_score else 0
        passed = percent >= scenario["pass_percent"]
        self._store.record_scenario_result(scenario_id, percent, passed)
        return {
            "scenario_id": scenario_id,
            "score": score,
            "max_score": max_score,
            "percent": percent,
            "passed": passed,
            "pass_percent": scenario["pass_percent"],
            "checkpoints": debrief,
        }
