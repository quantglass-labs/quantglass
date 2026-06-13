# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Paper order types and bracket execution: limit/stop entries, OCO exits."""

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from app.storage.state_store.db import connect
from app.storage.state_store.migrations import (
    _add_order_lifecycle_columns,
    _add_order_type_columns,
    _add_trade_plan_columns,
)
from app.storage.state_store.trading import PaperTradingStore


class PaperOrderTests(unittest.TestCase):
    def setUp(self):
        self._tmp = TemporaryDirectory(ignore_cleanup_errors=True)
        self.store = PaperTradingStore(Path(self._tmp.name) / "state.sqlite")
        with connect(self.store.sqlite_path) as connection:
            self.store.ensure_schema(connection)
            _add_trade_plan_columns(connection)
            _add_order_type_columns(connection)
            _add_order_lifecycle_columns(connection)
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


class OrderLifecycleTests(PaperOrderTests):
    def test_day_order_expires_next_day(self) -> None:
        trade, _ = self.store.submit_paper_trade(
            signal_id="s",
            symbol="BTCUSD",
            side="long",
            quantity=1.0,
            entry_price=100.0,
            trading_mode="paper",
            order_type="limit",
            limit_price=90.0,
            tif="day",
        )
        # Backdate the submission to yesterday.
        with connect(self.store.sqlite_path) as connection:
            connection.execute(
                "UPDATE paper_trade_intents SET submitted_at = '2020-01-01T00:00:00Z'"
            )
            connection.commit()
        executed, _ = self.store.process_pending_paper_trades({"BTCUSD": 80.0})
        self.assertEqual(executed, [])
        intents = self.store.list_paper_trade_intents()
        self.assertEqual(intents[0]["status"], "expired")

    def test_cancel_pending_only(self) -> None:
        trade, _ = self.store.submit_paper_trade(
            signal_id="s",
            symbol="BTCUSD",
            side="long",
            quantity=1.0,
            entry_price=100.0,
            trading_mode="paper",
            order_type="limit",
            limit_price=90.0,
        )
        self.assertTrue(self.store.cancel_paper_intent(trade["id"]))
        self.assertFalse(self.store.cancel_paper_intent(trade["id"]))  # already cancelled
        executed, _ = self.store.process_pending_paper_trades({"BTCUSD": 80.0})
        self.assertEqual(executed, [])

    def test_manual_close_realizes_pnl(self) -> None:
        self._submit()
        self.store.process_pending_paper_trades({"BTCUSD": 100.0})
        closure = self.store.close_paper_position("BTCUSD", 103.0)
        self.assertEqual(closure["exitKind"], "manual")
        account = self.store.get_paper_account()
        self.assertEqual(account["openPositions"], [])
        self.assertAlmostEqual(account["realizedPnl"], 3.0, places=2)

    def test_trailing_stop_ratchets_and_closes(self) -> None:
        self.store.submit_paper_trade(
            signal_id="s",
            symbol="BTCUSD",
            side="long",
            quantity=1.0,
            entry_price=100.0,
            trading_mode="paper",
            plan={"stop": 95.0},
            trail_percent=5.0,
        )
        self.store.process_pending_paper_trades({"BTCUSD": 100.0})
        # Price runs to 120: trail moves stop to 114; static 95 is superseded.
        self.assertEqual(self.store.enforce_paper_brackets({"BTCUSD": 120.0}), [])
        closures = self.store.enforce_paper_brackets({"BTCUSD": 113.0})
        self.assertEqual(len(closures), 1)
        self.assertEqual(closures[0]["exitKind"], "stop")
        self.assertAlmostEqual(closures[0]["exitPrice"], 114.0, places=2)
        account = self.store.get_paper_account()
        self.assertAlmostEqual(account["realizedPnl"], 14.0, places=2)


class AccountGuardTests(PaperOrderTests):
    def test_oversized_order_rejected_with_max_size(self) -> None:
        with self.assertRaises(ValueError) as ctx:
            self.store.submit_paper_trade(
                signal_id="s",
                symbol="BTCUSD",
                side="long",
                quantity=10_000.0,
                entry_price=100.0,
                trading_mode="paper",
            )
        self.assertIn("Insufficient buying power", str(ctx.exception))
        self.assertIn("Max size", str(ctx.exception))

    def test_opposing_position_rejected(self) -> None:
        self._submit(side="long")
        self.store.process_pending_paper_trades({"BTCUSD": 100.0})
        with self.assertRaises(ValueError) as ctx:
            self._submit(side="short")
        self.assertIn("Close it first", str(ctx.exception))

    def test_same_side_add_is_allowed(self) -> None:
        self._submit(side="long")
        self.store.process_pending_paper_trades({"BTCUSD": 100.0})
        self._submit(side="long")
        executed, _ = self.store.process_pending_paper_trades({"BTCUSD": 101.0})
        self.assertEqual(len(executed), 1)


class ClosureLedgerTests(PaperOrderTests):
    def test_bracket_and_manual_closures_recorded_with_r(self) -> None:
        self._submit(plan={"stop": 95.0, "target": 110.0})
        self.store.process_pending_paper_trades({"BTCUSD": 100.0})
        self.store.enforce_paper_brackets({"BTCUSD": 111.0})
        closures = self.store.list_paper_closures()
        self.assertEqual(len(closures), 1)
        self.assertEqual(closures[0]["exitKind"], "target")
        self.assertAlmostEqual(closures[0]["pnl"], 10.0, places=2)
        self.assertAlmostEqual(closures[0]["rMultiple"], 2.0, places=2)

        self._submit(plan={"stop": 95.0})
        self.store.process_pending_paper_trades({"BTCUSD": 100.0})
        self.store.close_paper_position("BTCUSD", 97.0)
        closures = self.store.list_paper_closures()
        self.assertEqual(len(closures), 2)
        self.assertEqual(closures[0]["exitKind"], "manual")
        self.assertAlmostEqual(closures[0]["rMultiple"], -0.6, places=2)


class PartialCloseTests(PaperOrderTests):
    def test_scale_out_closes_part_and_keeps_rest(self) -> None:
        trade, _ = self.store.submit_paper_trade(
            signal_id="s",
            symbol="BTCUSD",
            side="long",
            quantity=2.0,
            entry_price=100.0,
            trading_mode="paper",
        )
        self.store.process_pending_paper_trades({"BTCUSD": 100.0})
        closure = self.store.close_paper_position("BTCUSD", 105.0, quantity=0.5)
        self.assertEqual(closure["quantity"], 0.5)
        account = self.store.get_paper_account()
        self.assertEqual(account["openPositions"][0]["quantity"], 1.5)
        self.assertAlmostEqual(account["realizedPnl"], 2.5, places=2)
        ledger = self.store.list_paper_closures()
        self.assertEqual(ledger[0]["quantity"], 0.5)

    def test_oversized_partial_clamps_to_held(self) -> None:
        self._submit()
        self.store.process_pending_paper_trades({"BTCUSD": 100.0})
        closure = self.store.close_paper_position("BTCUSD", 101.0, quantity=99.0)
        self.assertEqual(closure["quantity"], 1.0)
        self.assertEqual(self.store.get_paper_account()["openPositions"], [])
