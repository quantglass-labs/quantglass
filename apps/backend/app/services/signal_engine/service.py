# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Signal engine orchestrator.

Wires the pure modules (indicators, setups, backtest, statistics, confidence,
narration) to the analytics store, strategy registry, and narrator. The private
``_``-prefixed methods are thin delegates kept as the stable seam for tests and
extensions.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from app.services.signal_engine import backtest as backtest_module
from app.services.signal_engine import indicators as indicators_module
from app.services.signal_engine import narration as narration_module
from app.services.signal_engine import setups as setups_module
from app.services.signal_engine import statistics as statistics_module
from app.services.signal_engine.composites import derive_composite_flags
from app.services.signal_engine.confidence import derive_confidence
from app.services.signal_engine.models import SeriesIndicators, SignalNarrator
from app.services.signal_engine.statistics import conformal_interval
from app.services.signal_engine.taxonomy import derive_quality, taxonomy_for
from app.storage.analytics_store import AnalyticsStore


class SignalEngineService:
    def __init__(
        self,
        analytics_store: AnalyticsStore,
        min_backtest_sample: int,
        narrator: SignalNarrator | None = None,
        strategy_registry: Any | None = None,
    ) -> None:
        self._analytics_store = analytics_store
        self._min_backtest_sample = min_backtest_sample
        self._narrator = narrator
        self._strategy_registry = strategy_registry

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

    def list_context_signals(self) -> list[dict[str, Any]]:
        """Regime family (SIG-2): the classifier's read on every tracked
        series, published as context-class signals with no trade geometry.
        Context names the environment; setups carry the trades."""
        items: list[dict[str, Any]] = []
        cross_sectional: dict[str, list[dict[str, Any]]] = {}
        for series in self._analytics_store.list_market_series(minimum_candles=80):
            payload = self._analytics_store.list_market_candles(
                series["symbol"], series["timeframe"], limit=120
            )
            candles = payload["items"]
            if len(candles) < 80:
                continue
            indicators = self._build_indicators(candles)
            index = len(candles) - 1
            close = float(candles[index]["close"])
            atr = indicators.atr14[index]
            regime = setups_module.market_regime(indicators, index)
            vol_regime = (
                setups_module.volatility_regime(indicators, index, atr, close)
                if atr is not None and close > 0
                else "normal"
            )
            display = {
                "trending": "Trending Regime",
                "ranging": "Ranging Regime",
                "volatile": "High Volatility Regime",
                "transitional": "Volatility Transition Regime",
            }[regime]
            base_record = {
                "symbol": self._display_symbol(series["symbol"], series["market_type"]),
                "symbol_id": series["symbol"],
                "timeframe": series["timeframe"],
                "generated_at_utc": candles[index]["open_time_utc"],
                "data_source": series["source"],
                "signal_class": "context",
            }
            # Statistical family (SIG-6): z-score of close vs its 20-bar mean.
            window = [float(c["close"]) for c in candles[index - 19 : index + 1]]
            mean20 = sum(window) / len(window)
            variance = sum((value - mean20) ** 2 for value in window) / len(window)
            std20 = variance**0.5
            if std20 > 0:
                z_score = (close - mean20) / std20
                if abs(z_score) >= 2.0:
                    items.append(
                        {
                            **base_record,
                            "family": "statistical",
                            "layer": "expert",
                            "display_name": (
                                "Z-Score Extreme (Stretched Up)"
                                if z_score > 0
                                else "Z-Score Extreme (Stretched Down)"
                            ),
                            "regime": regime,
                            "volatility_regime": vol_regime,
                            "lesson_id": "",
                            "tags": ["Statistical", "Z-Score"],
                            "message": (
                                f"Close is {z_score:+.1f} standard deviations from its 20-bar "
                                "mean. Stretch reverts in ranges and persists in trends - the "
                                "regime read decides which lens applies."
                            ),
                        }
                    )
            # Cross-sectional return for leader/laggard ranking (SIG-6).
            past_close = float(candles[index - 19]["close"])
            if past_close > 0:
                cross_sectional.setdefault(series["timeframe"], []).append(
                    {
                        "record": base_record,
                        "return_20": (close - past_close) / past_close,
                        "regime": regime,
                        "vol_regime": vol_regime,
                    }
                )

            # Volatility family context (SIG-4): states, not trades.
            if vol_regime == "compressed":
                items.append(
                    {
                        **base_record,
                        "family": "volatility",
                        "layer": "advanced",
                        "display_name": "Volatility Contraction",
                        "regime": regime,
                        "volatility_regime": vol_regime,
                        "lesson_id": "intermediate-23-volatility-regimes",
                        "tags": ["Volatility", "Compression"],
                        "message": (
                            "ATR is compressed versus its 30-bar baseline. Compression "
                            "precedes expansion - watch for squeeze-release setups."
                        ),
                    }
                )
            elif vol_regime == "expanded":
                items.append(
                    {
                        **base_record,
                        "family": "volatility",
                        "layer": "advanced",
                        "display_name": "Volatility Expansion",
                        "regime": regime,
                        "volatility_regime": vol_regime,
                        "lesson_id": "intermediate-23-volatility-regimes",
                        "tags": ["Volatility", "Expansion"],
                        "message": (
                            "ATR is expanded versus its 30-bar baseline. Stops sized from "
                            "calm bars are wrong here - the engine widens its multiples."
                        ),
                    }
                )
            day_range = float(candles[index]["high"]) - float(candles[index]["low"])
            average_range = (
                sum(float(c["high"]) - float(c["low"]) for c in candles[index - 14 : index]) / 14
            )
            if average_range > 0 and day_range > 2.0 * average_range:
                items.append(
                    {
                        **base_record,
                        "family": "volatility",
                        "layer": "advanced",
                        "display_name": "Range Expansion Day",
                        "regime": regime,
                        "volatility_regime": vol_regime,
                        "lesson_id": "intermediate-23-volatility-regimes",
                        "tags": ["Volatility", "Range"],
                        "message": (
                            f"This bar's range is {day_range / average_range:.1f}x the 14-bar "
                            "average. Expansion days reset every nearby invalidation level."
                        ),
                    }
                )
            items.append(
                {
                    "symbol": self._display_symbol(series["symbol"], series["market_type"]),
                    "symbol_id": series["symbol"],
                    "timeframe": series["timeframe"],
                    "family": "regime",
                    "layer": "advanced",
                    "signal_class": "context",
                    "display_name": display,
                    "regime": regime,
                    "volatility_regime": vol_regime,
                    "lesson_id": "intermediate-21-regime-detection",
                    "tags": ["Regime", vol_regime.title()],
                    "message": (
                        f"ADX/ATR classifier reads {regime} with {vol_regime} volatility. "
                        "Context only — gates setup families, never a trade by itself."
                    ),
                    "generated_at_utc": candles[index]["open_time_utc"],
                    "data_source": series["source"],
                }
            )
        # Relative strength family (SIG-6): leader and laggard per timeframe
        # cohort. Rank means nothing in a cohort of two, so require four.
        for entries in cross_sectional.values():
            if len(entries) < 4:
                continue
            ranked = sorted(entries, key=lambda entry: entry["return_20"])
            for entry, name, tags in (
                (ranked[-1], "Relative Strength Leader", ["Relative Strength", "Leader"]),
                (ranked[0], "Relative Weakness Laggard", ["Relative Strength", "Laggard"]),
            ):
                items.append(
                    {
                        **entry["record"],
                        "family": "relative-strength",
                        "layer": "advanced",
                        "display_name": name,
                        "regime": entry["regime"],
                        "volatility_regime": entry["vol_regime"],
                        "lesson_id": "",
                        "tags": tags,
                        "message": (
                            f"20-bar return of {entry['return_20'] * 100:+.1f}% ranks "
                            f"{'first' if name.endswith('Leader') else 'last'} of "
                            f"{len(entries)} tracked symbols on this timeframe. Strength "
                            "ranks rotate - context for symbol selection, never an entry."
                        ),
                    }
                )

        items.sort(key=lambda item: item["generated_at_utc"], reverse=True)
        return items

    def list_backtest_presets(self) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        seen: set[str] = set()
        for series in self._analytics_store.list_market_series(minimum_candles=80):
            default_preset = self.run_backtest_analysis(
                symbol_id=series["symbol"],
                market_type=series["market_type"],
                timeframe=series["timeframe"],
                setup_type=None,
                fees_percent=None,
                slippage_percent=None,
                train_test_split=70,
                walk_forward=True,
            )
            if default_preset is None:
                continue
            items.append(default_preset)
            seen.add(default_preset["id"])

            for definition in self._matching_strategy_definitions(
                series["market_type"], series["timeframe"]
            ):
                for setup_type in definition["setup_types"]:
                    if setup_type == default_preset["setupType"]:
                        continue
                    preset = self.run_backtest_analysis(
                        symbol_id=series["symbol"],
                        market_type=series["market_type"],
                        timeframe=series["timeframe"],
                        setup_type=setup_type,
                        fees_percent=None,
                        slippage_percent=None,
                        train_test_split=70,
                        walk_forward=True,
                    )
                    if preset is None or preset["id"] in seen:
                        continue
                    if preset["metrics"]["tradeCount"] <= 0 and definition["source"] == "built-in":
                        continue
                    preset = {
                        **preset,
                        "strategyId": definition["id"],
                        "strategyName": definition["name"],
                        "strategySource": definition["source"],
                        "extensionId": definition.get("extension_id"),
                    }
                    items.append(preset)
                    seen.add(preset["id"])
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
        selected_direction = self._direction_for_setup(
            selected_setup_type, latest_state["direction"]
        )
        default_fees_percent, default_slippage_percent = self._default_costs(market_type)
        backtest = self._run_backtest(
            candles=candles,
            indicators=indicators,
            market_type=market_type,
            timeframe=timeframe,
            setup_type=selected_setup_type,
            direction=selected_direction,
            fees_percent=fees_percent if fees_percent is not None else default_fees_percent,
            slippage_percent=slippage_percent
            if slippage_percent is not None
            else default_slippage_percent,
            train_test_split=train_test_split,
            walk_forward=walk_forward,
        )

        return self._build_backtest_preset(
            symbol_id=symbol_id,
            market_type=market_type,
            timeframe=timeframe,
            setup_type=selected_setup_type,
            fees_percent=fees_percent if fees_percent is not None else default_fees_percent,
            slippage_percent=slippage_percent
            if slippage_percent is not None
            else default_slippage_percent,
            train_test_split=train_test_split,
            walk_forward=walk_forward,
            backtest=backtest,
            strategy_definition=self._strategy_definition_for_setup(
                selected_setup_type, market_type, timeframe
            ),
        )

    # ------------------------------------------------------------------
    # Strategy registry integration
    # ------------------------------------------------------------------

    def _matching_strategy_definitions(
        self, market_type: str, timeframe: str
    ) -> list[dict[str, Any]]:
        if self._strategy_registry is None:
            return []
        items_method = getattr(self._strategy_registry, "items", None)
        if not callable(items_method):
            return []
        definitions = items_method()
        if not isinstance(definitions, list):
            return []
        matches: list[dict[str, Any]] = []
        for item in definitions:
            if not isinstance(item, dict):
                continue
            setup_types = item.get("setup_types")
            market_types = item.get("market_types")
            timeframes = item.get("timeframes")
            if not isinstance(setup_types, list) or not setup_types:
                continue
            if isinstance(market_types, list) and market_types and market_type not in market_types:
                continue
            if isinstance(timeframes, list) and timeframes and timeframe not in timeframes:
                continue
            matches.append(
                {
                    "id": str(item.get("id") or ""),
                    "name": str(item.get("name") or item.get("id") or ""),
                    "setup_types": [
                        str(setup_type) for setup_type in setup_types if isinstance(setup_type, str)
                    ],
                    "source": item.get("source")
                    if item.get("source") in {"built-in", "extension"}
                    else "built-in",
                    "extension_id": item.get("extension_id")
                    if isinstance(item.get("extension_id"), str)
                    else None,
                }
            )
        return matches

    def _strategy_definition_for_setup(
        self,
        setup_type: str,
        market_type: str,
        timeframe: str,
    ) -> dict[str, Any] | None:
        for definition in self._matching_strategy_definitions(market_type, timeframe):
            if setup_type in definition["setup_types"]:
                return definition
        return None

    def _extension_candidate_setups(self, context: dict[str, Any]) -> list[dict[str, Any]]:
        if self._strategy_registry is None:
            return []
        candidate_method = getattr(self._strategy_registry, "candidate_setups", None)
        if not callable(candidate_method):
            return []
        candidates = candidate_method(context)
        if not isinstance(candidates, list):
            return []
        required = {
            "signal",
            "setup_type",
            "direction",
            "reference_price",
            "entry_zone",
            "stop_loss",
            "take_profit",
            "confluence_score",
        }
        valid: list[dict[str, Any]] = []
        for candidate in candidates:
            if not isinstance(candidate, dict) or not required.issubset(candidate.keys()):
                continue
            valid.append(
                {
                    "status": "active",
                    "regime": str(context.get("regime") or "extension"),
                    "risk_level": "medium",
                    "trend_alignment": float(context.get("trend_alignment") or 0.0),
                    "volume_confirmation": float(context.get("volume_confirmation") or 0.0),
                    "volatility_regime": str(context.get("volatility_regime") or "normal"),
                    "reasons": ["Extension strategy candidate."],
                    **candidate,
                }
            )
        return valid

    # ------------------------------------------------------------------
    # Signal assembly
    # ------------------------------------------------------------------

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
        conformal = conformal_interval(backtest.get("out_of_sample_outcomes", []), coverage=0.9)
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
                "quality": derive_quality(state, risk_reward, data_age_seconds),
                **taxonomy_for(state["setup_type"]),
                "composite_flags": derive_composite_flags(
                    state["setup_type"],
                    pooled,
                    self._min_backtest_sample,
                    data_age_seconds,
                    timeframe,
                ),
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
                    "conformal_coverage": conformal["coverage"] if conformal else None,
                    "conformal_lower_r": round(conformal["lower_r"], 3) if conformal else None,
                    "conformal_upper_r": round(conformal["upper_r"], 3) if conformal else None,
                    "conformal_sample_size": conformal["calibration_sample_size"]
                    if conformal
                    else 0,
                    "conformal_guaranteed": bool(conformal),
                },
                "entry_zone": entry_zone,
                "stop_loss": stop_loss,
                "take_profit": take_profit,
                "risk_reward": risk_reward,
                "fees_slippage_assumed": self._fees_slippage_label(market_type),
                "reasons": state["reasons"],
                "invalidation": self._build_invalidation(
                    direction=state["direction"], timeframe=timeframe, stop_loss=stop_loss
                ),
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
        return setups_module.candidate_setups(
            market_type=market_type,
            timeframe=timeframe,
            indicators=indicators,
            index=index,
            extension_candidates=lambda context: self._extension_candidate_setups(
                {**context, "market_service": self}
            ),
        )

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
        return backtest_module.run_backtest(
            candles=candles,
            indicators=indicators,
            timeframe=timeframe,
            setup_type=setup_type,
            direction=direction,
            fees_percent=fees_percent,
            slippage_percent=slippage_percent,
            train_test_split=train_test_split,
            min_backtest_sample=self._min_backtest_sample,
            candidate_fn=lambda index: self._candidate_setups(
                market_type=market_type,
                timeframe=timeframe,
                indicators=indicators,
                index=index,
            ),
        )

    def _persist_expectancy(
        self,
        symbol_id: str,
        setup_type: str,
        timeframe: str,
        regime: str,
        backtest: dict[str, Any],
    ) -> None:
        try:
            oos_n = backtest["out_of_sample_trade_count"]
            oos_wins = round(backtest["out_of_sample_win_rate"] * oos_n) if oos_n > 0 else 0
            self._analytics_store.upsert_setup_expectancy(
                {
                    "symbol": symbol_id,
                    "setup_type": setup_type,
                    "timeframe": timeframe,
                    "regime": regime,
                    "sample_size": backtest["trade_count"],
                    "wins": backtest["wins"],
                    "sum_r": backtest["sum_r"],
                    "oos_sample_size": oos_n,
                    "oos_wins": oos_wins,
                    "oos_sum_r": backtest["out_of_sample_expectancy"] * oos_n,
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
        strategy_definition: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        display_symbol = self._display_symbol(symbol_id, market_type)
        return {
            "id": f"{symbol_id.lower()}-{timeframe}-{setup_type}",
            "name": f"{display_symbol} {setup_type.replace('_', ' ').title()}",
            "symbolId": symbol_id,
            "setupType": setup_type,
            "timeframe": timeframe,
            "strategyId": strategy_definition.get("id") if strategy_definition else None,
            "strategyName": strategy_definition.get("name") if strategy_definition else None,
            "strategySource": strategy_definition.get("source")
            if strategy_definition
            else "built-in",
            "extensionId": strategy_definition.get("extension_id") if strategy_definition else None,
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
        return narration_module.template_explanation(facts), "template"

    def _data_freshness(
        self, timeframe: str, generated_at_utc: str
    ) -> tuple[int | None, str | None]:
        bar_seconds = {
            "15m": 900,
            "1h": 3600,
            "4h": 14400,
            "1d": 86400,
        }.get(timeframe, 3600)
        try:
            opened = datetime.fromisoformat(generated_at_utc.replace("Z", "+00:00"))
            if opened.tzinfo is None:
                opened = opened.replace(tzinfo=UTC)
        except (ValueError, AttributeError):
            return None, None
        closed = opened + timedelta(seconds=bar_seconds)
        age_seconds = int((datetime.now(UTC) - closed).total_seconds())
        return max(age_seconds, 0), closed.isoformat().replace("+00:00", "Z")

    # ------------------------------------------------------------------
    # Small presentation helpers
    # ------------------------------------------------------------------

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

    def _display_symbol(self, symbol_id: str, market_type: str) -> str:
        if market_type == "crypto" and symbol_id.endswith("USD") and len(symbol_id) > 3:
            return f"{symbol_id[:-3]}/USD"
        return symbol_id

    def _build_signal_id(
        self, symbol_id: str, timeframe: str, signal_type: str, generated_at_utc: str
    ) -> str:
        return f"{symbol_id}-{timeframe}-{signal_type}-{generated_at_utc}"

    # ------------------------------------------------------------------
    # Delegates to the pure modules (stable seam for tests and extensions)
    # ------------------------------------------------------------------

    def _build_indicators(self, candles: list[dict[str, Any]]) -> SeriesIndicators:
        return indicators_module.build_indicators(candles)

    def _ema(self, values: list[float], period: int) -> list[float | None]:
        return indicators_module.ema(values, period)

    def _ema_of_optional(self, values: list[float | None], period: int) -> list[float | None]:
        return indicators_module.ema_of_optional(values, period)

    def _macd_line(self, values: list[float]) -> list[float | None]:
        return indicators_module.macd_line(values)

    def _bollinger(
        self, values: list[float], period: int, deviations: float
    ) -> tuple[list[float | None], list[float | None], list[float | None], list[float | None]]:
        return indicators_module.bollinger(values, period, deviations)

    def _donchian(
        self, highs: list[float], lows: list[float], period: int
    ) -> tuple[list[float | None], list[float | None]]:
        return indicators_module.donchian(highs, lows, period)

    def _keltner(
        self, ema: list[float | None], atr: list[float | None], multiplier: float
    ) -> tuple[list[float | None], list[float | None]]:
        return indicators_module.keltner(ema, atr, multiplier)

    def _sma(self, values: list[float], period: int) -> list[float | None]:
        return indicators_module.sma(values, period)

    def _rsi(self, values: list[float], period: int) -> list[float | None]:
        return indicators_module.rsi(values, period)

    def _atr(self, candles: list[dict[str, Any]], period: int) -> list[float | None]:
        return indicators_module.atr(candles, period)

    def _adx(self, candles: list[dict[str, Any]], period: int) -> list[float | None]:
        return indicators_module.adx(candles, period)

    def _market_regime(self, indicators: SeriesIndicators, index: int) -> str:
        return setups_module.market_regime(indicators, index)

    def _volatility_regime(
        self, indicators: SeriesIndicators, index: int, atr: float, close: float
    ) -> str:
        return setups_module.volatility_regime(indicators, index, atr, close)

    def _direction_for_setup(self, setup_type: str, fallback_direction: str) -> str:
        return setups_module.direction_for_setup(setup_type, fallback_direction)

    def _build_invalidation(self, direction: str, timeframe: str, stop_loss: float) -> str:
        return narration_module.build_invalidation(direction, timeframe, stop_loss)

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
        return backtest_module.simulate_ladder_trade(
            indicators=indicators,
            index=index,
            direction=direction,
            entry=entry,
            stop_loss=stop_loss,
            take_profit=take_profit,
            max_hold_bars=max_hold_bars,
            round_trip_cost=round_trip_cost,
        )

    def _max_hold_bars(self, timeframe: str) -> int:
        return backtest_module.max_hold_bars(timeframe)

    def _test_period(self, candles: list[dict[str, Any]]) -> str:
        return backtest_module.test_period(candles)

    def _derive_confidence(
        self,
        state: dict[str, Any],
        backtest: dict[str, Any],
        pooled: dict[str, Any],
    ) -> int:
        return derive_confidence(state, backtest, pooled, self._min_backtest_sample)

    def _calibrate_win_rate(self, raw_win_rate: float, sample_size: int) -> float:
        return statistics_module.calibrate_win_rate(
            raw_win_rate, sample_size, float(self._min_backtest_sample)
        )

    def _equity_curve(self, outcomes: list[float]) -> list[float]:
        return statistics_module.equity_curve(outcomes)

    def _drawdown_curve(self, equity_curve: list[float]) -> list[float]:
        return statistics_module.drawdown_curve(equity_curve)

    def _profit_factor(self, outcomes: list[float]) -> float:
        return statistics_module.profit_factor(outcomes)

    def _sharpe_ratio(self, outcomes: list[float]) -> float:
        return statistics_module.sharpe_ratio(outcomes)

    def _sortino_ratio(self, outcomes: list[float]) -> float:
        return statistics_module.sortino_ratio(outcomes)

    def _standard_deviation(self, values: list[float]) -> float:
        return statistics_module.standard_deviation(values)

    def _clamp(self, value: float, low: float = 0.0, high: float = 1.0) -> float:
        return setups_module.clamp(value, low, high)
