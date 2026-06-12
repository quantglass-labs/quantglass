# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Portfolio / risk meta-signals (SIG-5): the taxonomy's risk class.

These signals read the user's own paper account, trade reviews, and
constitution — never the market. They brake: each one names a condition
under which the next trade should be smaller, later, or skipped. They are
the signal-feed face of the same machinery the constitution enforces at
the ticket. Educational only.
"""

from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime
from typing import Any

HEAT_WARNING_FRACTION = 0.30
CONCENTRATION_FRACTION = 0.15
CLUSTER_SIZE = 3
DRAWDOWN_FRACTION = 0.05
COOLDOWN_PROCESS_BAR = 50
COOLDOWN_SAMPLE = 5


class RiskMetaService:
    def __init__(self, state_store: Any, trade_review_service: Any, constitution_service: Any):
        self._store = state_store
        self._review = trade_review_service
        self._constitution = constitution_service

    def list_risk_signals(self) -> list[dict[str, Any]]:
        account = self._store.get_paper_account()
        balance = float(account.get("balance") or 0.0)
        positions = account.get("openPositions", [])
        items: list[dict[str, Any]] = []

        def emit(name: str, severity: int, message: str, lesson: str, tags: list[str]) -> None:
            items.append(
                {
                    "family": "portfolio-risk",
                    "signal_class": "risk",
                    "layer": "expert",
                    "display_name": name,
                    "severity": severity,
                    "message": message,
                    "lesson_id": lesson,
                    "tags": tags,
                    "generated_at_utc": datetime.now(UTC).isoformat(),
                }
            )

        if balance > 0 and positions:
            notionals = [abs(float(p["quantity"]) * float(p["averagePrice"])) for p in positions]
            heat = sum(notionals) / balance
            if heat >= HEAT_WARNING_FRACTION:
                emit(
                    "Portfolio Heat Elevated",
                    3,
                    f"Open exposure is {heat * 100:.0f}% of the account. If these positions "
                    "correlate - and in a shock they will - this is one trade, not "
                    f"{len(positions)}.",
                    "intermediate-14-portfolio-heat",
                    ["Heat", "Exposure"],
                )
            worst = max(notionals) / balance
            if worst >= CONCENTRATION_FRACTION:
                emit(
                    "Exposure Concentration Warning",
                    2,
                    f"A single position is {worst * 100:.0f}% of the account. Size came from "
                    "conviction somewhere - re-derive it from risk.",
                    "intermediate-05-position-sizing",
                    ["Concentration"],
                )
            sides = Counter(str(p.get("side")) for p in positions)
            for side, count in sides.items():
                if count >= CLUSTER_SIZE:
                    emit(
                        f"Correlated {side.title()} Cluster",
                        2,
                        f"{count} open positions share the {side} direction. Same-direction "
                        "clusters behave as one large position when the regime turns.",
                        "intermediate-14-portfolio-heat",
                        ["Cluster", side.title()],
                    )

        if balance > 0:
            unrealized = sum(float(p.get("pnl") or 0.0) for p in positions)
            if unrealized < -DRAWDOWN_FRACTION * balance:
                emit(
                    "Drawdown Escalation",
                    3,
                    f"Open positions are down {abs(unrealized) / balance * 100:.1f}% of the "
                    "account. The drawdown lesson's first rule applies: never size up to "
                    "recover faster.",
                    "intermediate-15-drawdown",
                    ["Drawdown"],
                )

        constitution = self._constitution.get()
        if constitution["adopted"]:
            compliance = self._constitution.compliance(self._review.review()["items"])
            cap = constitution["rules"]["daily_max_trades"]
            if compliance["trades_today"] >= cap:
                emit(
                    "Cooldown Required",
                    3,
                    f"Daily trade cap reached ({compliance['trades_today']}/{cap}). Your own "
                    "constitution says the market reopens tomorrow.",
                    "advanced-22-discipline-systems",
                    ["Constitution", "Cooldown"],
                )

        recent = self._review.review()["items"][:COOLDOWN_SAMPLE]
        if len(recent) >= COOLDOWN_SAMPLE:
            average = sum(item["process_score"] for item in recent) / len(recent)
            if average < COOLDOWN_PROCESS_BAR:
                emit(
                    "Kill Switch: Process Degradation",
                    3,
                    f"Your last {len(recent)} trades average a process score of "
                    f"{average:.0f} - planning has broken down. Stand down, journal, and "
                    "replay a drill before the next order.",
                    "advanced-21-tilt",
                    ["Kill Switch", "Process"],
                )

        items.sort(key=lambda item: -item["severity"])
        return items
