# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Signal taxonomy (SIG-1): families, layers, classes, and the detector map.

Vocabulary from docs/signal-engine/advanced_signal_engine_taxonomy.md, adopted
selectively: every detector listed here flows through the evidence pipeline
(backtest, shrinkage, conformal, OOS cap) or is explicitly a *context* or
*risk* signal that carries no trade geometry. Families we cannot back with
honest data (order flow, options surface, social sentiment) are declined, not
faked.

Three signal classes:
  setup   — tradeable geometry (entry/stop/target) + backtest evidence
  context — names the environment (regimes, volatility states); gates setups
  risk    — portfolio/conduct warnings; brakes, never trades
"""

from __future__ import annotations

from dataclasses import dataclass

FAMILIES = {
    "technical": "Technical Signals",
    "market-structure": "Market Structure Signals",
    "volatility": "Volatility Signals",
    "relative-strength": "Relative Strength Signals",
    "statistical": "Statistical Signals",
    "regime": "Regime Signals",
    "portfolio-risk": "Portfolio / Risk Meta-Signals",
    "composite": "ML / Composite Signals",
}

LAYERS = ("beginner", "advanced", "expert")
SIGNAL_CLASSES = ("setup", "context", "risk")


@dataclass(frozen=True, slots=True)
class DetectorDefinition:
    """Declarative metadata for one detector's taxonomy placement."""

    setup_type: str
    display_name: str
    family: str
    layer: str
    signal_class: str
    lesson_id: str = ""
    tags: tuple[str, ...] = ()


# The existing engine detectors, placed in the taxonomy. New detectors
# (SIG-2..8) register here as they ship; anything absent renders untagged.
DETECTORS: tuple[DetectorDefinition, ...] = (
    DetectorDefinition(
        "ema_reclaim_pullback",
        "Pullback Continuation",
        "technical",
        "beginner",
        "setup",
        "advanced-06-trend-pullback",
        ("Trend", "EMA"),
    ),
    DetectorDefinition(
        "daily_trend_pullback",
        "Pullback Continuation (Daily)",
        "technical",
        "beginner",
        "setup",
        "advanced-06-trend-pullback",
        ("Trend", "EMA"),
    ),
    DetectorDefinition(
        "trend_hold_continuation",
        "Higher Low Hold",
        "market-structure",
        "advanced",
        "setup",
        "advanced-06-trend-pullback",
        ("Trend", "Structure"),
    ),
    DetectorDefinition(
        "trend_rejection_breakdown",
        "Resistance Rejection",
        "technical",
        "beginner",
        "setup",
        "advanced-07-trend-rejection",
        ("Trend", "Short"),
    ),
    DetectorDefinition(
        "breakdown_watch",
        "Breakdown",
        "technical",
        "beginner",
        "setup",
        "advanced-07-trend-rejection",
        ("Breakdown", "Short"),
    ),
    DetectorDefinition(
        "breakout_retest_continuation",
        "Breakout Retest",
        "technical",
        "beginner",
        "setup",
        "advanced-08-breakout-retest",
        ("Breakout", "Volume"),
    ),
    DetectorDefinition(
        "breakdown_retest_continuation",
        "Breakdown Retest",
        "technical",
        "beginner",
        "setup",
        "advanced-08-breakout-retest",
        ("Breakdown", "Volume"),
    ),
    DetectorDefinition(
        "range_meanreversion_long",
        "Range Bounce",
        "technical",
        "beginner",
        "setup",
        "advanced-09-mean-reversion",
        ("Range", "Mean Reversion"),
    ),
    DetectorDefinition(
        "range_meanreversion_short",
        "Range Fade",
        "technical",
        "beginner",
        "setup",
        "advanced-09-mean-reversion",
        ("Range", "Mean Reversion"),
    ),
    DetectorDefinition(
        "range_reset",
        "Range Reset",
        "technical",
        "beginner",
        "context",
        "advanced-09-mean-reversion",
        ("Range",),
    ),
)

_BY_SETUP_TYPE = {detector.setup_type: detector for detector in DETECTORS}


def taxonomy_for(setup_type: str) -> dict[str, object]:
    """Family/layer/class/tags for a setup type; safe defaults if unknown."""
    detector = _BY_SETUP_TYPE.get(setup_type)
    if detector is None:
        return {
            "family": "technical",
            "layer": "beginner",
            "signal_class": "setup",
            "display_name": setup_type.replace("_", " ").title(),
            "tags": [],
            "lesson_id": "",
        }
    return {
        "family": detector.family,
        "layer": detector.layer,
        "signal_class": detector.signal_class,
        "display_name": detector.display_name,
        "tags": list(detector.tags),
        "lesson_id": detector.lesson_id,
    }


def derive_quality(
    state: dict[str, object], risk_reward: float, data_age_seconds: int | None
) -> int:
    """Setup quality 0-100: geometry and context, independent of outcome
    evidence (which is what confidence measures). Confluence, trend and
    volume agreement, risk:reward shape, and data freshness."""
    confluence = float(state.get("confluence_score") or 0.0)
    trend = float(state.get("trend_alignment") or 0.0)
    volume = float(state.get("volume_confirmation") or 0.0)

    score = 20.0
    score += confluence * 40.0
    score += trend * 15.0
    score += volume * 10.0
    score += max(0.0, min(risk_reward, 3.0)) / 3.0 * 15.0
    if data_age_seconds is not None and data_age_seconds > 6 * 3600:
        score -= 10.0
    return max(0, min(100, int(round(score))))
