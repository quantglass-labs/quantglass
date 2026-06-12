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

# Planned reward below this multiple of planned risk is a structurally
# losing geometry unless the win rate is extreme.
MIN_PLANNED_RR = 1.0

# This many submissions in one UTC day reads as cadence, not selectivity.
OVERTRADING_DAILY_COUNT = 6

# A move over the last TREND_BARS candles beyond this fraction marks a
# strong trend; entering against it earns the regime-mismatch moment.
TREND_FRACTION = 0.05
TREND_BARS = 20

# At least this many executed, planless-note-free trades must lack journal
# annotations before the journal-skipping moment fires.
JOURNAL_SKIP_MIN = 3


class LearnMomentsService:
    """Derives coaching moments from the paper account and trade intents."""

    def __init__(self, state_store: Any, analytics_store: Any | None = None) -> None:
        self._store = state_store
        self._analytics = analytics_store

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
        moments.extend(self._poor_planned_rr(intents))
        moments.extend(self._overtrading_today(intents))
        moments.extend(self._journal_skipping(intents))
        moments.extend(self._regime_mismatch(intents))

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

    # ------------------------------------------------------------------
    # v2 detectors (ACAD-8): plan geometry, cadence, journaling, regime.
    # ------------------------------------------------------------------

    def _poor_planned_rr(self, intents: list[dict[str, Any]]) -> list[dict[str, Any]]:
        moments = []
        for intent in intents[:RAPID_FIRE_WINDOW]:
            stop = intent.get("planStop")
            target = intent.get("planTarget")
            entry = float(intent.get("executedPrice") or intent.get("entryPrice") or 0)
            if not stop or not target or entry <= 0:
                continue
            risk = abs(entry - float(stop))
            reward = abs(float(target) - entry)
            if risk <= 0:
                continue
            rr = reward / risk
            if rr >= MIN_PLANNED_RR:
                continue
            moments.append(
                {
                    "id": f"poor-rr-{intent['id']}",
                    "type": "poor_planned_rr",
                    "lesson_id": "intermediate-04-risk-reward",
                    "severity": 2,
                    "message": (
                        f"Your {intent['symbol']} plan risks more than it targets "
                        f"(reward {rr:.2f}x risk). Below 1:1 the math needs a win rate "
                        "most setups never deliver — the risk:reward lesson shows why."
                    ),
                    "evidence": {
                        "symbol_id": intent["symbol"],
                        "rr": round(rr, 2),
                        "entry": entry,
                        "stop": float(stop),
                        "target": float(target),
                    },
                }
            )
        return moments

    def _overtrading_today(self, intents: list[dict[str, Any]]) -> list[dict[str, Any]]:
        from datetime import UTC, datetime

        today = datetime.now(UTC).date().isoformat()
        count = sum(1 for intent in intents if str(intent.get("submittedAt") or "")[:10] == today)
        if count < OVERTRADING_DAILY_COUNT:
            return []
        return [
            {
                "id": "overtrading-today",
                "type": "overtrading_cadence",
                "lesson_id": "advanced-21-tilt",
                "severity": 3,
                "message": (
                    f"{count} orders submitted today. High cadence is the tilt lesson's "
                    "first warning sign — selectivity, not activity, is the edge."
                ),
                "evidence": {"count": count, "threshold": OVERTRADING_DAILY_COUNT},
            }
        ]

    def _journal_skipping(self, intents: list[dict[str, Any]]) -> list[dict[str, Any]]:
        get_notes = getattr(self._store, "get_journal_notes", None)
        if get_notes is None:
            return []
        notes = get_notes()
        executed = [intent for intent in intents if intent.get("status") == "executed"]
        unjournaled = [
            intent
            for intent in executed
            if not notes.get(str(intent["id"]), {}).get("note")
            and not notes.get(str(intent["id"]), {}).get("tags")
        ]
        if len(unjournaled) < JOURNAL_SKIP_MIN:
            return []
        return [
            {
                "id": "journal-skipping",
                "type": "journal_skipping",
                "lesson_id": "intermediate-17-journaling",
                "severity": 2,
                "message": (
                    f"{len(unjournaled)} of your {len(executed)} executed trades have no "
                    "journal note or tags. Unjournaled trades teach nothing — the "
                    "journaling lesson shows what two honest sentences buy you."
                ),
                "evidence": {
                    "unjournaled": len(unjournaled),
                    "executed": len(executed),
                },
            }
        ]

    def _regime_mismatch(self, intents: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if self._analytics is None:
            return []
        moments = []
        seen: set[str] = set()
        for intent in intents[:RAPID_FIRE_WINDOW]:
            symbol = intent.get("symbol") or ""
            side = intent.get("side")
            if not symbol or symbol in seen or side not in {"long", "short"}:
                continue
            seen.add(symbol)
            trend = self._trend_fraction(symbol)
            if trend is None:
                continue
            against = (side == "long" and trend <= -TREND_FRACTION) or (
                side == "short" and trend >= TREND_FRACTION
            )
            if not against:
                continue
            direction = "down" if trend < 0 else "up"
            moments.append(
                {
                    "id": f"regime-mismatch-{symbol}",
                    "type": "regime_mismatch",
                    "lesson_id": "intermediate-22-trading-with-regime",
                    "severity": 2,
                    "message": (
                        f"You went {side} {symbol} while its last {TREND_BARS} bars trend "
                        f"{direction} {abs(trend) * 100:.1f}%. Counter-trend entries need a "
                        "mean-reversion thesis — the regime lesson explains the gate."
                    ),
                    "evidence": {
                        "symbol_id": symbol,
                        "side": side,
                        "trend_fraction": round(trend, 4),
                        "bars": TREND_BARS,
                    },
                }
            )
        return moments

    def _trend_fraction(self, symbol: str) -> float | None:
        try:
            for series in self._analytics.list_market_series(minimum_candles=TREND_BARS):
                if series["symbol"] != symbol:
                    continue
                payload = self._analytics.list_market_candles(
                    series["symbol"], series["timeframe"], limit=TREND_BARS
                )
                items = payload.get("items") or []
                if len(items) < TREND_BARS:
                    return None
                first = float(items[0]["close"])
                last = float(items[-1]["close"])
                if first <= 0:
                    return None
                return (last - first) / first
        except Exception:  # noqa: BLE001 — coaching must never break the API
            return None
        return None
