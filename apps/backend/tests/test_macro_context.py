# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Macro/breadth/event context from ETF proxies and the calendar (SIG-8)."""

import unittest
from datetime import UTC, datetime

from app.services.signal_engine.macro_context import (
    derive_macro_context,
    upcoming_event_context,
)


class MacroProxyTests(unittest.TestCase):
    def test_untracked_proxies_contribute_nothing(self) -> None:
        self.assertEqual(derive_macro_context({"BTCUSD": 0.5}), [])

    def test_dollar_rates_gold_and_breadth_reads(self) -> None:
        items = derive_macro_context(
            {"UUP": 0.04, "TLT": -0.05, "GLD": 0.06, "SPY": 0.03, "RSP": 0.0}
        )
        names = {item["display_name"] for item in items}
        self.assertEqual(
            names,
            {
                "Dollar Strength Headwind",
                "Yield Spike Pressure",
                "Gold Safety Flow",
                "Cap Weight Concentration Warning",
            },
        )
        self.assertTrue(all(item["signal_class"] == "context" for item in items))

    def test_small_moves_stay_silent(self) -> None:
        items = derive_macro_context({"UUP": 0.01, "TLT": 0.01, "SPY": 0.01, "RSP": 0.005})
        self.assertEqual(items, [])


class EventCalendarTests(unittest.TestCase):
    def test_event_inside_window_emits_watch(self) -> None:
        # 2026-06-17 FOMC: a clock 24h before must see the watch.
        now = datetime(2026, 6, 16, 0, 0, tzinfo=UTC)
        names = {item["display_name"] for item in upcoming_event_context(now)}
        self.assertIn("FOMC Volatility Watch", names)

    def test_quiet_week_emits_nothing(self) -> None:
        now = datetime(2026, 6, 20, 0, 0, tzinfo=UTC)
        self.assertEqual(upcoming_event_context(now), [])


if __name__ == "__main__":
    unittest.main()
