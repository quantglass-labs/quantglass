# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Lesson-moment detection from paper-trading state."""

import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes.learn import router as learn_router
from app.services.learn_moments import LearnMomentsService


class _StateStore:
    def __init__(self) -> None:
        self.account = {"balance": 100000.0, "openPositions": []}
        self.intents: list[dict] = []
        self.alerts: list[dict] = []
        self.progress: dict[str, dict] = {}
        self.journal_notes: dict[str, dict] = {}

    def get_journal_notes(self):
        return self.journal_notes

    def get_paper_account(self):
        return self.account

    def list_paper_trade_intents(self):
        return self.intents

    def list_alerts(self):
        return self.alerts

    def get_learn_progress(self):
        return self.progress


def _service() -> tuple[LearnMomentsService, _StateStore]:
    store = _StateStore()
    return LearnMomentsService(store), store


class LearnMomentsTests(unittest.TestCase):
    def test_no_activity_yields_no_moments(self) -> None:
        service, _ = _service()
        self.assertEqual(service.get_moments(), [])

    def test_oversized_position_triggers_position_sizing_lesson(self) -> None:
        service, store = _service()
        store.account["openPositions"] = [
            {
                "symbolId": "BTCUSD",
                "side": "long",
                "quantity": 0.5,
                "averagePrice": 64000.0,
                "pnl": 0.0,
            }
        ]
        moments = service.get_moments()
        self.assertEqual(len(moments), 1)
        moment = moments[0]
        self.assertEqual(moment["type"], "oversized_position")
        self.assertEqual(moment["lesson_id"], "intermediate-05-position-sizing")
        self.assertAlmostEqual(moment["evidence"]["fraction"], 0.32, places=2)
        self.assertFalse(moment["lesson_completed"])

    def test_small_position_does_not_trigger(self) -> None:
        service, store = _service()
        store.account["openPositions"] = [
            {"symbolId": "AAPL", "side": "long", "quantity": 10, "averagePrice": 200.0, "pnl": 0.0}
        ]
        self.assertEqual(service.get_moments(), [])

    def test_rapid_fire_entries_trigger_trading_plan_lesson(self) -> None:
        service, store = _service()
        store.intents = [{"symbol": "ETHUSD"}] * 3 + [{"symbol": "AAPL"}] * 2
        moments = service.get_moments()
        self.assertEqual(len(moments), 1)
        self.assertEqual(moments[0]["type"], "rapid_fire_entries")
        self.assertEqual(moments[0]["lesson_id"], "expert-05-trading-plan")
        self.assertEqual(moments[0]["evidence"]["count"], 3)

    def test_unprotected_drawdown_triggers_atr_lesson(self) -> None:
        service, store = _service()
        store.account["openPositions"] = [
            {
                "symbolId": "SOLUSD",
                "side": "long",
                "quantity": 50,
                "averagePrice": 150.0,
                "pnl": -2500.0,
            }
        ]
        moments = service.get_moments()
        types = {moment["type"] for moment in moments}
        self.assertIn("unprotected_drawdown", types)
        drawdown = next(m for m in moments if m["type"] == "unprotected_drawdown")
        self.assertEqual(drawdown["lesson_id"], "intermediate-03-atr")

    def test_active_alert_suppresses_drawdown_moment(self) -> None:
        service, store = _service()
        store.account["openPositions"] = [
            {
                "symbolId": "SOLUSD",
                "side": "long",
                "quantity": 50,
                "averagePrice": 150.0,
                "pnl": -2500.0,
            }
        ]
        store.alerts = [{"symbolId": "SOLUSD", "status": "armed"}]
        types = {moment["type"] for moment in service.get_moments()}
        self.assertNotIn("unprotected_drawdown", types)

    def test_completed_lessons_sort_last(self) -> None:
        service, store = _service()
        store.account["openPositions"] = [
            {
                "symbolId": "BTCUSD",
                "side": "long",
                "quantity": 0.5,
                "averagePrice": 64000.0,
                "pnl": 0.0,
            }
        ]
        store.intents = [{"symbol": "ETHUSD"}] * 3
        store.progress = {"intermediate-05-position-sizing": {"completed_at": "2026-06-01"}}
        moments = service.get_moments()
        self.assertEqual(moments[-1]["lesson_id"], "intermediate-05-position-sizing")
        self.assertTrue(moments[-1]["lesson_completed"])

    def test_moments_route(self) -> None:
        app = FastAPI()
        service, store = _service()
        store.account["openPositions"] = [
            {
                "symbolId": "BTCUSD",
                "side": "long",
                "quantity": 0.5,
                "averagePrice": 64000.0,
                "pnl": 0.0,
            }
        ]
        app.state.learn_moments_service = service
        app.include_router(learn_router)
        client = TestClient(app)
        response = client.get("/api/learn/moments")
        self.assertEqual(response.status_code, 200)
        items = response.json()["items"]
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["type"], "oversized_position")


