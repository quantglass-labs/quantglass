# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Confidence calibration tracking (E3): record, resolve, report."""

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from app.storage.analytics_store import AnalyticsStore


def _row(signal_id="s1", confidence=60, direction="long"):
    return {
        "signal_id": signal_id,
        "symbol": "BTCUSD",
        "timeframe": "1d",
        "setup_type": "daily_trend_pullback",
        "direction": direction,
        "confidence": confidence,
        "entry": 100.0,
        "stop_loss": 95.0,
        "target": 110.0,
        "generated_at": "2026-06-01T00:00:00Z",
    }


class CalibrationStoreTests(unittest.TestCase):
    def setUp(self):
        self._tmp = TemporaryDirectory()
        root = Path(self._tmp.name)
        self.store = AnalyticsStore(root / "a.duckdb", root / "parquet")
        self.store.initialize()

    def tearDown(self):
        self._tmp.cleanup()

    def test_record_is_idempotent_and_resolution_buckets_report(self) -> None:
        self.store.record_signal_calibration(_row("s1", confidence=62))
        self.store.record_signal_calibration(_row("s1", confidence=62))  # duplicate ignored
        self.store.record_signal_calibration(_row("s2", confidence=64))
        self.store.record_signal_calibration(_row("s3", confidence=41))
        self.assertEqual(len(self.store.list_unresolved_calibrations()), 3)

        self.store.resolve_calibration("s1", "target", 2.0)
        self.store.resolve_calibration("s2", "stopped", -1.0)
        self.store.resolve_calibration("s3", "expired", None)

        report = self.store.calibration_report()
        self.assertEqual(report["resolved_count"], 2)  # expired excluded from buckets
        self.assertEqual(report["expired_count"], 1)
        self.assertEqual(report["pending_count"], 0)
        bucket = report["buckets"][0]
        self.assertEqual(bucket["bucket"], 60)
        self.assertEqual(bucket["sample"], 2)
        self.assertEqual(bucket["realized_win_rate_pct"], 50.0)
        # predicted ~63 vs realized 50 -> drift ~13
        self.assertAlmostEqual(bucket["drift_pts"], 13.0, delta=0.5)
        self.assertIsNotNone(report["average_drift_pts"])

    def test_empty_report_is_honest(self) -> None:
        report = self.store.calibration_report()
        self.assertEqual(report["buckets"], [])
        self.assertIsNone(report["average_drift_pts"])


if __name__ == "__main__":
    unittest.main()
