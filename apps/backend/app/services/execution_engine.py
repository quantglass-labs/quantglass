# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from app.services.event_bus import BackendEventBus
from app.services.notifications import AlertDeliveryResult, AlertNotificationService
from app.storage.analytics_store import AnalyticsStore
from app.storage.state_store import StateStore


@dataclass(frozen=True)
class MarketSnapshot:
    symbol: str
    price: float
    previous_price: float
    timeframe: str
    observed_at_utc: str
    source: str | None


@dataclass(frozen=True)
class AlertConditionSpec:
    mode: str
    threshold: float


class ExecutionEngineService:
    def __init__(
        self,
        state_store: StateStore,
        analytics_store: AnalyticsStore,
        event_bus: BackendEventBus,
        notification_service: AlertNotificationService,
    ) -> None:
        self._state_store = state_store
        self._analytics_store = analytics_store
        self._event_bus = event_bus
        self._notification_service = notification_service

    def run_alert_cycle(self) -> list[dict[str, Any]]:
        snapshots = self._latest_market_snapshots()
        fired_events: list[dict[str, Any]] = []

        for alert in self._state_store.list_alerts():
            if alert["status"] != "armed":
                continue
            snapshot = snapshots.get(alert["symbolId"])
            condition = self._parse_condition(alert["condition"])
            if snapshot is None or condition is None:
                continue
            if not self._condition_triggered(condition, snapshot):
                continue

            message = self._alert_message(alert["symbolId"], condition, snapshot)
            delivery_result = self._notification_service.deliver_alert(alert["channel"], message)
            history_message = self._history_message(message, delivery_result)
            _, history_item = self._state_store.record_alert_fire(
                alert_id=alert["id"],
                message=history_message,
                fired_at=snapshot.observed_at_utc,
            )
            payload = {
                "alertId": alert["id"],
                "symbolId": alert["symbolId"],
                "condition": alert["condition"],
                "message": history_item["message"],
                "channel": history_item["channel"],
                "firedAt": history_item["firedAt"],
                "price": snapshot.price,
                "timeframe": snapshot.timeframe,
                "delivered": delivery_result.delivered,
                "deliveryError": delivery_result.detail,
            }
            self._event_bus.publish("alert.fired", payload)
            if not delivery_result.delivered and delivery_result.detail:
                self._event_bus.publish(
                    "alert.delivery_failed",
                    {
                        "alertId": alert["id"],
                        "symbolId": alert["symbolId"],
                        "channel": alert["channel"],
                        "message": delivery_result.detail,
                        "firedAt": history_item["firedAt"],
                    },
                )
            fired_events.append(payload)

        return fired_events

    def close_position(
        self, symbol_id: str, quantity: float | None = None
    ) -> dict[str, Any] | None:
        """Manual market close at the latest closed price; partial when a
        quantity is given (scale-out)."""
        snapshots = self._latest_market_snapshots()
        snapshot = snapshots.get(symbol_id)
        if snapshot is None:
            return None
        closure = self._state_store.close_paper_position(symbol_id, snapshot.price, quantity)
        if closure is not None:
            self._event_bus.publish(
                "paper.position.closed",
                {
                    "symbolId": closure["symbolId"],
                    "side": closure["side"],
                    "exitKind": "manual",
                    "exitPrice": closure["exitPrice"],
                    "closedAt": closure["closedAt"],
                },
            )
        return closure

    def run_paper_cycle(self) -> dict[str, Any]:
        snapshots = self._latest_market_snapshots()
        price_map = {symbol: snapshot.price for symbol, snapshot in snapshots.items()}
        account_before = self._state_store.get_paper_account()
        executed_trades, _ = self._state_store.process_pending_paper_trades(price_map)
        bracket_closures = (
            self._state_store.enforce_paper_brackets(price_map)
            if hasattr(self._state_store, "enforce_paper_brackets")
            else []
        )
        account_after = self._state_store.refresh_paper_position_marks(price_map)

        for closure in bracket_closures:
            self._event_bus.publish(
                "paper.position.closed",
                {
                    "symbolId": closure["symbolId"],
                    "side": closure["side"],
                    "exitKind": closure["exitKind"],
                    "exitPrice": closure["exitPrice"],
                    "closedAt": closure["closedAt"],
                },
            )

        for trade in executed_trades:
            snapshot = snapshots.get(trade["symbol"])
            self._event_bus.publish(
                "paper.trade.executed",
                {
                    "tradeId": trade["id"],
                    "signalId": trade["signalId"],
                    "symbolId": trade["symbol"],
                    "side": trade["side"],
                    "quantity": trade["quantity"],
                    "executedPrice": trade["executedPrice"],
                    "executedAt": trade["executedAt"],
                    "timeframe": snapshot.timeframe if snapshot else None,
                },
            )

        if executed_trades or account_before != account_after:
            self._event_bus.publish(
                "paper.account.updated",
                {
                    "balance": account_after["balance"],
                    "buyingPower": account_after["buyingPower"],
                    "realizedPnl": account_after["realizedPnl"],
                    "openPositions": account_after["openPositions"],
                },
            )

        return {
            "executed": executed_trades,
            "account": account_after,
        }

    def _latest_market_snapshots(self) -> dict[str, MarketSnapshot]:
        preferred_rank = {"1h": 0, "4h": 1, "1d": 2, "15m": 3}
        selected_series: dict[str, dict[str, Any]] = {}
        for series in self._analytics_store.list_market_series(minimum_candles=2):
            current = selected_series.get(series["symbol"])
            if current is None or preferred_rank.get(series["timeframe"], 99) < preferred_rank.get(
                current["timeframe"], 99
            ):
                selected_series[series["symbol"]] = series

        snapshots: dict[str, MarketSnapshot] = {}
        for symbol, series in selected_series.items():
            candles = self._analytics_store.list_market_candles(
                symbol, series["timeframe"], limit=2
            )["items"]
            if not candles:
                continue
            latest = candles[-1]
            previous = candles[-2] if len(candles) >= 2 else latest
            snapshots[symbol] = MarketSnapshot(
                symbol=symbol,
                price=float(latest["close"]),
                previous_price=float(previous["close"]),
                timeframe=series["timeframe"],
                observed_at_utc=latest["open_time_utc"],
                source=series.get("source"),
            )
        return snapshots

    def _parse_condition(self, condition: str) -> AlertConditionSpec | None:
        return parse_condition_text(condition)


