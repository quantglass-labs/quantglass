# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Alert definitions and fire history."""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

from app.storage.state_store.defaults import now_iso


class AlertsStore:
    def __init__(self, sqlite_path: Path) -> None:
        self.sqlite_path = sqlite_path

    def ensure_schema(self, connection: sqlite3.Connection) -> None:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL,
                condition TEXT NOT NULL,
                channel TEXT NOT NULL DEFAULT 'desktop',
                status TEXT NOT NULL DEFAULT 'armed',
                last_fired TEXT,
                created_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS alert_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL,
                message TEXT NOT NULL,
                channel TEXT NOT NULL,
                fired_at TEXT NOT NULL
            )
            """
        )
        self._ensure_alerts_columns(connection)

    def list_alerts(self) -> list[dict[str, Any]]:
        with sqlite3.connect(self.sqlite_path) as connection:
            rows = connection.execute(
                """
                SELECT id, symbol, condition, channel, status, last_fired
                FROM alerts
                ORDER BY created_at DESC, id DESC
                """
            ).fetchall()
        return [self._serialize_alert_row(row) for row in rows]

    def create_alert(
        self,
        symbol: str,
        condition: str,
        channel: str,
        status: str = "armed",
    ) -> dict[str, Any]:
        created_at = now_iso()
        with sqlite3.connect(self.sqlite_path) as connection:
            cursor = connection.execute(
                """
                INSERT INTO alerts (symbol, condition, channel, status, last_fired, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (symbol.upper(), condition, channel, status, None, created_at),
            )
            connection.commit()
            alert_id = cursor.lastrowid
        return self.get_alert(str(alert_id))

    def get_alert(self, alert_id: str) -> dict[str, Any]:
        with sqlite3.connect(self.sqlite_path) as connection:
            row = connection.execute(
                """
                SELECT id, symbol, condition, channel, status, last_fired
                FROM alerts
                WHERE id = ?
                """,
                (alert_id,),
            ).fetchone()
        if row is None:
            raise KeyError(alert_id)
        return self._serialize_alert_row(row)

    def update_alert(
        self,
        alert_id: str,
        symbol: str,
        condition: str,
        channel: str,
        status: str,
    ) -> dict[str, Any]:
        with sqlite3.connect(self.sqlite_path) as connection:
            cursor = connection.execute(
                """
                UPDATE alerts
                SET symbol = ?, condition = ?, channel = ?, status = ?
                WHERE id = ?
                """,
                (symbol.upper(), condition, channel, status, alert_id),
            )
            connection.commit()
        if cursor.rowcount == 0:
            raise KeyError(alert_id)
        return self.get_alert(alert_id)

    def list_alert_history(self) -> list[dict[str, Any]]:
        with sqlite3.connect(self.sqlite_path) as connection:
            rows = connection.execute(
                """
                SELECT id, symbol, message, channel, fired_at
                FROM alert_history
                ORDER BY fired_at DESC, id DESC
                """
            ).fetchall()
        return [
            {
                "id": str(row[0]),
                "symbolId": row[1],
                "message": row[2],
                "channel": row[3],
                "firedAt": row[4],
            }
            for row in rows
        ]

    def record_alert_fire(
        self,
        alert_id: str,
        message: str,
        fired_at: str | None = None,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        observed_at = fired_at or now_iso()
        with sqlite3.connect(self.sqlite_path) as connection:
            cursor = connection.execute(
                """
                UPDATE alerts
                SET status = 'fired', last_fired = ?
                WHERE id = ?
                """,
                (observed_at, alert_id),
            )
            if cursor.rowcount == 0:
                raise KeyError(alert_id)
            symbol_row = connection.execute(
                "SELECT symbol, channel FROM alerts WHERE id = ?",
                (alert_id,),
            ).fetchone()
            history_cursor = connection.execute(
                """
                INSERT INTO alert_history (symbol, message, channel, fired_at)
                VALUES (?, ?, ?, ?)
                """,
                (symbol_row[0], message, symbol_row[1], observed_at),
            )
            connection.commit()

        history_item = {
            "id": str(history_cursor.lastrowid),
            "symbolId": symbol_row[0],
            "message": message,
            "channel": symbol_row[1],
            "firedAt": observed_at,
        }
        return self.get_alert(alert_id), history_item

    def _ensure_alerts_columns(self, connection: sqlite3.Connection) -> None:
        columns = {row[1] for row in connection.execute("PRAGMA table_info(alerts)").fetchall()}
        if "channel" not in columns:
            connection.execute(
                "ALTER TABLE alerts ADD COLUMN channel TEXT NOT NULL DEFAULT 'desktop'"
            )
        if "status" not in columns:
            connection.execute("ALTER TABLE alerts ADD COLUMN status TEXT NOT NULL DEFAULT 'armed'")
        if "last_fired" not in columns:
            connection.execute("ALTER TABLE alerts ADD COLUMN last_fired TEXT")

    def _serialize_alert_row(self, row: tuple[Any, ...]) -> dict[str, Any]:
        return {
            "id": str(row[0]),
            "symbolId": row[1],
            "condition": row[2],
            "channel": row[3],
            "status": row[4],
            "lastFired": row[5],
        }
