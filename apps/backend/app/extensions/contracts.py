# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Backward-compatible re-export; canonical home is ``quantglass_sdk.contracts``."""

from quantglass_sdk.contracts import (
    BacktestModelPlugin,
    DataQualityPlugin,
    IndicatorPlugin,
    StrategyCandidate,
    StrategyPlugin,
)

__all__ = [
    "BacktestModelPlugin",
    "DataQualityPlugin",
    "IndicatorPlugin",
    "StrategyCandidate",
    "StrategyPlugin",
]
