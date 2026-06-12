# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Dataset export (E5): your trading history is a dataset.

Candles already archive continuously as partitioned Parquet (the analytics
store's durable copy). This service exports the *behavioral* record - every
paper trade with its plan fields, every journal annotation, and the
confidence-calibration ledger - as CSV files a notebook or spreadsheet can
open directly. Local files only; nothing leaves the machine.
"""

from __future__ import annotations

import csv
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

TRADE_FIELDS = [
    "id",
    "signalId",
    "symbol",
    "side",
    "quantity",
    "entryPrice",
    "tradingMode",
    "submittedAt",
    "status",
    "executedAt",
    "executedPrice",
    "planStop",
    "planTarget",
    "planRiskPercent",
    "planReason",
    "planEmotion",
]


class DatasetExportService:
    def __init__(self, state_store: Any, analytics_store: Any, export_dir: Path) -> None:
        self._state_store = state_store
        self._analytics_store = analytics_store
        self._export_dir = export_dir

    def export(self) -> dict[str, Any]:
        stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
        target = self._export_dir / f"dataset-{stamp}"
        target.mkdir(parents=True, exist_ok=True)
        files: list[dict[str, Any]] = []

        trades = self._state_store.list_paper_trade_intents()
        files.append(self._write_csv(target / "trades.csv", TRADE_FIELDS, trades))

        notes = getattr(self._state_store, "get_journal_notes", dict)()
        journal_rows = [
            {"intent_id": intent_id, **entry} for intent_id, entry in sorted(notes.items())
        ]
        files.append(
            self._write_csv(
                target / "journal.csv", ["intent_id", "note", "tags", "updated_at"], journal_rows
            )
        )

        report = getattr(self._analytics_store, "calibration_report", lambda: {"buckets": []})()
        files.append(
            self._write_csv(
                target / "calibration_buckets.csv",
                ["bucket", "predicted_confidence", "realized_win_rate_pct", "sample", "drift_pts"],
                report.get("buckets", []),
            )
        )

        return {
            "directory": str(target),
            "files": files,
            "candles_parquet_dir": str(getattr(self._analytics_store, "parquet_dir", "")),
            "note": (
                "Local export only - nothing leaves this machine. Candles archive "
                "continuously as Parquet in the directory above."
            ),
        }

    @staticmethod
    def _write_csv(path: Path, fields: list[str], rows: list[dict[str, Any]]) -> dict[str, Any]:
        with open(path, "w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
            writer.writeheader()
            for row in rows:
                writer.writerow({field: row.get(field, "") for field in fields})
        return {"path": str(path), "rows": len(rows)}
