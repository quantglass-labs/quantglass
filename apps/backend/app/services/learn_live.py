# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Live-data exercises: lesson practice computed from real engine values.

Lessons opt in by declaring ``"live_exercise": "<generator>"`` in their JSON;
each generator builds a question from the learner's actual market data and
paper balance and recomputes the expected answer statelessly on check (the
client returns the parameters it was shown). Adding a generator here plus one
JSON field makes any lesson live. Educational use only — never advice.
"""

from __future__ import annotations

from typing import Any

from app.services.learn_service import _load_lessons
from app.services.signal_engine.indicators import atr as compute_atr

STOP_MULTIPLE = 1.45
REWARD_MULTIPLE = 2.4
RISK_FRACTION = 0.01
CRYPTO_ROUND_TRIP = 0.003  # (0.10% fee + 0.05% slippage) x 2 sides
TOLERANCE_PERCENT = 1.0


def _gen_atr_stop(market: dict[str, Any], _account: dict[str, Any]) -> dict[str, Any]:
    return {
        "question": (
            f"{market['symbol']} just closed at {market['close']:,.2f} with a live ATR-14 of "
            f"{market['atr']:,.2f}. Using the normal-regime stop multiple of {STOP_MULTIPLE}, "
            "where does the stop-loss go for a long entry at the close?"
        ),
        "hint": "stop_loss = close − (ATR × stop_multiple)",
        "params": {"symbol": market["symbol"], "close": market["close"], "atr": market["atr"]},
    }


def _exp_atr_stop(params: dict[str, Any]) -> float:
    return float(params["close"]) - float(params["atr"]) * STOP_MULTIPLE


def _gen_position_size(market: dict[str, Any], account: dict[str, Any]) -> dict[str, Any]:
    balance = float(account.get("balance") or 0.0)
    return {
        "question": (
            f"Your paper account balance is {balance:,.2f}. Risking "
            f"{RISK_FRACTION * 100:.0f}% per trade on {market['symbol']} — entry at the live "
            f"close {market['close']:,.2f}, stop {STOP_MULTIPLE} × live ATR "
            f"({market['atr']:,.2f}) below — how many units do you buy?"
        ),
        "hint": "units = (balance × risk%) ÷ (ATR × stop_multiple)",
        "params": {
            "symbol": market["symbol"],
            "close": market["close"],
            "atr": market["atr"],
            "balance": balance,
        },
    }


def _exp_position_size(params: dict[str, Any]) -> float:
    return (float(params["balance"]) * RISK_FRACTION) / (float(params["atr"]) * STOP_MULTIPLE)


def _gen_target_price(market: dict[str, Any], _account: dict[str, Any]) -> dict[str, Any]:
    return {
        "question": (
            f"{market['symbol']} long at the live close {market['close']:,.2f}; the stop sits "
            f"{STOP_MULTIPLE} × ATR ({market['atr']:,.2f}) below. At the engine's "
            f"{REWARD_MULTIPLE}R reward multiple, what price is the middle take-profit rung?"
        ),
        "hint": "target = close + (ATR × stop_multiple × reward_multiple)",
        "params": {"symbol": market["symbol"], "close": market["close"], "atr": market["atr"]},
    }


def _exp_target_price(params: dict[str, Any]) -> float:
    return float(params["close"]) + float(params["atr"]) * STOP_MULTIPLE * REWARD_MULTIPLE


def _gen_round_trip_cost(market: dict[str, Any], _account: dict[str, Any]) -> dict[str, Any]:
    notional = float(market["close"])
    return {
        "question": (
            f"You buy exactly one unit of {market['symbol']} at its live close "
            f"{market['close']:,.2f}. Using the engine's crypto defaults "
            "(0.10% fee + 0.05% slippage per side), what is the round-trip cost in dollars?"
        ),
        "hint": "cost = notional × (fee% + slippage%) × 2 sides",
        "params": {"symbol": market["symbol"], "close": notional},
    }


def _exp_round_trip_cost(params: dict[str, Any]) -> float:
    return float(params["close"]) * CRYPTO_ROUND_TRIP


def _gen_stop_distance_pct(market: dict[str, Any], _account: dict[str, Any]) -> dict[str, Any]:
    return {
        "question": (
            f"{market['symbol']} closes at {market['close']:,.2f} with ATR-14 "
            f"{market['atr']:,.2f}. In the normal volatility regime (stop multiple "
            f"{STOP_MULTIPLE}), how far away is the stop as a percentage of price?"
        ),
        "hint": "distance% = (ATR × stop_multiple) ÷ close × 100",
        "params": {"symbol": market["symbol"], "close": market["close"], "atr": market["atr"]},
    }


def _exp_stop_distance_pct(params: dict[str, Any]) -> float:
    return float(params["atr"]) * STOP_MULTIPLE / float(params["close"]) * 100


GENERATORS: dict[str, tuple[Any, Any]] = {
    "atr_stop": (_gen_atr_stop, _exp_atr_stop),
    "position_size": (_gen_position_size, _exp_position_size),
    "target_price": (_gen_target_price, _exp_target_price),
    "round_trip_cost": (_gen_round_trip_cost, _exp_round_trip_cost),
    "stop_distance_pct": (_gen_stop_distance_pct, _exp_stop_distance_pct),
}


def _lesson_generators() -> dict[str, str]:
    return {
        lesson["id"]: lesson["live_exercise"]
        for lesson in _load_lessons()
        if lesson.get("live_exercise")
    }


class LearnLiveExerciseService:
    """Builds and checks live exercises from real market and account state."""

    def __init__(self, state_store: Any, analytics_store: Any) -> None:
        self._state_store = state_store
        self._analytics_store = analytics_store

    def supports(self, lesson_id: str) -> bool:
        return _lesson_generators().get(lesson_id) in GENERATORS

    def build_exercise(self, lesson_id: str) -> dict[str, Any] | None:
        generator_id = _lesson_generators().get(lesson_id)
        if generator_id not in GENERATORS:
            return None
        market = self._latest_market_values()
        if market is None:
            return None
        account = self._state_store.get_paper_account()
        if generator_id == "position_size" and float(account.get("balance") or 0.0) <= 0:
            return None
        build, _ = GENERATORS[generator_id]
        exercise = build(market, account)
        return {
            "lesson_id": lesson_id,
            "type": "live_numeric",
            "tolerance_percent": TOLERANCE_PERCENT,
            **exercise,
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
            "explanation": (
                f"Expected ≈ {expected:,.4f}, computed from the live values you were shown. "
                "Rework the hint's formula with those exact numbers."
            ),
            "score": 10 if correct else 0,
        }

    def expected_answer(self, lesson_id: str, params: dict[str, Any]) -> float | None:
        generator_id = _lesson_generators().get(lesson_id)
        if generator_id not in GENERATORS:
            return None
        _, expected = GENERATORS[generator_id]
        try:
            value = expected(params)
        except (KeyError, TypeError, ValueError):
            return None
        if value != value or value in (float("inf"), float("-inf")):  # NaN/inf guard
            return None
        return value

    def _latest_market_values(self) -> dict[str, Any] | None:
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
        return {"symbol": series["symbol"], "close": close, "atr": float(atr14)}
