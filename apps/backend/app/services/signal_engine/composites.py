# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Honest composite flags (SIG-7): the ML/composite family without the ML.

Every flag here is derived from the engine's own pooled backtest
distributions and freshness data — never from a model we cannot show the
user. Follow-through probability IS the calibrated pooled win rate; a
false-breakout warning IS a breakout family whose own history says it
fails; signal decay IS staleness measured against the timeframe. No
fabricated inference, ever.
"""

from __future__ import annotations

from typing import Any

from app.services.signal_engine.statistics import calibrate_win_rate

FOLLOW_THROUGH_HIGH = 0.60
FOLLOW_THROUGH_LOW = 0.42
FALSE_BREAK_BAR = 0.45

# Bars of staleness after which a signal is decaying, per timeframe.
DECAY_SECONDS = {"15m": 2 * 900, "1h": 2 * 3600, "4h": 2 * 14400, "1d": 2 * 86400}

_BREAK_FAMILY_PREFIXES = ("breakout", "breakdown", "squeeze_release", "gap_and_go")


def derive_composite_flags(
    setup_type: str,
    pooled: dict[str, Any],
    min_backtest_sample: int,
    data_age_seconds: int | None,
    timeframe: str,
) -> list[dict[str, Any]]:
    flags: list[dict[str, Any]] = []

    def flag(flag_id: str, name: str, message: str) -> None:
        flags.append(
            {
                "id": flag_id,
                "family": "composite",
                "layer": "expert",
                "display_name": name,
                "message": message,
            }
        )

    sample = int(pooled.get("sample_size") or 0)
    if sample >= min_backtest_sample:
        calibrated = calibrate_win_rate(
            float(pooled.get("win_rate") or 0.0), sample, float(min_backtest_sample)
        )
        if calibrated >= FOLLOW_THROUGH_HIGH:
            flag(
                "follow_through_high",
                "Probability of Follow-Through: High",
                f"Calibrated pooled win rate is {calibrated:.0%} over {sample} trades of "
                "this setup across the watchlist.",
            )
        elif calibrated <= FOLLOW_THROUGH_LOW:
            flag(
                "follow_through_low",
                "Probability of Follow-Through: Low",
                f"Calibrated pooled win rate is only {calibrated:.0%} over {sample} trades "
                "— this setup's own history argues against it.",
            )
        if (
            any(setup_type.startswith(prefix) for prefix in _BREAK_FAMILY_PREFIXES)
            and calibrated < FALSE_BREAK_BAR
        ):
            flag(
                "false_break_probability_high",
                "False Breakout Probability: High",
                f"This break-style setup resolves against the break {1 - calibrated:.0%} of "
                "the time in its own pooled history.",
            )

    decay_limit = DECAY_SECONDS.get(timeframe)
    if decay_limit is not None and data_age_seconds is not None and data_age_seconds > decay_limit:
        flag(
            "signal_decay_warning",
            "Signal Decay Warning",
            f"Data is {data_age_seconds // 3600}h old — more than two {timeframe} bars. "
            "The market this signal describes may no longer exist.",
        )
    return flags
