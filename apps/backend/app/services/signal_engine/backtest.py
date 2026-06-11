# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Ladder backtest simulation over historical candidate setups.

The simulator sizes partial exits with the exact weights the signal shows the
user and takes the stop honestly when price trades through it.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from app.services.signal_engine.models import TP_LADDER_WEIGHTS, SeriesIndicators
from app.services.signal_engine.statistics import (
    drawdown_curve,
    equity_curve,
    profit_factor,
    sharpe_ratio,
    sortino_ratio,
)


def max_hold_bars(timeframe: str) -> int:
    return {
        "15m": 32,
        "1h": 24,
        "4h": 18,
        "1d": 12,
    }.get(timeframe, 14)


def test_period(candles: list[dict[str, Any]]) -> str:
    if not candles:
        return ""
    start = candles[0]["open_time_utc"].split("T", 1)[0]
    end = candles[-1]["open_time_utc"].split("T", 1)[0]
    return f"{start} to {end}"


def simulate_ladder_trade(
    indicators: SeriesIndicators,
    index: int,
    direction: str,
    entry: float,
    stop_loss: float,
    take_profit: list[float],
    max_hold_bars: int,
    round_trip_cost: float,
) -> float | None:
    risk_per_unit = abs(entry - stop_loss)
    if risk_per_unit <= 0:
        return None

    remaining = 1.0
    realized_r = 0.0
    rungs = list(zip(take_profit, TP_LADDER_WEIGHTS))
    hit = [False] * len(rungs)

    last_index = min(index + max_hold_bars, len(indicators.closes) - 1)
    for forward_index in range(index + 1, last_index + 1):
        bar_high = indicators.highs[forward_index]
        bar_low = indicators.lows[forward_index]

        if direction == "long":
            if bar_low <= stop_loss:
                realized_r += remaining * ((stop_loss - entry) / risk_per_unit)
                remaining = 0.0
                break
            for rung_index, (level, weight) in enumerate(rungs):
                if not hit[rung_index] and bar_high >= level:
                    hit[rung_index] = True
                    realized_r += weight * ((level - entry) / risk_per_unit)
                    remaining = max(0.0, remaining - weight)
        else:
            if bar_high >= stop_loss:
                realized_r += remaining * ((entry - stop_loss) / risk_per_unit)
                remaining = 0.0
                break
            for rung_index, (level, weight) in enumerate(rungs):
                if not hit[rung_index] and bar_low <= level:
                    hit[rung_index] = True
                    realized_r += weight * ((entry - level) / risk_per_unit)
                    remaining = max(0.0, remaining - weight)

        if remaining <= 1e-9:
            break

    if remaining > 1e-9:
        exit_price = indicators.closes[last_index]
        if direction == "long":
            realized_r += remaining * ((exit_price - entry) / risk_per_unit)
        else:
            realized_r += remaining * ((entry - exit_price) / risk_per_unit)

    cost_r = (entry * round_trip_cost) / risk_per_unit
    return realized_r - cost_r


def run_backtest(
    candles: list[dict[str, Any]],
    indicators: SeriesIndicators,
    timeframe: str,
    setup_type: str,
    direction: str,
    fees_percent: float,
    slippage_percent: float,
    train_test_split: int,
    min_backtest_sample: int,
    candidate_fn: Callable[[int], list[dict[str, Any]]],
) -> dict[str, Any]:
    hold_bars = max_hold_bars(timeframe)
    # Chronological list of (entry_index, net_R) so we can split honestly by time.
    trades: list[tuple[int, float]] = []
    round_trip_cost = ((fees_percent + slippage_percent) * 2) / 100

    for index in range(60, len(candles) - hold_bars - 1):
        candidates = candidate_fn(index)
        match = next(
            (
                candidate
                for candidate in candidates
                if candidate["setup_type"] == setup_type and candidate["direction"] == direction
            ),
            None,
        )
        if match is None or match["signal"] not in {"BUY_ZONE", "SELL", "WATCH", "HOLD"}:
            continue

        net_r = simulate_ladder_trade(
            indicators=indicators,
            index=index,
            direction=direction,
            entry=match["reference_price"],
            stop_loss=match["stop_loss"],
            take_profit=match["take_profit"],
            max_hold_bars=hold_bars,
            round_trip_cost=round_trip_cost,
        )
        if net_r is None:
            continue
        trades.append((index, net_r))

    if not trades:
        return {
            "win_rate": 0.0,
            "expectancy": 0.0,
            "trade_count": 0,
            "avg_r": 0.0,
            "in_sample_win_rate": 0.0,
            "out_of_sample_win_rate": 0.0,
            "in_sample_trade_count": 0,
            "out_of_sample_trade_count": 0,
            "in_sample_expectancy": 0.0,
            "out_of_sample_expectancy": 0.0,
            "out_of_sample_validated": False,
            "wins": 0,
            "sum_r": 0.0,
            "max_drawdown": 0.0,
            "sharpe": 0.0,
            "sortino": 0.0,
            "profit_factor": 0.0,
            "equity_curve": [100.0],
            "drawdown_curve": [0.0],
            "out_of_sample_outcomes": [],
            "test_period": test_period(candles),
        }

    outcomes = [net_r for _, net_r in trades]
    # Honest in-sample / out-of-sample split by time. No blending of the two blocks.
    split_index = max(1, int(len(outcomes) * (train_test_split / 100)))
    in_sample = outcomes[:split_index]
    out_of_sample = outcomes[split_index:]

    in_sample_win_rate = (
        (sum(1 for value in in_sample if value > 0) / len(in_sample)) if in_sample else 0.0
    )
    in_sample_expectancy = (sum(in_sample) / len(in_sample)) if in_sample else 0.0
    out_of_sample_win_rate = (
        (sum(1 for value in out_of_sample if value > 0) / len(out_of_sample))
        if out_of_sample
        else 0.0
    )
    out_of_sample_expectancy = (sum(out_of_sample) / len(out_of_sample)) if out_of_sample else 0.0

    win_rate = sum(1 for value in outcomes if value > 0) / len(outcomes)
    expectancy = sum(outcomes) / len(outcomes)

    out_of_sample_validated = (
        len(out_of_sample) >= min_backtest_sample and out_of_sample_expectancy > 0.0
    )

    equity_values = equity_curve(outcomes)
    drawdown_values = drawdown_curve(equity_values)

    return {
        "win_rate": win_rate,
        "expectancy": expectancy,
        "trade_count": len(outcomes),
        "avg_r": expectancy,
        "in_sample_win_rate": in_sample_win_rate,
        "out_of_sample_win_rate": out_of_sample_win_rate,
        "in_sample_trade_count": len(in_sample),
        "out_of_sample_trade_count": len(out_of_sample),
        "in_sample_expectancy": in_sample_expectancy,
        "out_of_sample_expectancy": out_of_sample_expectancy,
        "out_of_sample_validated": out_of_sample_validated,
        "wins": sum(1 for value in outcomes if value > 0),
        "sum_r": sum(outcomes),
        "max_drawdown": min(drawdown_values),
        "sharpe": sharpe_ratio(outcomes),
        "sortino": sortino_ratio(outcomes),
        "profit_factor": profit_factor(outcomes),
        "equity_curve": equity_values,
        "drawdown_curve": drawdown_values,
        "out_of_sample_outcomes": out_of_sample,
        "test_period": test_period(candles),
    }
