from dataclasses import dataclass, field
from typing import Any
from typing import Literal

from app.core.config import AppSettings, ProviderSettings
from app.providers.keyed import (
    AlpacaStocksOHLCVProvider,
    FinnhubStocksOHLCVProvider,
    PolygonStocksOHLCVProvider,
    TwelveDataStocksOHLCVProvider,
)
from app.providers.public import (
    CoinbasePublicOHLCVProvider,
    GeminiPublicOHLCVProvider,
    KrakenPublicOHLCVProvider,
    YahooFinanceOHLCVProvider,
)

Capability = Literal["ohlcv", "order_book", "news", "trading"]


@dataclass(slots=True)
class RegisteredProvider:
    name: str
    capabilities: set[Capability] = field(default_factory=set)
    configured: bool = False
    transport: Literal["public", "keyed", "internal"] = "internal"


class ProviderManager:
    def __init__(self, settings: ProviderSettings, app_settings: AppSettings | None = None) -> None:
        self._registry: dict[str, RegisteredProvider] = {}
        self._clients: dict[str, Any] = {}
        self.configure(settings, app_settings)

    def configure(self, settings: ProviderSettings, app_settings: AppSettings | None = None) -> None:
        self._settings = settings
        if app_settings is not None:
            self._app_settings = app_settings
        elif not hasattr(self, "_app_settings"):
            self._app_settings = None
        self._registry = {}
        self._clients = {}
        self._register_defaults()

    def _register_defaults(self) -> None:
        self.register("ccxt_coinbase", {"ohlcv", "order_book", "trading"}, client=CoinbasePublicOHLCVProvider(), transport="public")
        self.register("ccxt_kraken", {"ohlcv", "order_book", "trading"}, client=KrakenPublicOHLCVProvider(), transport="public")
        self.register("gemini", {"ohlcv", "order_book", "trading"}, client=GeminiPublicOHLCVProvider(), transport="public")
        self.register("alpaca", {"ohlcv", "trading"}, client=self._build_alpaca_client(), transport="keyed")
        self.register("finnhub", {"ohlcv", "news"}, client=self._build_finnhub_client(), transport="keyed")
        self.register("twelvedata", {"ohlcv"}, client=self._build_twelvedata_client(), transport="keyed")
        self.register("polygon", {"ohlcv"}, client=self._build_polygon_client(), transport="keyed")
        self.register("finnhub_news", {"news"}, client=self._build_finnhub_client(), transport="keyed")
        self.register("ollama", set(), transport="internal")
        self.register("openai", set(), transport="internal")
        self.register("alpaca_paper", {"trading"}, transport="internal")
        self.register("ccxt_trade", {"trading"}, transport="internal")
        self.register("coinbase_public", {"ohlcv"}, client=CoinbasePublicOHLCVProvider(), transport="public")
        self.register("kraken_public", {"ohlcv"}, client=KrakenPublicOHLCVProvider(), transport="public")
        self.register("gemini_public", {"ohlcv"}, client=GeminiPublicOHLCVProvider(), transport="public")
        self.register("yahoo_public", {"ohlcv"}, client=YahooFinanceOHLCVProvider(), transport="public")

    def register(
        self,
        name: str,
        capabilities: set[Capability],
        client: Any | None = None,
        transport: Literal["public", "keyed", "internal"] = "internal",
    ) -> None:
        self._registry[name] = RegisteredProvider(
            name=name,
            capabilities=capabilities,
            configured=client is not None,
            transport=transport,
        )
        if client is not None:
            self._clients[name] = client

    def set_settings(self, settings: ProviderSettings) -> None:
        self.configure(settings)

    def set_app_settings(self, app_settings: AppSettings) -> None:
        self.configure(self._settings, app_settings)

    def get_client(self, name: str) -> Any | None:
        return self._clients.get(name)

    def get_rate_limit_per_minute(
        self,
        domain: Literal["crypto", "stocks", "news", "ai", "trading"],
    ) -> int:
        if domain == "crypto":
            return self._settings.crypto_rate_limit_per_minute
        if domain == "stocks":
            return self._settings.stocks_rate_limit_per_minute
        return 60

    def get_registry(self) -> list[dict[str, object]]:
        return [
            {
                "name": provider.name,
                "capabilities": sorted(provider.capabilities),
                "configured": provider.configured,
                "transport": provider.transport,
            }
            for provider in sorted(self._registry.values(), key=lambda item: item.name)
        ]

    def is_configured(self, name: str) -> bool:
        return self._registry.get(name, RegisteredProvider(name=name)).configured

    def get_routes(self) -> dict[str, dict[str, str | None]]:
        return {
            "crypto": self._settings.crypto.model_dump(),
            "stocks": self._settings.stocks.model_dump(),
            "news": self._settings.news.model_dump(),
            "ai": self._settings.ai.model_dump(),
            "trading": self._settings.trading.model_dump(),
        }

    def resolve_chain(
        self,
        domain: Literal["crypto", "stocks", "news", "ai", "trading"],
        capability: Capability | None = None,
    ) -> list[str]:
        route = getattr(self._settings, domain)
        candidates = [route.primary, route.secondary, route.fallback]
        filtered = [provider for provider in candidates if provider]
        if capability is None:
            return filtered
        return [
            provider
            for provider in filtered
            if capability in self._registry.get(provider, RegisteredProvider(provider)).capabilities
        ]

    def _build_alpaca_client(self) -> Any | None:
        if not self._app_settings:
            return None
        if not self._app_settings.enable_alpaca_market_data:
            return None
        if not self._app_settings.alpaca_market_data_key_id or not self._app_settings.alpaca_market_data_secret_key:
            return None
        return AlpacaStocksOHLCVProvider(
            self._app_settings.alpaca_market_data_key_id,
            self._app_settings.alpaca_market_data_secret_key,
        )

    def _build_finnhub_client(self) -> Any | None:
        if not self._app_settings:
            return None
        if not self._app_settings.enable_finnhub_market_data or not self._app_settings.finnhub_api_key:
            return None
        return FinnhubStocksOHLCVProvider(self._app_settings.finnhub_api_key)

    def _build_polygon_client(self) -> Any | None:
        if not self._app_settings:
            return None
        if not self._app_settings.enable_polygon_market_data or not self._app_settings.polygon_api_key:
            return None
        return PolygonStocksOHLCVProvider(self._app_settings.polygon_api_key)

    def _build_twelvedata_client(self) -> Any | None:
        if not self._app_settings:
            return None
        if not self._app_settings.enable_twelvedata_market_data or not self._app_settings.twelvedata_api_key:
            return None
        return TwelveDataStocksOHLCVProvider(self._app_settings.twelvedata_api_key)