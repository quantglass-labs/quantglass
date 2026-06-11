# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Journal annotations on executed paper trades (MSN-4)."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

from app.storage.state_store.db import connect
from app.storage.state_store.defaults import now_iso

# Fixed vocabulary so detections stay declarative and community-pack safe.
MISTAKE_TAGS = (
    "chased_entry",
    "moved_stop",
    "revenge_trade",
    "oversized",
    "no_plan",
    "fomo_entry",
    "exited_early",
    "held_loser",
    "overtraded",
)


class JournalStore:
    def __init__(self, sqlite_path: Path) -> None:
        self.sqlite_path = sqlite_path

    def ensure_schema(self, connection: sqlite3.Connection) -> None:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS journal_notes (
                intent_id TEXT PRIMARY KEY,
                note TEXT NOT NULL DEFAULT '',
                tags TEXT NOT NULL DEFAULT '[]',
                updated_at TEXT NOT NULL
            )
            """
        )

    def get_journal_notes(self) -> dict[str, Any]:
        with connect(self.sqlite_path) as connection:
            rows = connection.execute(
                "SELECT intent_id, note, tags, updated_at FROM journal_notes"
            ).fetchall()
        return {
            row[0]: {"note": row[1], "tags": json.loads(row[2]), "updated_at": row[3]}
            for row in rows
        }

    def upsert_journal_note(self, intent_id: str, note: str, tags: list[str]) -> dict[str, Any]:
        clean_tags = [tag for tag in tags if tag in MISTAKE_TAGS]
        with connect(self.sqlite_path) as connection:
            connection.execute(
                """
                INSERT INTO journal_notes (intent_id, note, tags, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(intent_id) DO UPDATE SET
                    note = excluded.note,
                    tags = excluded.tags,
                    updated_at = excluded.updated_at
                """,
                (intent_id, note, json.dumps(clean_tags), now_iso()),
            )
            connection.commit()
        return {"intent_id": intent_id, "note": note, "tags": clean_tags}
