# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Live-data exercises generated from real market candles and account state."""

import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes.learn import router as learn_router
from app.services.learn_live import LearnLiveExerciseService


def _candles(count: int = 40, close: float = 100.0) -> list[dict]:
    return [
        {
            "open_time_utc": f"2026-06-{(i % 28) + 1:02d}T00:00:00Z",
            "open": close,
            "high": close + 2.0,
            "low": close - 2.0,
            "close": close,
            "volume": 1000.0,
        }
        for i in range(count)
    ]


class _AnalyticsStore:
    def __init__(self, candles=None):
        self.candles = candles if candles is not None else _candles()

    def list_market_series(self, minimum_candles: int = 60):
        if not self.candles:
            return []
        return [{"symbol": "BTCUSD", "timeframe": "1h", "market_type": "crypto", "source": "test"}]

    def list_market_candles(self, symbol, timeframe, limit=60):
        return {"items": self.candles[-limit:]}


class _StateStore:
    def __init__(self) -> None:
        self.completed: list[str] = []
        self.attempts: list[str] = []

    def get_paper_account(self):
        return {"balance": 50000.0, "openPositions": []}

    def mark_lesson_complete(self, lesson_id: str) -> None:
        self.completed.append(lesson_id)

    def record_lesson_attempt(self, lesson_id: str) -> None:
        self.attempts.append(lesson_id)


def _service(candles=None):
    store = _StateStore()
    return LearnLiveExerciseService(store, _AnalyticsStore(candles)), store


class LearnLiveExerciseTests(unittest.TestCase):
    def test_atr_exercise_uses_live_close_and_atr(self) -> None:
        service, _ = _service()
        exercise = service.build_exercise("intermediate-03-atr")
        assert exercise is not None
        # Constant 4-point true range -> ATR-14 = 4.
        self.assertAlmostEqual(exercise["params"]["atr"], 4.0)
        self.assertAlmostEqual(exercise["params"]["close"], 100.0)
        self.assertIn("BTCUSD", exercise["question"])

    def test_correct_live_answer_marks_complete(self) -> None:
        service, store = _service()
        exercise = service.build_exercise("intermediate-03-atr")
        expected = 100.0 - 4.0 * 1.45
        result = service.check_answer("intermediate-03-atr", str(expected), exercise["params"])
        self.assertTrue(result["correct"])
        self.assertEqual(store.completed, ["intermediate-03-atr"])

    def test_wrong_live_answer_records_attempt(self) -> None:
        service, store = _service()
        exercise = service.build_exercise("intermediate-03-atr")
        result = service.check_answer("intermediate-03-atr", "12345", exercise["params"])
        self.assertFalse(result["correct"])
        self.assertEqual(store.attempts, ["intermediate-03-atr"])
        self.assertAlmostEqual(result["expected"], 100.0 - 5.8, places=3)

    def test_position_sizing_uses_paper_balance(self) -> None:
        service, _ = _service()
        exercise = service.build_exercise("intermediate-05-position-sizing")
        assert exercise is not None
        self.assertAlmostEqual(exercise["params"]["balance"], 50000.0)
        expected = (50000.0 * 0.01) / (4.0 * 1.45)
        result = service.check_answer(
            "intermediate-05-position-sizing", f"{expected:.4f}", exercise["params"]
        )
        self.assertTrue(result["correct"])

    def test_unsupported_lesson_returns_none(self) -> None:
        service, _ = _service()
        self.assertIsNone(service.build_exercise("novice-01-candlestick"))

    def test_no_market_data_returns_none(self) -> None:
        service, _ = _service(candles=[])
        self.assertIsNone(service.build_exercise("intermediate-03-atr"))

    def test_tampered_params_still_check_consistently(self) -> None:
        # The check is stateless: whatever params the client returns are the
        # basis for the expected value, so tampering only changes the question.
        service, _ = _service()
        params = {"symbol": "BTCUSD", "close": 200.0, "atr": 10.0}
        result = service.check_answer("intermediate-03-atr", str(200.0 - 14.5), params)
        self.assertTrue(result["correct"])

    def test_routes(self) -> None:
        app = FastAPI()
        service, _ = _service()
        app.state.learn_live_service = service
        app.include_router(learn_router)
        client = TestClient(app)

        response = client.get("/api/learn/lesson/intermediate-03-atr/live-exercise")
        self.assertEqual(response.status_code, 200)
        exercise = response.json()
        check = client.post(
            "/api/learn/lesson/intermediate-03-atr/live-check",
            json={"answer": str(100.0 - 5.8), "params": exercise["params"]},
        )
        self.assertEqual(check.status_code, 200)
        self.assertTrue(check.json()["correct"])

        missing = client.get("/api/learn/lesson/novice-01-candlestick/live-exercise")
        self.assertEqual(missing.status_code, 404)


if __name__ == "__main__":
    unittest.main()


class GeneratorRegistryTests(unittest.TestCase):
    def test_declared_lessons_supported(self) -> None:
        service, _ = _service()
        for lesson_id in (
            "intermediate-03-atr",
            "intermediate-04-risk-reward",
            "intermediate-05-position-sizing",
            "intermediate-23-volatility-regimes",
            "novice-12-fees-slippage",
        ):
            self.assertTrue(service.supports(lesson_id), lesson_id)

    def test_target_price_generator(self) -> None:
        service, _ = _service()
        exercise = service.build_exercise("intermediate-04-risk-reward")
        assert exercise is not None
        # close 100, ATR 4: target = 100 + 4*1.45*2.4 = 113.92
        result = service.check_answer("intermediate-04-risk-reward", "113.92", exercise["params"])
        self.assertTrue(result["correct"])

    def test_round_trip_cost_generator(self) -> None:
        service, _ = _service()
        exercise = service.build_exercise("novice-12-fees-slippage")
        assert exercise is not None
        # one unit at close 100 -> 100 * 0.003 = 0.30
        result = service.check_answer("novice-12-fees-slippage", "0.30", exercise["params"])
        self.assertTrue(result["correct"])

    def test_stop_distance_pct_generator(self) -> None:
        service, _ = _service()
        exercise = service.build_exercise("intermediate-23-volatility-regimes")
        assert exercise is not None
        # 4*1.45/100*100 = 5.8%
        result = service.check_answer(
            "intermediate-23-volatility-regimes", "5.8", exercise["params"]
        )
        self.assertTrue(result["correct"])
