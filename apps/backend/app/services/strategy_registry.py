# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any
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
    candidate_factory: Callable[[dict[str, Any]], list[dict[str, Any]]] | None = None

    def as_dict(self) -> dict[str, object]:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "setup_types": list(self.setup_types),
            "direction": self.direction,
            "market_types": list(self.market_types),
            "timeframes": list(self.timeframes),
            "source": self.source,
            "extension_id": self.extension_id,
            "executable": self.candidate_factory is not None,
        }


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

    def candidate_setups(self, context: dict[str, Any]) -> list[dict[str, Any]]:
        market_type = str(context.get("market_type") or "")
        timeframe = str(context.get("timeframe") or "")
        candidates: list[dict[str, Any]] = []
        for definition in self._definitions.values():
            if definition.candidate_factory is None:
                continue
            if market_type not in definition.market_types or timeframe not in definition.timeframes:
                continue
            try:
                generated = definition.candidate_factory(context)
            except Exception:
                continue
            if not isinstance(generated, list):
                continue
            for candidate in generated:
                if not isinstance(candidate, dict):
                    continue
                candidates.append(
                    {
                        **candidate,
                        "strategy_id": definition.id,
                        "strategy_name": definition.name,
                        "strategy_source": definition.source,
                        "extension_id": definition.extension_id,
                    }
                )
        return candidates


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
