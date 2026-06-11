# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Readiness scores and level-unlock ladder."""

import unittest

from app.services.learn_readiness import LearnReadinessService
from app.services.learn_service import _load_lessons


class _StateStore:
    def __init__(self) -> None:
        self.progress: dict[str, dict] = {}
        self.intents: list[dict] = []

    def get_learn_progress(self):
        return self.progress

    def list_paper_trade_intents(self):
        return self.intents


class _Moments:
    def __init__(self, types=()):
        self._types = types

    def get_moments(self):
        return [{"type": t, "lesson_completed": False} for t in self._types]


def _complete_levels(store: _StateStore, levels: set[str]) -> None:
    for lesson in _load_lessons():
        if lesson["tier"] in levels:
            store.progress[lesson["id"]] = {"completed_at": "2026-06-01", "attempts": 1}


def _service(store=None, moments=None):
    return LearnReadinessService(store or _StateStore(), moments or _Moments())


class ReadinessScoreTests(unittest.TestCase):
    def test_fresh_user_scores(self) -> None:
        result = _service().get_readiness()
        self.assertEqual(result["scores"]["knowledge"], 0)
        self.assertEqual(result["scores"]["execution"], 0)
        self.assertEqual(result["scores"]["risk"], 100)
        self.assertEqual(result["scores"]["psychology"], 100)
        self.assertEqual(result["scores"]["consistency"], 0)

    def test_active_risk_moments_deduct(self) -> None:
        result = _service(
            moments=_Moments(["oversized_position", "unprotected_drawdown"])
        ).get_readiness()
        self.assertEqual(result["scores"]["risk"], 30)

    def test_rapid_fire_deducts_psychology(self) -> None:
        result = _service(moments=_Moments(["rapid_fire_entries"])).get_readiness()
        self.assertEqual(result["scores"]["psychology"], 60)

    def test_execution_saturates_at_expert_bar(self) -> None:
        store = _StateStore()
        store.intents = [{"status": "executed"}] * 75
        result = _service(store=store).get_readiness()
        self.assertEqual(result["scores"]["execution"], 100)
        self.assertEqual(result["executed_trades"], 75)

    def test_consistency_is_completion_over_attempts(self) -> None:
        store = _StateStore()
        store.progress = {
            "a": {"completed_at": "2026-06-01", "attempts": 1},
            "b": {"completed_at": "", "attempts": 3},
        }
        result = _service(store=store).get_readiness()
        self.assertEqual(result["scores"]["consistency"], 50)


class UnlockLadderTests(unittest.TestCase):
    def _levels(self, result):
        return {level["id"]: level for level in result["levels"]}

    def test_fresh_user_only_novice_unlocked(self) -> None:
        levels = self._levels(_service().get_readiness())
        self.assertTrue(levels["novice"]["unlocked"])
        self.assertFalse(levels["intermediate"]["unlocked"])
        self.assertFalse(levels["advanced"]["unlocked"])
        self.assertFalse(levels["expert"]["unlocked"])

    def test_novice_completion_unlocks_intermediate(self) -> None:
        store = _StateStore()
        _complete_levels(store, {"novice"})
        levels = self._levels(_service(store=store).get_readiness())
        self.assertTrue(levels["intermediate"]["unlocked"])
        self.assertFalse(levels["advanced"]["unlocked"])

    def test_advanced_needs_trades_and_clean_risk(self) -> None:
        store = _StateStore()
        _complete_levels(store, {"novice", "intermediate"})
        store.intents = [{"status": "executed"}] * 19
        levels = self._levels(_service(store=store).get_readiness())
        self.assertFalse(levels["advanced"]["unlocked"])  # 19 < 20 trades

        store.intents = [{"status": "executed"}] * 20
        levels = self._levels(_service(store=store).get_readiness())
        self.assertTrue(levels["advanced"]["unlocked"])

        # Same progress but an active severe risk moment relocks it.
        levels = self._levels(
            _service(store=store, moments=_Moments(["oversized_position"])).get_readiness()
        )
        self.assertFalse(levels["advanced"]["unlocked"])

    def test_expert_needs_everything(self) -> None:
        store = _StateStore()
        _complete_levels(store, {"novice", "intermediate", "advanced"})
        store.intents = [{"status": "executed"}] * 50
        levels = self._levels(_service(store=store).get_readiness())
        self.assertTrue(levels["expert"]["unlocked"])

        levels = self._levels(
            _service(store=store, moments=_Moments(["rapid_fire_entries"])).get_readiness()
        )
        self.assertFalse(levels["expert"]["unlocked"])  # psychology 60 not > bar? 60 >= 60 ok

    def test_requirements_carry_met_flags(self) -> None:
        levels = self._levels(_service().get_readiness())
        for requirement in levels["advanced"]["requirements"]:
            self.assertIn("label", requirement)
            self.assertIn("met", requirement)


if __name__ == "__main__":
    unittest.main()
