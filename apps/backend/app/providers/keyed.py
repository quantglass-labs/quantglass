import json
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def _fetch_json(url: str, headers: dict[str, str] | None = None) -> dict[str, Any]:
    request = Request(
        url,
        headers={"User-Agent": "Mozilla/5.0", **(headers or {})},
    )
    return json.loads(urlopen(request).read().decode("utf-8"))


def _post_json(url: str, payload: dict[str, Any], headers: dict[str, str] | None = None) -> dict[str, Any]:
    request = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"User-Agent": "Mozilla/5.0", "Content-Type": "application/json", **(headers or {})},
        method="POST",
    )
    try:
        return json.loads(urlopen(request).read().decode("utf-8"))
    except HTTPError as exc:
        response_body = exc.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(response_body)
        except json.JSONDecodeError as error:
            raise ValueError(f"Broker request failed with HTTP {exc.code}") from error
        detail = payload.get("message") or payload.get("code") or response_body
        raise ValueError(str(detail)) from exc


class AlpacaStocksOHLCVProvider:
    def __init__(self, key_id: str, secret_key: str) -> None:
        self._headers = {
            "APCA-API-KEY-ID": key_id,
            "APCA-API-SECRET-KEY": secret_key,
        }

    def get_symbols(self, market_type: str) -> list[str]:
        return ["SPY"] if market_type == "stocks" else []

    def get_ohlcv(
        self,
        symbol: str,
        timeframe: str,
        start: str | None = None,
        end: str | None = None,
    ) -> list[dict[str, Any]]:
        if timeframe != "1d":
            raise ValueError(f"Unsupported Alpaca timeframe: {timeframe}")
        query = urlencode({
            "timeframe": "1Day",
            "limit": 500,
            "feed": "iex",
            "sort": "asc",
        })
        payload = _fetch_json(
            f"https://data.alpaca.markets/v2/stocks/{symbol.upper()}/bars?{query}",
            headers=self._headers,
        )
        return [
            {
                "open_time_utc": row["t"],
                "open": float(row["o"]),
                "high": float(row["h"]),
                "low": float(row["l"]),
                "close": float(row["c"]),
                "volume": float(row["v"]),
            }
            for row in payload.get("bars", [])
        ]

    def get_quote(self, symbol: str) -> dict[str, Any]:
        candles = self.get_ohlcv(symbol, "1d")
        latest = candles[-1]
        return {"symbol": symbol.upper(), "last": latest["close"], "as_of_utc": latest["open_time_utc"]}

    def submit_order(self, symbol: str, side: str, quantity: float) -> dict[str, Any]:
        order_side = "buy" if side == "long" else "sell"
        payload = _post_json(
            "https://api.alpaca.markets/v2/orders",
            payload={
                "symbol": symbol.upper().replace("/", ""),
                "qty": quantity,
                "side": order_side,
                "type": "market",
                "time_in_force": "day",
            },
            headers=self._headers,
        )
        return {
            "id": payload.get("id"),
            "status": payload.get("status", "submitted"),
            "submitted_at": payload.get("submitted_at"),
            "filled_at": payload.get("filled_at"),
            "filled_avg_price": float(payload["filled_avg_price"])
            if payload.get("filled_avg_price") not in (None, "")
            else None,
            "symbol": payload.get("symbol", symbol.upper().replace("/", "")),
            "side": side,
            "qty": float(payload.get("qty", quantity)),
        }


