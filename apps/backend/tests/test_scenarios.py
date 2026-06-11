# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Replay scenarios: answer hiding, grading, persistence, content integrity (MSN-6)."""

import json
import unittest
from pathlib import Path

from app.services.scenarios import ScenarioService, _load_scenarios

_CONTENT = Path(__file__).resolve().parent.parent / "app" / "content"


class _Store:
    def __init__(self):
        self.results = {}

    def get_scenario_results(self):
        return self.results

    def record_scenario_result(self, scenario_id, percent, passed):
        best = self.results.get(scenario_id)
        if best is None or percent > best["best_percent"]:
            self.results[scenario_id] = {
                "best_percent": percent,
                "passed": passed,
                "attempts": 1,
                "taken_at": "now",
            }


def _service():
    return ScenarioService(_Store())


def _perfect_answers(scenario_id):
    scenario = next(s for s in _load_scenarios() if s["id"] == scenario_id)
    answers = {}
    for index, checkpoint in enumerate(scenario["checkpoints"]):
        best = max(checkpoint["options"], key=lambda option: option["points"])
        answers[str(index)] = best["id"]
    return answers


class ListAndRevealTests(unittest.TestCase):
    def test_listing_has_no_answers_and_no_best_until_played(self) -> None:
        listing = _service().list_scenarios()
        self.assertGreaterEqual(len(listing["items"]), 3)
        first = listing["items"][0]
        self.assertIsNone(first["best_percent"])
        self.assertNotIn("candles", first)

    def test_scenario_payload_hides_points_and_debriefs(self) -> None:
        scenario = _service().get_scenario("the-breakout-that-wasnt")
        self.assertTrue(scenario["candles"])
        for checkpoint in scenario["checkpoints"]:
            for option in checkpoint["options"]:
                self.assertNotIn("points", option)
                self.assertNotIn("debrief", option)

    def test_unknown_scenario_returns_none(self) -> None:
        self.assertIsNone(_service().get_scenario("nope"))


class GradingTests(unittest.TestCase):
    def test_perfect_run_scores_100_and_passes(self) -> None:
        service = _service()
        result = service.grade(
            "the-breakout-that-wasnt", _perfect_answers("the-breakout-that-wasnt")
        )
        self.assertEqual(result["percent"], 100)
        self.assertTrue(result["passed"])
        self.assertIsNone(result["checkpoints"][0]["best_choice"])

    def test_bad_run_fails_and_names_the_better_choice(self) -> None:
        service = _service()
        result = service.grade("the-breakout-that-wasnt", {"0": "chase", "1": "widen"})
        self.assertFalse(result["passed"])
        self.assertEqual(result["checkpoints"][0]["points"], 0)
        self.assertTrue(result["checkpoints"][0]["best_choice"])
        self.assertIn("No answer", result["checkpoints"][2]["debrief"])

    def test_best_score_persists_across_attempts(self) -> None:
        store = _Store()
        service = ScenarioService(store)
        service.grade("the-gap-down", {})
        service.grade("the-gap-down", _perfect_answers("the-gap-down"))
        service.grade("the-gap-down", {"0": "win_back"})
        listing = service.list_scenarios()
        item = next(i for i in listing["items"] if i["id"] == "the-gap-down")
        self.assertEqual(item["best_percent"], 100)
        self.assertTrue(item["passed"])


class ContentIntegrityTests(unittest.TestCase):
    def test_scenarios_are_well_formed(self) -> None:
        lesson_ids = set()
        for tier in ("novice", "intermediate", "advanced", "expert"):
            with open(_CONTENT / "lessons" / f"{tier}.json", encoding="utf-8") as handle:
                lesson_ids.update(lesson["id"] for lesson in json.load(handle))

        for scenario in _load_scenarios():
            bars = len(scenario["candles"])
            self.assertGreaterEqual(bars, 40, scenario["id"])
            option_best = []
            for checkpoint in scenario["checkpoints"]:
                self.assertLess(checkpoint["at_bar"], bars, scenario["id"])
                ids = [option["id"] for option in checkpoint["options"]]
                self.assertEqual(len(ids), len(set(ids)), scenario["id"])
                option_best.append(max(option["points"] for option in checkpoint["options"]))
            self.assertTrue(all(points > 0 for points in option_best), scenario["id"])
            for lesson_id in scenario.get("lesson_links", []):
                self.assertIn(lesson_id, lesson_ids, scenario["id"])
            for candle in scenario["candles"]:
                self.assertLessEqual(candle["low"], min(candle["open"], candle["close"]))
                self.assertGreaterEqual(candle["high"], max(candle["open"], candle["close"]))


if __name__ == "__main__":
    unittest.main()
