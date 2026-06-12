# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Honest composite flags (SIG-7): evidence-only, never fabricated."""

import unittest

from app.services.signal_engine.composites import derive_composite_flags


def _flags(setup="daily_trend_pullback", win=0.5, sample=0, age=60, tf="1d"):
    pooled = {"win_rate": win, "sample_size": sample}
    return {f["id"]: f for f in derive_composite_flags(setup, pooled, 20, age, tf)}


class CompositeFlagTests(unittest.TestCase):
    def test_thin_sample_emits_no_probability_flags(self) -> None:
        flags = _flags(win=0.9, sample=5)
        self.assertNotIn("follow_through_high", flags)
        self.assertNotIn("follow_through_low", flags)

    def test_strong_pooled_history_flags_high_follow_through(self) -> None:
        flags = _flags(win=0.7, sample=80)
        self.assertIn("follow_through_high", flags)
        self.assertIn("calibrated", flags["follow_through_high"]["message"].lower())

    def test_weak_breakout_history_flags_false_break(self) -> None:
        flags = _flags(setup="breakout_retest_continuation", win=0.35, sample=80)
        self.assertIn("false_break_probability_high", flags)
        self.assertIn("follow_through_low", flags)

    def test_non_break_setup_never_gets_false_break_flag(self) -> None:
        flags = _flags(setup="daily_trend_pullback", win=0.35, sample=80)
        self.assertNotIn("false_break_probability_high", flags)

    def test_stale_data_flags_decay(self) -> None:
        fresh = _flags(age=3600, tf="1d")
        stale = _flags(age=3 * 86400, tf="1d")
        self.assertNotIn("signal_decay_warning", fresh)
        self.assertIn("signal_decay_warning", stale)
        self.assertEqual(stale["signal_decay_warning"]["family"], "composite")


if __name__ == "__main__":
    unittest.main()
