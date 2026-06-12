# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Macro / breadth / event context (SIG-8) from honest, cheap data.

Macro reads come from ETF proxies the user already tracks in the corridor
(dollar, rates, gold, equal-weight vs cap-weight) - pure candle math, no
new providers. Event watches come from the published FOMC/BLS schedule
shipped as editable content. Crypto funding/OI is deferred: none of the
registered providers serve perp funding, and we do not fabricate data.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any

_CALENDAR = Path(__file__).resolve().parent.parent.parent / "content" / "calendar" / "events.json"

DOLLAR_PROXIES = ("UUP", "DXY")
RATES_PROXY = "TLT"
GOLD_PROXY = "GLD"
CAP_PROXY = "SPY"
EQUAL_PROXY = "RSP"

MOVE_BAR = 0.03
SPREAD_BAR = 0.02
EVENT_WINDOW_HOURS = 48


@lru_cache(maxsize=1)
def _load_events() -> tuple[dict[str, Any], ...]:
    with open(_CALENDAR, encoding="utf-8") as handle:
        return tuple(json.load(handle)["events"])


def _item(name: str, message: str, tags: list[str]) -> dict[str, Any]:
    return {
        "family": "macro",
        "layer": "advanced",
        "signal_class": "context",
        "display_name": name,
        "message": message,
        "tags": tags,
        "lesson_id": "expert-16-rates-liquidity",
        "generated_at_utc": datetime.now(UTC).isoformat(),
    }


def derive_macro_context(returns_by_symbol: dict[str, float]) -> list[dict[str, Any]]:
    """Intermarket reads from tracked ETF proxies' 20-bar returns. Symbols
    the user does not track simply contribute nothing."""
    items: list[dict[str, Any]] = []

    dollar = next((returns_by_symbol[p] for p in DOLLAR_PROXIES if p in returns_by_symbol), None)
    if dollar is not None and abs(dollar) >= MOVE_BAR:
        if dollar > 0:
            items.append(
                _item(
                    "Dollar Strength Headwind",
                    f"The dollar proxy is up {dollar:.1%} over 20 bars. Dollar strength "
                    "pressures risk assets and commodities priced in it.",
                    ["Macro", "Dollar"],
                )
            )
        else:
            items.append(
                _item(
                    "Dollar Weakness Tailwind",
                    f"The dollar proxy is down {abs(dollar):.1%} over 20 bars - a tailwind "
                    "for risk assets and hard-asset pricing.",
                    ["Macro", "Dollar"],
                )
            )

    rates = returns_by_symbol.get(RATES_PROXY)
    if rates is not None and abs(rates) >= MOVE_BAR:
        if rates < 0:
            items.append(
                _item(
                    "Yield Spike Pressure",
                    f"Long-duration bonds (TLT) are down {abs(rates):.1%} over 20 bars - "
                    "yields rising. Rate-sensitive equities feel this first.",
                    ["Macro", "Rates"],
                )
            )
        else:
            items.append(
                _item(
                    "Yield Drop Relief",
                    f"Long-duration bonds (TLT) are up {rates:.1%} over 20 bars - yields "
                    "falling, easing pressure on duration-sensitive assets.",
                    ["Macro", "Rates"],
                )
            )

    gold = returns_by_symbol.get(GOLD_PROXY)
    if gold is not None and gold >= MOVE_BAR:
        items.append(
            _item(
                "Gold Safety Flow",
                f"Gold (GLD) is up {gold:.1%} over 20 bars - classic safety rotation. "
                "Check whether equities confirm the defensive read.",
                ["Macro", "Gold"],
            )
        )

    cap = returns_by_symbol.get(CAP_PROXY)
    equal = returns_by_symbol.get(EQUAL_PROXY)
    if cap is not None and equal is not None:
        spread = equal - cap
        if spread <= -SPREAD_BAR:
            items.append(
                _item(
                    "Cap Weight Concentration Warning",
                    f"Equal-weight (RSP) trails cap-weight (SPY) by {abs(spread):.1%} over "
                    "20 bars - the rally is narrowing to a few large names.",
                    ["Breadth", "Concentration"],
                )
            )
        elif spread >= SPREAD_BAR:
            items.append(
                _item(
                    "Equal Weight Outperformance",
                    f"Equal-weight (RSP) leads cap-weight (SPY) by {spread:.1%} over 20 "
                    "bars - participation is broad, which healthy rallies show.",
                    ["Breadth", "Participation"],
                )
            )
    return items


def upcoming_event_context(now: datetime | None = None) -> list[dict[str, Any]]:
    """Volatility watches for scheduled macro events inside the window."""
    current = now or datetime.now(UTC)
    items: list[dict[str, Any]] = []
    for event in _load_events():
        event_time = datetime.fromisoformat(event["date"]).replace(tzinfo=UTC)
        delta = event_time - current
        if timedelta(0) <= delta <= timedelta(hours=EVENT_WINDOW_HOURS):
            hours = int(delta.total_seconds() // 3600)
            name = "FOMC Volatility Watch" if event["type"] == "fomc" else "CPI Volatility Watch"
            item = _item(
                name,
                f"{event['name']} in ~{hours}h. Event volatility builds before and "
                "resolves after - stops sized from calm bars are wrong inside this window.",
                ["Event", event["type"].upper()],
            )
            item["family"] = "event"
            items.append(item)
    return items
