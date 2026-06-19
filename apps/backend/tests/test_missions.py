# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Mission engine: criteria evaluation and completion persistence."""

import unittest

from app.services.missions import MissionService


def _item(score=100, notes=(), classification=None):
    return {
        "process_score": score,
        "process_notes": list(notes),
        "classification": classification,
    }


class _Review:
    def __init__(self, items):
        self.items = items

    def review(self):
        return {"items": self.items, "summary": {}}


class _Store:
    def __init__(self):
        self.completed = {}

    def get_completed_missions(self):
        return dict(self.completed)

    def record_mission_complete(self, mission_id):
        self.completed[mission_id] = "2026-06-11T00:00:00Z"

    def get_drill_results(self):
        # These tests exercise the field-work criteria; treat every
        # category's decision drill as already passed.
        from app.services.missions import _load_drills

        return {category: {"passed": True, "best_percent": 100} for category in _load_drills()}


def _missions(items):
    store = _Store()
    return MissionService(store, _Review(items)).list_missions(), store


class MissionTests(unittest.TestCase):
    def test_fresh_user_has_open_missions_with_progress(self) -> None:
        result, store = _missions([])
        by_id = {m["id"]: m for m in result["items"]}
        self.assertIn("risk-discipline", by_id)
        self.assertFalse(by_id["risk-discipline"]["completed"])
        trades = next(c for c in by_id["risk-discipline"]["criteria"] if "20" in c["label"])
        self.assertEqual(trades["current"], 0)
        self.assertEqual(store.completed, {})

    def test_risk_discipline_completes_and_persists(self) -> None:
        items = [_item(classification="earned_win") for _ in range(20)]
        result, store = _missions(items)
        mission = next(m for m in result["items"] if m["id"] == "risk-discipline")
        self.assertTrue(mission["completed"])
        self.assertIn("risk-discipline", store.completed)

    def test_dangerous_success_blocks_risk_discipline(self) -> None:
        items = [_item(classification="earned_win") for _ in range(19)]
        items.append(_item(score=40, classification="dangerous_success"))
        result, _ = _missions(items)
        mission = next(m for m in result["items"] if m["id"] == "risk-discipline")
        self.assertFalse(mission["completed"])
        blocked = next(c for c in mission["criteria"] if "dangerous" in c["label"].lower())
        self.assertFalse(blocked["met"])

    def test_stopless_trade_blocks(self) -> None:
        items = [_item() for _ in range(20)]
        items.append(_item(score=50, notes=["No stop was planned — invalidation undefined."]))
        result, _ = _missions(items)
        mission = next(m for m in result["items"] if m["id"] == "risk-discipline")
        stops = next(c for c in mission["criteria"] if "stop" in c["label"].lower())
        self.assertFalse(stops["met"])

    def test_planned_loss_mission(self) -> None:
        items = [_item(classification="well_played_loss") for _ in range(3)]
        items += [_item(classification="earned_win") for _ in range(2)]
        result, _ = _missions(items)
        mission = next(m for m in result["items"] if m["id"] == "accept-the-planned-loss")
        self.assertTrue(mission["completed"])

    def test_operator_streak_is_consecutive(self) -> None:
        # newest-first list: 5 good, 1 bad, 9 good -> best chronological run = 5? reversed:
        # chronological = 9 good, 1 bad, 5 good -> best run 9, not 14.
        items = (
            [_item(score=90) for _ in range(5)]
            + [_item(score=40)]
            + [_item(score=90) for _ in range(9)]
        )
        result, _ = _missions(items)
        mission = next(m for m in result["items"] if m["id"] == "the-operator")
        streak = next(c for c in mission["criteria"] if "consecutive" in c["label"])
        self.assertEqual(streak["current"], 9)
        self.assertFalse(mission["completed"])


class DailyBriefingTests(unittest.TestCase):
    def _briefing(self, days):
        class _StoreWithDays(_Store):
            def get_activity_days(self_inner):
                return list(days)

        return MissionService(_StoreWithDays(), _Review([])).daily_briefing()

    def test_empty_history_has_no_streak_but_offers_a_daily_mission(self) -> None:
        from datetime import UTC, datetime

        briefing = self._briefing([])
        self.assertEqual(briefing["streak"], 0)
        self.assertEqual(briefing["longest"], 0)
        self.assertFalse(briefing["active_today"])
        self.assertEqual(len(briefing["week"]), 7)
        self.assertEqual(briefing["week"][-1]["date"], datetime.now(UTC).date().isoformat())
        self.assertIsNotNone(briefing["daily_mission"])
        self.assertFalse(briefing["daily_mission"]["completed"])

    def test_consecutive_days_build_the_streak(self) -> None:
        from datetime import UTC, datetime, timedelta

        today = datetime.now(UTC).date()
        days = [(today - timedelta(days=offset)).isoformat() for offset in range(3)]
        briefing = self._briefing(days)
        self.assertEqual(briefing["streak"], 3)
        self.assertTrue(briefing["active_today"])
        self.assertTrue(briefing["week"][-1]["active"])

    def test_daily_mission_is_stable_within_the_day(self) -> None:
        first = self._briefing([])["daily_mission"]["id"]
        second = self._briefing([])["daily_mission"]["id"]
        self.assertEqual(first, second)

    def test_streak_summary_is_cheap_and_skips_trade_review(self) -> None:
        # The cheap path must not touch the review service (which is what makes
        # the full briefing expensive). A review that explodes proves we never
        # call it.
        from datetime import UTC, datetime, timedelta

        class _BoomReview:
            def review(self):
                raise AssertionError("streak_summary must not evaluate trades")

        class _StoreWithDays(_Store):
            def get_activity_days(self_inner):
                today = datetime.now(UTC).date()
                return [(today - timedelta(days=o)).isoformat() for o in range(4)]

        summary = MissionService(_StoreWithDays(), _BoomReview()).streak_summary()
        self.assertEqual(summary["streak"], 4)
        self.assertEqual(len(summary["week"]), 7)
        self.assertNotIn("daily_mission", summary)


if __name__ == "__main__":
    unittest.main()
