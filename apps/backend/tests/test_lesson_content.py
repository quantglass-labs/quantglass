# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Every lesson file must validate against the lesson schema, so community
lesson packs are safe pure-content pull requests."""

import json
import unittest
from pathlib import Path

from jsonschema import Draft202012Validator

CONTENT_DIR = Path(__file__).resolve().parent.parent / "app" / "content" / "lessons"


def _load(name: str):
    with open(CONTENT_DIR / name, encoding="utf-8") as handle:
        return json.load(handle)


class LessonContentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.validator = Draft202012Validator(_load("lesson.schema.json"))
        cls.meta = _load("modules.json")

    def test_tier_files_validate_against_schema(self) -> None:
        for tier in self.meta["level_order"]:
            lessons = _load(f"{tier}.json")
            self.assertIsInstance(lessons, list)
            self.assertGreater(len(lessons), 0, tier)
            for lesson in lessons:
                errors = sorted(self.validator.iter_errors(lesson), key=str)
                self.assertEqual(
                    errors, [], f"{tier}: {lesson.get('id')}: {[e.message for e in errors]}"
                )

    def test_lesson_ids_are_unique_and_match_tier(self) -> None:
        seen: set[str] = set()
        for tier in self.meta["level_order"]:
            for lesson in _load(f"{tier}.json"):
                self.assertNotIn(lesson["id"], seen)
                seen.add(lesson["id"])
                self.assertEqual(lesson["module_id"], tier)
                self.assertTrue(lesson["id"].startswith(f"{tier}-"))

    def test_multiple_choice_correct_index_in_range(self) -> None:
        for tier in self.meta["level_order"]:
            for lesson in _load(f"{tier}.json"):
                exercise = lesson["exercise"]
                if exercise["type"] == "multiple_choice":
                    self.assertLess(exercise["correct_index"], len(exercise["options"]))

    def test_orders_are_sequential_per_tier(self) -> None:
        for tier in self.meta["level_order"]:
            orders = sorted(lesson["order"] for lesson in _load(f"{tier}.json"))
            self.assertEqual(orders, list(range(1, len(orders) + 1)), tier)

    def test_track_ids_reference_defined_tracks_on_same_level(self) -> None:
        tracks = {track["id"]: track for track in self.meta["tracks"]}
        for tier in self.meta["level_order"]:
            for lesson in _load(f"{tier}.json"):
                self.assertIn(lesson["track_id"], tracks, lesson["id"])
                self.assertEqual(tracks[lesson["track_id"]]["level"], tier, lesson["id"])


if __name__ == "__main__":
    unittest.main()
