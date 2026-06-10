# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Known-answer tests for the statistical helpers behind backtest metrics.

These pin down the math that signal confidence is built on: win-rate
shrinkage, profit factor, Sharpe/Sortino, and the equity/drawdown curves.
"""

from math import sqrt

from app.services.signal_engine import SignalEngineService


def _engine(min_backtest_sample: int = 20) -> SignalEngineService:
    return SignalEngineService(analytics_store=object(), min_backtest_sample=min_backtest_sample)


class TestCalibrateWinRate:
    def test_empty_sample_returns_neutral_prior(self) -> None:
        assert _engine()._calibrate_win_rate(1.0, 0) == 0.5

    def test_perfect_tiny_sample_is_shrunk_hard_toward_half(self) -> None:
        # 3 wins out of 3 with a prior strength of 20:
        # (1.0*3 + 0.5*20) / 23 = 13/23
        calibrated = _engine(min_backtest_sample=20)._calibrate_win_rate(1.0, 3)
        assert abs(calibrated - 13 / 23) < 1e-12
        assert calibrated < 0.57

    def test_large_sample_dominates_the_prior(self) -> None:
        calibrated = _engine(min_backtest_sample=20)._calibrate_win_rate(0.62, 400)
        assert abs(calibrated - ((0.62 * 400) + 10) / 420) < 1e-12
        assert calibrated > 0.61

    def test_neutral_win_rate_is_a_fixed_point(self) -> None:
        assert _engine()._calibrate_win_rate(0.5, 37) == 0.5


class TestProfitFactor:
    def test_wins_over_losses(self) -> None:
        # Gross wins 3R, gross losses 2R.
        assert _engine()._profit_factor([2.0, 1.0, -1.0, -1.0]) == 1.5

    def test_no_losses_returns_gross_wins(self) -> None:
        assert _engine()._profit_factor([1.0, 0.5]) == 1.5

    def test_no_trades_returns_zero(self) -> None:
        assert _engine()._profit_factor([]) == 0.0


class TestSharpeAndSortino:
    def test_sharpe_known_answer(self) -> None:
        outcomes = [1.0, -1.0, 1.0, -1.0]
        # mean = 0, so Sharpe must be 0 regardless of deviation.
        assert _engine()._sharpe_ratio(outcomes) == 0.0

    def test_sharpe_positive_series(self) -> None:
        outcomes = [1.0, 2.0, 3.0]
        mean = 2.0
        deviation = 1.0  # sample stdev of [1,2,3]
        expected = (mean / deviation) * sqrt(3)
        assert abs(_engine()._sharpe_ratio(outcomes) - expected) < 1e-12

    def test_sharpe_requires_two_outcomes(self) -> None:
        assert _engine()._sharpe_ratio([1.5]) == 0.0

    def test_sortino_ignores_upside_volatility(self) -> None:
        # Same mean, but Sortino only penalizes downside deviation, so a
        # series with no losses has no downside deviation and returns 0.
        assert _engine()._sortino_ratio([1.0, 2.0, 3.0]) == 0.0

    def test_sortino_known_answer_with_losses(self) -> None:
        outcomes = [2.0, -1.0, 2.0, -1.0]
        downside = [0.0, -1.0, 0.0, -1.0]
        mean = 0.5
        downside_mean = -0.5
        downside_dev = sqrt(sum((d - downside_mean) ** 2 for d in downside) / 3)
        expected = (mean / downside_dev) * sqrt(4)
        assert abs(_engine()._sortino_ratio(outcomes) - expected) < 1e-12


class TestEquityAndDrawdownCurves:
    def test_equity_curve_compounds_at_1_2_percent_per_r(self) -> None:
        curve = _engine()._equity_curve([1.0, -1.0])
        assert curve[0] == 100.0
        assert abs(curve[1] - 101.2) < 1e-9
        assert abs(curve[2] - 101.2 * 0.988) < 1e-9

    def test_equity_curve_is_floored_above_zero(self) -> None:
        curve = _engine()._equity_curve([-80.0, -80.0, -80.0])
        assert min(curve) >= 1.0

    def test_drawdown_curve_tracks_peak_to_trough(self) -> None:
        drawdowns = _engine()._drawdown_curve([100.0, 110.0, 99.0, 110.0, 121.0])
        assert drawdowns[0] == 0.0
        assert drawdowns[1] == 0.0
        assert abs(drawdowns[2] - (-10.0)) < 1e-9
        assert drawdowns[3] == 0.0
        assert drawdowns[4] == 0.0


class TestDeriveConfidence:
    def test_unvalidated_backtest_caps_confidence(self) -> None:
        engine = _engine(min_backtest_sample=20)
        state = {
            "signal": "BUY",
            "trend_alignment": 1.0,
            "volume_confirmation": 1.0,
            "confluence_score": 0.9,
        }
        backtest = {
            "win_rate": 0.9,
            "trade_count": 200,
            "expectancy": 0.8,
            "out_of_sample_validated": False,
        }
        pooled = {"sample_size": 200, "win_rate": 0.9, "expectancy": 0.8}
        assert engine._derive_confidence(state, backtest, pooled) <= 62

    def test_confidence_is_bounded_between_20_and_89(self) -> None:
        engine = _engine(min_backtest_sample=20)
        weak_state = {
            "signal": "WAIT",
            "trend_alignment": -1.0,
            "volume_confirmation": 0.0,
            "confluence_score": 0.0,
        }
        bad_backtest = {
            "win_rate": 0.0,
            "trade_count": 5,
            "expectancy": -2.0,
            "out_of_sample_validated": False,
        }
        no_pool = {"sample_size": 0, "win_rate": 0.0, "expectancy": 0.0}
        low = engine._derive_confidence(weak_state, bad_backtest, no_pool)
        assert low >= 20

        strong_state = {
            "signal": "BUY",
            "trend_alignment": 1.0,
            "volume_confirmation": 1.0,
            "confluence_score": 1.0,
        }
        good_backtest = {
            "win_rate": 0.95,
            "trade_count": 500,
            "expectancy": 1.5,
            "out_of_sample_validated": True,
        }
        deep_pool = {"sample_size": 500, "win_rate": 0.95, "expectancy": 1.5}
        high = engine._derive_confidence(strong_state, good_backtest, deep_pool)
        assert high <= 89

    def test_thin_sample_scores_below_validated_deep_sample(self) -> None:
        engine = _engine(min_backtest_sample=20)
        state = {
            "signal": "BUY",
            "trend_alignment": 0.5,
            "volume_confirmation": 0.5,
            "confluence_score": 0.6,
        }
        backtest = {
            "win_rate": 0.7,
            "trade_count": 4,
            "expectancy": 0.4,
            "out_of_sample_validated": False,
        }
        thin = engine._derive_confidence(
            state, backtest, {"sample_size": 4, "win_rate": 0.7, "expectancy": 0.4}
        )
        validated = engine._derive_confidence(
            state,
            {**backtest, "trade_count": 200, "out_of_sample_validated": True},
            {"sample_size": 200, "win_rate": 0.7, "expectancy": 0.4},
        )
        assert thin < validated
