# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Unit tests for the pure indicator helpers used by the signal engine.

These verify the hand-rolled (numpy-free) implementations against known values so
that the confidence basis and backtest math stay trustworthy.
"""

from statistics import mean

from app.services.signal_engine import SeriesIndicators, SignalEngineService


def _engine() -> SignalEngineService:
    # The indicator helpers never touch the analytics store, so a dummy is fine.
    return SignalEngineService(analytics_store=object(), min_backtest_sample=20)


def test_sma_matches_simple_mean() -> None:
    engine = _engine()
    values = [float(x) for x in range(1, 11)]
    sma = engine._sma(values, 5)
    # First four entries cannot be computed.
    assert sma[:4] == [None, None, None, None]
    assert sma[4] == mean(values[0:5])
    assert sma[-1] == mean(values[-5:])


def test_ema_seeded_from_sma_and_responsive() -> None:
    engine = _engine()
    values = [10.0] * 10 + [20.0] * 10
    ema = engine._ema(values, 5)
    assert ema[3] is None
    # Seed equals the SMA of the first window.
    assert ema[4] == 10.0
    # EMA must climb toward the new level but never overshoot it.
    assert ema[-1] is not None
    assert 10.0 < ema[-1] <= 20.0


def test_rsi_all_gains_saturates_high() -> None:
    engine = _engine()
    rising = [float(x) for x in range(1, 30)]
    rsi = engine._rsi(rising, 14)
    assert rsi[-1] is not None
    assert rsi[-1] > 99.0


def test_rsi_all_losses_saturates_low() -> None:
    engine = _engine()
    falling = [float(x) for x in range(30, 1, -1)]
    rsi = engine._rsi(falling, 14)
    assert rsi[-1] is not None
    assert rsi[-1] < 1.0


def test_bollinger_band_ordering_and_midline() -> None:
    engine = _engine()
    values = [10.0, 11.0, 9.0, 12.0, 8.0, 13.0, 7.0, 14.0, 6.0, 15.0]
    upper, lower, mid, bandwidth = engine._bollinger(values, 5, 2.0)
    idx = len(values) - 1
    assert mid[idx] is not None and upper[idx] is not None and lower[idx] is not None
    assert lower[idx] < mid[idx] < upper[idx]
    assert bandwidth[idx] is not None and bandwidth[idx] > 0


def test_donchian_tracks_window_extremes() -> None:
    engine = _engine()
    highs = [1.0, 5.0, 3.0, 8.0, 2.0]
    lows = [0.5, 1.0, 0.2, 4.0, 0.1]
    dc_high, dc_low = engine._donchian(highs, lows, 3)
    assert dc_high[-1] == max(highs[-3:])
    assert dc_low[-1] == min(lows[-3:])


def test_atr_positive_for_volatile_series() -> None:
    engine = _engine()
    candles = [
        {"high": 10 + i, "low": 8 + i, "close": 9 + i}
        for i in range(20)
    ]
    atr = engine._atr(candles, 14)
    assert atr[-1] is not None
    assert atr[-1] > 0


def test_adx_strong_trend_high_value() -> None:
    engine = _engine()
    # A clean uptrend should produce a meaningfully strong ADX reading.
    candles = [
        {"high": 10 + i, "low": 9 + i, "close": 9.5 + i}
        for i in range(40)
    ]
    adx = engine._adx(candles, 14)
    assert adx[-1] is not None
    assert adx[-1] > 25.0


def test_macd_line_turns_positive_on_uptrend() -> None:
    engine = _engine()
    values = [10.0] * 5 + [10.0 + x for x in range(1, 35)]
    macd = engine._macd_line(values)
    assert macd[-1] is not None
    assert macd[-1] > 0
