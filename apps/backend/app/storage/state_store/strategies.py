# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Saved strategy persistence."""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

from app.storage.state_store.db import connect


class SavedStrategiesStore:
    def __init__(self, sqlite_path: Path) -> None:
        self.sqlite_path = sqlite_path

    def ensure_schema(self, connection: sqlite3.Connection) -> None:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS saved_strategies (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                symbol_id TEXT NOT NULL,
                setup_type TEXT NOT NULL,
                timeframe TEXT NOT NULL,
                saved_at TEXT NOT NULL
            )
            """
        )

    def list_saved_strategies(self) -> list[dict[str, Any]]:
        with connect(self.sqlite_path) as connection:
            rows = connection.execute(
                """
                SELECT id, name, symbol_id, setup_type, timeframe, saved_at
                FROM saved_strategies
                ORDER BY saved_at DESC, id DESC
                """
            ).fetchall()
        return [self._serialize_saved_strategy_row(row) for row in rows]

    def save_strategy(self, payload: dict[str, Any]) -> dict[str, Any]:
        with connect(self.sqlite_path) as connection:
            connection.execute(
                """
                INSERT INTO saved_strategies (id, name, symbol_id, setup_type, timeframe, saved_at)
                VALUES (:id, :name, :symbolId, :setupType, :timeframe, :savedAt)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    symbol_id = excluded.symbol_id,
                    setup_type = excluded.setup_type,
                    timeframe = excluded.timeframe,
                    saved_at = excluded.saved_at
                """,
                payload,
            )
            connection.commit()
        return payload

    def delete_saved_strategy(self, strategy_id: str) -> bool:
        with connect(self.sqlite_path) as connection:
            cursor = connection.execute(
                "DELETE FROM saved_strategies WHERE id = ?",
                (strategy_id,),
            )
            connection.commit()
        return cursor.rowcount > 0

    def _serialize_saved_strategy_row(self, row: tuple[Any, ...]) -> dict[str, Any]:
        return {
            "id": row[0],
            "name": row[1],
            "symbolId": row[2],
            "setupType": row[3],
            "timeframe": row[4],
            "savedAt": row[5],
        }
