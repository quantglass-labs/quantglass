# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class OHLCVProvider(Protocol):
    def get_symbols(self, market_type: str) -> list[str]: ...

    def get_ohlcv(
        self,
        symbol: str,
        timeframe: str,
        start: str | None = None,
        end: str | None = None,
    ) -> Any: ...

    def get_quote(self, symbol: str) -> dict[str, Any]: ...


@runtime_checkable
class OrderBookProvider(Protocol):
    def get_order_book(self, symbol: str, depth: int = 50) -> dict[str, Any]: ...


@runtime_checkable
class NewsProvider(Protocol):
    def get_news(self, symbol: str, limit: int = 20) -> list[dict[str, Any]]: ...


@runtime_checkable
class TradingProvider(Protocol):
    # PAR-5: the live path passes the full order ticket. Clients that keep the
    # legacy (symbol, side, quantity) signature still receive plain market
    # orders; everything else is refused upstream rather than downgraded.
    def submit_order(
        self,
        symbol: str,
        side: str,
        quantity: float,
        order_type: str = "market",
        limit_price: float | None = None,
        tif: str = "gtc",
        trail_percent: float | None = None,
        plan_stop: float | None = None,
        plan_target: float | None = None,
    ) -> dict[str, Any]: ...

    def get_positions(self) -> list[dict[str, Any]]: ...

    def cancel_order(self, order_id: str) -> dict[str, Any]: ...
