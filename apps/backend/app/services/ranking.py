# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Cross-sectional relative-strength ranking.

Pure-Python (no pandas) ranking of the locally-ingested market universe by trailing
momentum. Symbols are scored on a blend of trailing returns over several lookbacks and
then percentile-ranked against their peer group (same market type) so the watchlist can
surface the strongest candidates. Everything runs on data already stored in the local
analytics store; no network or cloud calls are made.
"""

from datetime import UTC, datetime
from typing import Any

from app.storage.analytics_store import AnalyticsStore


class RelativeStrengthRankingService:
    # Lookback windows (in bars) and their weights in the blended momentum score.
    _lookback_weights: dict[int, float] = {5: 0.15, 10: 0.25, 20: 0.35, 60: 0.25}
    _trend_window = 20

    def __init__(self, analytics_store: AnalyticsStore, minimum_candles: int = 30) -> None:
        self._analytics_store = analytics_store
        self._minimum_candles = minimum_candles

    def rank(self) -> dict[str, Any]:
        rows: list[dict[str, Any]] = []
        for series in self._analytics_store.list_market_series(
            minimum_candles=self._minimum_candles
        ):
            payload = self._analytics_store.list_market_candles(
                series["symbol"],
                series["timeframe"],
                limit=120,
            )
            closes = [
                candle["close"] for candle in payload["items"] if candle.get("close") is not None
            ]
            if len(closes) < self._minimum_candles:
                continue

            metrics = self._score(closes)
            if metrics is None:
                continue

            rows.append(
                {
                    "symbol": series["symbol"],
                    "market_type": series["market_type"],
                    "timeframe": series["timeframe"],
                    "source": series["source"],
                    "last_close": closes[-1],
                    "trailing_returns": metrics["trailing_returns"],
                    "momentum_score": metrics["momentum_score"],
                    "trend": metrics["trend"],
                }
            )

        self._assign_relative_strength(rows)
        rows.sort(
            key=lambda row: (
                row["relative_strength_percentile"],
                row["momentum_score"],
            ),
            reverse=True,
        )

        return {
            "generated_at_utc": datetime.now(UTC).isoformat(),
            "items": rows,
        }

    def _score(self, closes: list[float]) -> dict[str, Any] | None:
        latest = closes[-1]
        if latest <= 0:
            return None

        trailing_returns: dict[str, float] = {}
        weighted_total = 0.0
        weight_used = 0.0
        for lookback, weight in self._lookback_weights.items():
            if len(closes) <= lookback:
                continue
            reference = closes[-1 - lookback]
            if reference <= 0:
                continue
            ret = latest / reference - 1.0
            trailing_returns[f"r_{lookback}"] = round(ret, 6)
            weighted_total += ret * weight
            weight_used += weight

        if weight_used <= 0:
            return None

        momentum_score = round(weighted_total / weight_used, 6)
        trend = self._trend(closes)
        return {
            "trailing_returns": trailing_returns,
            "momentum_score": momentum_score,
            "trend": trend,
        }

    def _trend(self, closes: list[float]) -> str:
        if len(closes) < self._trend_window:
            return "neutral"
        window = closes[-self._trend_window :]
        sma = sum(window) / len(window)
        if closes[-1] > sma:
            return "up"
        if closes[-1] < sma:
            return "down"
        return "neutral"

    def _assign_relative_strength(self, rows: list[dict[str, Any]]) -> None:
        groups: dict[str, list[dict[str, Any]]] = {}
        for row in rows:
            groups.setdefault(row["market_type"], []).append(row)

        for group in groups.values():
            ordered = sorted(group, key=lambda row: row["momentum_score"])
            size = len(ordered)
            for index, row in enumerate(ordered):
                if size <= 1:
                    percentile = 100.0
                else:
                    percentile = round(index / (size - 1) * 100.0, 2)
                row["relative_strength_percentile"] = percentile
                row["peer_group_size"] = size
                row["peer_rank"] = size - index
