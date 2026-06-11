# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Deterministic signal engine.

Modules:
- ``indicators`` — pure, causal indicator math
- ``setups`` — market regimes and candidate setup families
- ``backtest`` — ladder trade simulation and in/out-of-sample reporting
- ``statistics`` — metric helpers (Sharpe, Sortino, calibration, curves)
- ``confidence`` — confidence derivation from setup state and evidence
- ``narration`` — deterministic narration templates
- ``service`` — the orchestrating :class:`SignalEngineService`
"""

from app.services.signal_engine.models import (
    TP_LADDER_WEIGHTS,
    SeriesIndicators,
    SignalNarrator,
)
from app.services.signal_engine.service import SignalEngineService

# Backwards-compatible alias for the pre-split private name.
_TP_LADDER_WEIGHTS = TP_LADDER_WEIGHTS

__all__ = [
    "SeriesIndicators",
    "SignalEngineService",
    "SignalNarrator",
    "TP_LADDER_WEIGHTS",
]
