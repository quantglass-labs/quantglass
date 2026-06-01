# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Tests for Phase G: retired provider stubs (G1) and relative-strength ranking (G2)."""

from app.core.config import ProviderSettings
from app.providers.manager import ProviderManager
from app.services.ranking import RelativeStrengthRankingService


def test_retired_stub_providers_are_not_registered() -> None:
    manager = ProviderManager(ProviderSettings())
    names = {entry["name"] for entry in manager.get_registry()}

    assert "coingecko" not in names
    assert "coinmarketcap" not in names
    assert "newsapi" not in names
    # Real providers remain available.
    assert "ccxt_coinbase" in names
    assert "finnhub_news" in names
    assert "yahoo_public" in names


def test_default_news_route_has_no_dead_secondary() -> None:
    settings = ProviderSettings()
    assert settings.news.primary == "finnhub_news"
    assert settings.news.secondary is None


class _FakeAnalyticsStore:
    def __init__(self, series: list[dict], candles: dict[tuple[str, str], list[float]]) -> None:
        self._series = series
        self._candles = candles

    def list_market_series(self, minimum_candles: int = 60) -> list[dict]:
        return [s for s in self._series if len(self._candles[(s["symbol"], s["timeframe"])]) >= minimum_candles]

    def list_market_candles(self, symbol: str, timeframe: str, limit: int = 300) -> dict:
        closes = self._candles[(symbol, timeframe)]
        return {
            "symbol": symbol,
            "timeframe": timeframe,
            "source": "test",
            "items": [{"close": value} for value in closes],
        }


def _trend_series(start: float, step: float, count: int = 70) -> list[float]:
    return [start + step * i for i in range(count)]


def test_ranking_orders_strongest_momentum_first() -> None:
    candles = {
        ("STRONG", "1h"): _trend_series(100.0, 2.0),
        ("WEAK", "1h"): _trend_series(200.0, 0.1),
        ("FALLING", "1h"): _trend_series(300.0, -1.5),
    }
    series = [
        {"symbol": "STRONG", "market_type": "crypto", "timeframe": "1h", "source": "test"},
        {"symbol": "WEAK", "market_type": "crypto", "timeframe": "1h", "source": "test"},
        {"symbol": "FALLING", "market_type": "crypto", "timeframe": "1h", "source": "test"},
    ]
    service = RelativeStrengthRankingService(_FakeAnalyticsStore(series, candles), minimum_candles=30)

    result = service.rank()
    items = result["items"]

    assert [item["symbol"] for item in items] == ["STRONG", "WEAK", "FALLING"]
    assert items[0]["relative_strength_percentile"] == 100.0
    assert items[-1]["relative_strength_percentile"] == 0.0
    assert items[0]["peer_rank"] == 1
    assert items[0]["peer_group_size"] == 3
    assert items[0]["trend"] == "up"
    assert items[-1]["trend"] == "down"


def test_ranking_percentile_isolated_per_market_type() -> None:
    candles = {
        ("BTCUSD", "1h"): _trend_series(100.0, 1.0),
        ("SPY", "1d"): _trend_series(400.0, 0.5),
    }
    series = [
        {"symbol": "BTCUSD", "market_type": "crypto", "timeframe": "1h", "source": "test"},
        {"symbol": "SPY", "market_type": "stocks", "timeframe": "1d", "source": "test"},
    ]
    service = RelativeStrengthRankingService(_FakeAnalyticsStore(series, candles), minimum_candles=30)

    result = service.rank()
    by_symbol = {item["symbol"]: item for item in result["items"]}

    # Each is the only member of its peer group, so both are top-ranked within their group.
    assert by_symbol["BTCUSD"]["relative_strength_percentile"] == 100.0
    assert by_symbol["SPY"]["relative_strength_percentile"] == 100.0
    assert by_symbol["BTCUSD"]["peer_group_size"] == 1
    assert by_symbol["SPY"]["peer_group_size"] == 1
