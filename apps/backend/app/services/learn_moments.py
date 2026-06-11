# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Lesson moments: teachable events detected from the user's own trading.

Each detector inspects real paper-trading state and, when it finds a
pattern worth coaching, emits a moment that links a concrete observation
("your BTCUSD position is 31% of your account") to the lesson that teaches
the underlying concept. Detection is deterministic and read-only —
educational coaching, never financial advice.
"""

from __future__ import annotations

from typing import Any

# Position notional above this share of account balance triggers the
# position-sizing moment. Deliberately generous: coaching, not nagging.
OVERSIZED_POSITION_FRACTION = 0.15

# This many submissions on one symbol within the recent window suggests
# impulse re-entry rather than a planned setup.
RAPID_FIRE_COUNT = 3
RAPID_FIRE_WINDOW = 10

# Unrealized loss beyond this fraction of balance without a protective
# alert suggests the invalidation level was never defined.
DRAWDOWN_FRACTION = 0.02


class LearnMomentsService:
    """Derives coaching moments from the paper account and trade intents."""

    def __init__(self, state_store: Any) -> None:
        self._store = state_store

    def get_moments(self) -> list[dict[str, Any]]:
        account = self._store.get_paper_account()
        intents = self._store.list_paper_trade_intents()
        alerts = self._store.list_alerts()
        completed = {
            lesson_id
            for lesson_id, data in self._store.get_learn_progress().items()
            if data.get("completed_at")
        }

        moments: list[dict[str, Any]] = []
        moments.extend(self._oversized_positions(account))
        moments.extend(self._rapid_fire_entries(intents))
        moments.extend(self._unprotected_drawdown(account, alerts))

        # Completed lessons still coach, but at lower priority.
        for moment in moments:
            moment["lesson_completed"] = moment["lesson_id"] in completed
        moments.sort(key=lambda moment: (moment["lesson_completed"], -moment["severity"]))
        return moments

    def _oversized_positions(self, account: dict[str, Any]) -> list[dict[str, Any]]:
        balance = float(account.get("balance") or 0.0)
        if balance <= 0:
            return []
        moments = []
        for position in account.get("openPositions", []):
            notional = abs(float(position["quantity"]) * float(position["averagePrice"]))
            fraction = notional / balance
            if fraction >= OVERSIZED_POSITION_FRACTION:
                moments.append(
                    {
                        "id": f"oversized-{position['symbolId']}",
                        "type": "oversized_position",
                        "lesson_id": "intermediate-05-position-sizing",
                        "severity": 3 if fraction >= 2 * OVERSIZED_POSITION_FRACTION else 2,
                        "message": (
                            f"Your {position['symbolId']} position is "
                            f"{fraction * 100:.0f}% of your paper account. The position-sizing "
                            "lesson shows how to size from risk, not conviction."
                        ),
                        "evidence": {
                            "symbol_id": position["symbolId"],
                            "notional": round(notional, 2),
                            "balance": round(balance, 2),
                            "fraction": round(fraction, 4),
                        },
                    }
                )
        return moments

    def _rapid_fire_entries(self, intents: list[dict[str, Any]]) -> list[dict[str, Any]]:
        recent = intents[:RAPID_FIRE_WINDOW]
        counts: dict[str, int] = {}
        for intent in recent:
            counts[intent["symbol"]] = counts.get(intent["symbol"], 0) + 1
        moments = []
        for symbol, count in counts.items():
            if count >= RAPID_FIRE_COUNT:
                moments.append(
                    {
                        "id": f"rapid-fire-{symbol}",
                        "type": "rapid_fire_entries",
                        "lesson_id": "expert-05-trading-plan",
                        "severity": 2,
                        "message": (
                            f"{count} of your last {len(recent)} orders were {symbol}. "
                            "Re-entering the same symbol repeatedly is usually impulse, not "
                            "plan — the trading-plan lesson covers entry discipline."
                        ),
                        "evidence": {
                            "symbol_id": symbol,
                            "count": count,
                            "window": len(recent),
                        },
                    }
                )
        return moments

    def _unprotected_drawdown(
        self, account: dict[str, Any], alerts: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        balance = float(account.get("balance") or 0.0)
        if balance <= 0:
            return []
        alerted_symbols = {alert["symbolId"] for alert in alerts if alert.get("status") != "fired"}
        moments = []
        for position in account.get("openPositions", []):
            pnl = float(position.get("pnl") or 0.0)
            if pnl >= 0 or abs(pnl) / balance < DRAWDOWN_FRACTION:
                continue
            if position["symbolId"] in alerted_symbols:
                continue
            moments.append(
                {
                    "id": f"unprotected-{position['symbolId']}",
                    "type": "unprotected_drawdown",
                    "lesson_id": "intermediate-03-atr",
                    "severity": 3,
                    "message": (
                        f"{position['symbolId']} is down "
                        f"{abs(pnl) / balance * 100:.1f}% of your account with no active "
                        "alert on it. The ATR lesson shows how to place an invalidation "
                        "level before entry, not after."
                    ),
                    "evidence": {
                        "symbol_id": position["symbolId"],
                        "pnl": round(pnl, 2),
                        "balance": round(balance, 2),
                    },
                }
            )
        return moments
