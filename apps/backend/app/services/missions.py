# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Mission engine (MSN-3, expanded): behavioral certifications over real use.

Missions are declarative JSON — objectives plus typed criteria evaluated
over the user's own activity: trade reviews (process scores, first-touch
outcomes, the 2x2), journal annotations, replay scenarios, Academy progress,
review reps, streaks, and the constitution. The catalog spans basic to
sophisticated missions for every level, and community packs can contribute
more through the extension SDK — criteria are declarative only, so a pack
can never run code. Completion is persisted and the readiness ladder reads
it. Educational only.
"""

from __future__ import annotations

import json
from collections import Counter
from datetime import UTC, date, datetime, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.services.content_locale import localize_drills, localize_missions
from app.services.locale import get_locale

_MISSIONS_FILE = Path(__file__).resolve().parent.parent / "content" / "missions" / "missions.json"

# Every criterion type the engine evaluates. Community packs are validated
# against this set, so the vocabulary doubles as the contribution contract.
CRITERIA_TYPES = frozenset(
    {
        # Trade review spine
        "min_trades",
        "all_have_stops",
        "max_risk_percent_each",
        "max_dangerous_success",
        "min_classification",
        "consecutive_process_scores",
        "min_process_average",
        "min_planned_losses_taken",
        "min_resolved",
        "min_symbol_diversity",
        "max_daily_trades",
        "min_trades_with_reason",
        "min_emotions_logged",
        "zero_tilt_entries",
        # Journal
        "min_journaled",
        "min_tagged",
        # Replay scenarios
        "scenario_passed",
        "min_scenarios_passed",
        # Academy
        "min_lessons_completed",
        "assessment_passed",
        "min_review_reps",
        "min_streak_days",
        # Constitution
        "constitution_adopted",
    }
)


MAX_ACTIVE_MISSIONS = 3

# Where each criterion is acted on: the mission briefing's "go there" link.
ACTION_HINTS: dict[str, dict[str, str]] = {
    "min_trades": {"route": "/signals", "cta": "Open Signals and place a planned trade"},
    "all_have_stops": {"route": "/signals", "cta": "Plan the stop before you confirm"},
    "max_risk_percent_each": {"route": "/signals", "cta": "Size from risk on the ticket"},
    "max_dangerous_success": {"route": "/review", "cta": "Check your 2x2 in Review"},
    "min_classification": {"route": "/review", "cta": "Track your quadrants in Review"},
    "consecutive_process_scores": {"route": "/journal", "cta": "Keep the streak in Journal"},
    "min_process_average": {"route": "/journal", "cta": "Raise the average in Journal"},
    "min_planned_losses_taken": {"route": "/journal", "cta": "Let stops do their job"},
    "min_resolved": {"route": "/journal", "cta": "See open trades through"},
    "min_symbol_diversity": {"route": "/", "cta": "Scan the dashboard for new symbols"},
    "max_daily_trades": {"route": "/review", "cta": "Watch your daily count in Review"},
    "min_trades_with_reason": {"route": "/signals", "cta": "Write the thesis on the ticket"},
    "min_emotions_logged": {"route": "/signals", "cta": "Log your state on the ticket"},
    "zero_tilt_entries": {"route": "/signals", "cta": "Skip the trade if you feel it"},
    "min_journaled": {"route": "/journal", "cta": "Write the note in Journal"},
    "min_tagged": {"route": "/journal", "cta": "Tag the mistakes in Journal"},
    "scenario_passed": {"route": "/missions", "cta": "Play the replay mission below"},
    "min_scenarios_passed": {"route": "/missions", "cta": "Play the replay missions below"},
    "min_lessons_completed": {"route": "/learn", "cta": "Open the Academy"},
    "assessment_passed": {"route": "/learn", "cta": "Take the exam in Learn"},
    "min_review_reps": {"route": "/learn", "cta": "Grade cards in Learn > Practice"},
    "min_streak_days": {"route": "/learn", "cta": "Do anything in the Academy today"},
    "constitution_adopted": {"route": "/review", "cta": "Adopt your rules in Review"},
}


@lru_cache(maxsize=1)
def _load_missions_base() -> tuple[dict[str, Any], ...]:
    with open(_MISSIONS_FILE, encoding="utf-8") as handle:
        return tuple(json.load(handle))


def _load_missions() -> tuple[dict[str, Any], ...]:
    """Built-in missions localized to the active request locale (English fallback)."""
    return localize_missions(_load_missions_base(), get_locale())


_DRILLS_FILE = Path(__file__).resolve().parent.parent / "content" / "missions" / "drills.json"


@lru_cache(maxsize=1)
def _load_drills_base() -> dict[str, dict[str, Any]]:
    with open(_DRILLS_FILE, encoding="utf-8") as handle:
        return {drill["category"]: drill for drill in json.load(handle)}


def _load_drills() -> dict[str, dict[str, Any]]:
    """Decision drills localized to the active request locale (English fallback)."""
    return localize_drills(_load_drills_base(), get_locale())


class MissionService:
    def __init__(
        self,
        state_store: Any,
        trade_review_service: Any,
        mission_pack_registry: Any | None = None,
    ) -> None:
        self._store = state_store
        self._review = trade_review_service
        self._packs = mission_pack_registry

    def _all_missions(self) -> list[dict[str, Any]]:
        missions = list(_load_missions())
        if self._packs is not None:
            missions.extend(self._packs.all_missions())
        return missions

    def list_missions(self) -> dict[str, Any]:
        context = self._build_context()
        completed = self._store.get_completed_missions()
        active = self._maybe(self._store, "get_active_missions", {})

        missions = []
        for mission in self._all_missions():
            criteria = []
            drill = (
                _load_drills().get(mission.get("category"))
                if mission.get("source", "builtin") == "builtin"
                else None
            )
            if drill is not None:
                result = context["drills"].get(mission["category"], {})
                passed = bool(result.get("passed"))
                criteria.append(
                    {
                        "label": f"Pass the decision drill: {drill['title']}",
                        "met": passed,
                        "current": 1 if passed else 0,
                        "target": 1,
                        "action": {"route": "/missions", "cta": "Run the decision drill"},
                        "drill": mission["category"],
                    }
                )
            for criterion in mission["criteria"]:
                evaluated = self._evaluate(criterion, context)
                evaluated["action"] = ACTION_HINTS.get(criterion["type"])
                criteria.append(evaluated)
            done = all(criterion["met"] for criterion in criteria)
            if done and mission["id"] not in completed:
                self._store.record_mission_complete(mission["id"])
                completed = self._store.get_completed_missions()
            if done and mission["id"] in active:
                # A finished mission leaves the active slots automatically.
                self._maybe_call("clear_mission_active", mission["id"])
                active = self._maybe(self._store, "get_active_missions", {})
            missions.append(
                {
                    "id": mission["id"],
                    "title": mission["title"],
                    "level": mission["level"],
                    "category": mission.get("category", "general"),
                    "description": mission["description"],
                    "lesson_links": mission.get("lesson_links", []),
                    "source": mission.get("source", "builtin"),
                    "criteria": criteria,
                    "completed": mission["id"] in completed,
                    "completed_at": completed.get(mission["id"]),
                    "active": mission["id"] in active,
                    "accepted_at": active.get(mission["id"]),
                }
            )
        return {"items": missions, "max_active": MAX_ACTIVE_MISSIONS}

    def daily_briefing(self) -> dict[str, Any]:
        """The discipline streak + today's featured mission.

        The streak counts consecutive days on which the user did any
        Academy/mission work — it rewards showing up and practising, never
        profit. ``daily_mission`` is a deterministic, date-seeded pick from
        the user's incomplete missions so the same mission stands for the
        whole day and rotates tomorrow.
        """
        days = set(self._maybe(self._store, "get_activity_days", []) or [])
        today = datetime.now(UTC).date()
        active_today = today.isoformat() in days
        # A rolling seven-day strip, oldest first, for the week dots.
        week = [
            {
                "date": (day := today - timedelta(days=offset)).isoformat(),
                "active": day.isoformat() in days,
            }
            for offset in range(6, -1, -1)
        ]

        listing = self.list_missions()
        items = listing["items"]
        incomplete = [mission for mission in items if not mission["completed"]]
        daily_mission = self._pick_daily_mission(incomplete, today) if incomplete else None

        return {
            "streak": self._current_streak(days, today),
            "longest": self._longest_streak(days),
            "active_today": active_today,
            "completed_total": sum(1 for mission in items if mission["completed"]),
            "week": week,
            "daily_mission": daily_mission,
        }

    @staticmethod
    def _current_streak(days: set[str], today: date) -> int:
        if not days:
            return 0
        # Today counts if active; otherwise the streak is measured to yesterday
        # so it survives an as-yet-unworked but not-yet-missed today.
        cursor = today if today.isoformat() in days else today - timedelta(days=1)
        streak = 0
        while cursor.isoformat() in days:
            streak += 1
            cursor -= timedelta(days=1)
        return streak

    @staticmethod
    def _longest_streak(days: set[str]) -> int:
        if not days:
            return 0
        ordered = sorted(date.fromisoformat(day) for day in days)
        longest = run = 1
        for previous, current in zip(ordered, ordered[1:]):
            run = run + 1 if (current - previous).days == 1 else 1
            longest = max(longest, run)
        return longest

    @staticmethod
    def _pick_daily_mission(incomplete: list[dict[str, Any]], today: date) -> dict[str, Any] | None:
        if not incomplete:
            return None
        # Prefer missions the user can act on today (a decision drill is
        # immediately runnable); fall back to the full incomplete pool.
        actionable = [
            mission
            for mission in incomplete
            if any(criterion.get("drill") for criterion in mission["criteria"])
        ]
        pool = actionable or incomplete
        seed = int(today.strftime("%Y%m%d"))
        return pool[seed % len(pool)]

    def accept(self, mission_id: str) -> dict[str, Any]:
        known = {mission["id"] for mission in self._all_missions()}
        if mission_id not in known:
            return {"ok": False, "error": "Unknown mission."}
        if mission_id in self._store.get_completed_missions():
            return {"ok": False, "error": "Mission already completed."}
        active = self._maybe(self._store, "get_active_missions", {})
        if mission_id in active:
            return {"ok": True}
        if len(active) >= MAX_ACTIVE_MISSIONS:
            return {
                "ok": False,
                "error": f"You already have {MAX_ACTIVE_MISSIONS} active missions. "
                "Finish or stand down from one first.",
            }
        self._store.set_mission_active(mission_id)
        return {"ok": True}

    def abandon(self, mission_id: str) -> dict[str, Any]:
        self._maybe_call("clear_mission_active", mission_id)
        return {"ok": True}

    # ------------------------------------------------------------------
    # Decision drills: scenario -> checkpoints -> process/risk/discipline.
    # ------------------------------------------------------------------

    def get_drill(self, category: str) -> dict[str, Any] | None:
        drill = _load_drills().get(category)
        if drill is None:
            return None
        result = self._maybe(self._store, "get_drill_results", {}).get(category)
        # Options go out without points, severity, or feedback - grading
        # happens server-side, exactly like replay scenarios.
        return {
            "category": drill["category"],
            "title": drill["title"],
            "scenario": drill["scenario"],
            "pass_percent": drill["pass_percent"],
            "best_percent": result["best_percent"] if result else None,
            "passed": bool(result and result["passed"]),
            "checkpoints": [
                {
                    "question": checkpoint["question"],
                    "options": [
                        {"id": option["id"], "label": option["label"]}
                        for option in checkpoint["options"]
                    ],
                }
                for checkpoint in drill["checkpoints"]
            ],
        }

    def grade_drill(self, category: str, answers: dict[str, str]) -> dict[str, Any] | None:
        drill = _load_drills().get(category)
        if drill is None:
            return None

        totals = {"process": 0, "risk": 0, "discipline": 0}
        maxima = {"process": 0, "risk": 0, "discipline": 0}
        severe = False
        debrief = []
        for index, checkpoint in enumerate(drill["checkpoints"]):
            for dimension in totals:
                maxima[dimension] += max(option[dimension] for option in checkpoint["options"])
            chosen = next(
                (
                    option
                    for option in checkpoint["options"]
                    if option["id"] == answers.get(str(index))
                ),
                None,
            )
            if chosen is not None:
                for dimension in totals:
                    totals[dimension] += chosen[dimension]
                if chosen.get("severe"):
                    severe = True
            best = max(checkpoint["options"], key=lambda option: option["process"])
            debrief.append(
                {
                    "question": checkpoint["question"],
                    "chosen": chosen["label"] if chosen else None,
                    "severe": bool(chosen and chosen.get("severe")),
                    "feedback": chosen["feedback"] if chosen else "No answer was given.",
                    "best_choice": (
                        best["label"] if not chosen or chosen["id"] != best["id"] else None
                    ),
                }
            )

        scores = {
            dimension: round(100 * totals[dimension] / maxima[dimension])
            if maxima[dimension]
            else 0
            for dimension in totals
        }
        passed = scores["process"] >= drill["pass_percent"] and not severe
        self._maybe_call("record_drill_result", category, scores["process"], passed)
        return {
            "category": category,
            "scores": scores,
            "severe_violation": severe,
            "passed": passed,
            "pass_percent": drill["pass_percent"],
            "checkpoints": debrief,
            "officer_note": (
                "Severe risk violation: this run trained a dangerous habit. Review the "
                "consequences below and replay the drill."
                if severe
                else (
                    "Good process. You protected capital, followed rules, and treated the "
                    "mission as decision training rather than a profit chase."
                    if passed
                    else "Below the bar. Read each consequence, study the linked lessons, retry."
                )
            ),
        }

    def _maybe_call(self, method: str, *args: Any) -> None:
        handler = getattr(self._store, method, None)
        if callable(handler):
            handler(*args)

    # ------------------------------------------------------------------
    # Evaluation context: one snapshot of everything criteria can read.
    # ------------------------------------------------------------------

    def _build_context(self) -> dict[str, Any]:
        review = self._review.review()
        return {
            "items": review["items"],
            "journal_notes": self._maybe(self._store, "get_journal_notes", {}),
            "scenarios": self._maybe(self._store, "get_scenario_results", {}),
            "progress": self._maybe(self._store, "get_learn_progress", {}),
            "assessments": self._maybe(self._store, "get_assessments", {}),
            "activity_days": self._maybe(self._store, "get_activity_days", []),
            "review_cards": self._maybe(self._store, "get_review_cards", {}),
            "constitution": self._maybe(self._store, "get_constitution", None),
            "drills": self._maybe(self._store, "get_drill_results", {}),
        }

    @staticmethod
    def _maybe(store: Any, method: str, default: Any) -> Any:
        getter = getattr(store, method, None)
        return getter() if callable(getter) else default

    # ------------------------------------------------------------------
    # Typed criteria over the context
    # ------------------------------------------------------------------

    def _evaluate(self, criterion: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        kind = criterion["type"]
        label = criterion["label"]
        items = context["items"]

        if kind == "min_trades":
            current = len(items)
            return self._result(label, current >= criterion["value"], current, criterion["value"])

        if kind == "all_have_stops":
            stopless = sum(
                1
                for item in items
                if any("No stop" in note for note in item.get("process_notes", []))
            )
            return self._result(label, len(items) > 0 and stopless == 0, stopless, 0)

        if kind == "max_risk_percent_each":
            violations = sum(
                1
                for item in items
                if any(
                    "exceeds" in note or "double" in note for note in item.get("process_notes", [])
                )
            )
            return self._result(label, len(items) > 0 and violations == 0, violations, 0)

        if kind == "max_dangerous_success":
            count = sum(1 for item in items if item.get("classification") == "dangerous_success")
            return self._result(label, count <= criterion["value"], count, criterion["value"])

        if kind == "min_classification":
            count = sum(
                1 for item in items if item.get("classification") == criterion["classification"]
            )
            return self._result(label, count >= criterion["value"], count, criterion["value"])

        if kind == "consecutive_process_scores":
            best = 0
            run = 0
            # review items are newest-first; chronological order for streaks
            for item in reversed(items):
                if item.get("process_score", 0) >= criterion["min_score"]:
                    run += 1
                    best = max(best, run)
                else:
                    run = 0
            return self._result(label, best >= criterion["value"], best, criterion["value"])

        if kind == "min_process_average":
            scores = [item.get("process_score", 0) for item in items]
            average = round(sum(scores) / len(scores)) if scores else 0
            return self._result(
                label, bool(scores) and average >= criterion["value"], average, criterion["value"]
            )

        if kind == "min_planned_losses_taken":
            count = sum(1 for item in items if item.get("outcome_status") == "stopped")
            return self._result(label, count >= criterion["value"], count, criterion["value"])

        if kind == "min_resolved":
            count = sum(1 for item in items if item.get("outcome_status") in {"stopped", "target"})
            return self._result(label, count >= criterion["value"], count, criterion["value"])

        if kind == "min_symbol_diversity":
            count = len({item.get("symbol") for item in items if item.get("symbol")})
            return self._result(label, count >= criterion["value"], count, criterion["value"])

        if kind == "max_daily_trades":
            days = Counter(str(item.get("submittedAt") or "")[:10] for item in items)
            worst = max(days.values()) if days else 0
            met = len(items) > 0 and worst <= criterion["value"]
            return self._result(label, met, worst, criterion["value"])

        if kind == "min_trades_with_reason":
            count = sum(1 for item in items if str(item.get("planReason") or "").strip())
            return self._result(label, count >= criterion["value"], count, criterion["value"])

        if kind == "min_emotions_logged":
            count = sum(1 for item in items if str(item.get("planEmotion") or "").strip())
            return self._result(label, count >= criterion["value"], count, criterion["value"])

        if kind == "zero_tilt_entries":
            count = sum(
                1
                for item in items
                if any("tilt states" in note for note in item.get("process_notes", []))
            )
            return self._result(label, len(items) > 0 and count == 0, count, 0)

        if kind == "min_journaled":
            notes = context["journal_notes"]
            count = sum(
                1
                for item in items
                if notes.get(str(item.get("id")), {}).get("note")
                or notes.get(str(item.get("id")), {}).get("tags")
            )
            return self._result(label, count >= criterion["value"], count, criterion["value"])

        if kind == "min_tagged":
            notes = context["journal_notes"]
            count = sum(1 for item in items if notes.get(str(item.get("id")), {}).get("tags"))
            return self._result(label, count >= criterion["value"], count, criterion["value"])

        if kind == "scenario_passed":
            result = context["scenarios"].get(criterion["scenario_id"])
            passed = bool(result and result.get("passed"))
            return self._result(label, passed, 1 if passed else 0, 1)

        if kind == "min_scenarios_passed":
            count = sum(1 for result in context["scenarios"].values() if result.get("passed"))
            return self._result(label, count >= criterion["value"], count, criterion["value"])

        if kind == "min_lessons_completed":
            count = sum(1 for data in context["progress"].values() if data.get("completed_at"))
            return self._result(label, count >= criterion["value"], count, criterion["value"])

        if kind == "assessment_passed":
            result = context["assessments"].get(criterion["level"])
            passed = bool(result and result.get("passed"))
            return self._result(label, passed, 1 if passed else 0, 1)

        if kind == "min_review_reps":
            count = sum(card["reps"] for card in context["review_cards"].values())
            return self._result(label, count >= criterion["value"], count, criterion["value"])

        if kind == "min_streak_days":
            days = set(context["activity_days"])
            from datetime import UTC, datetime, timedelta

            today = datetime.now(UTC).date()
            cursor = today if today.isoformat() in days else today - timedelta(days=1)
            streak = 0
            while cursor.isoformat() in days:
                streak += 1
                cursor -= timedelta(days=1)
            return self._result(label, streak >= criterion["value"], streak, criterion["value"])

        if kind == "constitution_adopted":
            adopted = context["constitution"] is not None
            return self._result(label, adopted, 1 if adopted else 0, 1)

        return self._result(label, False, 0, 0)

    @staticmethod
    def _result(label: str, met: bool, current: Any, target: Any) -> dict[str, Any]:
        return {"label": label, "met": met, "current": current, "target": target}
