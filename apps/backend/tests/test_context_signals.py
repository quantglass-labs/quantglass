# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Regime context signals (SIG-2): environment reads with no trade geometry."""

import unittest

from app.services.signal_engine.service import SignalEngineService


def _candles(n=100, drift=0.01):
    out = []
    price = 100.0
    for i in range(n):
        nxt = price * (1 + drift)
        out.append(
            {
                "open_time_utc": f"2026-06-{(i % 28) + 1:02d}T00:00:00Z",
                "open": price,
                "high": max(price, nxt) * 1.004,
                "low": min(price, nxt) * 0.996,
                "close": nxt,
                "volume": 1000,
            }
        )
        price = nxt
    return out


class _Analytics:
    def __init__(self, candles):
        self.candles = candles

    def list_market_series(self, minimum_candles=80):
        return [{"symbol": "BTCUSD", "market_type": "crypto", "timeframe": "1d", "source": "test"}]

    def list_market_candles(self, symbol, timeframe, limit=120):
        return {"items": self.candles}


class ContextSignalTests(unittest.TestCase):
    def test_steady_uptrend_reads_trending_with_no_geometry(self) -> None:
        service = SignalEngineService(analytics_store=_Analytics(_candles()), min_backtest_sample=20)
        items = service.list_context_signals()
        self.assertEqual(len(items), 1)
        record = items[0]
        self.assertEqual(record["signal_class"], "context")
        self.assertEqual(record["family"], "regime")
        self.assertEqual(record["regime"], "trending")
        self.assertEqual(record["display_name"], "Trending Regime")
        for forbidden in ("entry_zone", "stop_loss", "take_profit"):
            self.assertNotIn(forbidden, record)

    def test_short_series_is_skipped(self) -> None:
        service = SignalEngineService(analytics_store=_Analytics(_candles(40)), min_backtest_sample=20)
        self.assertEqual(service.list_context_signals(), [])


if __name__ == "__main__":
    unittest.main()
