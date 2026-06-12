# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Paper order types and bracket execution: limit/stop entries, OCO exits."""

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from app.storage.state_store.db import connect
from app.storage.state_store.migrations import (
    _add_order_type_columns,
    _add_trade_plan_columns,
)
from app.storage.state_store.trading import PaperTradingStore


class PaperOrderTests(unittest.TestCase):
    def setUp(self):
        self._tmp = TemporaryDirectory()
        self.store = PaperTradingStore(Path(self._tmp.name) / "state.sqlite")
        with connect(self.store.sqlite_path) as connection:
            self.store.ensure_schema(connection)
            _add_trade_plan_columns(connection)
            _add_order_type_columns(connection)
            connection.commit()

    def tearDown(self):
        self._tmp.cleanup()

    def _submit(self, order_type="market", limit_price=None, side="long", plan=None):
        trade, _ = self.store.submit_paper_trade(
            signal_id="s",
            symbol="BTCUSD",
            side=side,
            quantity=1.0,
            entry_price=100.0,
            trading_mode="paper",
            plan=plan or {},
            order_type=order_type,
            limit_price=limit_price,
        )
        return trade

    def test_market_order_fills_at_latest_price(self) -> None:
        self._submit()
        executed, _ = self.store.process_pending_paper_trades({"BTCUSD": 105.0})
        self.assertEqual(len(executed), 1)
        self.assertEqual(executed[0]["executedPrice"], 105.0)

    def test_limit_long_waits_for_price_at_or_below_limit(self) -> None:
        self._submit(order_type="limit", limit_price=98.0)
        executed, _ = self.store.process_pending_paper_trades({"BTCUSD": 101.0})
        self.assertEqual(executed, [])
        executed, _ = self.store.process_pending_paper_trades({"BTCUSD": 97.5})
        self.assertEqual(len(executed), 1)
        self.assertLessEqual(executed[0]["executedPrice"], 98.0)

    def test_stop_entry_long_waits_for_breakout(self) -> None:
        self._submit(order_type="stop", limit_price=104.0)
        executed, _ = self.store.process_pending_paper_trades({"BTCUSD": 102.0})
        self.assertEqual(executed, [])
        executed, _ = self.store.process_pending_paper_trades({"BTCUSD": 104.5})
        self.assertEqual(len(executed), 1)

    def test_bracket_closes_at_stop_and_realizes_loss(self) -> None:
        self._submit(plan={"stop": 95.0, "target": 110.0})
        self.store.process_pending_paper_trades({"BTCUSD": 100.0})
        closures = self.store.enforce_paper_brackets({"BTCUSD": 94.0})
        self.assertEqual(len(closures), 1)
        self.assertEqual(closures[0]["exitKind"], "stop")
        self.assertEqual(closures[0]["exitPrice"], 95.0)
        account = self.store.get_paper_account()
        self.assertEqual(account["openPositions"], [])
        self.assertAlmostEqual(account["realizedPnl"], -5.0, places=2)

    def test_bracket_closes_at_target_and_realizes_gain(self) -> None:
        self._submit(plan={"stop": 95.0, "target": 110.0})
        self.store.process_pending_paper_trades({"BTCUSD": 100.0})
        closures = self.store.enforce_paper_brackets({"BTCUSD": 111.0})
        self.assertEqual(closures[0]["exitKind"], "target")
        account = self.store.get_paper_account()
        self.assertEqual(account["openPositions"], [])
        self.assertAlmostEqual(account["realizedPnl"], 10.0, places=2)

    def test_untouched_bracket_keeps_position_open(self) -> None:
        self._submit(plan={"stop": 95.0, "target": 110.0})
        self.store.process_pending_paper_trades({"BTCUSD": 100.0})
        self.assertEqual(self.store.enforce_paper_brackets({"BTCUSD": 102.0}), [])
        self.assertEqual(len(self.store.get_paper_account()["openPositions"]), 1)


if __name__ == "__main__":
    unittest.main()
