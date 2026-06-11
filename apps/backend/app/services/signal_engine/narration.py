# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Deterministic narration templates. The template path is the guaranteed
fallback whenever no AI narrator is configured or a narrator fails."""

from __future__ import annotations

from typing import Any


def template_explanation(facts: dict[str, Any]) -> str:
    if facts["backtest_sample_size"]:
        validation = (
            "out-of-sample validated"
            if facts["out_of_sample_validated"]
            else "not yet out-of-sample validated"
        )
        metrics_text = (
            f"This {facts['setup_type']} pattern backtests at {facts['backtested_winrate_pct']:.0f}% win rate "
            f"with {facts['backtested_expectancy_R']:.2f}R expectancy across {facts['backtest_sample_size']} samples ({validation})."
        )
    else:
        metrics_text = (
            "Historical sample size is still too small to produce a reliable expectancy estimate."
        )
    return (
        f"{facts['symbol']} is in a {facts['signal'].lower().replace('_', ' ')} state on the closed {facts['timeframe']} "
        f"candle ({facts['market_regime']} regime) with {facts['confidence']}% confidence. "
        f"{facts['reasons'][0]} {facts['reasons'][1]} {metrics_text}"
    )


def build_invalidation(direction: str, timeframe: str, stop_loss: float) -> str:
    direction_phrase = "below" if direction == "long" else "above"
    return f"{timeframe} close {direction_phrase} {stop_loss:.2f}"
