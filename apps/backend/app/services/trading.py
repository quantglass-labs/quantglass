# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from __future__ import annotations

import inspect
from dataclasses import dataclass
from typing import Any

from app.providers.manager import ProviderManager
from app.services.event_bus import BackendEventBus
from app.storage.state_store import StateStore


class TradeExecutionError(ValueError):
    pass


@dataclass(frozen=True)
class TradeExecutionResult:
    accepted: bool
    trading_mode: str
    trade: dict[str, Any]
    account: dict[str, Any]


def _accepts_ticket(submit_order: Any) -> bool:
    """True when the client's submit_order takes the extended order ticket."""
    try:
        parameters = inspect.signature(submit_order).parameters
    except (TypeError, ValueError):
        return False
    return "order_type" in parameters or any(
        parameter.kind is inspect.Parameter.VAR_KEYWORD for parameter in parameters.values()
    )


class TradingExecutionService:
    def __init__(
        self,
        state_store: StateStore,
        provider_manager: ProviderManager,
        event_bus: BackendEventBus,
    ) -> None:
        self._state_store = state_store
        self._provider_manager = provider_manager
        self._event_bus = event_bus

    def submit_trade(
        self,
        signal_id: str,
        symbol: str,
        side: str,
        quantity: float,
        entry_price: float,
        plan: dict | None = None,
        order_type: str = "market",
        limit_price: float | None = None,
        tif: str = "gtc",
        expires_at: str | None = None,
        trail_percent: float | None = None,
    ) -> TradeExecutionResult:
        safety_settings = self._state_store.get_safety_settings()
        if safety_settings.trading_mode == "paper":
            trade, account = self._state_store.submit_paper_trade(
                signal_id=signal_id,
                symbol=symbol,
                side=side,
                quantity=quantity,
                entry_price=entry_price,
                trading_mode=safety_settings.trading_mode,
                plan=plan,
                order_type=order_type,
                limit_price=limit_price,
                tif=tif,
                expires_at=expires_at,
                trail_percent=trail_percent,
            )
            return TradeExecutionResult(
                accepted=True,
                trading_mode=safety_settings.trading_mode,
                trade=trade,
                account=account,
            )

        trade = self._submit_live_trade(
            signal_id=signal_id,
            symbol=symbol,
            side=side,
            quantity=quantity,
            entry_price=entry_price,
            safety_settings=safety_settings,
            order_type=order_type,
            limit_price=limit_price,
            tif=tif,
            trail_percent=trail_percent,
            plan=plan,
        )
        self._event_bus.publish(
            "live.trade.submitted",
            {
                "tradeId": trade["id"],
                "signalId": trade["signalId"],
                "symbolId": trade["symbol"],
                "side": trade["side"],
                "quantity": trade["quantity"],
                "provider": trade.get("provider"),
                "externalOrderId": trade.get("externalOrderId"),
                "brokerStatus": trade.get("brokerStatus"),
                "submittedAt": trade["submittedAt"],
            },
        )
        return TradeExecutionResult(
            accepted=True,
            trading_mode=safety_settings.trading_mode,
            trade=trade,
            account=self._state_store.get_paper_account(),
        )

    def _submit_live_trade(
        self,
        signal_id: str,
        symbol: str,
        side: str,
        quantity: float,
        entry_price: float,
        safety_settings: Any,
        order_type: str = "market",
        limit_price: float | None = None,
        tif: str = "gtc",
        trail_percent: float | None = None,
        plan: dict | None = None,
    ) -> dict[str, Any]:
        # Live execution is gated behind an explicit operator confirmation, not just the
        # trading_mode flag. A flipped mode alone must never reach a broker order.
        if not getattr(safety_settings, "live_trading_confirmed", False):
            raise TradeExecutionError(
                "Live trading is not confirmed. Enable the Risk & Safety live-trading "
                "confirmation (which requires keychain-stored trade credentials) before "
                "submitting real orders."
            )

        attempted_providers: list[str] = []

        for provider_name in self._provider_manager.resolve_chain("trading", "trading"):
            attempted_providers.append(provider_name)
            client = self._provider_manager.get_client(provider_name)
            if client is None or not hasattr(client, "submit_order"):
                continue

            # PAR-5: pass the full ticket to brokers that understand it. A client
            # on the legacy (symbol, side, quantity) signature only gets plain
            # market orders - resting orders, trails, and bracket legs are
            # refused rather than silently downgraded to an unprotected market fill.
            ticket = {
                "order_type": order_type,
                "limit_price": limit_price,
                "tif": tif,
                "trail_percent": trail_percent,
                "plan_stop": (plan or {}).get("stop"),
                "plan_target": (plan or {}).get("target"),
            }
            if _accepts_ticket(client.submit_order):
                broker_trade = client.submit_order(
                    symbol=symbol, side=side, quantity=quantity, **ticket
                )
            elif order_type != "market" or trail_percent is not None:
                raise TradeExecutionError(
                    f"Provider '{provider_name}' only supports plain market "
                    "orders on the live path. Resting and trailing orders "
                    "were not sent - nothing was downgraded silently."
                )
            else:
                broker_trade = client.submit_order(symbol=symbol, side=side, quantity=quantity)
            return self._state_store.record_live_trade(
                signal_id=signal_id,
                symbol=symbol,
                side=side,
                quantity=quantity,
                entry_price=entry_price,
                provider=provider_name,
                broker_trade=broker_trade,
                order_type=order_type,
                limit_price=limit_price,
                tif=tif,
                trail_percent=trail_percent,
            )

        attempted_label = ", ".join(attempted_providers) if attempted_providers else "none"
        raise TradeExecutionError(
            f"No configured live trading provider is available. Checked: {attempted_label}."
        )