def parse_condition_text(condition: str) -> AlertConditionSpec | None:
    """The deterministic alert grammar - the single authority on validity,
    shared by the engine and the NL parser (model proposes, this disposes)."""
    normalized = condition.strip().lower()
    patterns = [
        (r"cross(?:es)?\s+above\s+([0-9]+(?:\.[0-9]+)?)", "crosses_above"),
        (r"cross(?:es)?\s+below\s+([0-9]+(?:\.[0-9]+)?)", "crosses_below"),
        (r"(?:>=|above|over)\s*([0-9]+(?:\.[0-9]+)?)", "above"),
        (r"(?:<=|below|under)\s*([0-9]+(?:\.[0-9]+)?)", "below"),
    ]
    for pattern, mode in patterns:
        match = re.search(pattern, normalized)
        if match:
            return AlertConditionSpec(mode=mode, threshold=float(match.group(1)))
    return None

    def _condition_triggered(self, condition: AlertConditionSpec, snapshot: MarketSnapshot) -> bool:
        if condition.mode == "crosses_above":
            return snapshot.previous_price <= condition.threshold < snapshot.price
        if condition.mode == "crosses_below":
            return snapshot.previous_price >= condition.threshold > snapshot.price
        if condition.mode == "above":
            return snapshot.price >= condition.threshold
        if condition.mode == "below":
            return snapshot.price <= condition.threshold
        return False

    def _alert_message(
        self,
        symbol_id: str,
        condition: AlertConditionSpec,
        snapshot: MarketSnapshot,
    ) -> str:
        condition_text = condition.mode.replace("_", " ")
        return (
            f"{symbol_id} {condition_text} {condition.threshold:.2f} at {snapshot.price:.2f} "
            f"on the closed {snapshot.timeframe} candle."
        )

    def _history_message(
        self,
        message: str,
        delivery_result: AlertDeliveryResult,
    ) -> str:
        if delivery_result.delivered or not delivery_result.detail:
            return message
        return f"{message} Delivery error: {delivery_result.detail}"
