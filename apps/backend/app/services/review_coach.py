# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Journal + Review coach (MSN-4): the prescribing half of the feedback loop.

Journal merges every scored trade with the user's own reflection (note +
mistake tags). The coach scans that spine for *repeated* mistakes — the same
process note or tag appearing across trades — and prescribes the specific
Academy lessons and missions that train the fix. Detections are declarative:
a pattern, a threshold, and a prescription. Educational only, never advice.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

# A detection fires when `count >= threshold` trades match. Repeated mistakes
# need 2+; a dangerous success is flagged the first time it happens.
DETECTORS: tuple[dict[str, Any], ...] = (
    {
        "id": "no_stop",
        "label": "Trading without a stop",
        "note_contains": "No stop",
        "tags": ("no_plan",),
        "threshold": 2,
        "lessons": ["intermediate-16-trade-plan", "intermediate-04-risk-reward"],
        "missions": ["risk-discipline"],
    },
    {
        "id": "oversized_risk",
        "label": "Risking more than policy allows",
        "note_contains": "exceeds",
        "note_contains_alt": "double",
        "tags": ("oversized",),
        "threshold": 2,
        "lessons": ["intermediate-05-position-sizing", "advanced-28-leverage-discipline"],
        "missions": ["risk-discipline"],
    },
    {
        "id": "no_thesis",
        "label": "Entering without a written reason",
        "note_contains": "No written reason",
        "threshold": 2,
        "lessons": ["intermediate-16-trade-plan", "expert-05-trading-plan"],
        "missions": [],
    },
    {
        "id": "tilt_entries",
        "label": "Entering on tilt (FOMO / frustration)",
        "note_contains": "tilt states",
        "tags": ("fomo_entry", "revenge_trade"),
        "threshold": 2,
        "lessons": ["advanced-21-tilt", "advanced-22-discipline-systems"],
        "missions": ["the-operator"],
    },
    {
        "id": "dangerous_success",
        "label": "Dangerous successes — bad process rewarded",
        "classification": "dangerous_success",
        "threshold": 1,
        "lessons": ["advanced-22-discipline-systems", "advanced-23-drawdown-psychology"],
        "missions": ["risk-discipline", "accept-the-planned-loss"],
    },
    {
        "id": "stop_management",
        "label": "Moving or misplacing stops",
        "note_contains": "wrong side",
        "tags": ("moved_stop",),
        "threshold": 2,
        "lessons": ["intermediate-04-risk-reward", "advanced-22-discipline-systems"],
        "missions": ["accept-the-planned-loss"],
    },
    {
        "id": "impatience",
        "label": "Chasing entries or cutting winners early",
        "tags": ("chased_entry", "exited_early", "overtraded"),
        "threshold": 2,
        "lessons": ["advanced-21-tilt", "intermediate-16-trade-plan"],
        "missions": ["the-operator"],
    },
)


class ReviewCoachService:
    def __init__(self, state_store: Any, trade_review_service: Any, learn_service: Any) -> None:
        self._store = state_store
        self._review = trade_review_service
        self._learn = learn_service

    # ------------------------------------------------------------------
    # Journal: review spine merged with the user's own reflections.
    # ------------------------------------------------------------------

    def journal(self) -> dict[str, Any]:
        review = self._review.review()
        notes = self._store.get_journal_notes()
        items = []
        for item in review["items"]:
            entry = notes.get(str(item["id"]), {})
            items.append(
                {**item, "journal_note": entry.get("note", ""), "tags": entry.get("tags", [])}
            )
        return {"items": items, "summary": review["summary"]}

    def annotate(self, intent_id: str, note: str, tags: list[str]) -> dict[str, Any]:
        return self._store.upsert_journal_note(intent_id, note, tags)

    # ------------------------------------------------------------------
    # Coach: weekly summary + repeated-mistake detection + prescriptions.
    # ------------------------------------------------------------------

    def coach(self) -> dict[str, Any]:
        journal = self.journal()
        items = journal["items"]
        summary = journal["summary"]

        week_ago = (datetime.now(UTC) - timedelta(days=7)).isoformat()
        weekly_items = [item for item in items if str(item.get("submittedAt") or "") >= week_ago]
        weekly_scores = [item["process_score"] for item in weekly_items]

        detections = []
        for detector in DETECTORS:
            matched = [item for item in items if self._matches(detector, item)]
            if len(matched) < detector["threshold"]:
                continue
            detections.append(
                {
                    "id": detector["id"],
                    "label": detector["label"],
                    "count": len(matched),
                    "symbols": sorted({str(item.get("symbol") or "") for item in matched}),
                    "lessons": self._lesson_refs(detector["lessons"]),
                    "missions": detector["missions"],
                }
            )
        detections.sort(key=lambda detection: -detection["count"])

        return {
            "weekly": {
                "trades": len(weekly_items),
                "average_process_score": (
                    round(sum(weekly_scores) / len(weekly_scores)) if weekly_scores else 0
                ),
            },
            "summary": summary,
            "detections": detections,
        }

    def _matches(self, detector: dict[str, Any], item: dict[str, Any]) -> bool:
        needle = detector.get("note_contains")
        if needle and any(needle in note for note in item["process_notes"]):
            return True
        alt = detector.get("note_contains_alt")
        if alt and any(alt in note for note in item["process_notes"]):
            return True
        tags = detector.get("tags", ())
        if tags and any(tag in item.get("tags", []) for tag in tags):
            return True
        classification = detector.get("classification")
        return bool(classification) and item.get("classification") == classification

    def _lesson_refs(self, lesson_ids: list[str]) -> list[dict[str, str]]:
        titles = self._lesson_titles()
        return [
            {"id": lesson_id, "title": titles.get(lesson_id, lesson_id)} for lesson_id in lesson_ids
        ]

    def _lesson_titles(self) -> dict[str, str]:
        catalog = self._learn.get_catalog()
        titles: dict[str, str] = {}
        for level in catalog.get("levels", []):
            for track in level.get("tracks", []):
                for lesson in track.get("lessons", []):
                    titles[lesson["id"]] = lesson["title"]
        return titles
