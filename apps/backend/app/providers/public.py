# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

import json
from datetime import UTC, datetime
from typing import Any
from urllib.request import Request, urlopen

PROVIDER_HTTP_TIMEOUT_SECONDS = 8

# Fiat/stablecoin quote suffixes, longest first so USDT/USDC win over USD. Used
# to split a canonical symbol (e.g. "DOGEUSD") into base + quote so the public
# providers can fetch arbitrary user-added pairs, not just a hardcoded list.
_CRYPTO_QUOTES = ("USDT", "USDC", "USD")


def _split_crypto_symbol(symbol: str) -> tuple[str, str] | None:
    """Split a canonical crypto symbol (e.g. ``BTCUSD``) into ``(base, quote)``."""
    normalized = symbol.upper().replace("-", "").replace("/", "")
    for quote in _CRYPTO_QUOTES:
        base = normalized[: -len(quote)]
        if normalized.endswith(quote) and base:
            return base, quote
    return None


class CoinbasePublicOHLCVProvider:
    _granularity_by_timeframe = {
        "15m": 900,
        "1h": 3600,
        "1d": 86400,
    }
    _product_by_symbol = {
        "BTCUSD": "BTC-USD",
        "ETHUSD": "ETH-USD",
        "SOLUSD": "SOL-USD",
        "LINKUSD": "LINK-USD",
    }

    def get_symbols(self, market_type: str) -> list[str]:
        return sorted(self._product_by_symbol) if market_type == "crypto" else []

    def _resolve_product(self, symbol: str) -> str | None:
        normalized = symbol.upper().replace("-", "").replace("/", "")
        if normalized in self._product_by_symbol:
            return self._product_by_symbol[normalized]
        split = _split_crypto_symbol(normalized)
        return f"{split[0]}-{split[1]}" if split else None

    def get_ohlcv(
        self,
        symbol: str,
        timeframe: str,
        start: str | None = None,
        end: str | None = None,
    ) -> list[dict[str, Any]]:
        product = self._resolve_product(symbol)
        if product is None:
            raise ValueError(f"Unsupported Coinbase corridor symbol: {symbol}")
        granularity = self._granularity_by_timeframe.get(timeframe)
        if granularity is None:
            raise ValueError(f"Unsupported Coinbase timeframe: {timeframe}")

        request = Request(
            f"https://api.exchange.coinbase.com/products/{product}/candles?granularity={granularity}",
            headers={"User-Agent": "Mozilla/5.0"},
        )
        payload = json.loads(
            urlopen(request, timeout=PROVIDER_HTTP_TIMEOUT_SECONDS).read().decode("utf-8")
        )
        candles = [
            {
                "open_time_utc": datetime.fromtimestamp(row[0], UTC).isoformat(),
                "low": float(row[1]),
                "high": float(row[2]),
                "open": float(row[3]),
                "close": float(row[4]),
                "volume": float(row[5]),
            }
            for row in payload
        ]
        candles.sort(key=lambda entry: entry["open_time_utc"])
        return candles

    def get_quote(self, symbol: str) -> dict[str, Any]:
        candles = self.get_ohlcv(symbol, "1h")
        latest = candles[-1]
        return {
            "symbol": symbol.upper(),
            "last": latest["close"],
            "as_of_utc": latest["open_time_utc"],
        }


class KrakenPublicOHLCVProvider:
    _interval_by_timeframe = {
        "15m": 15,
        "1h": 60,
        "4h": 240,
        "1d": 1440,
    }
    _pair_by_symbol = {
        "BTCUSD": "XBTUSD",
        "ETHUSD": "ETHUSD",
        "SOLUSD": "SOLUSD",
        "LINKUSD": "LINKUSD",
    }

    def get_symbols(self, market_type: str) -> list[str]:
        return sorted(self._pair_by_symbol) if market_type == "crypto" else []

    def _resolve_pair(self, symbol: str) -> str | None:
        normalized = symbol.upper().replace("-", "").replace("/", "")
        if normalized in self._pair_by_symbol:
            return self._pair_by_symbol[normalized]
        split = _split_crypto_symbol(normalized)
        if not split:
            return None
        base, quote = split
        # Kraken lists Bitcoin under its legacy XBT ticker.
        base = "XBT" if base == "BTC" else base
        return f"{base}{quote}"

    def get_ohlcv(
        self,
        symbol: str,
        timeframe: str,
        start: str | None = None,
        end: str | None = None,
    ) -> list[dict[str, Any]]:
        pair = self._resolve_pair(symbol)
        if pair is None:
            raise ValueError(f"Unsupported Kraken corridor symbol: {symbol}")
        interval = self._interval_by_timeframe.get(timeframe)
        if interval is None:
            raise ValueError(f"Unsupported Kraken timeframe: {timeframe}")

        request = Request(
            f"https://api.kraken.com/0/public/OHLC?pair={pair}&interval={interval}",
            headers={"User-Agent": "Mozilla/5.0"},
        )
        payload = json.loads(
            urlopen(request, timeout=PROVIDER_HTTP_TIMEOUT_SECONDS).read().decode("utf-8")
        )
        pair_key = next(iter(payload["result"].keys() - {"last"}))
        candles = [
            {
                "open_time_utc": datetime.fromtimestamp(int(row[0]), UTC).isoformat(),
                "open": float(row[1]),
                "high": float(row[2]),
                "low": float(row[3]),
                "close": float(row[4]),
                "volume": float(row[6]),
            }
            for row in payload["result"][pair_key]
        ]
        candles.sort(key=lambda entry: entry["open_time_utc"])
        return candles

    def get_quote(self, symbol: str) -> dict[str, Any]:
        candles = self.get_ohlcv(symbol, "1h")
        latest = candles[-1]
        return {
            "symbol": symbol.upper(),
            "last": latest["close"],
            "as_of_utc": latest["open_time_utc"],
        }


