# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from dataclasses import dataclass, field
from typing import Any, Literal

from app.core.config import AppSettings, ProviderSettings, SafetySettings
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

Capability = Literal["ohlcv", "order_book", "news", "trading", "ai"]


@dataclass(slots=True)
class RegisteredProvider:
    name: str
    capabilities: set[Capability] = field(default_factory=set)
    configured: bool = False
    transport: Literal["public", "keyed", "internal"] = "internal"
    label: str | None = None
    source: Literal["builtin", "custom", "extension"] = "builtin"
    base_url: str | None = None
    auth_type: str | None = None
    profile_configured: bool | None = None
    adapter_status: Literal["available", "profile_only"] = "available"
    notes: str | None = None


class ProviderManager:
    def __init__(
        self,
        settings: ProviderSettings,
        app_settings: AppSettings | None = None,
        safety_settings: SafetySettings | None = None,
        custom_provider_profiles: list[dict[str, Any]] | None = None,
        api_key_provider: Any | None = None,
    ) -> None:
        self._registry: dict[str, RegisteredProvider] = {}
        self._clients: dict[str, Any] = {}
        self._custom_provider_profiles = custom_provider_profiles or []
        self._api_key_provider = api_key_provider
        self.configure(
            settings, app_settings, safety_settings, custom_provider_profiles, api_key_provider
        )

    def configure(
        self,
        settings: ProviderSettings,
        app_settings: AppSettings | None = None,
        safety_settings: SafetySettings | None = None,
        custom_provider_profiles: list[dict[str, Any]] | None = None,
        api_key_provider: Any | None = None,
    ) -> None:
        self._settings = settings
        if app_settings is not None:
            self._app_settings = app_settings
        elif not hasattr(self, "_app_settings"):
            self._app_settings = None
        if safety_settings is not None:
            self._safety_settings = safety_settings
        elif not hasattr(self, "_safety_settings"):
            self._safety_settings = SafetySettings()
        if custom_provider_profiles is not None:
            self._custom_provider_profiles = custom_provider_profiles
        elif not hasattr(self, "_custom_provider_profiles"):
            self._custom_provider_profiles = []
        if api_key_provider is not None:
            self._api_key_provider = api_key_provider
        elif not hasattr(self, "_api_key_provider"):
            self._api_key_provider = None
        self._registry = {}
        self._clients = {}
        self._register_defaults()
        self._register_custom_profiles()

    def _register_defaults(self) -> None:
        self.register(
            "ccxt_coinbase",
            {"ohlcv", "order_book", "trading"},
            client=CoinbasePublicOHLCVProvider(),
            transport="public",
        )
        self.register(
            "ccxt_kraken",
            {"ohlcv", "order_book", "trading"},
            client=KrakenPublicOHLCVProvider(),
            transport="public",
        )
        self.register(
            "gemini",
            {"ohlcv", "order_book", "trading"},
            client=GeminiPublicOHLCVProvider(),
            transport="public",
        )
        self.register(
            "alpaca", {"ohlcv", "trading"}, client=self._build_alpaca_client(), transport="keyed"
        )
        self.register(
            "finnhub", {"ohlcv", "news"}, client=self._build_finnhub_client(), transport="keyed"
        )
        self.register(
            "twelvedata", {"ohlcv"}, client=self._build_twelvedata_client(), transport="keyed"
        )
        self.register("polygon", {"ohlcv"}, client=self._build_polygon_client(), transport="keyed")
        self.register(
            "finnhub_news", {"news"}, client=self._build_finnhub_client(), transport="keyed"
        )
        self.register("ollama", {"ai"}, transport="internal")
        self.register("lm_studio", {"ai"}, transport="internal")
        self.register("openai", {"ai"}, transport="keyed")
        self.register("openai_compatible", {"ai"}, transport="keyed")
        self.register("alpaca_paper", {"trading"}, transport="internal")
        self.register("ccxt_trade", {"trading"}, transport="internal")
        self.register(
            "coinbase_public", {"ohlcv"}, client=CoinbasePublicOHLCVProvider(), transport="public"
        )
        self.register(
            "kraken_public", {"ohlcv"}, client=KrakenPublicOHLCVProvider(), transport="public"
        )
        self.register(
            "gemini_public", {"ohlcv"}, client=GeminiPublicOHLCVProvider(), transport="public"
        )
        self.register(
            "yahoo_public", {"ohlcv"}, client=YahooFinanceOHLCVProvider(), transport="public"
        )

    def register(
        self,
        name: str,
        capabilities: set[Capability],
        client: Any | None = None,
        transport: Literal["public", "keyed", "internal"] = "internal",
        label: str | None = None,
        source: Literal["builtin", "custom", "extension"] = "builtin",
        base_url: str | None = None,
        auth_type: str | None = None,
        profile_configured: bool | None = None,
        adapter_status: Literal["available", "profile_only"] = "available",
        notes: str | None = None,
    ) -> None:
        self._registry[name] = RegisteredProvider(
            name=name,
            capabilities=capabilities,
            configured=client is not None,
            transport=transport,
            label=label,
            source=source,
            base_url=base_url,
            auth_type=auth_type,
            profile_configured=profile_configured,
            adapter_status=adapter_status,
            notes=notes,
        )
        if client is not None:
            self._clients[name] = client

    def set_settings(self, settings: ProviderSettings) -> None:
        self.configure(settings)

    def set_app_settings(self, app_settings: AppSettings) -> None:
        self.configure(self._settings, app_settings)

    def set_safety_settings(self, safety_settings: SafetySettings) -> None:
        self.configure(self._settings, safety_settings=safety_settings)

    def set_custom_provider_profiles(self, profiles: list[dict[str, Any]]) -> None:
        self.configure(self._settings, custom_provider_profiles=profiles)

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
        providers: list[dict[str, object]] = []
        for provider in sorted(self._registry.values(), key=lambda item: item.name):
            item = {
                "name": provider.name,
                "capabilities": sorted(provider.capabilities),
                "configured": provider.configured,
                "transport": provider.transport,
            }
            if provider.label:
                item["label"] = provider.label
            if provider.source != "builtin":
                item["source"] = provider.source
            if provider.base_url:
                item["baseUrl"] = provider.base_url
            if provider.auth_type:
                item["authType"] = provider.auth_type
            if provider.profile_configured is not None:
                item["profileConfigured"] = provider.profile_configured
            if provider.adapter_status != "available":
                item["adapterStatus"] = provider.adapter_status
            if provider.notes:
                item["notes"] = provider.notes
            providers.append(item)
        return providers

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
        if (
            not self._app_settings.alpaca_market_data_key_id
            or not self._app_settings.alpaca_market_data_secret_key
        ):
            return None
        trading_base_url = (
            AlpacaStocksOHLCVProvider.LIVE_TRADING_BASE_URL
            if self._safety_settings.trading_mode == "live"
            and self._safety_settings.live_trading_confirmed
            else AlpacaStocksOHLCVProvider.PAPER_TRADING_BASE_URL
        )
        return AlpacaStocksOHLCVProvider(
            self._app_settings.alpaca_market_data_key_id,
            self._app_settings.alpaca_market_data_secret_key,
            trading_base_url=trading_base_url,
        )

    def _build_finnhub_client(self) -> Any | None:
        if not self._app_settings:
            return None
        if (
            not self._app_settings.enable_finnhub_market_data
            or not self._app_settings.finnhub_api_key
        ):
            return None
        return FinnhubStocksOHLCVProvider(self._app_settings.finnhub_api_key)

    def _build_polygon_client(self) -> Any | None:
        if not self._app_settings:
            return None
        if (
            not self._app_settings.enable_polygon_market_data
            or not self._app_settings.polygon_api_key
        ):
            return None
        return PolygonStocksOHLCVProvider(self._app_settings.polygon_api_key)

    def _build_twelvedata_client(self) -> Any | None:
        if not self._app_settings:
            return None
        if (
            not self._app_settings.enable_twelvedata_market_data
            or not self._app_settings.twelvedata_api_key
        ):
            return None
        return TwelveDataStocksOHLCVProvider(self._app_settings.twelvedata_api_key)

    def _register_custom_profiles(self) -> None:
        for profile in self._custom_provider_profiles:
            if not profile.get("enabled", True):
                continue
            provider_id = str(profile.get("id", "")).strip()
            if not provider_id:
                continue
            capabilities = {
                capability
                for capability in profile.get("capabilities", [])
                if capability in {"ohlcv", "order_book", "news", "trading", "ai"}
            }
            if not capabilities:
                continue
            auth_type = str(profile.get("authType") or profile.get("auth_type") or "none")
            api_key_id = str(profile.get("apiKeyId") or profile.get("api_key_id") or "")
            has_required_key = True
            if auth_type != "none":
                has_required_key = bool(
                    api_key_id
                    and callable(self._api_key_provider)
                    and self._api_key_provider(api_key_id)
                )
            self.register(
                provider_id,
                capabilities,
                client=None,
                transport="public" if auth_type == "none" else "keyed",
                label=str(profile.get("label") or provider_id),
                source="custom",
                base_url=str(profile.get("baseUrl") or profile.get("base_url") or ""),
                auth_type=auth_type,
                profile_configured=has_required_key,
                adapter_status="profile_only",
                notes=str(profile.get("notes") or ""),
            )
