# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Personal Trading Constitution persistence (MSN-5)."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

from app.storage.state_store.db import connect
from app.storage.state_store.defaults import now_iso


class ConstitutionStore:
    def __init__(self, sqlite_path: Path) -> None:
        self.sqlite_path = sqlite_path

    def ensure_schema(self, connection: sqlite3.Connection) -> None:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS constitution (
                key TEXT PRIMARY KEY CHECK (key = 'default'),
                rules TEXT NOT NULL,
                adopted_at TEXT NOT NULL
            )
            """
        )

    def get_constitution(self) -> dict[str, Any] | None:
        with connect(self.sqlite_path) as connection:
            row = connection.execute(
                "SELECT rules, adopted_at FROM constitution WHERE key = 'default'"
            ).fetchone()
        if row is None:
            return None
        return {"rules": json.loads(row[0]), "adopted_at": row[1]}

    def save_constitution(self, rules: dict[str, Any]) -> dict[str, Any]:
        adopted_at = now_iso()
        with connect(self.sqlite_path) as connection:
            connection.execute(
                """
                INSERT INTO constitution (key, rules, adopted_at)
                VALUES ('default', ?, ?)
                ON CONFLICT(key) DO UPDATE SET
                    rules = excluded.rules,
                    adopted_at = excluded.adopted_at
                """,
                (json.dumps(rules), adopted_at),
            )
            connection.commit()
        return {"rules": rules, "adopted_at": adopted_at}
