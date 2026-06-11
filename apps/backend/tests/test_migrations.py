# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""WAL journaling and the numbered migration runner."""

import sqlite3
import tempfile
import unittest
from pathlib import Path

from app.core.config import AiSettings, ProviderSettings, SafetySettings
from app.storage.state_store import StateStore
from app.storage.state_store.db import connect
from app.storage.state_store.migrations import MIGRATIONS, run_migrations


def _initialize(sqlite_path: Path) -> StateStore:
    store = StateStore(sqlite_path)
    store.initialize(ProviderSettings(), SafetySettings(), AiSettings())
    return store


class MigrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.sqlite_path = Path(self._tmp.name) / "state.db"

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_initialize_enables_wal_journaling(self) -> None:
        _initialize(self.sqlite_path)
        with connect(self.sqlite_path) as connection:
            mode = connection.execute("PRAGMA journal_mode").fetchone()[0]
        self.assertEqual(mode, "wal")

    def test_initialize_records_all_migrations(self) -> None:
        _initialize(self.sqlite_path)
        with sqlite3.connect(self.sqlite_path) as connection:
            rows = connection.execute(
                "SELECT version, name FROM schema_migrations ORDER BY version"
            ).fetchall()
        self.assertEqual([row[0] for row in rows], [version for version, _, _ in MIGRATIONS])

    def test_migrations_are_idempotent(self) -> None:
        _initialize(self.sqlite_path)
        with sqlite3.connect(self.sqlite_path) as connection:
            self.assertEqual(run_migrations(connection), [])

    def test_legacy_alerts_table_is_upgraded(self) -> None:
        # Simulate a pre-migration database: alerts without channel/status columns.
        with sqlite3.connect(self.sqlite_path) as connection:
            connection.execute(
                """
                CREATE TABLE alerts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    symbol TEXT NOT NULL,
                    condition TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
                """
            )
            connection.execute(
                "INSERT INTO alerts (symbol, condition, created_at) VALUES ('BTCUSD', 'x', 't')"
            )
            connection.commit()

        store = _initialize(self.sqlite_path)
        alerts = store.list_alerts()
        self.assertEqual(len(alerts), 1)
        self.assertEqual(alerts[0]["channel"], "desktop")
        self.assertEqual(alerts[0]["status"], "armed")


if __name__ == "__main__":
    unittest.main()
