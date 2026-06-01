"""Example OHLCV provider adapter for contributors.

This file is documentation-oriented. Copy the shape into a backend provider
module and add tests before registering a real provider.
"""

from __future__ import annotations

from typing import Any


class ExampleOHLCVProvider:
    def get_symbols(self, market_type: str) -> list[str]:
        if market_type != "crypto":
            return []
        return ["BTCUSD"]

    def get_ohlcv(
        self,
        symbol: str,
        timeframe: str,
        start: str | None = None,
        end: str | None = None,
    ) -> list[dict[str, Any]]:
        if timeframe != "1h":
            raise ValueError(f"Unsupported timeframe: {timeframe}")

        return [
            {
                "open_time_utc": "2026-01-01T00:00:00+00:00",
                "open": 100.0,
                "high": 101.0,
                "low": 99.0,
                "close": 100.5,
                "volume": 1000.0,
            }
        ]
