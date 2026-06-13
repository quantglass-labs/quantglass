# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Protocol


@dataclass(frozen=True, slots=True)
class StrategyCandidate:
    setup_type: str
    signal_type: Literal["BUY_ZONE", "SELL", "HOLD", "WAIT", "WATCH"]
    direction: Literal["long", "short"]
    confidence_hint: float
    reasons: tuple[str, ...]
    metadata: dict[str, Any] = field(default_factory=dict)


class StrategyPlugin(Protocol):
    def evaluate(
        self,
        candles: list[dict[str, Any]],
        features: dict[str, list[float | None]],
        context: dict[str, Any],
    ) -> list[StrategyCandidate]: ...


class IndicatorPlugin(Protocol):
    def compute(
        self,
        candles: list[dict[str, Any]],
        context: dict[str, Any],
    ) -> dict[str, list[float | None]]: ...


class BacktestModelPlugin(Protocol):
    def simulate(
        self,
        candles: list[dict[str, Any]],
        entries: list[dict[str, Any]],
        costs: dict[str, float],
        context: dict[str, Any],
    ) -> dict[str, Any]: ...


class DataQualityPlugin(Protocol):
    def inspect(
        self,
        candles: list[dict[str, Any]],
        context: dict[str, Any],
    ) -> list[dict[str, Any]]: ...