class FinnhubStocksOHLCVProvider:
    def __init__(self, api_key: str) -> None:
        self._api_key = api_key

    def get_symbols(self, market_type: str) -> list[str]:
        return ["SPY"] if market_type == "stocks" else []

    def get_ohlcv(
        self,
        symbol: str,
        timeframe: str,
        start: str | None = None,
        end: str | None = None,
    ) -> list[dict[str, Any]]:
        if timeframe != "1d":
            raise ValueError(f"Unsupported Finnhub timeframe: {timeframe}")
        end_utc = datetime.now(timezone.utc)
        start_utc = end_utc - timedelta(days=365)
        query = urlencode({
            "symbol": symbol.upper(),
            "resolution": "D",
            "from": int(start_utc.timestamp()),
            "to": int(end_utc.timestamp()),
            "token": self._api_key,
        })
        payload = _fetch_json(f"https://finnhub.io/api/v1/stock/candle?{query}")
        if payload.get("s") != "ok":
            raise ValueError(f"Finnhub response status: {payload.get('s')}")
        return [
            {
                "open_time_utc": datetime.fromtimestamp(timestamp, timezone.utc).isoformat(),
                "open": float(open_price),
                "high": float(high_price),
                "low": float(low_price),
                "close": float(close_price),
                "volume": float(volume),
            }
            for timestamp, open_price, high_price, low_price, close_price, volume in zip(
                payload.get("t", []),
                payload.get("o", []),
                payload.get("h", []),
                payload.get("l", []),
                payload.get("c", []),
                payload.get("v", []),
            )
        ]

    def get_quote(self, symbol: str) -> dict[str, Any]:
        candles = self.get_ohlcv(symbol, "1d")
        latest = candles[-1]
        return {"symbol": symbol.upper(), "last": latest["close"], "as_of_utc": latest["open_time_utc"]}

    def get_news(self, symbol: str, limit: int = 20) -> list[dict[str, Any]]:
        normalized_symbol = symbol.upper().replace("/", "")
        now_utc = datetime.now(timezone.utc)
        start_utc = now_utc - timedelta(days=7)
        query = urlencode(
            {
                "symbol": normalized_symbol,
                "from": start_utc.date().isoformat(),
                "to": now_utc.date().isoformat(),
                "token": self._api_key,
            }
        )
        payload = _fetch_json(f"https://finnhub.io/api/v1/company-news?{query}")
        items: list[dict[str, Any]] = []
        for entry in payload[:limit]:
            published_at = datetime.fromtimestamp(entry.get("datetime", 0), timezone.utc).isoformat()
            items.append(
                {
                    "id": f"finnhub-{normalized_symbol}-{entry.get('id', entry.get('datetime', 0))}",
                    "symbol": normalized_symbol,
                    "headline": entry.get("headline", f"{normalized_symbol} market update"),
                    "source": entry.get("source", "Finnhub"),
                    "publishedAt": published_at,
                    "summary": entry.get("summary") or entry.get("headline") or f"Latest provider-backed news for {normalized_symbol}.",
                    "sentiment": "neutral",
                }
            )
        return items


class PolygonStocksOHLCVProvider:
    def __init__(self, api_key: str) -> None:
        self._api_key = api_key

    def get_symbols(self, market_type: str) -> list[str]:
        return ["SPY"] if market_type == "stocks" else []

    def get_ohlcv(
        self,
        symbol: str,
        timeframe: str,
        start: str | None = None,
        end: str | None = None,
    ) -> list[dict[str, Any]]:
        if timeframe != "1d":
            raise ValueError(f"Unsupported Polygon timeframe: {timeframe}")
        end_date = datetime.now(timezone.utc).date()
        start_date = end_date - timedelta(days=365)
        query = urlencode({"adjusted": "true", "sort": "asc", "limit": 5000, "apiKey": self._api_key})
        payload = _fetch_json(
            f"https://api.polygon.io/v2/aggs/ticker/{symbol.upper()}/range/1/day/{start_date.isoformat()}/{end_date.isoformat()}?{query}"
        )
        return [
            {
                "open_time_utc": datetime.fromtimestamp(row["t"] / 1000, timezone.utc).isoformat(),
                "open": float(row["o"]),
                "high": float(row["h"]),
                "low": float(row["l"]),
                "close": float(row["c"]),
                "volume": float(row["v"]),
            }
            for row in payload.get("results", [])
        ]

    def get_quote(self, symbol: str) -> dict[str, Any]:
        candles = self.get_ohlcv(symbol, "1d")
        latest = candles[-1]
        return {"symbol": symbol.upper(), "last": latest["close"], "as_of_utc": latest["open_time_utc"]}


class TwelveDataStocksOHLCVProvider:
    def __init__(self, api_key: str) -> None:
        self._api_key = api_key

    def get_symbols(self, market_type: str) -> list[str]:
        return ["SPY"] if market_type == "stocks" else []

    def get_ohlcv(
        self,
        symbol: str,
        timeframe: str,
        start: str | None = None,
        end: str | None = None,
    ) -> list[dict[str, Any]]:
        if timeframe != "1d":
            raise ValueError(f"Unsupported Twelve Data timeframe: {timeframe}")
        query = urlencode({
            "symbol": symbol.upper(),
            "interval": "1day",
            "outputsize": 500,
            "apikey": self._api_key,
        })
        payload = _fetch_json(f"https://api.twelvedata.com/time_series?{query}")
        values = payload.get("values", [])
        candles = [
            {
                "open_time_utc": datetime.fromisoformat(f"{row['datetime']}+00:00").isoformat(),
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"]),
                "volume": float(row.get("volume", 0) or 0),
            }
            for row in values
        ]
        candles.sort(key=lambda entry: entry["open_time_utc"])
        return candles

    def get_quote(self, symbol: str) -> dict[str, Any]:
        candles = self.get_ohlcv(symbol, "1d")
        latest = candles[-1]
        return {"symbol": symbol.upper(), "last": latest["close"], "as_of_utc": latest["open_time_utc"]}