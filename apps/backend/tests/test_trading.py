# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

import unittest
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes.paper import router as paper_router
from app.services.event_bus import BackendEventBus
from app.services.trading import TradeExecutionError, TradingExecutionService


class _FakeStateStore:
    def __init__(self, trading_mode: str, live_trading_confirmed: bool = True) -> None:
        self._trading_mode = trading_mode
        self._live_trading_confirmed = live_trading_confirmed
        self.paper_trade_calls: list[dict[str, object]] = []
        self.live_trade_calls: list[dict[str, object]] = []

    def get_safety_settings(self) -> SimpleNamespace:
        return SimpleNamespace(
            trading_mode=self._trading_mode,
            live_trading_confirmed=self._live_trading_confirmed,
        )

    def submit_paper_trade(self, **kwargs):
        self.paper_trade_calls.append(kwargs)
        return (
            {
                "id": "paper-1",
                "signalId": kwargs["signal_id"],
                "symbol": kwargs["symbol"],
                "side": kwargs["side"],
                "quantity": kwargs["quantity"],
                "entryPrice": kwargs["entry_price"],
                "tradingMode": "paper",
                "submittedAt": "2026-05-30T00:00:00+00:00",
                "status": "pending",
                "provider": "alpaca_paper",
                "brokerStatus": "queued",
            },
            self.get_paper_account(),
        )

    def record_live_trade(self, **kwargs):
        self.live_trade_calls.append(kwargs)
        broker_trade = kwargs["broker_trade"]
        return {
            "id": "live-1",
            "signalId": kwargs["signal_id"],
            "symbol": kwargs["symbol"].upper(),
            "side": kwargs["side"],
            "quantity": kwargs["quantity"],
            "entryPrice": kwargs["entry_price"],
            "tradingMode": "live",
            "submittedAt": broker_trade["submitted_at"],
            "status": "submitted",
            "executedAt": broker_trade.get("filled_at"),
            "executedPrice": broker_trade.get("filled_avg_price"),
            "provider": kwargs["provider"],
            "externalOrderId": broker_trade["id"],
            "brokerStatus": broker_trade["status"],
        }

    def get_paper_account(self):
        return {
            "balance": 100000.0,
            "buyingPower": 100000.0,
            "realizedPnl": 0.0,
            "openPositions": [],
        }


class _FakeProviderClient:
    def submit_order(self, symbol: str, side: str, quantity: float):
        return {
            "id": "broker-123",
            "status": "accepted",
            "submitted_at": "2026-05-30T12:00:00+00:00",
            "filled_at": None,
            "filled_avg_price": None,
            "symbol": symbol,
            "side": side,
            "qty": quantity,
        }


class _FakeProviderManager:
    def __init__(self, chain: list[str], client=None) -> None:
        self._chain = chain
        self._client = client

    def resolve_chain(self, domain: str, capability: str | None = None) -> list[str]:
        return list(self._chain)

    def get_client(self, name: str):
        if name == "alpaca":
            return self._client
        return None


class _FailingTradingService:
    def submit_trade(self, **kwargs):
        raise TradeExecutionError("No configured live trading provider is available. Checked: alpaca, ccxt_trade.")


class TradingExecutionServiceTests(unittest.TestCase):
    def test_submit_trade_queues_paper_trades_in_paper_mode(self) -> None:
        state_store = _FakeStateStore(trading_mode="paper")
        provider_manager = _FakeProviderManager(chain=["alpaca"])
        service = TradingExecutionService(state_store, provider_manager, BackendEventBus())

        result = service.submit_trade(
            signal_id="signal-1",
            symbol="AAPL",
            side="long",
            quantity=2,
            entry_price=185.0,
        )

        self.assertTrue(result.accepted)
        self.assertEqual(result.trading_mode, "paper")
        self.assertEqual(len(state_store.paper_trade_calls), 1)
        self.assertEqual(state_store.paper_trade_calls[0]["trading_mode"], "paper")

    def test_submit_trade_sends_live_orders_through_provider_chain(self) -> None:
        state_store = _FakeStateStore(trading_mode="live")
        event_bus = BackendEventBus()
        queue = event_bus.subscribe()
        provider_manager = _FakeProviderManager(chain=["alpaca", "ccxt_trade"], client=_FakeProviderClient())
        service = TradingExecutionService(state_store, provider_manager, event_bus)

        result = service.submit_trade(
            signal_id="signal-2",
            symbol="SPY",
            side="long",
            quantity=1.5,
            entry_price=525.0,
        )

        event = queue.get_nowait()
        self.assertTrue(result.accepted)
        self.assertEqual(result.trading_mode, "live")
        self.assertEqual(result.trade["provider"], "alpaca")
        self.assertEqual(result.trade["externalOrderId"], "broker-123")
        self.assertEqual(len(state_store.live_trade_calls), 1)
        self.assertEqual(event["type"], "live.trade.submitted")
        self.assertEqual(event["payload"]["provider"], "alpaca")

    def test_submit_trade_blocks_live_when_not_confirmed(self) -> None:
        state_store = _FakeStateStore(trading_mode="live", live_trading_confirmed=False)
        provider_manager = _FakeProviderManager(chain=["alpaca"], client=_FakeProviderClient())
        service = TradingExecutionService(state_store, provider_manager, BackendEventBus())

        with self.assertRaises(TradeExecutionError):
            service.submit_trade(
                signal_id="signal-blocked",
                symbol="SPY",
                side="long",
                quantity=1.0,
                entry_price=525.0,
            )

        self.assertEqual(len(state_store.live_trade_calls), 0)


class PaperRouteTests(unittest.TestCase):
    def test_submit_trade_route_returns_live_trade_payload(self) -> None:
        app = FastAPI()
        app.include_router(paper_router)
        state_store = _FakeStateStore(trading_mode="live")
        trading_service = TradingExecutionService(
            state_store,
            _FakeProviderManager(chain=["alpaca", "ccxt_trade"], client=_FakeProviderClient()),
            BackendEventBus(),
        )
        app.state.trading_service = trading_service

        with TestClient(app) as client:
            response = client.post(
                "/api/paper-trades",
                json={
                    "signalId": "signal-live-route",
                    "symbol": "SPY",
                    "side": "long",
                    "quantity": 1,
                    "entryPrice": 520.0,
                },
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["accepted"])
        self.assertEqual(payload["tradingMode"], "live")
        self.assertEqual(payload["trade"]["provider"], "alpaca")
        self.assertEqual(payload["trade"]["externalOrderId"], "broker-123")

    def test_submit_trade_route_surfaces_live_execution_errors(self) -> None:
        app = FastAPI()
        app.include_router(paper_router)
        app.state.trading_service = _FailingTradingService()

        with TestClient(app) as client:
            response = client.post(
                "/api/paper-trades",
                json={
                    "signalId": "signal-3",
                    "symbol": "AAPL",
                    "side": "long",
                    "quantity": 1,
                    "entryPrice": 180.0,
                },
            )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["detail"],
            "No configured live trading provider is available. Checked: alpaca, ccxt_trade.",
        )