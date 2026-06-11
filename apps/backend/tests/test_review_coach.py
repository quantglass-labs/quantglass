# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Journal merge, repeated-mistake detection, and prescriptions (MSN-4)."""

import json
import unittest
from datetime import UTC, datetime, timedelta
from pathlib import Path

from app.services.review_coach import DETECTORS, ReviewCoachService

_CONTENT = Path(__file__).resolve().parent.parent / "app" / "content"


def _item(**overrides):
    base = {
        "id": "1",
        "symbol": "BTCUSD",
        "side": "long",
        "submittedAt": datetime.now(UTC).isoformat(),
        "planReason": "Pullback",
        "planEmotion": "calm",
        "process_score": 100,
        "process_notes": [],
        "outcome_status": "target",
        "outcome_r": 2.0,
        "classification": "earned_win",
    }
    base.update(overrides)
    return base


class _Review:
    def __init__(self, items):
        self.items = items

    def review(self):
        return {"items": self.items, "summary": {"trades": len(self.items)}}


class _Store:
    def __init__(self, notes=None):
        self.notes = notes or {}

    def get_journal_notes(self):
        return self.notes

    def upsert_journal_note(self, intent_id, note, tags):
        self.notes[intent_id] = {"note": note, "tags": tags, "updated_at": "now"}
        return {"intent_id": intent_id, "note": note, "tags": tags}


class _Learn:
    def get_catalog(self):
        return {
            "levels": [
                {
                    "tracks": [
                        {
                            "lessons": [
                                {
                                    "id": "intermediate-16-trade-plan",
                                    "title": "The Written Trade Plan",
                                },
                            ]
                        }
                    ]
                }
            ]
        }


def _service(items, notes=None):
    return ReviewCoachService(_Store(notes), _Review(items), _Learn())


class JournalTests(unittest.TestCase):
    def test_journal_merges_notes_and_tags(self) -> None:
        notes = {"1": {"note": "Chased it.", "tags": ["chased_entry"], "updated_at": "x"}}
        journal = _service([_item()], notes).journal()
        self.assertEqual(journal["items"][0]["journal_note"], "Chased it.")
        self.assertEqual(journal["items"][0]["tags"], ["chased_entry"])

    def test_trades_without_notes_get_empty_defaults(self) -> None:
        journal = _service([_item()]).journal()
        self.assertEqual(journal["items"][0]["journal_note"], "")
        self.assertEqual(journal["items"][0]["tags"], [])


class CoachTests(unittest.TestCase):
    def test_repeated_no_stop_detected_with_prescription(self) -> None:
        items = [
            _item(id=str(n), process_notes=["No stop was planned — invalidation undefined."])
            for n in range(2)
        ]
        coach = _service(items).coach()
        detection = next(d for d in coach["detections"] if d["id"] == "no_stop")
        self.assertEqual(detection["count"], 2)
        self.assertIn("risk-discipline", detection["missions"])
        self.assertEqual(detection["lessons"][0]["title"], "The Written Trade Plan")

    def test_single_mistake_below_threshold_not_flagged(self) -> None:
        items = [_item(process_notes=["No stop was planned — invalidation undefined."])]
        coach = _service(items).coach()
        self.assertNotIn("no_stop", [d["id"] for d in coach["detections"]])

    def test_dangerous_success_flagged_on_first_occurrence(self) -> None:
        coach = _service([_item(classification="dangerous_success")]).coach()
        ids = [d["id"] for d in coach["detections"]]
        self.assertIn("dangerous_success", ids)

    def test_journal_tags_drive_detection(self) -> None:
        notes = {
            "1": {"note": "", "tags": ["revenge_trade"], "updated_at": "x"},
            "2": {"note": "", "tags": ["fomo_entry"], "updated_at": "x"},
        }
        items = [_item(id="1"), _item(id="2")]
        coach = _service(items, notes).coach()
        self.assertIn("tilt_entries", [d["id"] for d in coach["detections"]])

    def test_weekly_summary_excludes_old_trades(self) -> None:
        old = (datetime.now(UTC) - timedelta(days=30)).isoformat()
        items = [_item(id="1"), _item(id="2", submittedAt=old, process_score=40)]
        coach = _service(items).coach()
        self.assertEqual(coach["weekly"]["trades"], 1)
        self.assertEqual(coach["weekly"]["average_process_score"], 100)


class PrescriptionIntegrityTests(unittest.TestCase):
    def test_detector_lessons_and_missions_exist_in_content(self) -> None:
        lesson_ids = set()
        for tier in ("novice", "intermediate", "advanced", "expert"):
            with open(_CONTENT / "lessons" / f"{tier}.json", encoding="utf-8") as handle:
                lesson_ids.update(lesson["id"] for lesson in json.load(handle))
        with open(_CONTENT / "missions" / "missions.json", encoding="utf-8") as handle:
            mission_ids = {mission["id"] for mission in json.load(handle)}

        for detector in DETECTORS:
            for lesson_id in detector["lessons"]:
                self.assertIn(lesson_id, lesson_ids, f"{detector['id']} -> {lesson_id}")
            for mission_id in detector["missions"]:
                self.assertIn(mission_id, mission_ids, f"{detector['id']} -> {mission_id}")


if __name__ == "__main__":
    unittest.main()
