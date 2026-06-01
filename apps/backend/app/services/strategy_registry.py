# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Literal

StrategyDirection = Literal["long", "short", "both"]


@dataclass(frozen=True, slots=True)
class StrategyDefinition:
    id: str
    name: str
    description: str
    setup_types: tuple[str, ...]
    direction: StrategyDirection
    market_types: tuple[str, ...] = ("crypto", "stocks")
    timeframes: tuple[str, ...] = ("15m", "1h", "4h", "1d")
    source: Literal["built-in", "extension"] = "built-in"
    extension_id: str | None = None

    def as_dict(self) -> dict[str, object]:
        return asdict(self)


class StrategyRegistry:
    def __init__(self) -> None:
        self._definitions: dict[str, StrategyDefinition] = {}
        for definition in built_in_strategies():
            self.register(definition)

    def register(self, definition: StrategyDefinition) -> None:
        self._definitions[definition.id] = definition

    def items(self) -> list[dict[str, object]]:
        return [
            definition.as_dict()
            for definition in sorted(self._definitions.values(), key=lambda item: item.id)
        ]

    def get(self, strategy_id: str) -> StrategyDefinition | None:
        return self._definitions.get(strategy_id)


def built_in_strategies() -> tuple[StrategyDefinition, ...]:
    return (
        StrategyDefinition(
            id="trend-pullback",
            name="Trend Pullback",
            description="EMA/SMA trend continuation setup using closed candles, RSI, volume, and volatility context.",
            setup_types=("ema_reclaim_pullback", "daily_trend_pullback", "trend_hold_continuation"),
            direction="long",
        ),
        StrategyDefinition(
            id="trend-rejection-breakdown",
            name="Trend Rejection Breakdown",
            description="Short-side trend rejection and breakdown continuation setup.",
            setup_types=("trend_rejection_breakdown", "breakdown_watch"),
            direction="short",
        ),
        StrategyDefinition(
            id="breakout-retest",
            name="Breakout Retest",
            description="Donchian/Keltner breakout or breakdown continuation setup with volume confirmation.",
            setup_types=("breakout_retest_continuation", "breakdown_retest_continuation"),
            direction="both",
        ),
        StrategyDefinition(
            id="range-mean-reversion",
            name="Range Mean Reversion",
            description="RSI2 and Bollinger-band mean reversion setup for ranging regimes.",
            setup_types=("range_meanreversion_long", "range_meanreversion_short", "range_reset"),
            direction="both",
        ),
    )
