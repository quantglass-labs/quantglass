# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Personal Trading Constitution (MSN-5): user-authored rules, enforced.

The constitution is the risk-officer track's written policy lesson turned
into a feature. The user adopts a small set of rules — max risk per trade,
a daily trade cap, stop and thesis requirements — and the app holds them to
it: the paper-trade ticket rejects violating submissions, and Review reports
adherence over the journal. Rules apply to the user's own paper trading;
nothing here is financial advice.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

DEFAULT_RULES: dict[str, Any] = {
    "max_risk_percent": 1.0,
    "daily_max_trades": 5,
    "require_stop": True,
    "require_reason": True,
}

RULE_LABELS = {
    "max_risk_percent": "Never risk more than {value}% on a single trade",
    "daily_max_trades": "No more than {value} trades per day",
    "require_stop": "Every trade has a stop before entry",
    "require_reason": "Every trade has a written reason",
}


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


class ConstitutionService:
    def __init__(self, state_store: Any) -> None:
        self._store = state_store

    def get(self) -> dict[str, Any]:
        saved = self._store.get_constitution()
        if saved is None:
            return {"adopted": False, "rules": dict(DEFAULT_RULES), "adopted_at": None}
        rules = {**DEFAULT_RULES, **saved["rules"]}
        return {"adopted": True, "rules": rules, "adopted_at": saved["adopted_at"]}

    def adopt(self, rules: dict[str, Any]) -> dict[str, Any]:
        clean = {
            "max_risk_percent": _clamp(float(rules.get("max_risk_percent", 1.0)), 0.1, 10.0),
            "daily_max_trades": int(_clamp(int(rules.get("daily_max_trades", 5)), 1, 50)),
            "require_stop": bool(rules.get("require_stop", True)),
            "require_reason": bool(rules.get("require_reason", True)),
        }
        saved = self._store.save_constitution(clean)
        return {"adopted": True, **saved}

    # ------------------------------------------------------------------
    # Enforcement at the ticket: violations block the submission.
    # ------------------------------------------------------------------

    def check_trade(self, plan: dict[str, Any]) -> list[str]:
        state = self.get()
        if not state["adopted"]:
            return []
        rules = state["rules"]
        violations: list[str] = []

        if rules["require_stop"] and not plan.get("stop"):
            violations.append("Your constitution requires a stop on every trade.")
        if rules["require_reason"] and not str(plan.get("reason") or "").strip():
            violations.append("Your constitution requires a written reason for every trade.")

        risk = plan.get("riskPercent")
        if risk is not None and float(risk) > rules["max_risk_percent"]:
            violations.append(
                f"Planned risk {float(risk):.2f}% breaks your "
                f"{rules['max_risk_percent']}% per-trade limit."
            )

        if self._trades_today() >= rules["daily_max_trades"]:
            violations.append(
                f"You have already placed {rules['daily_max_trades']} trades today — "
                "your daily cap. The market reopens tomorrow."
            )
        return violations

    def _trades_today(self) -> int:
        today = datetime.now(UTC).date().isoformat()
        intents = self._store.list_paper_trade_intents()
        return sum(1 for intent in intents if str(intent.get("submittedAt") or "")[:10] == today)

    # ------------------------------------------------------------------
    # Reporting for Review: adherence over the scored journal.
    # ------------------------------------------------------------------

    def compliance(self, items: list[dict[str, Any]]) -> dict[str, Any]:
        state = self.get()
        rules = state["rules"]
        total = len(items)

        def _count(predicate: Any) -> int:
            return sum(1 for item in items if predicate(item))

        checks = [
            {
                "id": "require_stop",
                "label": RULE_LABELS["require_stop"],
                "violations": _count(
                    lambda item: any("No stop" in note for note in item["process_notes"])
                ),
            },
            {
                "id": "require_reason",
                "label": RULE_LABELS["require_reason"],
                "violations": _count(
                    lambda item: any("No written reason" in note for note in item["process_notes"])
                ),
            },
            {
                "id": "max_risk_percent",
                "label": RULE_LABELS["max_risk_percent"].format(value=rules["max_risk_percent"]),
                "violations": _count(
                    lambda item: any(
                        "exceeds" in note or "double" in note for note in item["process_notes"]
                    )
                ),
            },
        ]
        return {
            "adopted": state["adopted"],
            "rules": rules,
            "total_trades": total,
            "trades_today": self._trades_today(),
            "checks": checks,
        }
