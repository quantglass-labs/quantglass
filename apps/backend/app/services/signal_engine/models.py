# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol


class SignalNarrator(Protocol):
    def narrate(self, facts: dict[str, Any]) -> tuple[str, str]: ...


@dataclass(frozen=True)
class SeriesIndicators:
    closes: list[float]
    highs: list[float]
    lows: list[float]
    volumes: list[float]
    ema21: list[float | None]
    sma50: list[float | None]
    rsi14: list[float | None]
    rsi2: list[float | None]
    atr14: list[float | None]
    adx14: list[float | None]
    macd_hist: list[float | None]
    bb_upper: list[float | None]
    bb_lower: list[float | None]
    bb_mid: list[float | None]
    bb_bandwidth: list[float | None]
    donchian_high: list[float | None]
    donchian_low: list[float | None]
    keltner_upper: list[float | None]
    keltner_lower: list[float | None]


# Scale-out weights for the displayed 3-rung take-profit ladder. Backtests must size
# partial exits identically to what the signal shows the user.
TP_LADDER_WEIGHTS = (0.5, 0.3, 0.2)
