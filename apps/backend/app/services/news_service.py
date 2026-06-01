# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.providers.base import NewsProvider
from app.providers.manager import ProviderManager
from app.services.signal_engine import SignalEngineService
from app.storage.analytics_store import AnalyticsStore


class NewsService:
    def __init__(
        self,
        provider_manager: ProviderManager,
        analytics_store: AnalyticsStore,
        signal_engine: SignalEngineService,
    ) -> None:
        self._provider_manager = provider_manager
        self._analytics_store = analytics_store
        self._signal_engine = signal_engine

    def list_news(self, limit_per_symbol: int = 2, max_items: int = 24) -> list[dict[str, Any]]:
        provider_items = self._provider_news(limit_per_symbol=limit_per_symbol, max_items=max_items)
        if provider_items:
            return provider_items[:max_items]
        return self._derived_market_updates(max_items=max_items)

    def _provider_news(self, limit_per_symbol: int, max_items: int) -> list[dict[str, Any]]:
        routes = self._provider_manager.resolve_chain("news", "news")
        if not routes:
            return []

        items: list[dict[str, Any]] = []
        seen_ids: set[str] = set()
        symbols = [series["symbol"] for series in self._analytics_store.list_market_series(minimum_candles=2)]
        preferred_symbols = self._dedupe_symbols(symbols)[: max(max_items // max(limit_per_symbol, 1), 1) * 2]
        for route in routes:
            client = self._provider_manager.get_client(route)
            if client is None or not isinstance(client, NewsProvider):
                continue
            for symbol in preferred_symbols:
                try:
                    provider_items = client.get_news(symbol, limit=limit_per_symbol)
                except Exception:
                    continue
                for item in provider_items:
                    normalized = self._normalize_provider_item(item, symbol, default_source=route)
                    if normalized["id"] in seen_ids:
                        continue
                    seen_ids.add(normalized["id"])
                    items.append(normalized)
                    if len(items) >= max_items:
                        return self._sort_items(items)
        return self._sort_items(items)

    def _derived_market_updates(self, max_items: int) -> list[dict[str, Any]]:
        signals_by_symbol = {
            item["symbolId"]: item
            for item in self._signal_engine.list_signals()
        }
        items: list[dict[str, Any]] = []
        for series in self._analytics_store.list_market_series(minimum_candles=2):
            candles_payload = self._analytics_store.list_market_candles(series["symbol"], series["timeframe"], limit=3)
            candles = candles_payload["items"]
            if len(candles) < 2:
                continue
            latest = candles[-1]
            previous = candles[-2]
            latest_close = float(latest["close"])
            previous_close = float(previous["close"])
            change_percent = ((latest_close - previous_close) / previous_close) * 100 if previous_close else 0.0
            signal = signals_by_symbol.get(series["symbol"])
            items.append(
                {
                    "id": f"market-update-{series['symbol']}-{series['timeframe']}-{latest['open_time_utc']}",
                    "symbol": self._display_symbol(series["symbol"], series["market_type"]),
                    "headline": self._headline_for_series(series["symbol"], series["market_type"], series["timeframe"], change_percent, signal),
                    "source": "Derived from local market data — not live news",
                    "derived": True,
                    "publishedAt": latest["open_time_utc"],
                    "summary": self._summary_for_series(series["symbol"], series["market_type"], series["timeframe"], latest_close, change_percent, signal),
                    "sentiment": self._sentiment_from_change(change_percent, signal),
                }
            )
        return self._sort_items(items)[:max_items]

    def _normalize_provider_item(
        self,
        item: dict[str, Any],
        symbol: str,
        default_source: str,
    ) -> dict[str, Any]:
        normalized_symbol = self._display_symbol(symbol, self._market_type_for_symbol(symbol))
        published_at = item.get("publishedAt") or item.get("published_at") or datetime.now(timezone.utc).isoformat()
        headline = item.get("headline") or item.get("title") or f"{normalized_symbol} market update"
        summary = item.get("summary") or item.get("description") or headline
        return {
            "id": str(item.get("id") or f"{default_source}-{symbol}-{published_at}"),
            "symbol": item.get("symbol") or normalized_symbol,
            "headline": headline,
            "source": item.get("source") or default_source,
            "derived": False,
            "publishedAt": published_at,
            "summary": summary,
            "sentiment": item.get("sentiment") or self._sentiment_from_text(f"{headline} {summary}"),
        }

    def _headline_for_series(
        self,
        symbol: str,
        market_type: str,
        timeframe: str,
        change_percent: float,
        signal: dict[str, Any] | None,
    ) -> str:
        display_symbol = self._display_symbol(symbol, market_type)
        if signal is None:
            direction = "extends" if change_percent >= 0 else "pulls back"
            return f"{display_symbol} {direction} on the closed {timeframe} candle"
        signal_name = signal["signal"]["signal"].replace("_", " ").title()
        return f"{display_symbol} prints {signal_name} as {timeframe} move reaches {change_percent:+.2f}%"

    def _summary_for_series(
        self,
        symbol: str,
        market_type: str,
        timeframe: str,
        latest_close: float,
        change_percent: float,
        signal: dict[str, Any] | None,
    ) -> str:
        display_symbol = self._display_symbol(symbol, market_type)
        base = f"{display_symbol} closed the latest {timeframe} bar at {latest_close:.2f}, a {change_percent:+.2f}% move versus the prior candle."
        if signal is None:
            return base
        setup_type = signal["signal"]["confidence_basis"]["setup_type"].replace("_", " ")
        confidence = signal["signal"]["confidence"]
        return f"{base} The current backend signal is {signal['signal']['signal']} with {confidence}% confidence on a {setup_type} setup."

    def _sentiment_from_change(self, change_percent: float, signal: dict[str, Any] | None) -> str:
        if signal and signal["signal"]["signal"] == "SELL":
            return "negative"
        if change_percent > 0.45:
            return "positive"
        if change_percent < -0.45:
            return "negative"
        return "neutral"

    def _sentiment_from_text(self, text: str) -> str:
        normalized = text.lower()
        positive_markers = ["beats", "upgrades", "reclaim", "gain", "extends", "breakout"]
        negative_markers = ["downgrade", "miss", "cuts", "slide", "breakdown", "risk"]
        if any(marker in normalized for marker in positive_markers):
            return "positive"
        if any(marker in normalized for marker in negative_markers):
            return "negative"
        return "neutral"

    def _display_symbol(self, symbol: str, market_type: str) -> str:
        if market_type == "crypto" and symbol.endswith("USD") and len(symbol) > 3:
            return f"{symbol[:-3]}/USD"
        return symbol

    def _market_type_for_symbol(self, symbol: str) -> str:
        return "crypto" if symbol.endswith("USD") and len(symbol) > 3 else "stocks"

    def _dedupe_symbols(self, symbols: list[str]) -> list[str]:
        ordered: list[str] = []
        seen: set[str] = set()
        for symbol in symbols:
            if symbol in seen:
                continue
            seen.add(symbol)
            ordered.append(symbol)
        return ordered

    def _sort_items(self, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return sorted(items, key=lambda item: item["publishedAt"], reverse=True)