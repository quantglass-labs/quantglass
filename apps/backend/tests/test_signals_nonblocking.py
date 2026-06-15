# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""The signals endpoint must never block on a full recompute.

Detection + backtests are the expensive part and scale with the universe, so
the API path (compute=False) serves only the warm cache while the scheduler
recomputes in the background. These tests pin that contract without running a
real backtest.
"""

import unittest

from app.services.signal_engine.service import SignalEngineService


class _CountingAnalytics:
    """Minimal analytics store that counts the expensive candle fetches."""

    def __init__(self, series: list[dict[str, str]]) -> None:
        self._series = series
        self.candle_calls = 0

    def list_market_series(self, minimum_candles: int = 80) -> list[dict[str, str]]:
        return self._series

    def list_market_candles(self, symbol: str, timeframe: str, limit: int = 320) -> dict:
        self.candle_calls += 1
        return {"items": []}


def _service() -> tuple[SignalEngineService, _CountingAnalytics]:
    analytics = _CountingAnalytics(
        [{"symbol": "BTCUSD", "market_type": "crypto", "timeframe": "1d", "source": "test"}]
    )
    return SignalEngineService(analytics_store=analytics, min_backtest_sample=20), analytics


class NonBlockingSignalsTests(unittest.TestCase):
    def test_cold_cache_returns_empty_without_fetching_candles(self) -> None:
        service, analytics = _service()
        # The endpoint path must not touch the heavy candle/backtest path.
        self.assertEqual(service.list_signals(compute=False), [])
        self.assertEqual(analytics.candle_calls, 0)

    def test_serves_warm_cache_without_recompute(self) -> None:
        service, analytics = _service()
        service._signal_cache[("BTCUSD", "1d")] = (
            "ts1",
            {"signal": {"generated_at_utc": "2026-01-01T00:00:00Z"}},
        )
        served = service.list_signals(compute=False)
        self.assertEqual(len(served), 1)
        # Still no candle fetch — it read the cache, not the backtest path.
        self.assertEqual(analytics.candle_calls, 0)

    def test_compute_true_uses_the_recompute_path(self) -> None:
        service, analytics = _service()
        # With compute=True the engine does walk the candle path (here the empty
        # candles yield no signal, but the fetch happened — i.e. it would warm).
        service.list_signals(compute=True)
        self.assertEqual(analytics.candle_calls, 1)


if __name__ == "__main__":
    unittest.main()
