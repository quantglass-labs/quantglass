# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Pure indicator math over closed-candle series.

Every function is causal: the value at index ``i`` depends only on candles at
``i`` and earlier. Outputs are ``None`` until the warm-up window is filled.
"""

from __future__ import annotations

from math import sqrt
from typing import Any

from app.services.signal_engine.models import SeriesIndicators


def ema(values: list[float], period: int) -> list[float | None]:
    output: list[float | None] = [None] * len(values)
    if len(values) < period:
        return output
    multiplier = 2 / (period + 1)
    seed = sum(values[:period]) / period
    output[period - 1] = seed
    previous = seed
    for index in range(period, len(values)):
        previous = ((values[index] - previous) * multiplier) + previous
        output[index] = previous
    return output


def ema_of_optional(values: list[float | None], period: int) -> list[float | None]:
    output: list[float | None] = [None] * len(values)
    multiplier = 2 / (period + 1)
    previous: float | None = None
    seed_window: list[float] = []
    for index, value in enumerate(values):
        if value is None:
            continue
        if previous is None:
            seed_window.append(value)
            if len(seed_window) == period:
                previous = sum(seed_window) / period
                output[index] = previous
            continue
        previous = ((value - previous) * multiplier) + previous
        output[index] = previous
    return output


def macd_line(values: list[float]) -> list[float | None]:
    fast = ema(values, 12)
    slow = ema(values, 26)
    return [
        (fast_value - slow_value) if fast_value is not None and slow_value is not None else None
        for fast_value, slow_value in zip(fast, slow)
    ]


def bollinger(
    values: list[float],
    period: int,
    deviations: float,
) -> tuple[list[float | None], list[float | None], list[float | None], list[float | None]]:
    upper: list[float | None] = [None] * len(values)
    lower: list[float | None] = [None] * len(values)
    mid: list[float | None] = [None] * len(values)
    bandwidth: list[float | None] = [None] * len(values)
    if len(values) < period:
        return upper, lower, mid, bandwidth
    for index in range(period - 1, len(values)):
        window = values[index - period + 1 : index + 1]
        mean = sum(window) / period
        variance = sum((value - mean) ** 2 for value in window) / period
        std = sqrt(variance)
        upper[index] = mean + deviations * std
        lower[index] = mean - deviations * std
        mid[index] = mean
        bandwidth[index] = ((upper[index] - lower[index]) / mean) if mean else 0.0
    return upper, lower, mid, bandwidth


def donchian(
    highs: list[float],
    lows: list[float],
    period: int,
) -> tuple[list[float | None], list[float | None]]:
    upper: list[float | None] = [None] * len(highs)
    lower: list[float | None] = [None] * len(lows)
    for index in range(period - 1, len(highs)):
        upper[index] = max(highs[index - period + 1 : index + 1])
        lower[index] = min(lows[index - period + 1 : index + 1])
    return upper, lower


def keltner(
    ema_values: list[float | None],
    atr_values: list[float | None],
    multiplier: float,
) -> tuple[list[float | None], list[float | None]]:
    upper: list[float | None] = [None] * len(ema_values)
    lower: list[float | None] = [None] * len(ema_values)
    for index in range(len(ema_values)):
        mid = ema_values[index]
        band = atr_values[index]
        if mid is None or band is None:
            continue
        upper[index] = mid + multiplier * band
        lower[index] = mid - multiplier * band
    return upper, lower


def sma(values: list[float], period: int) -> list[float | None]:
    output: list[float | None] = [None] * len(values)
    if len(values) < period:
        return output
    running_total = sum(values[:period])
    output[period - 1] = running_total / period
    for index in range(period, len(values)):
        running_total += values[index] - values[index - period]
        output[index] = running_total / period
    return output


def rsi(values: list[float], period: int) -> list[float | None]:
    output: list[float | None] = [None] * len(values)
    if len(values) <= period:
        return output
    gains = [0.0] * len(values)
    losses = [0.0] * len(values)
    for index in range(1, len(values)):
        delta = values[index] - values[index - 1]
        gains[index] = max(delta, 0.0)
        losses[index] = max(-delta, 0.0)
    average_gain = sum(gains[1 : period + 1]) / period
    average_loss = sum(losses[1 : period + 1]) / period
    output[period] = (
        100.0 if average_loss == 0 else 100 - (100 / (1 + (average_gain / average_loss)))
    )
    for index in range(period + 1, len(values)):
        average_gain = ((average_gain * (period - 1)) + gains[index]) / period
        average_loss = ((average_loss * (period - 1)) + losses[index]) / period
        output[index] = (
            100.0 if average_loss == 0 else 100 - (100 / (1 + (average_gain / average_loss)))
        )
    return output


def atr(candles: list[dict[str, Any]], period: int) -> list[float | None]:
    output: list[float | None] = [None] * len(candles)
    if len(candles) <= period:
        return output
    true_ranges: list[float] = [0.0] * len(candles)
    for index, candle in enumerate(candles):
        high = float(candle["high"])
        low = float(candle["low"])
        if index == 0:
            true_ranges[index] = high - low
            continue
        previous_close = float(candles[index - 1]["close"])
        true_ranges[index] = max(high - low, abs(high - previous_close), abs(low - previous_close))
    average_true_range = sum(true_ranges[1 : period + 1]) / period
    output[period] = average_true_range
    for index in range(period + 1, len(candles)):
        average_true_range = ((average_true_range * (period - 1)) + true_ranges[index]) / period
        output[index] = average_true_range
    return output


def adx(candles: list[dict[str, Any]], period: int) -> list[float | None]:
    length = len(candles)
    output: list[float | None] = [None] * length
    if length <= period * 2:
        return output

    plus_dm = [0.0] * length
    minus_dm = [0.0] * length
    true_range = [0.0] * length
    for index in range(1, length):
        high = float(candles[index]["high"])
        low = float(candles[index]["low"])
        previous_high = float(candles[index - 1]["high"])
        previous_low = float(candles[index - 1]["low"])
        previous_close = float(candles[index - 1]["close"])
        up_move = high - previous_high
        down_move = previous_low - low
        plus_dm[index] = up_move if (up_move > down_move and up_move > 0) else 0.0
        minus_dm[index] = down_move if (down_move > up_move and down_move > 0) else 0.0
        true_range[index] = max(high - low, abs(high - previous_close), abs(low - previous_close))

    smoothed_tr = sum(true_range[1 : period + 1])
    smoothed_plus = sum(plus_dm[1 : period + 1])
    smoothed_minus = sum(minus_dm[1 : period + 1])

    dx_values: list[float] = []
    for index in range(period + 1, length):
        smoothed_tr = smoothed_tr - (smoothed_tr / period) + true_range[index]
        smoothed_plus = smoothed_plus - (smoothed_plus / period) + plus_dm[index]
        smoothed_minus = smoothed_minus - (smoothed_minus / period) + minus_dm[index]
        if smoothed_tr == 0:
            continue
        plus_di = 100 * (smoothed_plus / smoothed_tr)
        minus_di = 100 * (smoothed_minus / smoothed_tr)
        di_sum = plus_di + minus_di
        dx = 100 * (abs(plus_di - minus_di) / di_sum) if di_sum else 0.0
        dx_values.append(dx)
        if len(dx_values) == period:
            output[index] = sum(dx_values) / period
        elif len(dx_values) > period:
            output[index] = ((output[index - 1] or 0.0) * (period - 1) + dx) / period
    return output


def build_indicators(candles: list[dict[str, Any]]) -> SeriesIndicators:
    closes = [float(candle["close"]) for candle in candles]
    highs = [float(candle["high"]) for candle in candles]
    lows = [float(candle["low"]) for candle in candles]
    volumes = [float(candle["volume"]) for candle in candles]
    ema21 = ema(closes, 21)
    atr14 = atr(candles, 14)
    macd_values = macd_line(closes)
    macd_signal = ema_of_optional(macd_values, 9)
    macd_hist = [
        (line - signal) if line is not None and signal is not None else None
        for line, signal in zip(macd_values, macd_signal)
    ]
    bb_upper, bb_lower, bb_mid, bb_bandwidth = bollinger(closes, 20, 2.0)
    donchian_high, donchian_low = donchian(highs, lows, 20)
    keltner_upper, keltner_lower = keltner(ema21, atr14, 1.5)
    return SeriesIndicators(
        closes=closes,
        highs=highs,
        lows=lows,
        volumes=volumes,
        ema21=ema21,
        sma50=sma(closes, 50),
        rsi14=rsi(closes, 14),
        rsi2=rsi(closes, 2),
        atr14=atr14,
        adx14=adx(candles, 14),
        macd_hist=macd_hist,
        bb_upper=bb_upper,
        bb_lower=bb_lower,
        bb_mid=bb_mid,
        bb_bandwidth=bb_bandwidth,
        donchian_high=donchian_high,
        donchian_low=donchian_low,
        keltner_upper=keltner_upper,
        keltner_lower=keltner_lower,
    )