class GeminiPublicOHLCVProvider:
    _period_by_timeframe = {
        "15m": "15m",
        "1h": "1hr",
        "6h": "6hr",
        "1d": "1day",
    }
    _symbol_by_symbol = {
        "BTCUSD": "BTCUSD",
        "ETHUSD": "ETHUSD",
        "SOLUSD": "SOLUSD",
        "LINKUSD": "LINKUSD",
    }

    def get_symbols(self, market_type: str) -> list[str]:
        return sorted(self._symbol_by_symbol) if market_type == "crypto" else []

    def _resolve_symbol(self, symbol: str) -> str | None:
        normalized = symbol.upper().replace("-", "").replace("/", "")
        if normalized in self._symbol_by_symbol:
            return self._symbol_by_symbol[normalized]
        split = _split_crypto_symbol(normalized)
        return f"{split[0]}{split[1]}" if split else None

    def get_ohlcv(
        self,
        symbol: str,
        timeframe: str,
        start: str | None = None,
        end: str | None = None,
    ) -> list[dict[str, Any]]:
        gemini_symbol = self._resolve_symbol(symbol)
        if gemini_symbol is None:
            raise ValueError(f"Unsupported Gemini corridor symbol: {symbol}")
        period = self._period_by_timeframe.get(timeframe)
        if period is None:
            raise ValueError(f"Unsupported Gemini timeframe: {timeframe}")

        request = Request(
            f"https://api.gemini.com/v2/candles/{gemini_symbol}/{period}",
            headers={"User-Agent": "Mozilla/5.0"},
        )
        payload = json.loads(
            urlopen(request, timeout=PROVIDER_HTTP_TIMEOUT_SECONDS).read().decode("utf-8")
        )
        candles = [
            {
                "open_time_utc": datetime.fromtimestamp(int(row[0]) / 1000, UTC).isoformat(),
                "open": float(row[1]),
                "high": float(row[2]),
                "low": float(row[3]),
                "close": float(row[4]),
                "volume": float(row[5]),
            }
            for row in payload
        ]
        candles.sort(key=lambda entry: entry["open_time_utc"])
        return candles

    def get_quote(self, symbol: str) -> dict[str, Any]:
        candles = self.get_ohlcv(symbol, "1h")
        latest = candles[-1]
        return {
            "symbol": symbol.upper(),
            "last": latest["close"],
            "as_of_utc": latest["open_time_utc"],
        }


class YahooFinanceOHLCVProvider:
    _interval_by_timeframe = {
        "1d": "1d",
    }

    def get_symbols(self, market_type: str) -> list[str]:
        return (
            ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "TSLA", "COIN", "IWM"]
            if market_type == "stocks"
            else []
        )

    def get_ohlcv(
        self,
        symbol: str,
        timeframe: str,
        start: str | None = None,
        end: str | None = None,
    ) -> list[dict[str, Any]]:
        # Any valid ticker is fetchable from Yahoo's public chart endpoint, so we
        # no longer gate on a hardcoded list — this lets users track their own
        # symbols and lets the macro-proxy ETFs (UUP/TLT/GLD/RSP) ingest.
        # get_symbols() still advertises the curated default set. An unknown
        # ticker simply returns no data downstream and is recorded as a
        # per-target diagnostic rather than rejected up front.
        normalized_symbol = symbol.upper()
        interval = self._interval_by_timeframe.get(timeframe)
        if interval is None:
            raise ValueError(f"Unsupported Yahoo timeframe: {timeframe}")

        request = Request(
            f"https://query1.finance.yahoo.com/v8/finance/chart/{normalized_symbol}?interval={interval}&range=6mo",
            headers={"User-Agent": "Mozilla/5.0"},
        )
        payload = json.loads(
            urlopen(request, timeout=PROVIDER_HTTP_TIMEOUT_SECONDS).read().decode("utf-8")
        )
        result_list = (payload.get("chart") or {}).get("result")
        if not result_list:
            error = (payload.get("chart") or {}).get("error") or {}
            raise ValueError(
                f"No Yahoo data for {normalized_symbol}: "
                f"{error.get('description', 'unknown or unsupported symbol')}"
            )
        result = result_list[0]
        quote = result["indicators"]["quote"][0]

        candles: list[dict[str, Any]] = []
        for index, timestamp in enumerate(result.get("timestamp") or []):
            open_value = quote["open"][index]
            high_value = quote["high"][index]
            low_value = quote["low"][index]
            close_value = quote["close"][index]
            volume_value = quote["volume"][index]
            if None in {open_value, high_value, low_value, close_value, volume_value}:
                continue
            candles.append(
                {
                    "open_time_utc": datetime.fromtimestamp(timestamp, UTC).isoformat(),
                    "open": float(open_value),
                    "high": float(high_value),
                    "low": float(low_value),
                    "close": float(close_value),
                    "volume": float(volume_value),
                }
            )

        candles.sort(key=lambda entry: entry["open_time_utc"])
        return candles

    def get_quote(self, symbol: str) -> dict[str, Any]:
        candles = self.get_ohlcv(symbol, "1d")
        latest = candles[-1]
        return {
            "symbol": symbol.upper(),
            "last": latest["close"],
            "as_of_utc": latest["open_time_utc"],
        }
