# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Literal


@dataclass(frozen=True, slots=True)
class IndicatorDefinition:
    id: str
    name: str
    category: str
    description: str
    inputs: tuple[str, ...]
    outputs: tuple[str, ...]
    source: Literal["built-in", "extension"] = "built-in"
    extension_id: str | None = None

    def as_dict(self) -> dict[str, object]:
        return asdict(self)


class IndicatorRegistry:
    def __init__(self) -> None:
        self._definitions: dict[str, IndicatorDefinition] = {}
        for definition in built_in_indicators():
            self.register(definition)

    def register(self, definition: IndicatorDefinition) -> None:
        self._definitions[definition.id] = definition

    def items(self) -> list[dict[str, object]]:
        return [
            definition.as_dict()
            for definition in sorted(self._definitions.values(), key=lambda item: item.id)
        ]

    def get(self, indicator_id: str) -> IndicatorDefinition | None:
        return self._definitions.get(indicator_id)


def built_in_indicators() -> tuple[IndicatorDefinition, ...]:
    return (
        IndicatorDefinition(
            id="ema21",
            name="EMA 21",
            category="trend",
            description="Short trend baseline used for pullback/rejection logic.",
            inputs=("close",),
            outputs=("ema21",),
        ),
        IndicatorDefinition(
            id="sma50",
            name="SMA 50",
            category="trend",
            description="Intermediate trend baseline and higher-timeframe slope proxy.",
            inputs=("close",),
            outputs=("sma50",),
        ),
        IndicatorDefinition(
            id="rsi14",
            name="RSI 14",
            category="momentum",
            description="Primary momentum oscillator used in trend setups.",
            inputs=("close",),
            outputs=("rsi14",),
        ),
        IndicatorDefinition(
            id="rsi2",
            name="RSI 2",
            category="mean_reversion",
            description="Fast oscillator used for range mean-reversion triggers.",
            inputs=("close",),
            outputs=("rsi2",),
        ),
        IndicatorDefinition(
            id="atr14",
            name="ATR 14",
            category="volatility",
            description="Volatility and stop-distance baseline.",
            inputs=("high", "low", "close"),
            outputs=("atr14",),
        ),
        IndicatorDefinition(
            id="adx14",
            name="ADX 14",
            category="regime",
            description="Trend strength input for market-regime classification.",
            inputs=("high", "low", "close"),
            outputs=("adx14",),
        ),
        IndicatorDefinition(
            id="macd-histogram",
            name="MACD Histogram",
            category="momentum",
            description="Momentum agreement input for confluence scoring.",
            inputs=("close",),
            outputs=("macd_hist",),
        ),
        IndicatorDefinition(
            id="bollinger-20-2",
            name="Bollinger Bands 20/2",
            category="mean_reversion",
            description="Band, midline, and bandwidth features for range setups.",
            inputs=("close",),
            outputs=("bb_upper", "bb_mid", "bb_lower", "bb_bandwidth"),
        ),
        IndicatorDefinition(
            id="donchian-20",
            name="Donchian Channel 20",
            category="breakout",
            description="Breakout and breakdown boundary detection.",
            inputs=("high", "low"),
            outputs=("donchian_high", "donchian_low"),
        ),
        IndicatorDefinition(
            id="keltner-21-atr",
            name="Keltner Channel",
            category="volatility",
            description="Trend-channel context around EMA21 and ATR.",
            inputs=("ema21", "atr14"),
            outputs=("keltner_upper", "keltner_lower"),
        ),
    )
