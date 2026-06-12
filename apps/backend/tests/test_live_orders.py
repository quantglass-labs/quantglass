# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Live order-type mapping (PAR-5): ticket -> broker payloads, covenant rejections."""

import unittest

from tests.test_trading import _FakeProviderManager, _FakeStateStore

from app.providers.keyed import AlpacaStocksOHLCVProvider
from app.services.event_bus import BackendEventBus
from app.services.trading import TradeExecutionError, TradingExecutionService

build = AlpacaStocksOHLCVProvider.build_order_payload


class AlpacaPayloadTests(unittest.TestCase):
    def test_market_order_maps_sides_and_tif(self) -> None:
        payload = build("BTC/USD", "short", 0.5, tif="day")
        self.assertEqual(payload["symbol"], "BTCUSD")
        self.assertEqual(payload["side"], "sell")
        self.assertEqual(payload["type"], "market")
        self.assertEqual(payload["time_in_force"], "day")

    def test_limit_and_stop_entries_carry_their_trigger(self) -> None:
        limit = build("SPY", "long", 1, order_type="limit", limit_price=520.0, tif="gtc")
        self.assertEqual(limit["limit_price"], 520.0)
        stop = build("SPY", "long", 1, order_type="stop", limit_price=530.0, tif="gtc")
        self.assertEqual(stop["stop_price"], 530.0)
        self.assertNotIn("limit_price", stop)

    def test_plan_legs_become_bracket_or_oto(self) -> None:
        bracket = build("SPY", "long", 1, plan_stop=500.0, plan_target=560.0, tif="gtc")
        self.assertEqual(bracket["order_class"], "bracket")
        self.assertEqual(bracket["stop_loss"], {"stop_price": 500.0})
        self.assertEqual(bracket["take_profit"], {"limit_price": 560.0})
        oto = build("SPY", "long", 1, plan_stop=500.0, tif="gtc")
        self.assertEqual(oto["order_class"], "oto")
        self.assertNotIn("take_profit", oto)

    def test_unexpressible_tickets_are_refused_not_downgraded(self) -> None:
        with self.assertRaisesRegex(ValueError, "good-till-date"):
            build("SPY", "long", 1, tif="gtd")
        with self.assertRaisesRegex(ValueError, "trailing stop"):
            build("SPY", "long", 1, trail_percent=2.0)
        with self.assertRaisesRegex(ValueError, "market or limit"):
            build("SPY", "long", 1, order_type="stop", limit_price=530.0, plan_stop=500.0)
        with self.assertRaisesRegex(ValueError, "limit price"):
            build("SPY", "long", 1, order_type="limit")


class _TicketCapturingClient:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    def submit_order(self, symbol, side, quantity, **ticket):
        self.calls.append({"symbol": symbol, "side": side, "quantity": quantity, **ticket})
        return {"id": "broker-9", "status": "accepted", "submitted_at": "2026-06-12T00:00:00+00:00"}


class _LegacyMarketOnlyClient:
    def __init__(self) -> None:
        self.calls: list[tuple] = []

    def submit_order(self, symbol, side, quantity):
        self.calls.append((symbol, side, quantity))
        return {"id": "broker-0", "status": "accepted", "submitted_at": "2026-06-12T00:00:00+00:00"}


def _live_service(client):
    state_store = _FakeStateStore(trading_mode="live")
    manager = _FakeProviderManager(chain=["alpaca"], client=client)
    return state_store, TradingExecutionService(state_store, manager, BackendEventBus())


class LiveTicketRoutingTests(unittest.TestCase):
    def test_full_ticket_reaches_a_modern_client(self) -> None:
        client = _TicketCapturingClient()
        state_store, service = _live_service(client)
        service.submit_trade(
            signal_id="s1",
            symbol="SPY",
            side="long",
            quantity=1.0,
            entry_price=525.0,
            plan={"stop": 500.0, "target": 560.0},
            order_type="limit",
            limit_price=520.0,
            tif="gtc",
        )
        call = client.calls[0]
        self.assertEqual(call["order_type"], "limit")
        self.assertEqual(call["limit_price"], 520.0)
        self.assertEqual(call["tif"], "gtc")
        self.assertEqual(call["plan_stop"], 500.0)
        self.assertEqual(call["plan_target"], 560.0)
        recorded = state_store.live_trade_calls[0]
        self.assertEqual(recorded["order_type"], "limit")
        self.assertEqual(recorded["tif"], "gtc")

    def test_legacy_client_refuses_resting_orders(self) -> None:
        client = _LegacyMarketOnlyClient()
        _, service = _live_service(client)
        with self.assertRaisesRegex(TradeExecutionError, "plain market"):
            service.submit_trade(
                signal_id="s2",
                symbol="SPY",
                side="long",
                quantity=1.0,
                entry_price=525.0,
                order_type="limit",
                limit_price=520.0,
            )
        self.assertEqual(client.calls, [])

    def test_legacy_client_still_takes_plain_market_orders(self) -> None:
        client = _LegacyMarketOnlyClient()
        _, service = _live_service(client)
        result = service.submit_trade(
            signal_id="s3",
            symbol="SPY",
            side="long",
            quantity=1.0,
            entry_price=525.0,
        )
        self.assertTrue(result.accepted)
        self.assertEqual(client.calls, [("SPY", "long", 1.0)])


if __name__ == "__main__":
    unittest.main()
