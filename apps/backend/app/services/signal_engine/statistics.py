# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Pure statistical helpers behind backtest metrics and confidence."""

from __future__ import annotations

from math import ceil, floor, sqrt


def calibrate_win_rate(raw_win_rate: float, sample_size: int, prior_strength: float) -> float:
    # Shrink toward 0.5 proportionally to how thin the sample is (empirical-Bayes
    # style). Prevents a 100%-of-3 backtest from reading as high confidence.
    if sample_size <= 0:
        return 0.5
    return ((raw_win_rate * sample_size) + (0.5 * prior_strength)) / (sample_size + prior_strength)


def equity_curve(outcomes: list[float]) -> list[float]:
    equity = 100.0
    curve = [equity]
    for outcome in outcomes:
        equity *= 1 + (outcome * 0.012)
        curve.append(max(equity, 1.0))
    return curve


def drawdown_curve(equity_values: list[float]) -> list[float]:
    peak = equity_values[0]
    drawdowns = [0.0]
    for equity in equity_values[1:]:
        peak = max(peak, equity)
        drawdowns.append(((equity - peak) / peak) * 100 if peak else 0.0)
    return drawdowns


def profit_factor(outcomes: list[float]) -> float:
    gross_wins = sum(outcome for outcome in outcomes if outcome > 0)
    gross_losses = abs(sum(outcome for outcome in outcomes if outcome < 0))
    if gross_losses == 0:
        return gross_wins if gross_wins else 0.0
    return gross_wins / gross_losses


def sharpe_ratio(outcomes: list[float]) -> float:
    if len(outcomes) < 2:
        return 0.0
    deviation = standard_deviation(outcomes)
    if deviation == 0:
        return 0.0
    mean = sum(outcomes) / len(outcomes)
    return (mean / deviation) * sqrt(len(outcomes))


def sortino_ratio(outcomes: list[float]) -> float:
    if len(outcomes) < 2:
        return 0.0
    downside = [min(outcome, 0.0) for outcome in outcomes]
    downside_deviation = standard_deviation(downside)
    if downside_deviation == 0:
        return 0.0
    mean = sum(outcomes) / len(outcomes)
    return (mean / downside_deviation) * sqrt(len(outcomes))


def standard_deviation(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0
    mean = sum(values) / len(values)
    variance = sum((value - mean) ** 2 for value in values) / (len(values) - 1)
    return sqrt(variance)


def conformal_interval(
    calibration_outcomes: list[float],
    coverage: float = 0.9,
) -> dict[str, float | int | bool] | None:
    """Split-conformal prediction interval for the next trade outcome (in R).

    Treats the out-of-sample trade outcomes as the calibration set and returns
    a distribution-free interval that contains the next outcome with
    probability >= ``coverage``, assuming exchangeability. Finite-sample valid:
    no normality or variance assumptions. Returns ``None`` when the
    calibration set is too small for the requested coverage (the honest
    answer, rather than an interval without a guarantee).
    """
    n = len(calibration_outcomes)
    if n == 0 or not 0.0 < coverage < 1.0:
        return None
    alpha = 1.0 - coverage
    # Conformal rank adjustment: quantiles of the augmented sample of size n+1.
    # Epsilon guards keep binary floating point (e.g. 1 - 0.9) from shifting ranks.
    lower_rank = floor((n + 1) * (alpha / 2) + 1e-9)
    upper_rank = ceil((n + 1) * (1 - alpha / 2) - 1e-9)
    if lower_rank < 1 or upper_rank > n:
        return None
    ordered = sorted(calibration_outcomes)
    return {
        "coverage": coverage,
        "lower_r": ordered[lower_rank - 1],
        "upper_r": ordered[upper_rank - 1],
        "calibration_sample_size": n,
        "guaranteed": True,
    }
