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
    def submit_order(self, order: dict[str, Any]) -> dict[str, Any]: ...

    def get_positions(self) -> list[dict[str, Any]]: ...

    def cancel_order(self, order_id: str) -> dict[str, Any]: ...