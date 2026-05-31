"""Tests for win-rate calibration (F4) and corridor timeframe coverage (F1)."""

from datetime import timedelta

from app.providers.public import (
    CoinbasePublicOHLCVProvider,
    GeminiPublicOHLCVProvider,
    KrakenPublicOHLCVProvider,
)
from app.services.market_corridor import MarketCorridorService
from app.services.signal_engine import SignalEngineService


def _engine(min_sample: int = 30) -> SignalEngineService:
    return SignalEngineService(analytics_store=object(), min_backtest_sample=min_sample)


def test_thin_sample_shrinks_toward_prior() -> None:
    engine = _engine(min_sample=30)
    # 100% win rate on 3 trades must not read anywhere near 1.0.
    calibrated = engine._calibrate_win_rate(1.0, 3)
    assert calibrated < 0.6


def test_large_sample_tracks_observed_rate() -> None:
    engine = _engine(min_sample=30)
    calibrated = engine._calibrate_win_rate(0.7, 1000)
    assert abs(calibrated - 0.7) < 0.02


def test_zero_sample_returns_neutral_prior() -> None:
    engine = _engine()
    assert engine._calibrate_win_rate(0.9, 0) == 0.5


def test_every_corridor_timeframe_has_expected_delta() -> None:
    # Invariant: every ingested timeframe must be schedulable (gap analysis needs a delta).
    for target in MarketCorridorService._corridor_targets:
        delta = MarketCorridorService._expected_delta(target["timeframe"])
        assert isinstance(delta, timedelta)
        assert delta > timedelta(0)


def test_crypto_providers_support_intraday_timeframes() -> None:
    # The 15m/4h corridor targets require provider granularity support somewhere in the chain.
    assert "15m" in CoinbasePublicOHLCVProvider._granularity_by_timeframe
    assert "15m" in KrakenPublicOHLCVProvider._interval_by_timeframe
    assert "4h" in KrakenPublicOHLCVProvider._interval_by_timeframe
    assert "15m" in GeminiPublicOHLCVProvider._period_by_timeframe
