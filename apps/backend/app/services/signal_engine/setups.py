# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Setup detection: market regimes, candidate families, and trade-level geometry.

``candidate_setups`` walks the built-in setup families (trend pullback/rejection,
breakout retest, range mean reversion) plus an optional extension hook, and
returns fully composed candidates with entry zone, stop, and take-profit ladder.
"""

from __future__ import annotations

from collections.abc import Callable
from statistics import median
from typing import Any

from app.services.signal_engine.models import SeriesIndicators


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def market_regime(indicators: SeriesIndicators, index: int) -> str:
    close = indicators.closes[index]
    ema = indicators.ema21[index]
    sma = indicators.sma50[index]
    adx = indicators.adx14[index]
    atr = indicators.atr14[index]
    if ema is None or sma is None or atr is None or close <= 0:
        return "transitional"
    atr_percent = atr / close
    baseline_window = [
        value / price
        for value, price in zip(
            indicators.atr14[max(0, index - 49) : index + 1],
            indicators.closes[max(0, index - 49) : index + 1],
        )
        if value is not None and price > 0
    ]
    baseline_atr_percent = median(baseline_window) if baseline_window else atr_percent
    if baseline_atr_percent and atr_percent >= baseline_atr_percent * 1.7:
        return "volatile"
    adx_value = adx if adx is not None else 0.0
    if adx_value >= 22.0:
        return "trending"
    if adx_value < 16.0:
        return "ranging"
    return "transitional"


def volatility_regime(indicators: SeriesIndicators, index: int, atr: float, close: float) -> str:
    current_atr_percent = atr / close if close else 0.0
    atr_percents = [
        atr_value / price
        for atr_value, price in zip(
            indicators.atr14[max(0, index - 29) : index + 1],
            indicators.closes[max(0, index - 29) : index + 1],
        )
        if atr_value is not None and price > 0
    ]
    baseline_atr_percent = median(atr_percents) if atr_percents else current_atr_percent
    if current_atr_percent <= baseline_atr_percent * 0.8:
        return "compressed"
    if current_atr_percent >= baseline_atr_percent * 1.25:
        return "expanded"
    return "normal"


def higher_timeframe_slope(sma50: list[float | None], index: int) -> float:
    current = sma50[index]
    prior = sma50[index - 10] if index >= 10 else None
    if current is None or prior is None or prior == 0:
        return 0.0
    return (current - prior) / prior


def confluence(
    base: float,
    trend_alignment: float,
    volume_confirmation: float,
    macd_agree: bool,
    htf_agree: bool,
    regime_bonus: float,
) -> float:
    score = base
    score += trend_alignment * 0.15
    score += volume_confirmation * 0.1
    score += 0.1 if macd_agree else 0.0
    score += 0.1 if htf_agree else 0.0
    score += regime_bonus
    return clamp(score)


def direction_for_setup(setup_type: str, fallback_direction: str) -> str:
    # Failed-move reversals trade AGAINST the move they name: a failed
    # breakout is a short, a failed breakdown is a long.
    if setup_type == "failed_breakout_reversal":
        return "short"
    if setup_type == "failed_breakdown_reversal":
        return "long"
    if (
        "breakdown" in setup_type
        or "short" in setup_type
        or setup_type in {"breakdown_watch", "trend_rejection_breakdown"}
    ):
        return "short"
    if "long" in setup_type or "pullback" in setup_type or "breakout" in setup_type:
        return "long"
    return fallback_direction


def build_reasons(
    market_type: str,
    signal_type: str,
    direction: str,
    timeframe: str,
    close: float,
    ema: float,
    sma: float,
    rsi: float,
    volume_ratio: float,
    volatility_regime: str,
    regime: str,
    invalidation_anchor: float,
) -> list[str]:
    trend_phrase = "above" if direction == "long" else "below"
    return [
        f"Latest {timeframe} close is {trend_phrase} the 21-period EMA and the 50-period trend baseline.",
        f"RSI is {rsi:.1f}, which keeps the current setup in a {signal_type.lower().replace('_', ' ')} state.",
        f"Volume is running at {volume_ratio:.2f}x the recent baseline, supporting participation quality.",
        f"Market regime is {regime} with {volatility_regime} volatility; invalidation sits near {invalidation_anchor:.2f}.",
    ]


def compose_candidate(
    signal_type: str,
    setup_type: str,
    direction: str,
    status: str,
    regime: str,
    indicators: SeriesIndicators,
    index: int,
    atr: float,
    ema: float,
    close: float,
    rsi: float,
    recent_high: float,
    recent_low: float,
    volume_ratio: float,
    volatility_regime: str,
    trend_alignment: float,
    volume_confirmation: float,
    confluence_score: float,
    market_type: str,
    timeframe: str,
    mean_reversion_target: float | None = None,
) -> dict[str, Any]:
    stop_multiple = (
        1.3
        if volatility_regime == "compressed"
        else 1.6
        if volatility_regime == "expanded"
        else 1.45
    )
    reward_multiple = 2.4 if signal_type in {"BUY_ZONE", "SELL"} else 1.8

    if direction == "long":
        reference_price = min(close, ema * 1.002)
        risk_distance = atr * stop_multiple
        entry_zone = [reference_price - (atr * 0.45), reference_price + (atr * 0.15)]
        stop_loss = reference_price - risk_distance
        if mean_reversion_target is not None and mean_reversion_target > reference_price:
            # Mean-reversion exits target the band midline, not an open-ended ladder.
            span = mean_reversion_target - reference_price
            take_profit = [
                reference_price + span * 0.6,
                mean_reversion_target,
                reference_price + span * 1.3,
            ]
        else:
            take_profit = [
                reference_price + (risk_distance * reward_multiple * 0.65),
                reference_price + (risk_distance * reward_multiple),
                reference_price + (risk_distance * reward_multiple * 1.35),
            ]
        invalidation_anchor = recent_low
    else:
        reference_price = max(close, ema * 0.998)
        risk_distance = atr * stop_multiple
        entry_zone = [reference_price - (atr * 0.15), reference_price + (atr * 0.45)]
        stop_loss = reference_price + risk_distance
        if mean_reversion_target is not None and mean_reversion_target < reference_price:
            span = reference_price - mean_reversion_target
            take_profit = [
                reference_price - span * 0.6,
                mean_reversion_target,
                reference_price - span * 1.3,
            ]
        else:
            take_profit = [
                reference_price - (risk_distance * reward_multiple * 0.65),
                reference_price - (risk_distance * reward_multiple),
                reference_price - (risk_distance * reward_multiple * 1.35),
            ]
        invalidation_anchor = recent_high

    current_atr_percent = atr / close if close else 0.0
    atr_percent = current_atr_percent * 100
    if atr_percent < 1.0:
        risk_level = "low"
    elif atr_percent < 2.6:
        risk_level = "medium"
    else:
        risk_level = "high"

    reasons = build_reasons(
        market_type=market_type,
        signal_type=signal_type,
        direction=direction,
        timeframe=timeframe,
        close=close,
        ema=ema,
        sma=indicators.sma50[index] or ema,
        rsi=rsi,
        volume_ratio=volume_ratio,
        volatility_regime=volatility_regime,
        regime=regime,
        invalidation_anchor=invalidation_anchor,
    )

    return {
        "signal": signal_type,
        "setup_type": setup_type,
        "direction": direction,
        "status": status,
        "regime": regime,
        "risk_level": risk_level,
        "reference_price": reference_price,
        "entry_zone": entry_zone,
        "stop_loss": stop_loss,
        "take_profit": take_profit,
        "trend_alignment": trend_alignment,
        "volume_confirmation": volume_confirmation,
        "volatility_regime": volatility_regime,
        "confluence_score": confluence_score,
        "reasons": reasons,
    }


def candidate_setups(
    market_type: str,
    timeframe: str,
    indicators: SeriesIndicators,
    index: int,
    extension_candidates: Callable[[dict[str, Any]], list[dict[str, Any]]] | None = None,
) -> list[dict[str, Any]]:
    if index < 55:
        return []

    close = indicators.closes[index]
    high = indicators.highs[index]
    low = indicators.lows[index]
    volume = indicators.volumes[index]
    ema = indicators.ema21[index]
    sma = indicators.sma50[index]
    rsi = indicators.rsi14[index]
    rsi_fast = indicators.rsi2[index]
    atr = indicators.atr14[index]
    macd_hist = indicators.macd_hist[index]
    bb_upper = indicators.bb_upper[index]
    bb_lower = indicators.bb_lower[index]
    donchian_high_prev = indicators.donchian_high[index - 1]
    donchian_low_prev = indicators.donchian_low[index - 1]
    if ema is None or sma is None or rsi is None or atr is None or atr <= 0:
        return []

    recent_start = max(0, index - 19)
    recent_high = max(indicators.highs[recent_start : index + 1])
    recent_low = min(indicators.lows[recent_start : index + 1])
    average_volume = sum(indicators.volumes[recent_start : index + 1]) / max(
        index + 1 - recent_start, 1
    )
    volume_ratio = volume / average_volume if average_volume else 0.0
    trend_gap = (ema - sma) / close if close else 0.0
    trend_alignment = clamp(abs(trend_gap) / 0.03)
    volume_confirmation = clamp(volume_ratio / 1.75)
    vol_regime = volatility_regime(indicators, index, atr, close)
    regime = market_regime(indicators, index)
    htf_slope = higher_timeframe_slope(indicators.sma50, index)
    macd_value = macd_hist if macd_hist is not None else 0.0

    bullish_trend = close > ema > sma
    bearish_trend = close < ema < sma

    candidates: list[dict[str, Any]] = []

    # --- Family 1: trend pullback / rejection (trending or transitional regimes) ---
    if regime in {"trending", "transitional"}:
        near_ema_pullback = low <= ema * 1.01 <= high or abs(close - ema) / close <= 0.008
        near_ema_rejection = low <= ema <= high or abs(close - ema) / close <= 0.008
        if bullish_trend and near_ema_pullback and 46 <= rsi <= 72:
            score = confluence(
                base=0.55,
                trend_alignment=trend_alignment,
                volume_confirmation=volume_confirmation,
                macd_agree=macd_value > 0,
                htf_agree=htf_slope > 0,
                regime_bonus=0.1 if regime == "trending" else 0.0,
            )
            candidates.append(
                compose_candidate(
                    signal_type="BUY_ZONE",
                    setup_type="daily_trend_pullback"
                    if timeframe == "1d"
                    else "ema_reclaim_pullback",
                    direction="long",
                    status="active",
                    regime=regime,
                    indicators=indicators,
                    index=index,
                    atr=atr,
                    ema=ema,
                    close=close,
                    rsi=rsi,
                    recent_high=recent_high,
                    recent_low=recent_low,
                    volume_ratio=volume_ratio,
                    volatility_regime=vol_regime,
                    trend_alignment=trend_alignment,
                    volume_confirmation=volume_confirmation,
                    confluence_score=score,
                    market_type=market_type,
                    timeframe=timeframe,
                )
            )
        elif bearish_trend and near_ema_rejection and 28 <= rsi <= 54:
            score = confluence(
                base=0.55,
                trend_alignment=trend_alignment,
                volume_confirmation=volume_confirmation,
                macd_agree=macd_value < 0,
                htf_agree=htf_slope < 0,
                regime_bonus=0.1 if regime == "trending" else 0.0,
            )
            candidates.append(
                compose_candidate(
                    signal_type="SELL",
                    setup_type="trend_rejection_breakdown",
                    direction="short",
                    status="active",
                    regime=regime,
                    indicators=indicators,
                    index=index,
                    atr=atr,
                    ema=ema,
                    close=close,
                    rsi=rsi,
                    recent_high=recent_high,
                    recent_low=recent_low,
                    volume_ratio=volume_ratio,
                    volatility_regime=vol_regime,
                    trend_alignment=trend_alignment,
                    volume_confirmation=volume_confirmation,
                    confluence_score=score,
                    market_type=market_type,
                    timeframe=timeframe,
                )
            )

    # --- Family 2: breakout retest (trending regime, Donchian + Keltner) ---
    if regime == "trending" and donchian_high_prev is not None and donchian_low_prev is not None:
        broke_out_up = high >= donchian_high_prev and close >= donchian_high_prev * 0.997
        broke_out_down = low <= donchian_low_prev and close <= donchian_low_prev * 1.003
        if bullish_trend and broke_out_up and volume_ratio >= 1.0:
            score = confluence(
                base=0.6,
                trend_alignment=trend_alignment,
                volume_confirmation=volume_confirmation,
                macd_agree=macd_value > 0,
                htf_agree=htf_slope > 0,
                regime_bonus=0.12,
            )
            candidates.append(
                compose_candidate(
                    signal_type="WATCH",
                    setup_type="breakout_retest_continuation",
                    direction="long",
                    status="active",
                    regime=regime,
                    indicators=indicators,
                    index=index,
                    atr=atr,
                    ema=ema,
                    close=close,
                    rsi=rsi,
                    recent_high=recent_high,
                    recent_low=recent_low,
                    volume_ratio=volume_ratio,
                    volatility_regime=vol_regime,
                    trend_alignment=trend_alignment,
                    volume_confirmation=volume_confirmation,
                    confluence_score=score,
                    market_type=market_type,
                    timeframe=timeframe,
                )
            )
        elif bearish_trend and broke_out_down and volume_ratio >= 1.0:
            score = confluence(
                base=0.6,
                trend_alignment=trend_alignment,
                volume_confirmation=volume_confirmation,
                macd_agree=macd_value < 0,
                htf_agree=htf_slope < 0,
                regime_bonus=0.12,
            )
            candidates.append(
                compose_candidate(
                    signal_type="WATCH",
                    setup_type="breakdown_retest_continuation",
                    direction="short",
                    status="active",
                    regime=regime,
                    indicators=indicators,
                    index=index,
                    atr=atr,
                    ema=ema,
                    close=close,
                    rsi=rsi,
                    recent_high=recent_high,
                    recent_low=recent_low,
                    volume_ratio=volume_ratio,
                    volatility_regime=vol_regime,
                    trend_alignment=trend_alignment,
                    volume_confirmation=volume_confirmation,
                    confluence_score=score,
                    market_type=market_type,
                    timeframe=timeframe,
                )
            )

    # --- Family 3: range mean reversion (ranging regime, RSI2 + Bollinger) ---
    if (
        regime == "ranging"
        and rsi_fast is not None
        and bb_upper is not None
        and bb_lower is not None
    ):
        if rsi_fast <= 8 and low <= bb_lower * 1.005:
            score = confluence(
                base=0.5,
                trend_alignment=0.3,
                volume_confirmation=volume_confirmation,
                macd_agree=True,
                htf_agree=htf_slope >= 0,
                regime_bonus=0.08,
            )
            candidates.append(
                compose_candidate(
                    signal_type="BUY_ZONE",
                    setup_type="range_meanreversion_long",
                    direction="long",
                    status="active",
                    regime=regime,
                    indicators=indicators,
                    index=index,
                    atr=atr,
                    ema=ema,
                    close=close,
                    rsi=rsi,
                    recent_high=recent_high,
                    recent_low=recent_low,
                    volume_ratio=volume_ratio,
                    volatility_regime=vol_regime,
                    trend_alignment=trend_alignment,
                    volume_confirmation=volume_confirmation,
                    confluence_score=score,
                    market_type=market_type,
                    timeframe=timeframe,
                    mean_reversion_target=indicators.bb_mid[index],
                )
            )
        elif rsi_fast >= 92 and high >= bb_upper * 0.995:
            score = confluence(
                base=0.5,
                trend_alignment=0.3,
                volume_confirmation=volume_confirmation,
                macd_agree=True,
                htf_agree=htf_slope <= 0,
                regime_bonus=0.08,
            )
            candidates.append(
                compose_candidate(
                    signal_type="SELL",
                    setup_type="range_meanreversion_short",
                    direction="short",
                    status="active",
                    regime=regime,
                    indicators=indicators,
                    index=index,
                    atr=atr,
                    ema=ema,
                    close=close,
                    rsi=rsi,
                    recent_high=recent_high,
                    recent_low=recent_low,
                    volume_ratio=volume_ratio,
                    volatility_regime=vol_regime,
                    trend_alignment=trend_alignment,
                    volume_confirmation=volume_confirmation,
                    confluence_score=score,
                    market_type=market_type,
                    timeframe=timeframe,
                    mean_reversion_target=indicators.bb_mid[index],
                )
            )

    if extension_candidates is not None:
        candidates.extend(
            extension_candidates(
                {
                    "market_type": market_type,
                    "timeframe": timeframe,
                    "indicators": indicators,
                    "index": index,
                    "close": close,
                    "high": high,
                    "low": low,
                    "volume": volume,
                    "ema21": ema,
                    "sma50": sma,
                    "rsi14": rsi,
                    "rsi2": rsi_fast,
                    "atr14": atr,
                    "volume_ratio": volume_ratio,
                    "trend_alignment": trend_alignment,
                    "volume_confirmation": volume_confirmation,
                    "volatility_regime": vol_regime,
                    "regime": regime,
                }
            )
        )

    # --- Family 4 (SIG-3): failed moves — breakouts/breakdowns that snapped back ---
    if donchian_high_prev is not None and donchian_low_prev is not None and index >= 2:
        prev_high = indicators.highs[index - 1]
        prev_low = indicators.lows[index - 1]
        broke_then_failed_up = prev_high > donchian_high_prev and close < donchian_high_prev
        broke_then_failed_down = prev_low < donchian_low_prev and close > donchian_low_prev
        if broke_then_failed_up and volume_ratio >= 0.9:
            score = confluence(
                base=0.5,
                trend_alignment=trend_alignment,
                volume_confirmation=volume_confirmation,
                macd_agree=macd_value < 0,
                htf_agree=htf_slope < 0,
                regime_bonus=0.08 if regime in {"ranging", "transitional"} else 0.0,
            )
            candidates.append(
                compose_candidate(
                    signal_type="SELL",
                    setup_type="failed_breakout_reversal",
                    direction="short",
                    status="active",
                    regime=regime,
                    indicators=indicators,
                    index=index,
                    atr=atr,
                    ema=ema,
                    close=close,
                    rsi=rsi,
                    recent_high=recent_high,
                    recent_low=recent_low,
                    volume_ratio=volume_ratio,
                    volatility_regime=vol_regime,
                    trend_alignment=trend_alignment,
                    volume_confirmation=volume_confirmation,
                    confluence_score=score,
                    market_type=market_type,
                    timeframe=timeframe,
                )
            )
        elif broke_then_failed_down and volume_ratio >= 0.9:
            score = confluence(
                base=0.5,
                trend_alignment=trend_alignment,
                volume_confirmation=volume_confirmation,
                macd_agree=macd_value > 0,
                htf_agree=htf_slope > 0,
                regime_bonus=0.08 if regime in {"ranging", "transitional"} else 0.0,
            )
            candidates.append(
                compose_candidate(
                    signal_type="BUY_ZONE",
                    setup_type="failed_breakdown_reversal",
                    direction="long",
                    status="active",
                    regime=regime,
                    indicators=indicators,
                    index=index,
                    atr=atr,
                    ema=ema,
                    close=close,
                    rsi=rsi,
                    recent_high=recent_high,
                    recent_low=recent_low,
                    volume_ratio=volume_ratio,
                    volatility_regime=vol_regime,
                    trend_alignment=trend_alignment,
                    volume_confirmation=volume_confirmation,
                    confluence_score=score,
                    market_type=market_type,
                    timeframe=timeframe,
                )
            )

    # --- Family 5 (SIG-3): liquidity sweep and reclaim of a prior extreme ---
    if index >= 21:
        prior_low = min(indicators.lows[index - 20 : index])
        prior_high = max(indicators.highs[index - 20 : index])
        swept_low_reclaimed = low < prior_low and close > prior_low
        swept_high_reclaimed = high > prior_high and close < prior_high
        if swept_low_reclaimed and volume_ratio >= 1.1:
            score = confluence(
                base=0.52,
                trend_alignment=trend_alignment,
                volume_confirmation=volume_confirmation,
                macd_agree=macd_value > 0,
                htf_agree=htf_slope > 0,
                regime_bonus=0.05,
            )
            candidates.append(
                compose_candidate(
                    signal_type="BUY_ZONE",
                    setup_type="liquidity_sweep_reclaim_long",
                    direction="long",
                    status="active",
                    regime=regime,
                    indicators=indicators,
                    index=index,
                    atr=atr,
                    ema=ema,
                    close=close,
                    rsi=rsi,
                    recent_high=recent_high,
                    recent_low=recent_low,
                    volume_ratio=volume_ratio,
                    volatility_regime=vol_regime,
                    trend_alignment=trend_alignment,
                    volume_confirmation=volume_confirmation,
                    confluence_score=score,
                    market_type=market_type,
                    timeframe=timeframe,
                )
            )
        elif swept_high_reclaimed and volume_ratio >= 1.1:
            score = confluence(
                base=0.52,
                trend_alignment=trend_alignment,
                volume_confirmation=volume_confirmation,
                macd_agree=macd_value < 0,
                htf_agree=htf_slope < 0,
                regime_bonus=0.05,
            )
            candidates.append(
                compose_candidate(
                    signal_type="SELL",
                    setup_type="liquidity_sweep_reclaim_short",
                    direction="short",
                    status="active",
                    regime=regime,
                    indicators=indicators,
                    index=index,
                    atr=atr,
                    ema=ema,
                    close=close,
                    rsi=rsi,
                    recent_high=recent_high,
                    recent_low=recent_low,
                    volume_ratio=volume_ratio,
                    volatility_regime=vol_regime,
                    trend_alignment=trend_alignment,
                    volume_confirmation=volume_confirmation,
                    confluence_score=score,
                    market_type=market_type,
                    timeframe=timeframe,
                )
            )

    # --- Family 6 (SIG-3): moving average crossover (EMA21 x SMA50) ---
    prev_ema = indicators.ema21[index - 1] if index >= 1 else None
    prev_sma = indicators.sma50[index - 1] if index >= 1 else None
    if prev_ema is not None and prev_sma is not None:
        crossed_up = prev_ema <= prev_sma and ema > sma
        crossed_down = prev_ema >= prev_sma and ema < sma
        if (crossed_up or crossed_down) and regime != "volatile":
            is_long = crossed_up
            score = confluence(
                base=0.5,
                trend_alignment=trend_alignment,
                volume_confirmation=volume_confirmation,
                macd_agree=(macd_value > 0) == is_long,
                htf_agree=(htf_slope > 0) == is_long,
                regime_bonus=0.06 if regime == "trending" else 0.0,
            )
            candidates.append(
                compose_candidate(
                    signal_type="BUY_ZONE" if is_long else "SELL",
                    setup_type="ma_crossover_long" if is_long else "ma_crossover_short",
                    direction="long" if is_long else "short",
                    status="active",
                    regime=regime,
                    indicators=indicators,
                    index=index,
                    atr=atr,
                    ema=ema,
                    close=close,
                    rsi=rsi,
                    recent_high=recent_high,
                    recent_low=recent_low,
                    volume_ratio=volume_ratio,
                    volatility_regime=vol_regime,
                    trend_alignment=trend_alignment,
                    volume_confirmation=volume_confirmation,
                    confluence_score=score,
                    market_type=market_type,
                    timeframe=timeframe,
                )
            )

    # --- Family 7 (SIG-3): inside-bar break in trend direction ---
    if index >= 2:
        mother_high = indicators.highs[index - 2]
        mother_low = indicators.lows[index - 2]
        inside = (
            indicators.highs[index - 1] <= mother_high and indicators.lows[index - 1] >= mother_low
        )
        if inside and regime in {"trending", "transitional"}:
            broke_up = bullish_trend and close > mother_high
            broke_down = bearish_trend and close < mother_low
            if broke_up or broke_down:
                is_long = broke_up
                score = confluence(
                    base=0.5,
                    trend_alignment=trend_alignment,
                    volume_confirmation=volume_confirmation,
                    macd_agree=(macd_value > 0) == is_long,
                    htf_agree=(htf_slope > 0) == is_long,
                    regime_bonus=0.08 if regime == "trending" else 0.0,
                )
                candidates.append(
                    compose_candidate(
                        signal_type="BUY_ZONE" if is_long else "SELL",
                        setup_type="inside_bar_break_long" if is_long else "inside_bar_break_short",
                        direction="long" if is_long else "short",
                        status="active",
                        regime=regime,
                        indicators=indicators,
                        index=index,
                        atr=atr,
                        ema=ema,
                        close=close,
                        rsi=rsi,
                        recent_high=recent_high,
                        recent_low=recent_low,
                        volume_ratio=volume_ratio,
                        volatility_regime=vol_regime,
                        trend_alignment=trend_alignment,
                        volume_confirmation=volume_confirmation,
                        confluence_score=score,
                        market_type=market_type,
                        timeframe=timeframe,
                    )
                )

    # --- SIG-3 tranche 2 helper: one call per detector keeps blocks honest ---
    def _emit(signal_type: str, setup_type: str, is_long: bool, base: float, bonus: float) -> None:
        score = confluence(
            base=base,
            trend_alignment=trend_alignment,
            volume_confirmation=volume_confirmation,
            macd_agree=(macd_value > 0) == is_long,
            htf_agree=(htf_slope > 0) == is_long,
            regime_bonus=bonus,
        )
        candidates.append(
            compose_candidate(
                signal_type=signal_type,
                setup_type=setup_type,
                direction="long" if is_long else "short",
                status="active",
                regime=regime,
                indicators=indicators,
                index=index,
                atr=atr,
                ema=ema,
                close=close,
                rsi=rsi,
                recent_high=recent_high,
                recent_low=recent_low,
                volume_ratio=volume_ratio,
                volatility_regime=vol_regime,
                trend_alignment=trend_alignment,
                volume_confirmation=volume_confirmation,
                confluence_score=score,
                market_type=market_type,
                timeframe=timeframe,
            )
        )

    # --- Family 8 (SIG-3): session gaps — continuation vs fill ---
    if indicators.opens and index >= 1:
        open_price = indicators.opens[index]
        prior_close = indicators.closes[index - 1]
        gap_fraction = (open_price - prior_close) / prior_close if prior_close > 0 else 0.0
        if abs(gap_fraction) >= 0.01 and abs(open_price - prior_close) >= atr * 0.5:
            gapped_up = gap_fraction > 0
            held = close > open_price if gapped_up else close < open_price
            faded = close < prior_close if gapped_up else close > prior_close
            if held and volume_ratio >= 1.1:
                _emit(
                    "BUY_ZONE" if gapped_up else "SELL",
                    "gap_and_go_long" if gapped_up else "gap_and_go_short",
                    gapped_up,
                    0.5,
                    0.08 if regime == "trending" else 0.0,
                )
            elif faded:
                _emit(
                    "SELL" if gapped_up else "BUY_ZONE",
                    "gap_fill_reversal_short" if gapped_up else "gap_fill_reversal_long",
                    not gapped_up,
                    0.48,
                    0.05,
                )

    # --- Family 9 (SIG-3): rolling VWAP reclaim / rejection ---
    if indicators.vwap20 and index >= 1:
        vwap_now = indicators.vwap20[index]
        vwap_prev = indicators.vwap20[index - 1]
        close_prev = indicators.closes[index - 1]
        if vwap_now is not None and vwap_prev is not None and regime != "volatile":
            reclaimed = close_prev < vwap_prev and close > vwap_now
            rejected = close_prev > vwap_prev and close < vwap_now
            if reclaimed and volume_ratio >= 1.0:
                _emit("BUY_ZONE", "vwap_reclaim_long", True, 0.5, 0.05)
            elif rejected and volume_ratio >= 1.0:
                _emit("SELL", "vwap_rejection_short", False, 0.5, 0.05)

    # --- Family 10 (SIG-3): change of character — break of the last swing ---
    if index >= 10:
        swing_high = max(indicators.highs[index - 10 : index - 2])
        swing_low = min(indicators.lows[index - 10 : index - 2])
        if bearish_trend and close > swing_high and volume_ratio >= 1.1:
            _emit("WATCH", "structure_break_long", True, 0.46, 0.0)
        elif bullish_trend and close < swing_low and volume_ratio >= 1.1:
            _emit("WATCH", "structure_break_short", False, 0.46, 0.0)

    # --- Family 11 (SIG-3): outside-bar reversal against the recent drift ---
    if index >= 6:
        engulfs = high > indicators.highs[index - 1] and low < indicators.lows[index - 1]
        drift = indicators.closes[index - 1] - indicators.closes[index - 6]
        if engulfs and volume_ratio >= 1.2:
            closed_against_down_drift = drift < 0 and close > indicators.highs[index - 1]
            closed_against_up_drift = drift > 0 and close < indicators.lows[index - 1]
            if closed_against_down_drift:
                _emit("BUY_ZONE", "outside_bar_reversal_long", True, 0.5, 0.0)
            elif closed_against_up_drift:
                _emit("SELL", "outside_bar_reversal_short", False, 0.5, 0.0)

    # --- Fallback states so the surface always has a contextual read ---
    if not candidates:
        if bullish_trend:
            fallback_signal, fallback_setup, direction = (
                "HOLD",
                "trend_hold_continuation",
                "long",
            )
            status = "active"
        elif bearish_trend:
            fallback_signal, fallback_setup, direction = "WATCH", "breakdown_watch", "short"
            status = "active"
        else:
            fallback_signal, fallback_setup, direction = "WAIT", "range_reset", "long"
            status = "invalidated"
        score = confluence(
            base=0.3,
            trend_alignment=trend_alignment,
            volume_confirmation=volume_confirmation,
            macd_agree=(macd_value > 0) if direction == "long" else (macd_value < 0),
            htf_agree=(htf_slope > 0) if direction == "long" else (htf_slope < 0),
            regime_bonus=0.0,
        )
        candidates.append(
            compose_candidate(
                signal_type=fallback_signal,
                setup_type=fallback_setup,
                direction=direction,
                status=status,
                regime=regime,
                indicators=indicators,
                index=index,
                atr=atr,
                ema=ema,
                close=close,
                rsi=rsi,
                recent_high=recent_high,
                recent_low=recent_low,
                volume_ratio=volume_ratio,
                volatility_regime=vol_regime,
                trend_alignment=trend_alignment,
                volume_confirmation=volume_confirmation,
                confluence_score=score,
                market_type=market_type,
                timeframe=timeframe,
            )
        )

    return candidates
