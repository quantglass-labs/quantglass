from __future__ import annotations

from dataclasses import dataclass
from math import sqrt
from statistics import median
from typing import Any, Protocol


class SignalNarrator(Protocol):
    def narrate(self, facts: dict[str, Any]) -> tuple[str, str]:
        ...


from app.storage.analytics_store import AnalyticsStore


@dataclass(frozen=True)
class SeriesIndicators:
    closes: list[float]
    highs: list[float]
    lows: list[float]
    volumes: list[float]
    ema21: list[float | None]
    sma50: list[float | None]
    rsi14: list[float | None]
    rsi2: list[float | None]
    atr14: list[float | None]
    adx14: list[float | None]
    macd_hist: list[float | None]
    bb_upper: list[float | None]
    bb_lower: list[float | None]
    bb_mid: list[float | None]
    bb_bandwidth: list[float | None]
    donchian_high: list[float | None]
    donchian_low: list[float | None]
    keltner_upper: list[float | None]
    keltner_lower: list[float | None]


# Scale-out weights for the displayed 3-rung take-profit ladder. Backtests must size
# partial exits identically to what the signal shows the user.
_TP_LADDER_WEIGHTS = (0.5, 0.3, 0.2)


class SignalEngineService:
    def __init__(
        self,
        analytics_store: AnalyticsStore,
        min_backtest_sample: int,
        narrator: SignalNarrator | None = None,
    ) -> None:
        self._analytics_store = analytics_store
        self._min_backtest_sample = min_backtest_sample
        self._narrator = narrator

    def list_signals(self) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        for series in self._analytics_store.list_market_series(minimum_candles=80):
            candle_payload = self._analytics_store.list_market_candles(
                series["symbol"],
                series["timeframe"],
                limit=320,
            )
            signal = self._build_signal_record(
                symbol_id=series["symbol"],
                market_type=series["market_type"],
                timeframe=series["timeframe"],
                source=series["source"],
                candles=candle_payload["items"],
            )
            if signal is not None:
                items.append(signal)

        items.sort(key=lambda item: item["signal"]["generated_at_utc"], reverse=True)
        return items

    def list_backtest_presets(self) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        for series in self._analytics_store.list_market_series(minimum_candles=80):
            preset = self.run_backtest_analysis(
                symbol_id=series["symbol"],
                market_type=series["market_type"],
                timeframe=series["timeframe"],
                setup_type=None,
                fees_percent=None,
                slippage_percent=None,
                train_test_split=70,
                walk_forward=True,
            )
            if preset is not None:
                items.append(preset)
        items.sort(key=lambda item: (item["timeframe"], item["name"]))
        return items

    def run_backtest_analysis(
        self,
        symbol_id: str,
        market_type: str,
        timeframe: str,
        setup_type: str | None,
        fees_percent: float | None,
        slippage_percent: float | None,
        train_test_split: int,
        walk_forward: bool,
    ) -> dict[str, Any] | None:
        candle_payload = self._analytics_store.list_market_candles(symbol_id, timeframe, limit=320)
        candles = candle_payload["items"]
        if len(candles) < 80:
            return None

        indicators = self._build_indicators(candles)
        latest_state = self._classify_state(
            symbol_id=symbol_id,
            market_type=market_type,
            timeframe=timeframe,
            source=candle_payload.get("source") or "",
            candles=candles,
            indicators=indicators,
            index=len(candles) - 1,
        )
        if latest_state is None:
            return None

        selected_setup_type = setup_type or latest_state["setup_type"]
        selected_direction = self._direction_for_setup(selected_setup_type, latest_state["direction"])
        default_fees_percent, default_slippage_percent = self._default_costs(market_type)
        backtest = self._run_backtest(
            candles=candles,
            indicators=indicators,
            market_type=market_type,
            timeframe=timeframe,
            setup_type=selected_setup_type,
            direction=selected_direction,
            fees_percent=fees_percent if fees_percent is not None else default_fees_percent,
            slippage_percent=slippage_percent if slippage_percent is not None else default_slippage_percent,
            train_test_split=train_test_split,
            walk_forward=walk_forward,
        )

        return self._build_backtest_preset(
            symbol_id=symbol_id,
            market_type=market_type,
            timeframe=timeframe,
            setup_type=selected_setup_type,
            fees_percent=fees_percent if fees_percent is not None else default_fees_percent,
            slippage_percent=slippage_percent if slippage_percent is not None else default_slippage_percent,
            train_test_split=train_test_split,
            walk_forward=walk_forward,
            backtest=backtest,
        )

    def _build_signal_record(
        self,
        symbol_id: str,
        market_type: str,
        timeframe: str,
        source: str,
        candles: list[dict[str, Any]],
    ) -> dict[str, Any] | None:
        if len(candles) < 80:
            return None

        indicators = self._build_indicators(candles)
        latest_index = len(candles) - 1
        state = self._classify_state(
            symbol_id=symbol_id,
            market_type=market_type,
            timeframe=timeframe,
            source=source,
            candles=candles,
            indicators=indicators,
            index=latest_index,
        )
        if state is None:
            return None

        fees_percent, slippage_percent = self._default_costs(market_type)
        backtest = self._run_backtest(
            candles=candles,
            indicators=indicators,
            market_type=market_type,
            timeframe=timeframe,
            setup_type=state["setup_type"],
            direction=state["direction"],
            fees_percent=fees_percent,
            slippage_percent=slippage_percent,
            train_test_split=70,
            walk_forward=True,
        )

        # Persist this symbol's per-setup expectancy so confidence can be pooled across
        # the whole watchlist rather than relying on a single thin sample.
        self._persist_expectancy(
            symbol_id=symbol_id,
            setup_type=state["setup_type"],
            timeframe=timeframe,
            regime=state["regime"],
            backtest=backtest,
        )
        pooled = self._analytics_store.get_pooled_expectancy(state["setup_type"], timeframe)

        confidence = self._derive_confidence(state=state, backtest=backtest, pooled=pooled)
        generated_at_utc = candles[-1]["open_time_utc"]
        ingested_at = candles[-1].get("ingested_at")
        display_symbol = self._display_symbol(symbol_id, market_type)
        signal_id = self._build_signal_id(symbol_id, timeframe, state["signal"], generated_at_utc)

        stop_loss = round(state["stop_loss"], 2)
        take_profit = [round(level, 2) for level in state["take_profit"]]
        entry_zone = [round(level, 2) for level in state["entry_zone"]]
        risk_reward = self._risk_reward(
            entry=state["reference_price"],
            stop_loss=stop_loss,
            take_profit=take_profit,
            direction=state["direction"],
        )

        data_age_seconds, last_candle_close_at = self._data_freshness(
            timeframe=timeframe,
            generated_at_utc=generated_at_utc,
        )

        narration_text, narration_source = self._narrate(
            display_symbol=display_symbol,
            signal_type=state["signal"],
            confidence=confidence,
            timeframe=timeframe,
            setup_type=state["setup_type"],
            regime=state["regime"],
            entry_zone=entry_zone,
            stop_loss=stop_loss,
            take_profit=take_profit,
            risk_reward=risk_reward,
            backtest=backtest,
            reasons=state["reasons"],
        )

        return {
            "id": signal_id,
            "symbolId": symbol_id,
            "marketType": market_type,
            "status": state["status"],
            "signal": {
                "symbol": display_symbol,
                "timeframe": timeframe,
                "signal": state["signal"],
                "risk_level": state["risk_level"],
                "confidence": confidence,
                "confidence_basis": {
                    "trend_alignment": round(state["trend_alignment"], 2),
                    "volume_confirmation": round(state["volume_confirmation"], 2),
                    "volatility_regime": state["volatility_regime"],
                    "setup_type": state["setup_type"],
                    "backtested_winrate": round(backtest["win_rate"], 4),
                    "backtested_expectancy_R": round(backtest["expectancy"], 4),
                    "backtest_sample_size": backtest["trade_count"],
                    "out_of_sample_validated": backtest["out_of_sample_validated"],
                    "market_regime": state["regime"],
                    "out_of_sample_sample_size": backtest["out_of_sample_trade_count"],
                    "out_of_sample_expectancy_R": round(backtest["out_of_sample_expectancy"], 4),
                    "pooled_sample_size": pooled["sample_size"],
                    "pooled_winrate": round(pooled["win_rate"], 4),
                    "pooled_expectancy_R": round(pooled["expectancy"], 4),
                    "confluence_score": round(state["confluence_score"], 2),
                },
                "entry_zone": entry_zone,
                "stop_loss": stop_loss,
                "take_profit": take_profit,
                "risk_reward": risk_reward,
                "fees_slippage_assumed": self._fees_slippage_label(market_type),
                "reasons": state["reasons"],
                "invalidation": self._build_invalidation(direction=state["direction"], timeframe=timeframe, stop_loss=stop_loss),
                "candle_status": "closed",
                "data_source": source,
                "generated_at_utc": generated_at_utc,
                "data_age_seconds": data_age_seconds,
                "last_candle_close_at": last_candle_close_at,
                "ingested_at": ingested_at,
                "ai_explanation": narration_text,
                "narration_source": narration_source,
                "disclaimer": "Educational analysis only. Not financial advice.",
            },
        }

    def _build_indicators(self, candles: list[dict[str, Any]]) -> SeriesIndicators:
        closes = [float(candle["close"]) for candle in candles]
        highs = [float(candle["high"]) for candle in candles]
        lows = [float(candle["low"]) for candle in candles]
        volumes = [float(candle["volume"]) for candle in candles]
        ema21 = self._ema(closes, 21)
        atr14 = self._atr(candles, 14)
        macd_line = self._macd_line(closes)
        macd_signal = self._ema_of_optional(macd_line, 9)
        macd_hist = [
            (line - signal) if line is not None and signal is not None else None
            for line, signal in zip(macd_line, macd_signal)
        ]
        bb_upper, bb_lower, bb_mid, bb_bandwidth = self._bollinger(closes, 20, 2.0)
        donchian_high, donchian_low = self._donchian(highs, lows, 20)
        keltner_upper, keltner_lower = self._keltner(ema21, atr14, 1.5)
        return SeriesIndicators(
            closes=closes,
            highs=highs,
            lows=lows,
            volumes=volumes,
            ema21=ema21,
            sma50=self._sma(closes, 50),
            rsi14=self._rsi(closes, 14),
            rsi2=self._rsi(closes, 2),
            atr14=atr14,
            adx14=self._adx(candles, 14),
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

    def _market_regime(self, indicators: SeriesIndicators, index: int) -> str:
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

    def _classify_state(
        self,
        symbol_id: str,
        market_type: str,
        timeframe: str,
        source: str,
        candles: list[dict[str, Any]],
        indicators: SeriesIndicators,
        index: int,
    ) -> dict[str, Any] | None:
        candidates = self._candidate_setups(
            market_type=market_type,
            timeframe=timeframe,
            indicators=indicators,
            index=index,
        )
        if not candidates:
            return None
        best = max(candidates, key=lambda candidate: candidate["confluence_score"])
        best["symbol_id"] = symbol_id
        best["market_type"] = market_type
        best["timeframe"] = timeframe
        best["source"] = source
        return best

    def _candidate_setups(
        self,
        market_type: str,
        timeframe: str,
        indicators: SeriesIndicators,
        index: int,
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
        average_volume = sum(indicators.volumes[recent_start : index + 1]) / max(index + 1 - recent_start, 1)
        volume_ratio = volume / average_volume if average_volume else 0.0
        trend_gap = (ema - sma) / close if close else 0.0
        trend_alignment = self._clamp(abs(trend_gap) / 0.03)
        volume_confirmation = self._clamp(volume_ratio / 1.75)
        volatility_regime = self._volatility_regime(indicators, index, atr, close)
        regime = self._market_regime(indicators, index)
        htf_slope = self._higher_timeframe_slope(indicators.sma50, index)
        macd_value = macd_hist if macd_hist is not None else 0.0

        bullish_trend = close > ema > sma
        bearish_trend = close < ema < sma

        candidates: list[dict[str, Any]] = []

        # --- Family 1: trend pullback / rejection (trending or transitional regimes) ---
        if regime in {"trending", "transitional"}:
            near_ema_pullback = low <= ema * 1.01 <= high or abs(close - ema) / close <= 0.008
            near_ema_rejection = low <= ema <= high or abs(close - ema) / close <= 0.008
            if bullish_trend and near_ema_pullback and 46 <= rsi <= 72:
                confluence = self._confluence(
                    base=0.55,
                    trend_alignment=trend_alignment,
                    volume_confirmation=volume_confirmation,
                    macd_agree=macd_value > 0,
                    htf_agree=htf_slope > 0,
                    regime_bonus=0.1 if regime == "trending" else 0.0,
                )
                candidates.append(
                    self._compose_candidate(
                        signal_type="BUY_ZONE",
                        setup_type="daily_trend_pullback" if timeframe == "1d" else "ema_reclaim_pullback",
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
                        volatility_regime=volatility_regime,
                        trend_alignment=trend_alignment,
                        volume_confirmation=volume_confirmation,
                        confluence_score=confluence,
                        market_type=market_type,
                        timeframe=timeframe,
                    )
                )
            elif bearish_trend and near_ema_rejection and 28 <= rsi <= 54:
                confluence = self._confluence(
                    base=0.55,
                    trend_alignment=trend_alignment,
                    volume_confirmation=volume_confirmation,
                    macd_agree=macd_value < 0,
                    htf_agree=htf_slope < 0,
                    regime_bonus=0.1 if regime == "trending" else 0.0,
                )
                candidates.append(
                    self._compose_candidate(
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
                        volatility_regime=volatility_regime,
                        trend_alignment=trend_alignment,
                        volume_confirmation=volume_confirmation,
                        confluence_score=confluence,
                        market_type=market_type,
                        timeframe=timeframe,
                    )
                )

        # --- Family 2: breakout retest (trending regime, Donchian + Keltner) ---
        if regime == "trending" and donchian_high_prev is not None and donchian_low_prev is not None:
            broke_out_up = high >= donchian_high_prev and close >= donchian_high_prev * 0.997
            broke_out_down = low <= donchian_low_prev and close <= donchian_low_prev * 1.003
            if bullish_trend and broke_out_up and volume_ratio >= 1.0:
                confluence = self._confluence(
                    base=0.6,
                    trend_alignment=trend_alignment,
                    volume_confirmation=volume_confirmation,
                    macd_agree=macd_value > 0,
                    htf_agree=htf_slope > 0,
                    regime_bonus=0.12,
                )
                candidates.append(
                    self._compose_candidate(
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
                        volatility_regime=volatility_regime,
                        trend_alignment=trend_alignment,
                        volume_confirmation=volume_confirmation,
                        confluence_score=confluence,
                        market_type=market_type,
                        timeframe=timeframe,
                    )
                )
            elif bearish_trend and broke_out_down and volume_ratio >= 1.0:
                confluence = self._confluence(
                    base=0.6,
                    trend_alignment=trend_alignment,
                    volume_confirmation=volume_confirmation,
                    macd_agree=macd_value < 0,
                    htf_agree=htf_slope < 0,
                    regime_bonus=0.12,
                )
                candidates.append(
                    self._compose_candidate(
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
                        volatility_regime=volatility_regime,
                        trend_alignment=trend_alignment,
                        volume_confirmation=volume_confirmation,
                        confluence_score=confluence,
                        market_type=market_type,
                        timeframe=timeframe,
                    )
                )

        # --- Family 3: range mean reversion (ranging regime, RSI2 + Bollinger) ---
        if regime == "ranging" and rsi_fast is not None and bb_upper is not None and bb_lower is not None:
            if rsi_fast <= 8 and low <= bb_lower * 1.005:
                confluence = self._confluence(
                    base=0.5,
                    trend_alignment=0.3,
                    volume_confirmation=volume_confirmation,
                    macd_agree=True,
                    htf_agree=htf_slope >= 0,
                    regime_bonus=0.08,
                )
                candidates.append(
                    self._compose_candidate(
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
                        volatility_regime=volatility_regime,
                        trend_alignment=trend_alignment,
                        volume_confirmation=volume_confirmation,
                        confluence_score=confluence,
                        market_type=market_type,
                        timeframe=timeframe,
                        mean_reversion_target=indicators.bb_mid[index],
                    )
                )
            elif rsi_fast >= 92 and high >= bb_upper * 0.995:
                confluence = self._confluence(
                    base=0.5,
                    trend_alignment=0.3,
                    volume_confirmation=volume_confirmation,
                    macd_agree=True,
                    htf_agree=htf_slope <= 0,
                    regime_bonus=0.08,
                )
                candidates.append(
                    self._compose_candidate(
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
                        volatility_regime=volatility_regime,
                        trend_alignment=trend_alignment,
                        volume_confirmation=volume_confirmation,
                        confluence_score=confluence,
                        market_type=market_type,
                        timeframe=timeframe,
                        mean_reversion_target=indicators.bb_mid[index],
                    )
                )

        # --- Fallback states so the surface always has a contextual read ---
        if not candidates:
            if bullish_trend:
                fallback_signal, fallback_setup, direction = "HOLD", "trend_hold_continuation", "long"
                status = "active"
            elif bearish_trend:
                fallback_signal, fallback_setup, direction = "WATCH", "breakdown_watch", "short"
                status = "active"
            else:
                fallback_signal, fallback_setup, direction = "WAIT", "range_reset", "long"
                status = "invalidated"
            confluence = self._confluence(
                base=0.3,
                trend_alignment=trend_alignment,
                volume_confirmation=volume_confirmation,
                macd_agree=(macd_value > 0) if direction == "long" else (macd_value < 0),
                htf_agree=(htf_slope > 0) if direction == "long" else (htf_slope < 0),
                regime_bonus=0.0,
            )
            candidates.append(
                self._compose_candidate(
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
                    volatility_regime=volatility_regime,
                    trend_alignment=trend_alignment,
                    volume_confirmation=volume_confirmation,
                    confluence_score=confluence,
                    market_type=market_type,
                    timeframe=timeframe,
                )
            )

        return candidates

    def _compose_candidate(
        self,
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
        stop_multiple = 1.3 if volatility_regime == "compressed" else 1.6 if volatility_regime == "expanded" else 1.45
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

        reasons = self._build_reasons(
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

    def _confluence(
        self,
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
        return self._clamp(score)

    def _volatility_regime(self, indicators: SeriesIndicators, index: int, atr: float, close: float) -> str:
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

    def _higher_timeframe_slope(self, sma50: list[float | None], index: int) -> float:
        current = sma50[index]
        prior = sma50[index - 10] if index >= 10 else None
        if current is None or prior is None or prior == 0:
            return 0.0
        return (current - prior) / prior

    def _run_backtest(
        self,
        candles: list[dict[str, Any]],
        indicators: SeriesIndicators,
        market_type: str,
        timeframe: str,
        setup_type: str,
        direction: str,
        fees_percent: float,
        slippage_percent: float,
        train_test_split: int,
        walk_forward: bool,
    ) -> dict[str, Any]:
        max_hold_bars = self._max_hold_bars(timeframe)
        # Chronological list of (entry_index, net_R) so we can split honestly by time.
        trades: list[tuple[int, float]] = []
        round_trip_cost = ((fees_percent + slippage_percent) * 2) / 100

        for index in range(60, len(candles) - max_hold_bars - 1):
            candidates = self._candidate_setups(
                market_type=market_type,
                timeframe=timeframe,
                indicators=indicators,
                index=index,
            )
            match = next(
                (
                    candidate
                    for candidate in candidates
                    if candidate["setup_type"] == setup_type and candidate["direction"] == direction
                ),
                None,
            )
            if match is None or match["signal"] not in {"BUY_ZONE", "SELL", "WATCH", "HOLD"}:
                continue

            net_r = self._simulate_ladder_trade(
                indicators=indicators,
                index=index,
                direction=direction,
                entry=match["reference_price"],
                stop_loss=match["stop_loss"],
                take_profit=match["take_profit"],
                max_hold_bars=max_hold_bars,
                round_trip_cost=round_trip_cost,
            )
            if net_r is None:
                continue
            trades.append((index, net_r))

        if not trades:
            return {
                "win_rate": 0.0,
                "expectancy": 0.0,
                "trade_count": 0,
                "avg_r": 0.0,
                "in_sample_win_rate": 0.0,
                "out_of_sample_win_rate": 0.0,
                "in_sample_trade_count": 0,
                "out_of_sample_trade_count": 0,
                "in_sample_expectancy": 0.0,
                "out_of_sample_expectancy": 0.0,
                "out_of_sample_validated": False,
                "wins": 0,
                "sum_r": 0.0,
                "max_drawdown": 0.0,
                "sharpe": 0.0,
                "sortino": 0.0,
                "profit_factor": 0.0,
                "equity_curve": [100.0],
                "drawdown_curve": [0.0],
                "test_period": self._test_period(candles),
            }

        outcomes = [net_r for _, net_r in trades]
        # Honest in-sample / out-of-sample split by time. No blending of the two blocks.
        split_index = max(1, int(len(outcomes) * (train_test_split / 100)))
        in_sample = outcomes[:split_index]
        out_of_sample = outcomes[split_index:]

        in_sample_win_rate = (sum(1 for value in in_sample if value > 0) / len(in_sample)) if in_sample else 0.0
        in_sample_expectancy = (sum(in_sample) / len(in_sample)) if in_sample else 0.0
        out_of_sample_win_rate = (
            sum(1 for value in out_of_sample if value > 0) / len(out_of_sample)
        ) if out_of_sample else 0.0
        out_of_sample_expectancy = (sum(out_of_sample) / len(out_of_sample)) if out_of_sample else 0.0

        win_rate = sum(1 for value in outcomes if value > 0) / len(outcomes)
        expectancy = sum(outcomes) / len(outcomes)

        out_of_sample_validated = (
            len(out_of_sample) >= self._min_backtest_sample and out_of_sample_expectancy > 0.0
        )

        equity_curve = self._equity_curve(outcomes)
        drawdown_curve = self._drawdown_curve(equity_curve)

        return {
            "win_rate": win_rate,
            "expectancy": expectancy,
            "trade_count": len(outcomes),
            "avg_r": expectancy,
            "in_sample_win_rate": in_sample_win_rate,
            "out_of_sample_win_rate": out_of_sample_win_rate,
            "in_sample_trade_count": len(in_sample),
            "out_of_sample_trade_count": len(out_of_sample),
            "in_sample_expectancy": in_sample_expectancy,
            "out_of_sample_expectancy": out_of_sample_expectancy,
            "out_of_sample_validated": out_of_sample_validated,
            "wins": sum(1 for value in outcomes if value > 0),
            "sum_r": sum(outcomes),
            "max_drawdown": min(drawdown_curve),
            "sharpe": self._sharpe_ratio(outcomes),
            "sortino": self._sortino_ratio(outcomes),
            "profit_factor": self._profit_factor(outcomes),
            "equity_curve": equity_curve,
            "drawdown_curve": drawdown_curve,
            "test_period": self._test_period(candles),
        }

    def _simulate_ladder_trade(
        self,
        indicators: SeriesIndicators,
        index: int,
        direction: str,
        entry: float,
        stop_loss: float,
        take_profit: list[float],
        max_hold_bars: int,
        round_trip_cost: float,
    ) -> float | None:
        risk_per_unit = abs(entry - stop_loss)
        if risk_per_unit <= 0:
            return None

        remaining = 1.0
        realized_r = 0.0
        rungs = list(zip(take_profit, _TP_LADDER_WEIGHTS))
        hit = [False] * len(rungs)

        last_index = min(index + max_hold_bars, len(indicators.closes) - 1)
        for forward_index in range(index + 1, last_index + 1):
            bar_high = indicators.highs[forward_index]
            bar_low = indicators.lows[forward_index]

            if direction == "long":
                if bar_low <= stop_loss:
                    realized_r += remaining * ((stop_loss - entry) / risk_per_unit)
                    remaining = 0.0
                    break
                for rung_index, (level, weight) in enumerate(rungs):
                    if not hit[rung_index] and bar_high >= level:
                        hit[rung_index] = True
                        realized_r += weight * ((level - entry) / risk_per_unit)
                        remaining = max(0.0, remaining - weight)
            else:
                if bar_high >= stop_loss:
                    realized_r += remaining * ((entry - stop_loss) / risk_per_unit)
                    remaining = 0.0
                    break
                for rung_index, (level, weight) in enumerate(rungs):
                    if not hit[rung_index] and bar_low <= level:
                        hit[rung_index] = True
                        realized_r += weight * ((entry - level) / risk_per_unit)
                        remaining = max(0.0, remaining - weight)

            if remaining <= 1e-9:
                break

        if remaining > 1e-9:
            exit_price = indicators.closes[last_index]
            if direction == "long":
                realized_r += remaining * ((exit_price - entry) / risk_per_unit)
            else:
                realized_r += remaining * ((entry - exit_price) / risk_per_unit)

        cost_r = (entry * round_trip_cost) / risk_per_unit
        return realized_r - cost_r

    def _max_hold_bars(self, timeframe: str) -> int:
        return {
            "15m": 32,
            "1h": 24,
            "4h": 18,
            "1d": 12,
        }.get(timeframe, 14)

    def _persist_expectancy(
        self,
        symbol_id: str,
        setup_type: str,
        timeframe: str,
        regime: str,
        backtest: dict[str, Any],
    ) -> None:
        try:
            self._analytics_store.upsert_setup_expectancy(
                {
                    "symbol": symbol_id,
                    "setup_type": setup_type,
                    "timeframe": timeframe,
                    "regime": regime,
                    "sample_size": backtest["trade_count"],
                    "wins": backtest["wins"],
                    "sum_r": backtest["sum_r"],
                    "oos_sample_size": backtest["out_of_sample_trade_count"],
                    "oos_wins": sum(
                        1
                        for _ in range(backtest["out_of_sample_trade_count"])
                        if backtest["out_of_sample_win_rate"] > 0
                    ),
                    "oos_sum_r": backtest["out_of_sample_expectancy"]
                    * backtest["out_of_sample_trade_count"],
                }
            )
        except Exception:
            # Persisting pooled stats is best-effort and must not block signal output.
            return

    def _build_backtest_preset(
        self,
        symbol_id: str,
        market_type: str,
        timeframe: str,
        setup_type: str,
        fees_percent: float,
        slippage_percent: float,
        train_test_split: int,
        walk_forward: bool,
        backtest: dict[str, Any],
    ) -> dict[str, Any]:
        display_symbol = self._display_symbol(symbol_id, market_type)
        return {
            "id": f"{symbol_id.lower()}-{timeframe}-{setup_type}",
            "name": f"{display_symbol} {setup_type.replace('_', ' ').title()}",
            "symbolId": symbol_id,
            "setupType": setup_type,
            "timeframe": timeframe,
            "feesPercent": round(fees_percent, 4),
            "slippagePercent": round(slippage_percent, 4),
            "trainTestSplit": train_test_split,
            "walkForward": walk_forward,
            "metrics": {
                "winRate": round(backtest["win_rate"] * 100, 1),
                "avgR": round(backtest["avg_r"], 3),
                "expectancy": round(backtest["expectancy"], 3),
                "maxDrawdown": round(backtest["max_drawdown"], 2),
                "sharpe": round(backtest["sharpe"], 2),
                "sortino": round(backtest["sortino"], 2),
                "profitFactor": round(backtest["profit_factor"], 2),
                "tradeCount": backtest["trade_count"],
                "testPeriod": backtest["test_period"],
                "inSampleWinRate": round(backtest["in_sample_win_rate"] * 100, 1),
                "outOfSampleWinRate": round(backtest["out_of_sample_win_rate"] * 100, 1),
                "inSampleTradeCount": backtest["in_sample_trade_count"],
                "outOfSampleTradeCount": backtest["out_of_sample_trade_count"],
                "outOfSampleExpectancy": round(backtest["out_of_sample_expectancy"], 3),
                "outOfSampleValidated": backtest["out_of_sample_validated"],
            },
            "equityCurve": [round(point, 2) for point in backtest["equity_curve"]],
            "drawdownCurve": [round(point, 2) for point in backtest["drawdown_curve"]],
        }

    def _derive_confidence(
        self,
        state: dict[str, Any],
        backtest: dict[str, Any],
        pooled: dict[str, Any],
    ) -> int:
        base = 42 if state["signal"] == "WAIT" else 52 if state["signal"] in {"HOLD", "WATCH"} else 58
        score = base
        score += state["trend_alignment"] * 14
        score += state["volume_confirmation"] * 8
        score += (state["confluence_score"] - 0.5) * 18

        # Prefer pooled, calibrated statistics when a credible sample exists; otherwise
        # lean on the single-symbol backtest but damp confidence toward neutral.
        if pooled["sample_size"] >= self._min_backtest_sample:
            calibrated_win_rate = self._calibrate_win_rate(pooled["win_rate"], pooled["sample_size"])
            score += (calibrated_win_rate - 0.5) * 32
            score += max(min(pooled["expectancy"], 1.0), -1.0) * 10
        else:
            calibrated_win_rate = self._calibrate_win_rate(backtest["win_rate"], backtest["trade_count"])
            score += (calibrated_win_rate - 0.5) * 20
            score += max(min(backtest["expectancy"], 1.0), -1.0) * 8
            score -= 8  # thin sample penalty

        if not backtest["out_of_sample_validated"]:
            score = min(score, 62)

        return max(20, min(89, int(round(score))))

    def _calibrate_win_rate(self, raw_win_rate: float, sample_size: int) -> float:
        # Shrink toward 0.5 proportionally to how thin the sample is (empirical-Bayes
        # style). Prevents a 100%-of-3 backtest from reading as high confidence.
        prior_strength = float(self._min_backtest_sample)
        if sample_size <= 0:
            return 0.5
        return ((raw_win_rate * sample_size) + (0.5 * prior_strength)) / (sample_size + prior_strength)

    def _data_freshness(self, timeframe: str, generated_at_utc: str) -> tuple[int | None, str | None]:
        from datetime import datetime, timezone

        bar_seconds = {
            "15m": 900,
            "1h": 3600,
            "4h": 14400,
            "1d": 86400,
        }.get(timeframe, 3600)
        try:
            opened = datetime.fromisoformat(generated_at_utc.replace("Z", "+00:00"))
            if opened.tzinfo is None:
                opened = opened.replace(tzinfo=timezone.utc)
        except (ValueError, AttributeError):
            return None, None
        from datetime import timedelta

        closed = opened + timedelta(seconds=bar_seconds)
        age_seconds = int((datetime.now(timezone.utc) - closed).total_seconds())
        return max(age_seconds, 0), closed.isoformat().replace("+00:00", "Z")

    def _narrate(
        self,
        display_symbol: str,
        signal_type: str,
        confidence: int,
        timeframe: str,
        setup_type: str,
        regime: str,
        entry_zone: list[float],
        stop_loss: float,
        take_profit: list[float],
        risk_reward: float,
        backtest: dict[str, Any],
        reasons: list[str],
    ) -> tuple[str, str]:
        facts = {
            "symbol": display_symbol,
            "signal": signal_type,
            "confidence": confidence,
            "timeframe": timeframe,
            "setup_type": setup_type,
            "market_regime": regime,
            "entry_zone": entry_zone,
            "stop_loss": stop_loss,
            "take_profit": take_profit,
            "risk_reward": risk_reward,
            "backtested_winrate_pct": round(backtest["win_rate"] * 100, 1),
            "backtested_expectancy_R": round(backtest["expectancy"], 2),
            "backtest_sample_size": backtest["trade_count"],
            "out_of_sample_validated": backtest["out_of_sample_validated"],
            "reasons": reasons,
        }
        if self._narrator is not None:
            try:
                text, source = self._narrator.narrate(facts)
                if text:
                    return text, source
            except Exception:
                # Any narrator failure degrades to the deterministic template below.
                pass
        return self._template_explanation(facts), "template"

    def _template_explanation(self, facts: dict[str, Any]) -> str:
        if facts["backtest_sample_size"]:
            validation = (
                "out-of-sample validated"
                if facts["out_of_sample_validated"]
                else "not yet out-of-sample validated"
            )
            metrics_text = (
                f"This {facts['setup_type']} pattern backtests at {facts['backtested_winrate_pct']:.0f}% win rate "
                f"with {facts['backtested_expectancy_R']:.2f}R expectancy across {facts['backtest_sample_size']} samples ({validation})."
            )
        else:
            metrics_text = "Historical sample size is still too small to produce a reliable expectancy estimate."
        return (
            f"{facts['symbol']} is in a {facts['signal'].lower().replace('_', ' ')} state on the closed {facts['timeframe']} "
            f"candle ({facts['market_regime']} regime) with {facts['confidence']}% confidence. "
            f"{facts['reasons'][0]} {facts['reasons'][1]} {metrics_text}"
        )

    def _build_reasons(
        self,
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

    def _direction_for_setup(self, setup_type: str, fallback_direction: str) -> str:
        if (
            "breakdown" in setup_type
            or "short" in setup_type
            or setup_type in {"breakdown_watch", "trend_rejection_breakdown"}
        ):
            return "short"
        if "long" in setup_type or "pullback" in setup_type or "breakout" in setup_type:
            return "long"
        return fallback_direction

    def _build_invalidation(self, direction: str, timeframe: str, stop_loss: float) -> str:
        direction_phrase = "below" if direction == "long" else "above"
        return f"{timeframe} close {direction_phrase} {stop_loss:.2f}"

    def _default_costs(self, market_type: str) -> tuple[float, float]:
        if market_type == "crypto":
            return 0.10, 0.05
        return 0.02, 0.01

    def _fees_slippage_label(self, market_type: str) -> str:
        fees_percent, slippage_percent = self._default_costs(market_type)
        fee_label = f"{fees_percent:.2f}%" if market_type == "stocks" else f"{fees_percent:.1f}%"
        slippage_label = f"{slippage_percent:.2f}%"
        if market_type == "crypto":
            return f"{fee_label} taker + {slippage_label} slippage"
        return f"{fee_label} fee + {slippage_label} slippage"

    def _risk_reward(
        self,
        entry: float,
        stop_loss: float,
        take_profit: list[float],
        direction: str,
    ) -> float:
        risk = abs(entry - stop_loss)
        if risk == 0 or not take_profit:
            return 0.0
        target = take_profit[min(1, len(take_profit) - 1)]
        reward = (target - entry) if direction == "long" else (entry - target)
        return round(max(reward / risk, 0.0), 2)

    def _equity_curve(self, outcomes: list[float]) -> list[float]:
        equity = 100.0
        curve = [equity]
        for outcome in outcomes:
            equity *= 1 + (outcome * 0.012)
            curve.append(max(equity, 1.0))
        return curve

    def _drawdown_curve(self, equity_curve: list[float]) -> list[float]:
        peak = equity_curve[0]
        drawdowns = [0.0]
        for equity in equity_curve[1:]:
            peak = max(peak, equity)
            drawdowns.append(((equity - peak) / peak) * 100 if peak else 0.0)
        return drawdowns

    def _profit_factor(self, outcomes: list[float]) -> float:
        gross_wins = sum(outcome for outcome in outcomes if outcome > 0)
        gross_losses = abs(sum(outcome for outcome in outcomes if outcome < 0))
        if gross_losses == 0:
            return gross_wins if gross_wins else 0.0
        return gross_wins / gross_losses

    def _sharpe_ratio(self, outcomes: list[float]) -> float:
        if len(outcomes) < 2:
            return 0.0
        deviation = self._standard_deviation(outcomes)
        if deviation == 0:
            return 0.0
        mean = sum(outcomes) / len(outcomes)
        return (mean / deviation) * sqrt(len(outcomes))

    def _sortino_ratio(self, outcomes: list[float]) -> float:
        if len(outcomes) < 2:
            return 0.0
        downside = [min(outcome, 0.0) for outcome in outcomes]
        downside_deviation = self._standard_deviation(downside)
        if downside_deviation == 0:
            return 0.0
        mean = sum(outcomes) / len(outcomes)
        return (mean / downside_deviation) * sqrt(len(outcomes))

    def _standard_deviation(self, values: list[float]) -> float:
        if len(values) < 2:
            return 0.0
        mean = sum(values) / len(values)
        variance = sum((value - mean) ** 2 for value in values) / (len(values) - 1)
        return sqrt(variance)

    def _test_period(self, candles: list[dict[str, Any]]) -> str:
        if not candles:
            return ""
        start = candles[0]["open_time_utc"].split("T", 1)[0]
        end = candles[-1]["open_time_utc"].split("T", 1)[0]
        return f"{start} to {end}"

    def _display_symbol(self, symbol_id: str, market_type: str) -> str:
        if market_type == "crypto" and symbol_id.endswith("USD") and len(symbol_id) > 3:
            return f"{symbol_id[:-3]}/USD"
        return symbol_id

    def _build_signal_id(self, symbol_id: str, timeframe: str, signal_type: str, generated_at_utc: str) -> str:
        return f"{symbol_id}-{timeframe}-{signal_type}-{generated_at_utc}"

    def _clamp(self, value: float, low: float = 0.0, high: float = 1.0) -> float:
        return max(low, min(high, value))

    def _ema(self, values: list[float], period: int) -> list[float | None]:
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

    def _ema_of_optional(self, values: list[float | None], period: int) -> list[float | None]:
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

    def _macd_line(self, values: list[float]) -> list[float | None]:
        fast = self._ema(values, 12)
        slow = self._ema(values, 26)
        return [
            (fast_value - slow_value) if fast_value is not None and slow_value is not None else None
            for fast_value, slow_value in zip(fast, slow)
        ]

    def _bollinger(
        self,
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

    def _donchian(
        self,
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

    def _keltner(
        self,
        ema: list[float | None],
        atr: list[float | None],
        multiplier: float,
    ) -> tuple[list[float | None], list[float | None]]:
        upper: list[float | None] = [None] * len(ema)
        lower: list[float | None] = [None] * len(ema)
        for index in range(len(ema)):
            mid = ema[index]
            band = atr[index]
            if mid is None or band is None:
                continue
            upper[index] = mid + multiplier * band
            lower[index] = mid - multiplier * band
        return upper, lower

    def _sma(self, values: list[float], period: int) -> list[float | None]:
        output: list[float | None] = [None] * len(values)
        if len(values) < period:
            return output
        running_total = sum(values[:period])
        output[period - 1] = running_total / period
        for index in range(period, len(values)):
            running_total += values[index] - values[index - period]
            output[index] = running_total / period
        return output

    def _rsi(self, values: list[float], period: int) -> list[float | None]:
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
        output[period] = 100.0 if average_loss == 0 else 100 - (100 / (1 + (average_gain / average_loss)))
        for index in range(period + 1, len(values)):
            average_gain = ((average_gain * (period - 1)) + gains[index]) / period
            average_loss = ((average_loss * (period - 1)) + losses[index]) / period
            output[index] = 100.0 if average_loss == 0 else 100 - (100 / (1 + (average_gain / average_loss)))
        return output

    def _atr(self, candles: list[dict[str, Any]], period: int) -> list[float | None]:
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

    def _adx(self, candles: list[dict[str, Any]], period: int) -> list[float | None]:
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
