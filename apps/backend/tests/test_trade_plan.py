# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Plan-aware paper trades (MSN-1): persistence and round-trip."""

import tempfile
import unittest
from pathlib import Path

from app.core.config import AiSettings, ProviderSettings, SafetySettings
from app.storage.state_store import StateStore


def _store(tmp: str) -> StateStore:
    store = StateStore(Path(tmp) / "state.db")
    store.initialize(ProviderSettings(), SafetySettings(), AiSettings())
    return store


PLAN = {
    "stop": 63100.0,
    "target": 66400.0,
    "riskPercent": 1.0,
    "reason": "Pullback to rising 21-EMA in trending regime.",
    "emotion": "calm",
}


class TradePlanTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.store = _store(self._tmp.name)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_plan_persists_and_round_trips(self) -> None:
        trade, _ = self.store.submit_paper_trade(
            signal_id="sig-1",
            symbol="BTCUSD",
            side="long",
            quantity=0.1,
            entry_price=64000.0,
            trading_mode="paper",
            plan=PLAN,
        )
        self.assertEqual(trade["planStop"], 63100.0)
        self.assertEqual(trade["planReason"], PLAN["reason"])

        listed = self.store.list_paper_trade_intents()[0]
        self.assertEqual(listed["planStop"], 63100.0)
        self.assertEqual(listed["planTarget"], 66400.0)
        self.assertEqual(listed["planRiskPercent"], 1.0)
        self.assertEqual(listed["planEmotion"], "calm")

    def test_plan_is_optional_for_backward_compatibility(self) -> None:
        self.store.submit_paper_trade(
            signal_id="sig-2",
            symbol="ETHUSD",
            side="long",
            quantity=1.0,
            entry_price=3000.0,
            trading_mode="paper",
        )
        listed = self.store.list_paper_trade_intents()[0]
        self.assertIsNone(listed["planStop"])
        self.assertIsNone(listed["planReason"])

    def test_migration_3_recorded(self) -> None:
        import sqlite3

        with sqlite3.connect(self.store.sqlite_path) as connection:
            versions = {
                row[0]
                for row in connection.execute("SELECT version FROM schema_migrations").fetchall()
            }
        self.assertIn(3, versions)


if __name__ == "__main__":
    unittest.main()
