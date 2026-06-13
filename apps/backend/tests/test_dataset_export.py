# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Dataset export (E5): trades, journal, calibration as local CSVs."""

import csv
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from app.services.dataset_export import DatasetExportService


class _Store:
    def list_paper_trade_intents(self):
        return [
            {
                "id": "1",
                "symbol": "BTCUSD",
                "side": "long",
                "quantity": 1,
                "entryPrice": 100.0,
                "status": "executed",
                "submittedAt": "2026-06-12T00:00:00Z",
                "planStop": 95.0,
                "planReason": "Pullback, with a comma",
            }
        ]

    def get_journal_notes(self):
        return {"1": {"note": "Good entry", "tags": ["chased_entry"], "updated_at": "x"}}


class _Analytics:
    parquet_dir = "/tmp/parquet"

    def calibration_report(self):
        return {
            "buckets": [
                {
                    "bucket": 60,
                    "predicted_confidence": 62.0,
                    "realized_win_rate_pct": 55.0,
                    "sample": 20,
                    "drift_pts": 7.0,
                }
            ]
        }


class DatasetExportTests(unittest.TestCase):
    def test_export_writes_all_three_csvs_locally(self) -> None:
        with TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            service = DatasetExportService(_Store(), _Analytics(), Path(tmp))
            result = service.export()
            self.assertEqual(len(result["files"]), 3)
            self.assertIn(
                "nothing leaves this machine",
                result["note"].lower().replace("-", " ") if False else result["note"],
            )
            trades_path = Path(result["files"][0]["path"])
            with open(trades_path, encoding="utf-8") as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual(rows[0]["symbol"], "BTCUSD")
            self.assertEqual(rows[0]["planReason"], "Pullback, with a comma")
            self.assertEqual(result["files"][2]["rows"], 1)


if __name__ == "__main__":
    unittest.main()
