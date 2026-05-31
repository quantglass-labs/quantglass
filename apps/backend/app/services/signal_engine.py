from __future__ import annotations

from dataclasses import dataclass
from math import sqrt
from statistics import median
from typing import Any

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
    atr14: list[float | None]


class SignalEngineService:
    def __init__(self, analytics_store: AnalyticsStore, min_backtest_sample: int) -> None:
        self._analytics_store = analytics_store
        self._min_backtest_sample = min_backtest_sample

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

        confidence = self._derive_confidence(
            state=state,
            backtest=backtest,
        )
        generated_at_utc = candles[-1]["open_time_utc"]
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
                    "out_of_sample_validated": backtest["trade_count"] >= self._min_backtest_sample,
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
                "ai_explanation": self._build_ai_explanation(
                    display_symbol=display_symbol,
                    signal_type=state["signal"],
                    confidence=confidence,
                    timeframe=timeframe,
                    setup_type=state["setup_type"],
                    backtest=backtest,
                    reasons=state["reasons"],
                ),
                "disclaimer": "Educational analysis only. Not financial advice.",
            },
        }

    def _build_indicators(self, candles: list[dict[str, Any]]) -> SeriesIndicators:
        closes = [float(candle["close"]) for candle in candles]
        highs = [float(candle["high"]) for candle in candles]
        lows = [float(candle["low"]) for candle in candles]
        volumes = [float(candle["volume"]) for candle in candles]
        return SeriesIndicators(
            closes=closes,
            highs=highs,
            lows=lows,
            volumes=volumes,
            ema21=self._ema(closes, 21),
            sma50=self._sma(closes, 50),
            rsi14=self._rsi(closes, 14),
            atr14=self._atr(candles, 14),
        )

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
        if index < 55:
            return None

        close = indicators.closes[index]
        high = indicators.highs[index]
        low = indicators.lows[index]
        volume = indicators.volumes[index]
        ema = indicators.ema21[index]
        sma = indicators.sma50[index]
        rsi = indicators.rsi14[index]
        atr = indicators.atr14[index]
        if ema is None or sma is None or rsi is None or atr is None or atr <= 0:
            return None

        recent_start = max(0, index - 19)
        recent_high = max(indicators.highs[recent_start : index + 1])
        recent_low = min(indicators.lows[recent_start : index + 1])
        average_volume = sum(indicators.volumes[recent_start : index + 1]) / max(index + 1 - recent_start, 1)
        volume_ratio = volume / average_volume if average_volume else 0.0
        trend_gap = (ema - sma) / close if close else 0.0
        trend_alignment = self._clamp(abs(trend_gap) / 0.03)
        volume_confirmation = self._clamp(volume_ratio / 1.75)
        atr_percents = [
            atr_value / price
            for atr_value, price in zip(indicators.atr14[max(0, index - 29) : index + 1], indicators.closes[max(0, index - 29) : index + 1])
            if atr_value is not None and price > 0
        ]
        current_atr_percent = atr / close if close else 0.0
        baseline_atr_percent = median(atr_percents) if atr_percents else current_atr_percent
        if current_atr_percent <= baseline_atr_percent * 0.8:
            volatility_regime = "compressed"
        elif current_atr_percent >= baseline_atr_percent * 1.25:
            volatility_regime = "expanded"
        else:
            volatility_regime = "normal"

        bullish_trend = close > ema > sma
        bearish_trend = close < ema < sma
        near_ema_pullback = low <= ema * 1.01 <= high or abs(close - ema) / close <= 0.008
        near_ema_rejection = low <= ema <= high or abs(close - ema) / close <= 0.008
        breakout_pressure = close >= recent_high * 0.995 and volume_ratio >= 0.95

        direction = "long"
        signal_type = "WAIT"
        setup_type = "range_reset"
        status = "invalidated"

        if bullish_trend and near_ema_pullback and 46 <= rsi <= 72:
            signal_type = "BUY_ZONE"
            setup_type = "daily_trend_pullback" if timeframe == "1d" else "ema_reclaim_pullback"
            status = "active"
        elif bearish_trend and near_ema_rejection and 28 <= rsi <= 54:
            signal_type = "SELL"
            setup_type = "trend_rejection_breakdown"
            direction = "short"
            status = "active"
        elif bullish_trend and breakout_pressure:
            signal_type = "WATCH"
            setup_type = "compression_breakout_watch"
            status = "active"
        elif bullish_trend:
            signal_type = "HOLD"
            setup_type = "trend_hold_continuation"
            status = "active"
        elif bearish_trend:
            signal_type = "WATCH"
            setup_type = "breakdown_watch"
            direction = "short"
            status = "active"

        stop_multiple = 1.3 if volatility_regime == "compressed" else 1.6 if volatility_regime == "expanded" else 1.45
        reward_multiple = 2.4 if signal_type in {"BUY_ZONE", "SELL"} else 1.8

        if direction == "long":
            reference_price = min(close, ema * 1.002)
            risk_distance = atr * stop_multiple
            entry_zone = [reference_price - (atr * 0.45), reference_price + (atr * 0.15)]
            stop_loss = reference_price - risk_distance
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
            take_profit = [
                reference_price - (risk_distance * reward_multiple * 0.65),
                reference_price - (risk_distance * reward_multiple),
                reference_price - (risk_distance * reward_multiple * 1.35),
            ]
            invalidation_anchor = recent_high

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
            sma=sma,
            rsi=rsi,
            volume_ratio=volume_ratio,
            volatility_regime=volatility_regime,
            invalidation_anchor=invalidation_anchor,
        )

        return {
            "symbol_id": symbol_id,
            "market_type": market_type,
            "timeframe": timeframe,
            "source": source,
            "signal": signal_type,
            "setup_type": setup_type,
            "direction": direction,
            "status": status,
            "risk_level": risk_level,
            "reference_price": reference_price,
            "entry_zone": entry_zone,
            "stop_loss": stop_loss,
            "take_profit": take_profit,
            "trend_alignment": trend_alignment,
            "volume_confirmation": volume_confirmation,
            "volatility_regime": volatility_regime,
            "reasons": reasons,
        }

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
        max_hold_bars = 18 if timeframe == "1h" else 10
        outcomes: list[float] = []

        for index in range(60, len(candles) - max_hold_bars - 1):
            state = self._classify_state(
                symbol_id="",
                market_type=market_type,
                timeframe=timeframe,
                source="",
                candles=candles,
                indicators=indicators,
                index=index,
            )
            if state is None:
                continue
            if state["setup_type"] != setup_type or state["direction"] != direction:
                continue
            if state["signal"] not in {"BUY_ZONE", "SELL", "WATCH", "HOLD"}:
                continue

            entry = indicators.closes[index]
            atr_value = indicators.atr14[index]
            if atr_value is None or atr_value <= 0:
                continue
            risk_distance = max(atr_value * 1.35, entry * 0.004)
            if direction == "long":
                stop = entry - risk_distance
                target = entry + (risk_distance * 2.2)
            else:
                stop = entry + risk_distance
                target = entry - (risk_distance * 2.2)

            exit_price = indicators.closes[index + max_hold_bars]
            for forward_index in range(index + 1, min(index + max_hold_bars + 1, len(candles))):
                next_high = indicators.highs[forward_index]
                next_low = indicators.lows[forward_index]
                if direction == "long":
                    if next_low <= stop:
                        exit_price = stop
                        break
                    if next_high >= target:
                        exit_price = target
                        break
                else:
                    if next_high >= stop:
                        exit_price = stop
                        break
                    if next_low <= target:
                        exit_price = target
                        break

            gross_r = ((exit_price - entry) / risk_distance) if direction == "long" else ((entry - exit_price) / risk_distance)
            round_trip_cost = ((fees_percent + slippage_percent) * 2) / 100
            cost_r = (entry * round_trip_cost) / risk_distance
            outcomes.append(gross_r - cost_r)

        if not outcomes:
            return {
                "win_rate": 0.0,
                "expectancy": 0.0,
                "trade_count": 0,
                "avg_r": 0.0,
                "in_sample_win_rate": 0.0,
                "out_of_sample_win_rate": 0.0,
                "max_drawdown": 0.0,
                "sharpe": 0.0,
                "sortino": 0.0,
                "profit_factor": 0.0,
                "equity_curve": [100.0],
                "drawdown_curve": [0.0],
                "test_period": self._test_period(candles),
            }

        split_index = max(1, int(len(outcomes) * (train_test_split / 100)))
        train = outcomes[:split_index]
        test = outcomes[split_index:] or outcomes[-1:]
        train_win_rate = sum(1 for outcome in train if outcome > 0) / len(train)
        test_win_rate = sum(1 for outcome in test if outcome > 0) / len(test)
        blended_win_rate = (train_win_rate * 0.45) + (test_win_rate * 0.55)
        expectancy = sum(outcomes) / len(outcomes)
        if walk_forward and len(outcomes) >= 12:
            window_size = max(4, len(outcomes) // 3)
            windows = [outcomes[index : index + window_size] for index in range(0, len(outcomes), window_size)]
            non_empty_windows = [window for window in windows if window]
            if non_empty_windows:
                forward_windows = non_empty_windows[-2:] if len(non_empty_windows) > 1 else non_empty_windows
                forward_expectancy = sum(sum(window) / len(window) for window in forward_windows) / len(forward_windows)
                forward_win_rate = sum(
                    sum(1 for outcome in window if outcome > 0) / len(window)
                    for window in forward_windows
                ) / len(forward_windows)
                expectancy = (expectancy * 0.55) + (forward_expectancy * 0.45)
                blended_win_rate = (blended_win_rate * 0.6) + (forward_win_rate * 0.4)

        equity_curve = self._equity_curve(outcomes)
        drawdown_curve = self._drawdown_curve(equity_curve)

        return {
            "win_rate": blended_win_rate,
            "expectancy": expectancy,
            "trade_count": len(outcomes),
            "avg_r": sum(outcomes) / len(outcomes),
            "in_sample_win_rate": train_win_rate,
            "out_of_sample_win_rate": test_win_rate,
            "max_drawdown": min(drawdown_curve),
            "sharpe": self._sharpe_ratio(outcomes),
            "sortino": self._sortino_ratio(outcomes),
            "profit_factor": self._profit_factor(outcomes),
            "equity_curve": equity_curve,
            "drawdown_curve": drawdown_curve,
            "test_period": self._test_period(candles),
        }

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
            },
            "equityCurve": [round(point, 2) for point in backtest["equity_curve"]],
            "drawdownCurve": [round(point, 2) for point in backtest["drawdown_curve"]],
        }

    def _derive_confidence(self, state: dict[str, Any], backtest: dict[str, Any]) -> int:
        base = 42 if state["signal"] == "WAIT" else 52 if state["signal"] in {"HOLD", "WATCH"} else 58
        score = base
        score += state["trend_alignment"] * 18
        score += state["volume_confirmation"] * 10
        score += max(min(backtest["expectancy"], 1.0), -1.0) * 10
        score += backtest["win_rate"] * 12
        if backtest["trade_count"] < self._min_backtest_sample:
            score -= 6
        return max(20, min(89, int(round(score))))

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
        invalidation_anchor: float,
    ) -> list[str]:
        trend_phrase = "above" if direction == "long" else "below"
        action_phrase = {
            "BUY_ZONE": "pullback held against short-term trend support",
            "SELL": "rejection formed beneath short-term trend resistance",
            "HOLD": "trend remains constructive without a fresh trigger",
            "WATCH": "setup is close to activation but still needs confirmation",
            "WAIT": "price structure is not yet favorable after the latest reset",
        }[signal_type]
        return [
            f"Latest {timeframe} close is {trend_phrase} the 21-period EMA and the 50-period trend baseline.",
            f"RSI is {rsi:.1f}, which keeps the current setup in a {signal_type.lower().replace('_', ' ')} state.",
            f"Volume is running at {volume_ratio:.2f}x the recent baseline, supporting participation quality.",
            f"Volatility regime is {volatility_regime}; invalidation sits near {invalidation_anchor:.2f}.",
        ]

    def _build_ai_explanation(
        self,
        display_symbol: str,
        signal_type: str,
        confidence: int,
        timeframe: str,
        setup_type: str,
        backtest: dict[str, Any],
        reasons: list[str],
    ) -> str:
        if backtest["trade_count"]:
            metrics_text = (
                f"The {setup_type} pattern shows a {backtest['win_rate'] * 100:.0f}% win rate "
                f"with {backtest['expectancy']:.2f}R expectancy across {backtest['trade_count']} historical samples."
            )
        else:
            metrics_text = "Historical sample size is still too small to produce a reliable expectancy estimate."
        return (
            f"{display_symbol} is currently in a {signal_type.lower().replace('_', ' ')} state on the closed {timeframe} candle with {confidence}% confidence. "
            f"{reasons[0]} {reasons[1]} {metrics_text}"
        )

    def _direction_for_setup(self, setup_type: str, fallback_direction: str) -> str:
        if "breakdown" in setup_type or setup_type in {"breakdown_watch", "trend_rejection_breakdown"}:
            return "short"
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