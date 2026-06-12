# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Signal taxonomy placement and the quality/confidence split (SIG-1)."""

import json
import unittest
from pathlib import Path

from app.services.signal_engine.taxonomy import (
    DETECTORS,
    FAMILIES,
    LAYERS,
    SIGNAL_CLASSES,
    derive_quality,
    taxonomy_for,
)

_LESSONS = Path(__file__).resolve().parent.parent / "app" / "content" / "lessons"


class TaxonomyIntegrityTests(unittest.TestCase):
    def test_every_detector_is_well_placed(self) -> None:
        lesson_ids = set()
        for tier in ("novice", "intermediate", "advanced", "expert"):
            with open(_LESSONS / f"{tier}.json", encoding="utf-8") as handle:
                lesson_ids.update(lesson["id"] for lesson in json.load(handle))
        seen = set()
        for detector in DETECTORS:
            self.assertNotIn(detector.setup_type, seen)
            seen.add(detector.setup_type)
            self.assertIn(detector.family, FAMILIES)
            self.assertIn(detector.layer, LAYERS)
            self.assertIn(detector.signal_class, SIGNAL_CLASSES)
            if detector.lesson_id:
                self.assertIn(detector.lesson_id, lesson_ids, detector.setup_type)

    def test_known_setup_maps_and_unknown_gets_safe_defaults(self) -> None:
        known = taxonomy_for("breakout_retest_continuation")
        self.assertEqual(known["family"], "technical")
        self.assertEqual(known["display_name"], "Breakout Retest")
        unknown = taxonomy_for("community_custom_setup")
        self.assertEqual(unknown["signal_class"], "setup")
        self.assertEqual(unknown["display_name"], "Community Custom Setup")


class QualityTests(unittest.TestCase):
    def test_quality_rewards_confluence_geometry_and_freshness(self) -> None:
        strong = derive_quality(
            {"confluence_score": 0.9, "trend_alignment": 1.0, "volume_confirmation": 1.0},
            risk_reward=3.0,
            data_age_seconds=60,
        )
        weak = derive_quality(
            {"confluence_score": 0.3, "trend_alignment": 0.2, "volume_confirmation": 0.0},
            risk_reward=0.8,
            data_age_seconds=8 * 3600,
        )
        self.assertGreater(strong, 90)
        self.assertLess(weak, 45)
        self.assertGreaterEqual(weak, 0)

    def test_quality_is_clamped(self) -> None:
        self.assertLessEqual(
            derive_quality(
                {"confluence_score": 1.0, "trend_alignment": 1.0, "volume_confirmation": 1.0},
                risk_reward=10.0,
                data_age_seconds=0,
            ),
            100,
        )


class NewDetectorTests(unittest.TestCase):
    def test_sig3_setup_types_are_registered_with_directions(self) -> None:
        from app.services.signal_engine.setups import direction_for_setup

        expectations = {
            "failed_breakout_reversal": "short",
            "failed_breakdown_reversal": "long",
            "liquidity_sweep_reclaim_long": "long",
            "liquidity_sweep_reclaim_short": "short",
            "ma_crossover_long": "long",
            "ma_crossover_short": "short",
            "inside_bar_break_long": "long",
            "inside_bar_break_short": "short",
        }
        expectations.update(
            {
                "gap_and_go_long": "long",
                "gap_and_go_short": "short",
                "gap_fill_reversal_short": "short",
                "gap_fill_reversal_long": "long",
                "vwap_reclaim_long": "long",
                "vwap_rejection_short": "short",
                "structure_break_long": "long",
                "structure_break_short": "short",
                "outside_bar_reversal_long": "long",
                "outside_bar_reversal_short": "short",
            }
        )
        expectations.update(
            {
                "squeeze_release_long": "long",
                "squeeze_release_short": "short",
                "narrow_range_break_long": "long",
                "narrow_range_break_short": "short",
            }
        )
        registered = {d.setup_type for d in DETECTORS}
        for setup_type, direction in expectations.items():
            self.assertIn(setup_type, registered)
            self.assertEqual(direction_for_setup(setup_type, "long"), direction, setup_type)


if __name__ == "__main__":
    unittest.main()
