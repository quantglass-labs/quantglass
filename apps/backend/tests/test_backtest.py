"""Tests for the ladder backtest simulator.

The simulator must size partial exits with the exact weights the signal shows the
user (0.5 / 0.3 / 0.2) and must take the stop honestly when price trades through it.
"""

from app.services.signal_engine import SeriesIndicators, SignalEngineService


def _engine() -> SignalEngineService:
    return SignalEngineService(analytics_store=object(), min_backtest_sample=20)


def _indicators(closes: list[float], highs: list[float], lows: list[float]) -> SeriesIndicators:
    n = len(closes)
    none_list = [None] * n
    return SeriesIndicators(
        closes=closes,
        highs=highs,
        lows=lows,
        volumes=[1.0] * n,
        ema21=list(none_list),
        sma50=list(none_list),
        rsi14=list(none_list),
        rsi2=list(none_list),
        atr14=list(none_list),
        adx14=list(none_list),
        macd_hist=list(none_list),
        bb_upper=list(none_list),
        bb_lower=list(none_list),
        bb_mid=list(none_list),
        bb_bandwidth=list(none_list),
        donchian_high=list(none_list),
        donchian_low=list(none_list),
        keltner_upper=list(none_list),
        keltner_lower=list(none_list),
    )


def test_long_full_ladder_hit_returns_weighted_r() -> None:
    engine = _engine()
    # entry 100, stop 98 -> risk 2. TPs at +1R, +2R, +3R = 102, 104, 106.
    closes = [100.0, 102.0, 104.0, 106.0]
    highs = [100.0, 102.0, 104.0, 106.0]
    lows = [100.0, 101.0, 103.0, 105.0]
    indicators = _indicators(closes, highs, lows)

    result = engine._simulate_ladder_trade(
        indicators=indicators,
        index=0,
        direction="long",
        entry=100.0,
        stop_loss=98.0,
        take_profit=[102.0, 104.0, 106.0],
        max_hold_bars=10,
        round_trip_cost=0.0,
    )
    expected = 0.5 * 1.0 + 0.3 * 2.0 + 0.2 * 3.0  # = 1.7R
    assert result is not None
    assert abs(result - expected) < 1e-9


def test_long_stop_out_returns_minus_one_r() -> None:
    engine = _engine()
    closes = [100.0, 97.0]
    highs = [100.0, 100.0]
    lows = [100.0, 97.0]  # trades straight through the 98 stop
    indicators = _indicators(closes, highs, lows)

    result = engine._simulate_ladder_trade(
        indicators=indicators,
        index=0,
        direction="long",
        entry=100.0,
        stop_loss=98.0,
        take_profit=[102.0, 104.0, 106.0],
        max_hold_bars=10,
        round_trip_cost=0.0,
    )
    assert result is not None
    assert abs(result - (-1.0)) < 1e-9


def test_round_trip_cost_reduces_realized_r() -> None:
    engine = _engine()
    closes = [100.0, 102.0, 104.0, 106.0]
    highs = [100.0, 102.0, 104.0, 106.0]
    lows = [100.0, 101.0, 103.0, 105.0]
    indicators = _indicators(closes, highs, lows)

    no_cost = engine._simulate_ladder_trade(
        indicators=indicators,
        index=0,
        direction="long",
        entry=100.0,
        stop_loss=98.0,
        take_profit=[102.0, 104.0, 106.0],
        max_hold_bars=10,
        round_trip_cost=0.0,
    )
    with_cost = engine._simulate_ladder_trade(
        indicators=indicators,
        index=0,
        direction="long",
        entry=100.0,
        stop_loss=98.0,
        take_profit=[102.0, 104.0, 106.0],
        max_hold_bars=10,
        round_trip_cost=0.001,
    )
    assert no_cost is not None and with_cost is not None
    assert with_cost < no_cost


def test_zero_risk_trade_is_rejected() -> None:
    engine = _engine()
    indicators = _indicators([100.0, 101.0], [100.0, 101.0], [100.0, 100.0])
    result = engine._simulate_ladder_trade(
        indicators=indicators,
        index=0,
        direction="long",
        entry=100.0,
        stop_loss=100.0,
        take_profit=[101.0, 102.0, 103.0],
        max_hold_bars=5,
        round_trip_cost=0.0,
    )
    assert result is None
