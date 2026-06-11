# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Watchlist persistence."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from app.storage.state_store.defaults import now_iso


class WatchlistStore:
    def __init__(self, sqlite_path: Path) -> None:
        self.sqlite_path = sqlite_path

    def ensure_schema(self, connection: sqlite3.Connection) -> None:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS watchlist_entries (
                symbol TEXT PRIMARY KEY,
                market_type TEXT NOT NULL,
                notes TEXT,
                created_at TEXT NOT NULL
            )
            """
        )

    def list_watchlist(self) -> list[dict[str, str | None]]:
        with sqlite3.connect(self.sqlite_path) as connection:
            rows = connection.execute(
                "SELECT symbol, market_type, notes, created_at FROM watchlist_entries ORDER BY symbol"
            ).fetchall()
        return [
            {
                "symbol": symbol,
                "market_type": market_type,
                "notes": notes,
                "created_at": created_at,
            }
            for symbol, market_type, notes, created_at in rows
        ]

    def add_watchlist_symbol(
        self,
        symbol: str,
        market_type: str,
        notes: str | None = None,
    ) -> dict[str, str | None]:
        payload = {
            "symbol": symbol.upper(),
            "market_type": market_type,
            "notes": notes,
            "created_at": now_iso(),
        }
        with sqlite3.connect(self.sqlite_path) as connection:
            connection.execute(
                """
                INSERT INTO watchlist_entries (symbol, market_type, notes, created_at)
                VALUES (:symbol, :market_type, :notes, :created_at)
                ON CONFLICT(symbol) DO UPDATE SET
                    market_type = excluded.market_type,
                    notes = excluded.notes
                """,
                payload,
            )
            connection.commit()
        return payload

    def delete_watchlist_symbol(self, symbol: str) -> bool:
        with sqlite3.connect(self.sqlite_path) as connection:
            cursor = connection.execute(
                "DELETE FROM watchlist_entries WHERE symbol = ?",
                (symbol.upper(),),
            )
            connection.commit()
        return cursor.rowcount > 0
