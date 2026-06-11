# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Readiness scores and level-unlock logic for the Academy.

Implements the gated-progression model from docs/academy.md (v1, soft
gating): five readiness dimensions computed from real app data — lesson
progress, paper-trading history, and the coaching-moment detectors — plus
per-level unlock requirements. Every formula is documented here so a score
is always explainable. Educational instrumentation only, never advice.
"""

from __future__ import annotations

from typing import Any

from app.services.learn_service import LearnService, _load_lessons

# Trade-count bars per the blueprint's unlock ladder (v1 scale).
ADVANCED_TRADE_BAR = 20
EXPERT_TRADE_BAR = 50
EXPERT_PSYCHOLOGY_BAR = 70


class LearnReadinessService:
    """Computes readiness scores and level unlocks from live app state."""

    def __init__(self, state_store: Any, moments_service: Any) -> None:
        self._store = state_store
        self._moments = moments_service

    # ------------------------------------------------------------------
    # Scores (each 0-100, formula documented inline)
    # ------------------------------------------------------------------

    def get_readiness(self) -> dict[str, Any]:
        progress = self._store.get_learn_progress()
        completed_ids = {lid for lid, data in progress.items() if data.get("completed_at")}
        attempted_ids = set(progress.keys())
        lessons = _load_lessons()
        by_level: dict[str, tuple[int, int]] = {}
        for lesson in lessons:
            done, total = by_level.get(lesson["tier"], (0, 0))
            by_level[lesson["tier"]] = (done + (lesson["id"] in completed_ids), total + 1)

        executed_trades = [
            intent
            for intent in self._store.list_paper_trade_intents()
            if intent.get("status") == "executed"
        ]
        moments = self._moments.get_moments()
        active_types = {moment["type"] for moment in moments if not moment["lesson_completed"]}

        # Knowledge: overall lesson completion fraction.
        total_lessons = len(lessons)
        knowledge = round(100 * len(completed_ids & {les["id"] for les in lessons}) / total_lessons)

        # Execution: paper-trade experience, saturating at the expert bar.
        execution = min(100, round(100 * len(executed_trades) / EXPERT_TRADE_BAR))

        # Risk: starts at 100; active risk moments (oversized position,
        # unprotected drawdown) deduct heavily.
        risk = 100
        if "oversized_position" in active_types:
            risk -= 35
        if "unprotected_drawdown" in active_types:
            risk -= 35
        risk = max(0, risk)

        # Psychology: starts at 100; the rapid-fire (tilt footprint) detector
        # deducts heavily.
        psychology = 100
        if "rapid_fire_entries" in active_types:
            psychology -= 40
        psychology = max(0, psychology)

        # Consistency: of lessons attempted, the share completed — finishing
        # what you start. 0 until anything is attempted.
        consistency = round(100 * len(completed_ids) / len(attempted_ids)) if attempted_ids else 0

        scores = {
            "knowledge": knowledge,
            "execution": execution,
            "risk": risk,
            "psychology": psychology,
            "consistency": consistency,
        }
        return {
            "scores": scores,
            "levels": self._level_unlocks(by_level, len(executed_trades), scores),
            "executed_trades": len(executed_trades),
            "active_moments": sorted(active_types),
        }

    # ------------------------------------------------------------------
    # Unlock ladder (v1, soft gating — the UI marks locks, content stays
    # readable; hard gating arrives with assessments in ACAD-6)
    # ------------------------------------------------------------------

    def _level_unlocks(
        self,
        by_level: dict[str, tuple[int, int]],
        executed_trades: int,
        scores: dict[str, int],
    ) -> list[dict[str, Any]]:
        def level_complete(level: str) -> bool:
            done, total = by_level.get(level, (0, 0))
            return total > 0 and done == total

        def requirement(label: str, met: bool) -> dict[str, Any]:
            return {"label": label, "met": met}

        novice = {"id": "novice", "unlocked": True, "requirements": []}

        intermediate_reqs = [
            requirement("Complete all novice lessons", level_complete("novice")),
        ]
        intermediate = {
            "id": "intermediate",
            "unlocked": all(req["met"] for req in intermediate_reqs),
            "requirements": intermediate_reqs,
        }

        advanced_reqs = [
            requirement("Complete all intermediate lessons", level_complete("intermediate")),
            requirement(
                f"Execute {ADVANCED_TRADE_BAR}+ paper trades",
                executed_trades >= ADVANCED_TRADE_BAR,
            ),
            requirement("No active severe risk moments", scores["risk"] >= 70),
        ]
        advanced = {
            "id": "advanced",
            "unlocked": intermediate["unlocked"] and all(req["met"] for req in advanced_reqs),
            "requirements": advanced_reqs,
        }

        expert_reqs = [
            requirement("Complete all advanced lessons", level_complete("advanced")),
            requirement(
                f"Execute {EXPERT_TRADE_BAR}+ paper trades", executed_trades >= EXPERT_TRADE_BAR
            ),
            requirement(
                f"Psychology score {EXPERT_PSYCHOLOGY_BAR}+",
                scores["psychology"] >= EXPERT_PSYCHOLOGY_BAR,
            ),
        ]
        expert = {
            "id": "expert",
            "unlocked": advanced["unlocked"] and all(req["met"] for req in expert_reqs),
            "requirements": expert_reqs,
        }

        return [novice, intermediate, advanced, expert]


__all__ = ["LearnReadinessService", "LearnService"]
