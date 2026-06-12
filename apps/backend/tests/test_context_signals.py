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
    def __init__(self, candles, symbols=("BTCUSD",)):
        self.candles = candles
        self.symbols = symbols

    def list_market_series(self, minimum_candles=80):
        return [
            {"symbol": symbol, "market_type": "crypto", "timeframe": "1d", "source": "test"}
            for symbol in self.symbols
        ]

    def list_market_candles(self, symbol, timeframe, limit=120):
        return {"items": self.candles[symbol] if isinstance(self.candles, dict) else self.candles}


class ContextSignalTests(unittest.TestCase):
    def test_steady_uptrend_reads_trending_with_no_geometry(self) -> None:
        service = SignalEngineService(
            analytics_store=_Analytics(_candles()), min_backtest_sample=20
        )
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
        service = SignalEngineService(
            analytics_store=_Analytics(_candles(40)), min_backtest_sample=20
        )
        self.assertEqual(service.list_context_signals(), [])


class CrossSectionalTests(unittest.TestCase):
    def test_leader_and_laggard_ranked_across_four_symbols(self) -> None:
        candles = {
            "A": _candles(drift=0.02),
            "B": _candles(drift=0.01),
            "C": _candles(drift=0.0),
            "D": _candles(drift=-0.01),
        }
        analytics = _Analytics(candles, symbols=("A", "B", "C", "D"))
        service = SignalEngineService(analytics_store=analytics, min_backtest_sample=20)
        items = service.list_context_signals()
        names = {item["display_name"]: item for item in items}
        self.assertIn("Relative Strength Leader", names)
        self.assertIn("Relative Weakness Laggard", names)
        self.assertEqual(names["Relative Strength Leader"]["symbol_id"], "A")
        self.assertEqual(names["Relative Weakness Laggard"]["symbol_id"], "D")

    def test_no_ranking_below_four_symbols(self) -> None:
        analytics = _Analytics({"A": _candles(), "B": _candles(drift=0.0)}, symbols=("A", "B"))
        service = SignalEngineService(analytics_store=analytics, min_backtest_sample=20)
        names = {item["display_name"] for item in service.list_context_signals()}
        self.assertNotIn("Relative Strength Leader", names)

    def test_price_spike_emits_z_score_stretch(self) -> None:
        # A steady ramp never exceeds |z|=2 (the last point of a smooth ramp
        # sits near 1.6 sigma); only a genuine dislocation should trigger.
        candles = _candles(drift=0.0)
        spike = dict(candles[-1])
        spike["close"] = spike["close"] * 1.12
        spike["high"] = spike["close"] * 1.01
        candles[-1] = spike
        service = SignalEngineService(analytics_store=_Analytics(candles), min_backtest_sample=20)
        names = {item["display_name"] for item in service.list_context_signals()}
        self.assertIn("Z-Score Extreme (Stretched Up)", names)
        steady = SignalEngineService(
            analytics_store=_Analytics(_candles(drift=0.02)), min_backtest_sample=20
        )
        steady_names = {item["display_name"] for item in steady.list_context_signals()}
        self.assertNotIn("Z-Score Extreme (Stretched Up)", steady_names)


if __name__ == "__main__":
    unittest.main()
