# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Glossary aggregation, reference library, bridges, and test-out (MSN-7)."""

import json
import unittest
from pathlib import Path

from app.services.learn_service import LearnService, _load_lessons

_CONTENT = Path(__file__).resolve().parent.parent / "app" / "content"


class _Store:
    def get_learn_progress(self):
        return {}


def _service():
    return LearnService(_Store())


class GlossaryTests(unittest.TestCase):
    def test_glossary_aggregates_and_dedupes_key_terms(self) -> None:
        glossary = _service().get_glossary()
        items = glossary["items"]
        self.assertGreater(len(items), 200)
        terms = [entry["term"].lower() for entry in items]
        self.assertEqual(len(terms), len(set(terms)))
        self.assertEqual(terms, sorted(terms))
        first = items[0]
        self.assertTrue(first["definition"])
        self.assertTrue(first["lesson_id"])
        self.assertTrue(first["lesson_title"])


class ReferenceTests(unittest.TestCase):
    def test_reference_has_all_four_sections(self) -> None:
        reference = _service().get_reference()
        ids = [section["id"] for section in reference["sections"]]
        self.assertEqual(ids, ["indicators", "order-types", "formulas", "scam-checklist"])
        for section in reference["sections"]:
            self.assertGreaterEqual(len(section["items"]), 5)
            for item in section["items"]:
                self.assertTrue(item["name"])
                self.assertTrue(item["notes"])


class BridgeIntegrityTests(unittest.TestCase):
    def test_bridges_point_at_real_missions_and_scenarios(self) -> None:
        with open(_CONTENT / "missions" / "missions.json", encoding="utf-8") as handle:
            mission_ids = {mission["id"] for mission in json.load(handle)}
        with open(_CONTENT / "scenarios" / "scenarios.json", encoding="utf-8") as handle:
            scenario_ids = {scenario["id"] for scenario in json.load(handle)}

        bridged = 0
        with_mistakes = 0
        for lesson in _load_lessons():
            if "common_mistakes" in lesson:
                with_mistakes += 1
                self.assertTrue(all(len(item) >= 10 for item in lesson["common_mistakes"]))
            bridge = lesson.get("bridge")
            if not bridge:
                continue
            bridged += 1
            self.assertTrue(bridge["cta"])
            if "mission_id" in bridge:
                self.assertIn(bridge["mission_id"], mission_ids, lesson["id"])
            if "scenario_id" in bridge:
                self.assertIn(bridge["scenario_id"], scenario_ids, lesson["id"])
        self.assertGreaterEqual(bridged, 8)
        self.assertGreaterEqual(with_mistakes, 20)


if __name__ == "__main__":
    unittest.main()