class _Analytics:
    def __init__(self, closes):
        self.closes = closes

    def list_market_series(self, minimum_candles=20):
        return [{"symbol": "BTCUSD", "timeframe": "1h"}]

    def list_market_candles(self, symbol, timeframe, limit=20):
        return {"items": [{"close": c} for c in self.closes]}


class MomentsV2Tests(unittest.TestCase):
    def test_poor_planned_rr_detected(self) -> None:
        service, store = _service()
        store.intents = [
            {
                "id": "1",
                "symbol": "BTCUSD",
                "side": "long",
                "entryPrice": 100.0,
                "planStop": 90.0,
                "planTarget": 104.0,
            }
        ]
        moments = service.get_moments()
        match = next(m for m in moments if m["type"] == "poor_planned_rr")
        self.assertEqual(match["evidence"]["rr"], 0.4)

    def test_healthy_rr_not_flagged(self) -> None:
        service, store = _service()
        store.intents = [
            {
                "id": "1",
                "symbol": "BTCUSD",
                "side": "long",
                "entryPrice": 100.0,
                "planStop": 95.0,
                "planTarget": 110.0,
            }
        ]
        self.assertFalse([m for m in service.get_moments() if m["type"] == "poor_planned_rr"])

    def test_overtrading_cadence_fires_at_six_today(self) -> None:
        from datetime import UTC, datetime

        today = datetime.now(UTC).isoformat()
        service, store = _service()
        store.intents = [{"id": str(n), "symbol": f"S{n}", "submittedAt": today} for n in range(6)]
        types = [m["type"] for m in service.get_moments()]
        self.assertIn("overtrading_cadence", types)

    def test_journal_skipping_counts_unannotated_executed_trades(self) -> None:
        service, store = _service()
        store.intents = [{"id": str(n), "symbol": f"S{n}", "status": "executed"} for n in range(3)]
        match = next(m for m in service.get_moments() if m["type"] == "journal_skipping")
        self.assertEqual(match["evidence"]["unjournaled"], 3)
        store.journal_notes = {"0": {"note": "x", "tags": []}}
        self.assertFalse([m for m in service.get_moments() if m["type"] == "journal_skipping"])

    def test_regime_mismatch_flags_long_in_downtrend(self) -> None:
        store = _StateStore()
        closes = [100 - n for n in range(20)]  # steady downtrend
        service = LearnMomentsService(store, _Analytics(closes))
        store.intents = [{"id": "1", "symbol": "BTCUSD", "side": "long"}]
        match = next(m for m in service.get_moments() if m["type"] == "regime_mismatch")
        self.assertLess(match["evidence"]["trend_fraction"], 0)

    def test_regime_mismatch_quiet_without_analytics(self) -> None:
        service, store = _service()
        store.intents = [{"id": "1", "symbol": "BTCUSD", "side": "long"}]
        self.assertFalse([m for m in service.get_moments() if m["type"] == "regime_mismatch"])


if __name__ == "__main__":
    unittest.main()
