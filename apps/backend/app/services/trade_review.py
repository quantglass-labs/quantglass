# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Process scores and the decision-vs-outcome classifier (MSN-2).

Every executed paper trade is scored on *process* — was there a plan, was the
risk inside policy, was the stop sane — independent of profit. Outcomes are
resolved by replaying the planned trade against the real candles that
followed execution, with the backtester's conservative first-touch rule
(stop wins within an ambiguous bar). The 2x2 then names each trade:

    good decision + good outcome   -> earned win
    good decision + bad outcome    -> well-played loss (variance)
    bad decision  + bad outcome    -> honest tuition
    bad decision  + good outcome   -> DANGEROUS SUCCESS (rewards a habit
                                      that eventually bills the account)

Educational instrumentation only — never financial advice.
"""

from __future__ import annotations

from typing import Any

PROCESS_GOOD_BAR = 70
MAX_RISK_PERCENT = 1.0
RESOLVE_BARS = 60

TILT_EMOTIONS = {"fomo", "frustrated"}


class TradeReviewService:
    def __init__(self, state_store: Any, analytics_store: Any) -> None:
        self._state_store = state_store
        self._analytics_store = analytics_store

    # ------------------------------------------------------------------
    # Process score (0-100): every component documented and reported.
    # ------------------------------------------------------------------

    def score_process(self, intent: dict[str, Any]) -> tuple[int, list[str]]:
        score = 0
        notes: list[str] = []

        stop = intent.get("planStop")
        entry = float(intent.get("executedPrice") or intent.get("entryPrice") or 0)
        side = intent.get("side")

        if stop:
            score += 30
            stop_valid = (side == "long" and float(stop) < entry) or (
                side == "short" and float(stop) > entry
            )
            if stop_valid:
                score += 15
            else:
                notes.append("Stop is on the wrong side of the entry.")
        else:
            notes.append("No stop was planned — invalidation undefined.")

        if (intent.get("planReason") or "").strip():
            score += 20
        else:
            notes.append("No written reason — the trade has no thesis on record.")

        risk = intent.get("planRiskPercent")
        if risk is not None:
            if float(risk) <= MAX_RISK_PERCENT:
                score += 25
            elif float(risk) <= 2 * MAX_RISK_PERCENT:
                score += 15
                notes.append(f"Risk {float(risk):.2f}% exceeds the {MAX_RISK_PERCENT}% policy.")
            else:
                notes.append(
                    f"Risk {float(risk):.2f}% is more than double the {MAX_RISK_PERCENT}% policy."
                )
        else:
            notes.append("Planned risk was not recorded.")

        emotion = (intent.get("planEmotion") or "").lower()
        if emotion and emotion not in TILT_EMOTIONS:
            score += 10
        elif emotion in TILT_EMOTIONS:
            notes.append(f"Entered while '{emotion}' — the tilt states the psychology track names.")

        return min(score, 100), notes

    # ------------------------------------------------------------------
    # Outcome: first-touch replay of the planned trade on real candles.
    # ------------------------------------------------------------------

    def resolve_outcome(self, intent: dict[str, Any]) -> dict[str, Any]:
        stop = intent.get("planStop")
        entry = float(intent.get("executedPrice") or intent.get("entryPrice") or 0)
        side = intent.get("side")
        executed_at = intent.get("executedAt") or intent.get("submittedAt") or ""
        if not stop or entry <= 0:
            return {"status": "unscored", "r": None}
        risk = abs(entry - float(stop))
        if risk <= 0:
            return {"status": "unscored", "r": None}
        target = intent.get("planTarget")

        candles = self._candles_after(intent.get("symbol") or "", executed_at)
        if not candles:
            return {"status": "open", "r": None}

        for candle in candles[:RESOLVE_BARS]:
            high = float(candle["high"])
            low = float(candle["low"])
            if side == "long":
                if low <= float(stop):  # conservative: stop first in ambiguous bars
                    return {"status": "stopped", "r": -1.0}
                if target and high >= float(target):
                    return {"status": "target", "r": (float(target) - entry) / risk}
            else:
                if high >= float(stop):
                    return {"status": "stopped", "r": -1.0}
                if target and low <= float(target):
                    return {"status": "target", "r": (entry - float(target)) / risk}

        last_close = float(candles[min(RESOLVE_BARS, len(candles)) - 1]["close"])
        mark = (last_close - entry) / risk if side == "long" else (entry - last_close) / risk
        return {"status": "open", "r": round(mark, 3)}

    def _candles_after(self, symbol: str, executed_at: str) -> list[dict[str, Any]]:
        for series in self._analytics_store.list_market_series(minimum_candles=10):
            if series["symbol"] != symbol:
                continue
            payload = self._analytics_store.list_market_candles(
                series["symbol"], series["timeframe"], limit=320
            )
            items = payload.get("items") or []
            return [c for c in items if str(c.get("open_time_utc") or "") > executed_at]
        return []

    # ------------------------------------------------------------------
    # The review: scored, resolved, classified.
    # ------------------------------------------------------------------

    def review(self) -> dict[str, Any]:
        items: list[dict[str, Any]] = []
        quadrants = {
            "earned_win": 0,
            "well_played_loss": 0,
            "honest_tuition": 0,
            "dangerous_success": 0,
        }
        scores: list[int] = []

        for intent in self._state_store.list_paper_trade_intents():
            if intent.get("status") != "executed":
                continue
            score, notes = self.score_process(intent)
            outcome = self.resolve_outcome(intent)
            scores.append(score)

            classification = None
            if outcome["r"] is not None and outcome["status"] in {"stopped", "target"}:
                good_decision = score >= PROCESS_GOOD_BAR
                good_outcome = outcome["r"] > 0
                classification = (
                    "earned_win"
                    if good_decision and good_outcome
                    else "well_played_loss"
                    if good_decision
                    else "dangerous_success"
                    if good_outcome
                    else "honest_tuition"
                )
                quadrants[classification] += 1

            items.append(
                {
                    "id": intent["id"],
                    "symbol": intent.get("symbol"),
                    "side": intent.get("side"),
                    "submittedAt": intent.get("submittedAt"),
                    "planReason": intent.get("planReason"),
                    "planEmotion": intent.get("planEmotion"),
                    "process_score": score,
                    "process_notes": notes,
                    "outcome_status": outcome["status"],
                    "outcome_r": outcome["r"],
                    "classification": classification,
                }
            )

        return {
            "items": items,
            "summary": {
                "trades": len(items),
                "average_process_score": round(sum(scores) / len(scores)) if scores else 0,
                "quadrants": quadrants,
                "dangerous_success_count": quadrants["dangerous_success"],
                "process_good_bar": PROCESS_GOOD_BAR,
            },
        }
