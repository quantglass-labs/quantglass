# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Backtest workbench (BT-1..3): stress, Monte Carlo, bias gates, fingerprint.

The institutional-workbench vision (docs/backtesting/) treats a backtest as
an audited research artifact, not a single number. Everything here is
derived from the run itself: stress rows re-run the same simulation under
worse costs (an honest cost-model stress — we do not pretend to model
microstructure we cannot see), Monte Carlo resamples the run's own trade
outcomes, bias gates state what this engine does and does not control for,
and the fingerprint makes the experiment reproducible.
"""

from __future__ import annotations

import hashlib
import random
from collections.abc import Callable
from typing import Any

MONTE_CARLO_RUNS = 400


def stress_table(
    rerun: Callable[[float, float], dict[str, Any]],
    fees_percent: float,
    slippage_percent: float,
    base: dict[str, Any],
) -> list[dict[str, Any]]:
    """Re-run the identical simulation under stressed cost assumptions."""

    def row(name: str, result: dict[str, Any]) -> dict[str, Any]:
        return {
            "scenario": name,
            "expectancy_r": round(result["expectancy"], 3),
            "win_rate": round(result["win_rate"], 4),
            "profit_factor": round(result["profit_factor"], 2),
            "trade_count": result["trade_count"],
        }

    rows = [row("Base costs", base)]
    rows.append(row("Slippage x2", rerun(fees_percent, slippage_percent * 2)))
    rows.append(row("Slippage x3", rerun(fees_percent, slippage_percent * 3)))
    rows.append(row("Fees + slippage x2", rerun(fees_percent * 2, slippage_percent * 2)))
    return rows


def monte_carlo_drawdowns(outcomes: list[float], runs: int = MONTE_CARLO_RUNS) -> dict[str, Any]:
    """Resample the run's own R outcomes into a max-drawdown distribution.

    Resampling with replacement breaks streak clustering, so real drawdowns
    can exceed these figures — the payload says so rather than hiding it.
    """
    if len(outcomes) < 10:
        return {"available": False, "reason": "Fewer than 10 trades — distribution would mislead."}
    rng = random.Random(20260612)  # deterministic: same run, same distribution
    max_drawdowns: list[float] = []
    for _ in range(runs):
        equity = 0.0
        peak = 0.0
        worst = 0.0
        for _ in range(len(outcomes)):
            equity += rng.choice(outcomes)
            peak = max(peak, equity)
            worst = min(worst, equity - peak)
        max_drawdowns.append(worst)
    max_drawdowns.sort()
    return {
        "available": True,
        "runs": runs,
        "sample": len(outcomes),
        "median_max_drawdown_r": round(max_drawdowns[len(max_drawdowns) // 2], 2),
        "p95_max_drawdown_r": round(max_drawdowns[int(len(max_drawdowns) * 0.05)], 2),
        "caveat": ("Resampling breaks streak clustering; live drawdowns can exceed these figures."),
    }


def bias_gates(
    backtest: dict[str, Any],
    min_backtest_sample: int,
    fees_percent: float,
    slippage_percent: float,
    walk_forward: bool,
) -> list[dict[str, Any]]:
    """What this run controls for, what it does not. Honesty over green ticks."""

    def gate(gate_id: str, label: str, status: str, evidence: str) -> dict[str, Any]:
        return {"id": gate_id, "label": label, "status": status, "evidence": evidence}

    sample = backtest["trade_count"]
    gates = [
        gate(
            "lookahead",
            "Look-ahead bias",
            "pass",
            "Signals evaluate closed candles only; outcomes replay strictly forward bars.",
        ),
        gate(
            "costs",
            "Execution costs modeled",
            "pass" if (fees_percent + slippage_percent) > 0 else "fail",
            f"Round trip charged at {(fees_percent + slippage_percent) * 2:.2f}% "
            "(fees + slippage, both sides).",
        ),
        gate(
            "sample",
            "Sample size",
            "pass" if sample >= min_backtest_sample else "warn",
            f"{sample} trades vs a {min_backtest_sample}-trade bar.",
        ),
        gate(
            "oos",
            "Out-of-sample validation",
            "pass" if backtest["out_of_sample_validated"] else "warn",
            f"OOS block: {backtest['out_of_sample_trade_count']} trades, "
            f"expectancy {backtest['out_of_sample_expectancy']:.2f}R.",
        ),
        gate(
            "walk_forward",
            "Walk-forward",
            "pass" if walk_forward else "warn",
            "Chronological IS/OOS split with no blending."
            if walk_forward
            else "Walk-forward disabled for this run.",
        ),
        gate(
            "survivorship",
            "Survivorship bias",
            "info",
            "Single-symbol corridor data; no delisted-universe handling. Applies to "
            "watchlist scans, not index studies.",
        ),
        gate(
            "snooping",
            "Data snooping",
            "info",
            "Parameter families are fixed engine-wide (stops 1.3-1.6 ATR, ladder "
            "50/30/20); per-run parameter sweeps are not performed.",
        ),
    ]
    return gates


def experiment_fingerprint(
    symbol_id: str,
    timeframe: str,
    setup_type: str,
    direction: str,
    fees_percent: float,
    slippage_percent: float,
    train_test_split: int,
    first_candle: str,
    last_candle: str,
) -> dict[str, str]:
    payload = "|".join(
        [
            symbol_id,
            timeframe,
            setup_type,
            direction,
            f"{fees_percent:.4f}",
            f"{slippage_percent:.4f}",
            str(train_test_split),
            first_candle,
            last_candle,
        ]
    )
    return {
        "experiment_id": hashlib.sha256(payload.encode()).hexdigest()[:16],
        "dataset_range": f"{first_candle} → {last_candle}",
    }
