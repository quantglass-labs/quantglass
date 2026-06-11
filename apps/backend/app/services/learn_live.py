# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Live-data exercises: lesson practice computed from real engine values.

Instead of canned textbook numbers, supported lessons can generate an
exercise from the user's actual market data (latest close, real ATR) and the
user's actual paper balance. Answers are checked statelessly: the client
returns the parameters it was shown and the server recomputes the expected
value, so nothing needs to be persisted between question and answer.
Educational use only — never financial advice.
"""

from __future__ import annotations

from typing import Any

from app.services.signal_engine.indicators import atr as compute_atr

STOP_MULTIPLE = 1.45
RISK_FRACTION = 0.01
TOLERANCE_PERCENT = 1.0

LIVE_EXERCISE_LESSONS = {
    "intermediate-03-atr",
    "intermediate-05-position-sizing",
}


class LearnLiveExerciseService:
    """Builds and checks live exercises from real market and account state."""

    def __init__(self, state_store: Any, analytics_store: Any) -> None:
        self._state_store = state_store
        self._analytics_store = analytics_store

    def supports(self, lesson_id: str) -> bool:
        return lesson_id in LIVE_EXERCISE_LESSONS

    def build_exercise(self, lesson_id: str) -> dict[str, Any] | None:
        if not self.supports(lesson_id):
            return None
        market = self._latest_market_values()
        if market is None:
            return None
        symbol, close, atr14 = market

        if lesson_id == "intermediate-03-atr":
            return {
                "lesson_id": lesson_id,
                "type": "live_numeric",
                "question": (
                    f"{symbol} just closed at {close:,.2f} with a live ATR-14 of {atr14:,.2f}. "
                    f"Using the normal-regime stop multiple of {STOP_MULTIPLE}, where does the "
                    "stop-loss go for a long entry at the close?"
                ),
                "hint": "stop_loss = close − (ATR × stop_multiple)",
                "params": {"symbol": symbol, "close": close, "atr": atr14},
                "tolerance_percent": TOLERANCE_PERCENT,
            }

        account = self._state_store.get_paper_account()
        balance = float(account.get("balance") or 0.0)
        if balance <= 0:
            return None
        return {
            "lesson_id": lesson_id,
            "type": "live_numeric",
            "question": (
                f"Your paper account balance is {balance:,.2f}. Risking "
                f"{RISK_FRACTION * 100:.0f}% per trade on {symbol} — entry at the live close "
                f"{close:,.2f}, stop {STOP_MULTIPLE} × live ATR ({atr14:,.2f}) below — "
                "how many units do you buy?"
            ),
            "hint": "units = (balance × risk%) ÷ (ATR × stop_multiple)",
            "params": {"symbol": symbol, "close": close, "atr": atr14, "balance": balance},
            "tolerance_percent": TOLERANCE_PERCENT,
        }

    def check_answer(self, lesson_id: str, answer: str, params: dict[str, Any]) -> dict[str, Any]:
        expected = self.expected_answer(lesson_id, params)
        if expected is None:
            return {
                "correct": False,
                "explanation": "This lesson has no live exercise.",
                "score": 0,
            }
        try:
            given = float(str(answer).replace(",", "").strip())
        except (TypeError, ValueError):
            given = float("nan")
        tolerance = abs(expected) * (TOLERANCE_PERCENT / 100)
        correct = abs(given - expected) <= tolerance
        if correct:
            self._state_store.mark_lesson_complete(lesson_id)
        else:
            self._state_store.record_lesson_attempt(lesson_id)
        return {
            "correct": correct,
            "expected": round(expected, 4),
            "explanation": self._explanation(lesson_id, params, expected),
            "score": 10 if correct else 0,
        }

    def expected_answer(self, lesson_id: str, params: dict[str, Any]) -> float | None:
        try:
            close = float(params["close"])
            atr14 = float(params["atr"])
        except (KeyError, TypeError, ValueError):
            return None
        if atr14 <= 0 or close <= 0:
            return None
        if lesson_id == "intermediate-03-atr":
            return close - (atr14 * STOP_MULTIPLE)
        if lesson_id == "intermediate-05-position-sizing":
            try:
                balance = float(params["balance"])
            except (KeyError, TypeError, ValueError):
                return None
            if balance <= 0:
                return None
            return (balance * RISK_FRACTION) / (atr14 * STOP_MULTIPLE)
        return None

    def _explanation(self, lesson_id: str, params: dict[str, Any], expected: float) -> str:
        if lesson_id == "intermediate-03-atr":
            return (
                f"stop_loss = {float(params['close']):,.2f} − ({float(params['atr']):,.2f} × "
                f"{STOP_MULTIPLE}) = {expected:,.2f}. These are live values from your own data."
            )
        return (
            f"units = ({float(params['balance']):,.2f} × {RISK_FRACTION * 100:.0f}%) ÷ "
            f"({float(params['atr']):,.2f} × {STOP_MULTIPLE}) = {expected:,.4f}. "
            "Sizing from risk keeps every trade's loss identical regardless of volatility."
        )

    def _latest_market_values(self) -> tuple[str, float, float] | None:
        series_list = self._analytics_store.list_market_series(minimum_candles=20)
        if not series_list:
            return None
        series = series_list[0]
        payload = self._analytics_store.list_market_candles(
            series["symbol"], series["timeframe"], limit=60
        )
        candles = payload.get("items") or []
        if len(candles) < 16:
            return None
        atr_values = compute_atr(candles, 14)
        atr14 = atr_values[-1]
        close = float(candles[-1]["close"])
        if atr14 is None or atr14 <= 0 or close <= 0:
            return None
        return series["symbol"], close, float(atr14)
