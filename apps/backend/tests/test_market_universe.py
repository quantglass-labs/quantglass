# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""The market universe is no longer a hardcoded list.

Two behaviours under test, both without touching the network:
- the public crypto providers resolve arbitrary ``<base><quote>`` symbols to
  each exchange's native format, not just a fixed dictionary;
- the corridor extends its static matrix with the user's watchlist symbols, so
  signals and backtests cover what the user actually follows.
"""

import unittest

from app.providers.public import (
    CoinbasePublicOHLCVProvider,
    GeminiPublicOHLCVProvider,
    KrakenPublicOHLCVProvider,
    _split_crypto_symbol,
)
from app.services.market_corridor import MarketCorridorService


class CryptoSymbolResolutionTests(unittest.TestCase):
    def test_split_canonical_symbol(self) -> None:
        self.assertEqual(_split_crypto_symbol("BTCUSD"), ("BTC", "USD"))
        self.assertEqual(_split_crypto_symbol("doge-usd"), ("DOGE", "USD"))
        self.assertEqual(_split_crypto_symbol("ETHUSDT"), ("ETH", "USDT"))
        self.assertIsNone(_split_crypto_symbol("FOO"))

    def test_coinbase_resolves_known_and_derived(self) -> None:
        provider = CoinbasePublicOHLCVProvider()
        self.assertEqual(provider._resolve_product("BTCUSD"), "BTC-USD")  # dict
        self.assertEqual(provider._resolve_product("DOGEUSD"), "DOGE-USD")  # derived
        self.assertIsNone(provider._resolve_product("NOTAPAIR"))

    def test_kraken_maps_bitcoin_to_xbt(self) -> None:
        provider = KrakenPublicOHLCVProvider()
        self.assertEqual(provider._resolve_pair("BTCUSD"), "XBTUSD")
        self.assertEqual(provider._resolve_pair("AVAXUSD"), "AVAXUSD")
        self.assertIsNone(provider._resolve_pair("FOO"))

    def test_gemini_passes_through_derived_symbol(self) -> None:
        provider = GeminiPublicOHLCVProvider()
        self.assertEqual(provider._resolve_symbol("BTCUSD"), "BTCUSD")
        self.assertEqual(provider._resolve_symbol("MATIC-USD"), "MATICUSD")
        self.assertIsNone(provider._resolve_symbol("FOO"))


class WatchlistCorridorTests(unittest.TestCase):
    def _service(self, watchlist: list[dict[str, str]]) -> MarketCorridorService:
        # _targets() only needs the watchlist provider; the data dependencies are
        # unused for target-building, so None is fine here.
        return MarketCorridorService(
            provider_manager=None,  # type: ignore[arg-type]
            analytics_store=None,  # type: ignore[arg-type]
            rate_limiter=None,  # type: ignore[arg-type]
            watchlist_provider=lambda: watchlist,
        )

    def test_watchlist_stocks_added_as_daily_targets(self) -> None:
        service = self._service([{"symbol": "googl", "market_type": "stocks"}])
        targets = service._targets()
        googl = [t for t in targets if t["symbol"] == "GOOGL"]
        self.assertEqual({t["timeframe"] for t in googl}, {"1d"})
        self.assertEqual(googl[0]["route_domain"], "stocks")

    def test_watchlist_crypto_added_with_intraday_ladder_and_normalized(self) -> None:
        service = self._service([{"symbol": "doge/usd", "market_type": "crypto"}])
        doge = [t for t in service._targets() if t["symbol"] == "DOGEUSD"]
        self.assertEqual({t["timeframe"] for t in doge}, {"1h", "4h", "1d"})

    def test_watchlist_does_not_duplicate_base_matrix_symbols(self) -> None:
        before = MarketCorridorService(
            provider_manager=None,  # type: ignore[arg-type]
            analytics_store=None,  # type: ignore[arg-type]
            rate_limiter=None,  # type: ignore[arg-type]
        )._targets()
        service = self._service([{"symbol": "SPY", "market_type": "stocks"}])
        # SPY is already a daily base target; adding it to the watchlist must not
        # create a duplicate (symbol, timeframe) target.
        self.assertEqual(len(service._targets()), len(before))

    def test_unknown_market_type_is_skipped(self) -> None:
        service = self._service([{"symbol": "EURUSD", "market_type": "forex"}])
        self.assertFalse(any(t["symbol"] == "EURUSD" for t in service._targets()))


if __name__ == "__main__":
    unittest.main()
