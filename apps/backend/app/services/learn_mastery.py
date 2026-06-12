# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Mastery loop (ACAD-6): spaced repetition, XP, streaks, and track badges.

Review cards are the key terms of *completed* lessons, scheduled with an
SM-2-lite algorithm (self-graded: again / good / easy). XP is derived from
persisted progress rather than event plumbing, so it can never drift from
the truth: lessons, exams, missions, scenarios, and review reps each carry
a fixed weight. The streak counts consecutive days with any Academy
activity. Badges are earned by completing every lesson in a track.
"""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime, timedelta
from typing import Any

XP_WEIGHTS = {
    "lesson": 20,
    "assessment": 100,
    "mission": 150,
    "scenario": 75,
    "review_rep": 2,
}

LEVEL_TITLES = [
    "Observer",
    "Apprentice",
    "Chartist",
    "Risk Keeper",
    "Strategist",
    "Operator",
    "Veteran",
    "Master",
]

MIN_EASE = 1.3
NEW_CARDS_PER_QUEUE = 6
QUEUE_SIZE = 12


def _now() -> datetime:
    return datetime.now(UTC)


class LearnMasteryService:
    def __init__(self, state_store: Any, learn_service: Any) -> None:
        self._store = state_store
        self._learn = learn_service

    # ------------------------------------------------------------------
    # Mastery summary: XP, level, streak, badges, review counts.
    # ------------------------------------------------------------------

    def mastery(self) -> dict[str, Any]:
        progress = self._store.get_learn_progress()
        completed_lessons = sum(1 for data in progress.values() if data.get("completed_at"))
        assessments_passed = sum(
            1 for data in self._store.get_assessments().values() if data.get("passed")
        )
        missions = len(self._store.get_completed_missions())
        scenarios_passed = sum(
            1 for data in self._store.get_scenario_results().values() if data.get("passed")
        )
        review_reps = sum(card["reps"] for card in self._store.get_review_cards().values())

        xp = (
            completed_lessons * XP_WEIGHTS["lesson"]
            + assessments_passed * XP_WEIGHTS["assessment"]
            + missions * XP_WEIGHTS["mission"]
            + scenarios_passed * XP_WEIGHTS["scenario"]
            + review_reps * XP_WEIGHTS["review_rep"]
        )
        level = min(len(LEVEL_TITLES) - 1, int((xp / 100) ** 0.5))
        next_level_xp = ((level + 1) ** 2) * 100

        queue = self.review_queue()
        return {
            "xp": xp,
            "level": level,
            "level_title": LEVEL_TITLES[level],
            "next_level_xp": next_level_xp,
            "streak_days": self._streak(),
            "badges": self._badges(progress),
            "review_due": len(queue["items"]),
            "xp_breakdown": {
                "lessons": completed_lessons,
                "assessments_passed": assessments_passed,
                "missions": missions,
                "scenarios_passed": scenarios_passed,
                "review_reps": review_reps,
            },
        }

    def _streak(self) -> int:
        days = set(self._store.get_activity_days())
        if not days:
            return 0
        today = _now().date()
        # A streak survives until a full day is missed; today counts if active.
        cursor = today if today.isoformat() in days else today - timedelta(days=1)
        streak = 0
        while cursor.isoformat() in days:
            streak += 1
            cursor -= timedelta(days=1)
        return streak

    def _badges(self, progress: dict[str, Any]) -> list[dict[str, Any]]:
        completed_ids = {lid for lid, data in progress.items() if data.get("completed_at")}
        badges = []
        for level in self._learn.get_catalog().get("levels", []):
            for track in level.get("tracks", []):
                lessons = track.get("lessons", [])
                if not lessons:
                    continue
                done = sum(1 for lesson in lessons if lesson["id"] in completed_ids)
                badges.append(
                    {
                        "track_id": track["id"],
                        "title": track["title"],
                        "level": level["id"],
                        "earned": done == len(lessons),
                        "progress": done,
                        "total": len(lessons),
                    }
                )
        return badges

    # ------------------------------------------------------------------
    # Spaced repetition (SM-2-lite over completed lessons' key terms).
    # ------------------------------------------------------------------

    def review_queue(self) -> dict[str, Any]:
        cards = self._store.get_review_cards()
        now_iso = _now().isoformat()
        definitions = self._definitions_for_completed()

        due = [
            {
                "term": card["term"],
                "definition": definitions.get(key, {}).get("definition", ""),
                "lesson_id": card["lesson_id"],
                "status": "due",
            }
            for key, card in cards.items()
            if card["due_at"] <= now_iso and key in definitions
        ]
        new = [
            {
                "term": entry["term"],
                "definition": entry["definition"],
                "lesson_id": entry["lesson_id"],
                "status": "new",
            }
            for key, entry in definitions.items()
            if key not in cards
        ][:NEW_CARDS_PER_QUEUE]

        items = (due + new)[:QUEUE_SIZE]
        return {"items": items}

    def grade(self, term: str, grade: str) -> dict[str, Any]:
        cards = self._store.get_review_cards()
        key = term.lower()
        card = cards.get(
            key,
            {"interval_days": 0.0, "ease": 2.5, "reps": 0, "lapses": 0, "lesson_id": ""},
        )
        if not card["lesson_id"]:
            card["lesson_id"] = self._definitions_for_completed().get(key, {}).get("lesson_id", "")

        ease = float(card["ease"])
        interval = float(card["interval_days"])
        if grade == "again":
            interval = 0.0  # due again today
            ease = max(MIN_EASE, ease - 0.2)
            card["lapses"] = int(card["lapses"]) + 1
        elif grade == "easy":
            interval = max(2.0, interval * ease * 1.5)
            ease += 0.1
        else:  # "good"
            interval = max(1.0, interval * ease) if interval else 1.0

        updated = {
            "interval_days": round(interval, 2),
            "ease": round(ease, 2),
            "due_at": (_now() + timedelta(days=interval)).isoformat(),
            "reps": int(card["reps"]) + 1,
            "lapses": int(card["lapses"]),
        }
        self._store.upsert_review_card(term, card["lesson_id"], updated)
        return {"term": term, **updated}

    def _definitions_for_completed(self) -> dict[str, dict[str, str]]:
        progress = self._store.get_learn_progress()
        completed_ids = {lid for lid, data in progress.items() if data.get("completed_at")}
        definitions: dict[str, dict[str, str]] = {}
        for entry in self._learn.get_glossary()["items"]:
            if entry["lesson_id"] in completed_ids:
                definitions[entry["term"].lower()] = entry
        return definitions

    # ------------------------------------------------------------------
    # Progress analytics + certificates (ACAD-11).
    # ------------------------------------------------------------------

    def analytics(self) -> dict[str, Any]:
        progress = self._store.get_learn_progress()
        completed = {lid: data for lid, data in progress.items() if data.get("completed_at")}
        assessments = self._store.get_assessments()
        catalog = self._learn.get_catalog()

        levels = []
        for level in catalog.get("levels", []):
            done = level.get("completed", 0)
            total = level.get("total", 0)
            assessment = assessments.get(level["id"])
            levels.append(
                {
                    "id": level["id"],
                    "title": level.get("title", level["id"]),
                    "completed": done,
                    "total": total,
                    "percent": round(100 * done / total) if total else 0,
                    "assessment": (
                        {"score": assessment["score"], "passed": assessment["passed"]}
                        if assessment
                        else None
                    ),
                    "certificate_earned": self._certificate_earned(level, assessment),
                }
            )

        # Lessons completed per ISO week, most recent 8 weeks.
        weekly: dict[str, int] = {}
        for data in completed.values():
            stamp = str(data["completed_at"])[:10]
            try:
                day = datetime.fromisoformat(stamp)
            except ValueError:
                continue
            year, week, _ = day.isocalendar()
            weekly[f"{year}-W{week:02d}"] = weekly.get(f"{year}-W{week:02d}", 0) + 1
        recent_weeks = sorted(weekly)[-8:]

        mastery = self.mastery()
        return {
            "levels": levels,
            "tracks": mastery["badges"],
            "weekly": [{"week": week, "lessons": weekly[week]} for week in recent_weeks],
            "totals": {
                "lessons_completed": len(completed),
                "xp": mastery["xp"],
                "streak_days": mastery["streak_days"],
                "badges_earned": sum(1 for badge in mastery["badges"] if badge["earned"]),
            },
        }

    @staticmethod
    def _certificate_earned(level: dict[str, Any], assessment: dict[str, Any] | None) -> bool:
        total = level.get("total", 0)
        return bool(
            total and level.get("completed", 0) == total and assessment and assessment["passed"]
        )

    def certificate(self, level_id: str) -> dict[str, Any]:
        catalog = self._learn.get_catalog()
        level = next(
            (entry for entry in catalog.get("levels", []) if entry["id"] == level_id), None
        )
        if level is None:
            return {"earned": False, "requirements": ["Unknown level."]}
        assessment = self._store.get_assessments().get(level_id)

        requirements = []
        total = level.get("total", 0)
        done = level.get("completed", 0)
        if not total or done < total:
            requirements.append(f"Complete all {total} {level_id} lessons ({done} done).")
        if not assessment or not assessment.get("passed"):
            requirements.append(f"Pass the {level_id} assessment.")
        if requirements:
            return {"earned": False, "level": level_id, "requirements": requirements}

        issued_at = str(assessment.get("taken_at") or _now().isoformat())
        payload = f"quantglass:{level_id}:{total}:{assessment['score']}:{issued_at}"
        verification = hashlib.sha256(payload.encode()).hexdigest()[:16]
        return {
            "earned": True,
            "level": level_id,
            "level_title": level.get("title", level_id),
            "lesson_count": total,
            "exam_score": assessment["score"],
            "issued_at": issued_at,
            "verification": verification,
        }
