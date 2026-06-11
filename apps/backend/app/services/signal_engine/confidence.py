# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Signal confidence derivation from setup state and backtest evidence."""

from __future__ import annotations

from typing import Any

from app.services.signal_engine.statistics import calibrate_win_rate


def derive_confidence(
    state: dict[str, Any],
    backtest: dict[str, Any],
    pooled: dict[str, Any],
    min_backtest_sample: int,
) -> int:
    base = 42 if state["signal"] == "WAIT" else 52 if state["signal"] in {"HOLD", "WATCH"} else 58
    score = base
    score += state["trend_alignment"] * 14
    score += state["volume_confirmation"] * 8
    score += (state["confluence_score"] - 0.5) * 18

    # Prefer pooled, calibrated statistics when a credible sample exists; otherwise
    # lean on the single-symbol backtest but damp confidence toward neutral.
    prior_strength = float(min_backtest_sample)
    if pooled["sample_size"] >= min_backtest_sample:
        calibrated_win_rate = calibrate_win_rate(
            pooled["win_rate"], pooled["sample_size"], prior_strength
        )
        score += (calibrated_win_rate - 0.5) * 32
        score += max(min(pooled["expectancy"], 1.0), -1.0) * 10
    else:
        calibrated_win_rate = calibrate_win_rate(
            backtest["win_rate"], backtest["trade_count"], prior_strength
        )
        score += (calibrated_win_rate - 0.5) * 20
        score += max(min(backtest["expectancy"], 1.0), -1.0) * 8
        score -= 8  # thin sample penalty

    if not backtest["out_of_sample_validated"]:
        score = min(score, 62)

    return max(20, min(89, int(round(score))))
