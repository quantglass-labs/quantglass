# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Mastery loop: XP derivation, streaks, badges, and SM-2-lite review (ACAD-6)."""

import unittest
from datetime import UTC, datetime, timedelta

from app.services.learn_mastery import LearnMasteryService


def _day(offset: int) -> str:
    return (datetime.now(UTC).date() - timedelta(days=offset)).isoformat()


class _Store:
    def __init__(self):
        self.progress = {}
        self.assessments = {}
        self.missions = {}
        self.scenarios = {}
        self.cards = {}
        self.activity = []

    def get_learn_progress(self):
        return self.progress

    def get_assessments(self):
        return self.assessments

    def get_completed_missions(self):
        return self.missions

    def get_scenario_results(self):
        return self.scenarios

    def get_review_cards(self):
        return self.cards

    def upsert_review_card(self, term, lesson_id, card):
        self.cards[term.lower()] = {"term": term, "lesson_id": lesson_id, **card}

    def get_activity_days(self):
        return self.activity


class _Learn:
    def get_catalog(self):
        return {
            "levels": [
                {
                    "id": "novice",
                    "tracks": [
                        {
                            "id": "chart-literacy",
                            "title": "Chart Literacy",
                            "lessons": [{"id": "l1"}, {"id": "l2"}],
                        }
                    ],
                }
            ]
        }

    def get_glossary(self):
        return {
            "items": [
                {"term": "ATR", "definition": "Volatility in price units.", "lesson_id": "l1"},
                {"term": "RSI", "definition": "Momentum oscillator.", "lesson_id": "l2"},
                {"term": "VWAP", "definition": "Volume-weighted price.", "lesson_id": "l9"},
            ]
        }


def _service(store=None):
    return LearnMasteryService(store or _Store(), _Learn())


class XpAndBadgeTests(unittest.TestCase):
    def test_xp_derives_from_persisted_progress(self) -> None:
        store = _Store()
        store.progress = {"l1": {"completed_at": "x"}, "l2": {"completed_at": "x"}}
        store.assessments = {"novice": {"passed": True}}
        store.missions = {"risk-discipline": "x"}
        store.scenarios = {"the-gap-down": {"passed": True}}
        mastery = _service(store).mastery()
        # 2*20 + 100 + 150 + 75 = 365
        self.assertEqual(mastery["xp"], 365)
        self.assertEqual(mastery["level"], 1)
        self.assertTrue(mastery["level_title"])

    def test_badge_earned_only_when_track_complete(self) -> None:
        store = _Store()
        store.progress = {"l1": {"completed_at": "x"}}
        badges = _service(store).mastery()["badges"]
        self.assertEqual(badges[0]["progress"], 1)
        self.assertFalse(badges[0]["earned"])
        store.progress["l2"] = {"completed_at": "x"}
        self.assertTrue(_service(store).mastery()["badges"][0]["earned"])

    def test_streak_counts_consecutive_days_and_breaks_on_gap(self) -> None:
        store = _Store()
        store.activity = [_day(0), _day(1), _day(2), _day(5)]
        self.assertEqual(_service(store).mastery()["streak_days"], 3)
        store.activity = [_day(1), _day(2)]  # nothing today: streak still alive
        self.assertEqual(_service(store).mastery()["streak_days"], 2)
        store.activity = [_day(3)]
        self.assertEqual(_service(store).mastery()["streak_days"], 0)


class ReviewQueueTests(unittest.TestCase):
    def test_new_cards_come_only_from_completed_lessons(self) -> None:
        store = _Store()
        store.progress = {"l1": {"completed_at": "x"}}
        queue = _service(store).review_queue()
        terms = [item["term"] for item in queue["items"]]
        self.assertIn("ATR", terms)
        self.assertNotIn("RSI", terms)  # l2 not completed
        self.assertNotIn("VWAP", terms)  # l9 not completed

    def test_grading_good_then_easy_grows_the_interval(self) -> None:
        store = _Store()
        store.progress = {"l1": {"completed_at": "x"}}
        service = _service(store)
        first = service.grade("ATR", "good")
        self.assertEqual(first["interval_days"], 1.0)
        second = service.grade("ATR", "easy")
        self.assertGreater(second["interval_days"], first["interval_days"])
        self.assertEqual(second["reps"], 2)

    def test_again_lapses_and_keeps_card_due(self) -> None:
        store = _Store()
        store.progress = {"l1": {"completed_at": "x"}}
        service = _service(store)
        service.grade("ATR", "good")
        result = service.grade("ATR", "again")
        self.assertEqual(result["interval_days"], 0.0)
        self.assertEqual(result["lapses"], 1)
        self.assertLess(result["ease"], 2.5)
        queue = service.review_queue()
        statuses = {item["term"]: item["status"] for item in queue["items"]}
        self.assertEqual(statuses.get("ATR"), "due")


if __name__ == "__main__":
    unittest.main()
