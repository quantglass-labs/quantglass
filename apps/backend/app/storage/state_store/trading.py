# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Paper account, positions, and trade intent persistence.

Live trades are recorded in the same intent table with ``trading_mode = 'live'``
so the history surface stays unified.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

from app.storage.state_store.defaults import default_paper_account, now_iso


class PaperTradingStore:
    def __init__(self, sqlite_path: Path) -> None:
        self.sqlite_path = sqlite_path

    def ensure_schema(self, connection: sqlite3.Connection) -> None:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS paper_account_state (
                account_key TEXT PRIMARY KEY,
                balance REAL NOT NULL,
                buying_power REAL NOT NULL,
                realized_pnl REAL NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS paper_positions (
                symbol_id TEXT PRIMARY KEY,
                side TEXT NOT NULL,
                quantity REAL NOT NULL,
                average_price REAL NOT NULL,
                pnl REAL NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS paper_trade_intents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                signal_id TEXT NOT NULL,
                symbol TEXT NOT NULL,
                side TEXT NOT NULL,
                quantity REAL NOT NULL,
                entry_price REAL NOT NULL,
                trading_mode TEXT NOT NULL,
                submitted_at TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                executed_at TEXT,
                executed_price REAL,
                provider TEXT,
                external_order_id TEXT,
                broker_status TEXT
            )
            """
        )
        self._ensure_paper_trade_intent_columns(connection)
        self.ensure_account_row(connection)

    def ensure_account_row(self, connection: sqlite3.Connection) -> None:
        existing = connection.execute(
            "SELECT 1 FROM paper_account_state WHERE account_key = 'default'"
        ).fetchone()
        if existing is None:
            default_account = default_paper_account()
            connection.execute(
                """
                INSERT INTO paper_account_state (account_key, balance, buying_power, realized_pnl, updated_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    "default",
                    default_account["balance"],
                    default_account["buyingPower"],
                    default_account["realizedPnl"],
                    now_iso(),
                ),
            )

    def get_paper_account(self) -> dict[str, Any]:
        with sqlite3.connect(self.sqlite_path) as connection:
            row = connection.execute(
                """
                SELECT balance, buying_power, realized_pnl
                FROM paper_account_state
                WHERE account_key = 'default'
                """
            ).fetchone()
            positions = connection.execute(
                """
                SELECT symbol_id, side, quantity, average_price, pnl
                FROM paper_positions
                ORDER BY symbol_id
                """
            ).fetchall()

        if row is None:
            return default_paper_account()

        return {
            "balance": row[0],
            "buyingPower": row[1],
            "realizedPnl": row[2],
            "openPositions": [
                self._serialize_paper_position_row(position) for position in positions
            ],
        }

    def replace_paper_account(self, account: dict[str, Any]) -> dict[str, Any]:
        with sqlite3.connect(self.sqlite_path) as connection:
            self._write_paper_account(connection, account)
            connection.commit()
        return self.get_paper_account()

    def list_paper_trade_intents(self) -> list[dict[str, Any]]:
        with sqlite3.connect(self.sqlite_path) as connection:
            rows = connection.execute(
                """
                SELECT id, signal_id, symbol, side, quantity, entry_price, trading_mode, submitted_at,
                       status, executed_at, executed_price, provider, external_order_id, broker_status
                FROM paper_trade_intents
                ORDER BY submitted_at DESC, id DESC
                """
            ).fetchall()
        return [self._serialize_paper_trade_row(row) for row in rows]

    def submit_paper_trade(
        self,
        signal_id: str,
        symbol: str,
        side: str,
        quantity: float,
        entry_price: float,
        trading_mode: str,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        submitted_at = now_iso()
        symbol_id = symbol.upper().replace("/", "")

        with sqlite3.connect(self.sqlite_path) as connection:
            self.ensure_account_row(connection)
            connection.execute(
                """
                INSERT INTO paper_trade_intents (
                    signal_id, symbol, side, quantity, entry_price, trading_mode, submitted_at, status, provider, broker_status
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 'alpaca_paper', 'queued')
                """,
                (signal_id, symbol_id, side, quantity, entry_price, trading_mode, submitted_at),
            )
            trade_id = connection.execute("SELECT last_insert_rowid()").fetchone()[0]
            connection.commit()

        account = self.get_paper_account()
        trade = {
            "id": str(trade_id),
            "signalId": signal_id,
            "symbol": symbol_id,
            "side": side,
            "quantity": quantity,
            "entryPrice": entry_price,
            "tradingMode": trading_mode,
            "submittedAt": submitted_at,
            "status": "pending",
            "provider": "alpaca_paper",
            "brokerStatus": "queued",
        }
        return trade, account

    def record_live_trade(
        self,
        signal_id: str,
        symbol: str,
        side: str,
        quantity: float,
        entry_price: float,
        provider: str,
        broker_trade: dict[str, Any],
    ) -> dict[str, Any]:
        submitted_at = str(broker_trade.get("submitted_at") or now_iso())
        executed_at = broker_trade.get("filled_at")
        executed_price = broker_trade.get("filled_avg_price")
        status = "executed" if executed_at else "submitted"
        symbol_id = symbol.upper().replace("/", "")

        with sqlite3.connect(self.sqlite_path) as connection:
            connection.execute(
                """
                INSERT INTO paper_trade_intents (
                    signal_id, symbol, side, quantity, entry_price, trading_mode, submitted_at,
                    status, executed_at, executed_price, provider, external_order_id, broker_status
                )
                VALUES (?, ?, ?, ?, ?, 'live', ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    signal_id,
                    symbol_id,
                    side,
                    quantity,
                    entry_price,
                    submitted_at,
                    status,
                    executed_at,
                    executed_price,
                    provider,
                    broker_trade.get("id"),
                    broker_trade.get("status"),
                ),
            )
            trade_id = connection.execute("SELECT last_insert_rowid()").fetchone()[0]
            connection.commit()

        return {
            "id": str(trade_id),
            "signalId": signal_id,
            "symbol": symbol_id,
            "side": side,
            "quantity": quantity,
            "entryPrice": entry_price,
            "tradingMode": "live",
            "submittedAt": submitted_at,
            "status": status,
            "executedAt": executed_at,
            "executedPrice": executed_price,
            "provider": provider,
            "externalOrderId": broker_trade.get("id"),
            "brokerStatus": broker_trade.get("status"),
        }

    def process_pending_paper_trades(
        self,
        latest_prices: dict[str, float],
    ) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        executed: list[dict[str, Any]] = []
        executed_at = now_iso()

        with sqlite3.connect(self.sqlite_path) as connection:
            self.ensure_account_row(connection)
            rows = connection.execute(
                """
                SELECT id, signal_id, symbol, side, quantity, entry_price, trading_mode, submitted_at,
                       status, executed_at, executed_price, provider, external_order_id, broker_status
                FROM paper_trade_intents
                WHERE status = 'pending'
                ORDER BY submitted_at ASC, id ASC
                """
            ).fetchall()

            for row in rows:
                symbol_id = row[2]
                executed_price = float(latest_prices.get(symbol_id, row[5]))
                self._apply_trade_fill(
                    connection=connection,
                    symbol_id=symbol_id,
                    side=row[3],
                    quantity=float(row[4]),
                    executed_price=executed_price,
                    executed_at=executed_at,
                )
                connection.execute(
                    """
                    UPDATE paper_trade_intents
                    SET status = 'executed', executed_at = ?, executed_price = ?
                    WHERE id = ?
                    """,
                    (executed_at, executed_price, row[0]),
                )
                executed.append(
                    {
                        "id": str(row[0]),
                        "signalId": row[1],
                        "symbol": symbol_id,
                        "side": row[3],
                        "quantity": float(row[4]),
                        "entryPrice": float(row[5]),
                        "executedPrice": executed_price,
                        "tradingMode": row[6],
                        "submittedAt": row[7],
                        "status": "executed",
                        "executedAt": executed_at,
                        "provider": row[11],
                        "externalOrderId": row[12],
                        "brokerStatus": "filled",
                    }
                )

            self._recalculate_paper_account_totals(connection)
            connection.commit()

        return executed, self.get_paper_account()

    def refresh_paper_position_marks(self, latest_prices: dict[str, float]) -> dict[str, Any]:
        updated_at = now_iso()
        with sqlite3.connect(self.sqlite_path) as connection:
            rows = connection.execute(
                """
                SELECT symbol_id, side, quantity, average_price
                FROM paper_positions
                ORDER BY symbol_id
                """
            ).fetchall()
            for symbol_id, side, quantity, average_price in rows:
                latest_price = latest_prices.get(symbol_id)
                if latest_price is None:
                    continue
                pnl = self._calculate_unrealized_pnl(
                    side=side,
                    quantity=float(quantity),
                    average_price=float(average_price),
                    latest_price=float(latest_price),
                )
                connection.execute(
                    """
                    UPDATE paper_positions
                    SET pnl = ?, updated_at = ?
                    WHERE symbol_id = ?
                    """,
                    (pnl, updated_at, symbol_id),
                )
            self._recalculate_paper_account_totals(connection)
            connection.commit()
        return self.get_paper_account()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _write_paper_account(
        self,
        connection: sqlite3.Connection,
        account: dict[str, Any],
    ) -> None:
        updated_at = now_iso()
        connection.execute(
            """
            INSERT INTO paper_account_state (account_key, balance, buying_power, realized_pnl, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(account_key) DO UPDATE SET
                balance = excluded.balance,
                buying_power = excluded.buying_power,
                realized_pnl = excluded.realized_pnl,
                updated_at = excluded.updated_at
            """,
            (
                "default",
                account["balance"],
                account["buyingPower"],
                account["realizedPnl"],
                updated_at,
            ),
        )

    def _ensure_paper_trade_intent_columns(self, connection: sqlite3.Connection) -> None:
        columns = {
            row[1]
            for row in connection.execute("PRAGMA table_info(paper_trade_intents)").fetchall()
        }
        if "status" not in columns:
            connection.execute(
                "ALTER TABLE paper_trade_intents ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'"
            )
        if "executed_at" not in columns:
            connection.execute("ALTER TABLE paper_trade_intents ADD COLUMN executed_at TEXT")
        if "executed_price" not in columns:
            connection.execute("ALTER TABLE paper_trade_intents ADD COLUMN executed_price REAL")
        if "provider" not in columns:
            connection.execute("ALTER TABLE paper_trade_intents ADD COLUMN provider TEXT")
        if "external_order_id" not in columns:
            connection.execute("ALTER TABLE paper_trade_intents ADD COLUMN external_order_id TEXT")
        if "broker_status" not in columns:
            connection.execute("ALTER TABLE paper_trade_intents ADD COLUMN broker_status TEXT")

    def _apply_trade_fill(
        self,
        connection: sqlite3.Connection,
        symbol_id: str,
        side: str,
        quantity: float,
        executed_price: float,
        executed_at: str,
    ) -> None:
        account_row = connection.execute(
            """
            SELECT balance, buying_power, realized_pnl
            FROM paper_account_state
            WHERE account_key = 'default'
            """
        ).fetchone()
        if account_row is None:
            self.ensure_account_row(connection)
            account_row = connection.execute(
                """
                SELECT balance, buying_power, realized_pnl
                FROM paper_account_state
                WHERE account_key = 'default'
                """
            ).fetchone()

        buying_power = float(account_row[1])
        realized_pnl = float(account_row[2])
        existing_position = connection.execute(
            """
            SELECT symbol_id, side, quantity, average_price, pnl
            FROM paper_positions
            WHERE symbol_id = ?
            """,
            (symbol_id,),
        ).fetchone()

        if existing_position is None:
            buying_power = max(buying_power - (quantity * executed_price), 0.0)
            connection.execute(
                """
                INSERT INTO paper_positions (symbol_id, side, quantity, average_price, pnl, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (symbol_id, side, quantity, executed_price, 0.0, executed_at),
            )
        elif existing_position[1] == side:
            existing_quantity = float(existing_position[2])
            total_quantity = existing_quantity + quantity
            average_price = (
                (existing_quantity * float(existing_position[3])) + (quantity * executed_price)
            ) / total_quantity
            buying_power = max(buying_power - (quantity * executed_price), 0.0)
            connection.execute(
                """
                UPDATE paper_positions
                SET quantity = ?, average_price = ?, pnl = ?, updated_at = ?
                WHERE symbol_id = ?
                """,
                (total_quantity, average_price, 0.0, executed_at, symbol_id),
            )
        else:
            existing_quantity = float(existing_position[2])
            average_price = float(existing_position[3])
            close_quantity = min(existing_quantity, quantity)
            realized_pnl += self._calculate_realized_pnl(
                side=existing_position[1],
                quantity=close_quantity,
                average_price=average_price,
                executed_price=executed_price,
            )
            buying_power += close_quantity * executed_price

            remaining_existing = existing_quantity - close_quantity
            remaining_new = quantity - close_quantity
            if remaining_existing > 0:
                connection.execute(
                    """
                    UPDATE paper_positions
                    SET quantity = ?, pnl = ?, updated_at = ?
                    WHERE symbol_id = ?
                    """,
                    (remaining_existing, 0.0, executed_at, symbol_id),
                )
            else:
                connection.execute(
                    "DELETE FROM paper_positions WHERE symbol_id = ?",
                    (symbol_id,),
                )

            if remaining_new > 0:
                buying_power = max(buying_power - (remaining_new * executed_price), 0.0)
                connection.execute(
                    """
                    INSERT INTO paper_positions (symbol_id, side, quantity, average_price, pnl, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(symbol_id) DO UPDATE SET
                        side = excluded.side,
                        quantity = excluded.quantity,
                        average_price = excluded.average_price,
                        pnl = excluded.pnl,
                        updated_at = excluded.updated_at
                    """,
                    (symbol_id, side, remaining_new, executed_price, 0.0, executed_at),
                )

        connection.execute(
            """
            UPDATE paper_account_state
            SET buying_power = ?, realized_pnl = ?, updated_at = ?
            WHERE account_key = 'default'
            """,
            (buying_power, realized_pnl, executed_at),
        )

    def _recalculate_paper_account_totals(self, connection: sqlite3.Connection) -> None:
        account_row = connection.execute(
            """
            SELECT buying_power, realized_pnl
            FROM paper_account_state
            WHERE account_key = 'default'
            """
        ).fetchone()
        if account_row is None:
            return
        positions = connection.execute(
            """
            SELECT quantity, average_price, pnl
            FROM paper_positions
            """
        ).fetchall()
        allocated_notional = sum(
            float(quantity) * float(average_price) for quantity, average_price, _ in positions
        )
        unrealized_pnl = sum(float(pnl) for _, _, pnl in positions)
        balance = (
            float(account_row[0]) + allocated_notional + float(account_row[1]) + unrealized_pnl
        )
        connection.execute(
            """
            UPDATE paper_account_state
            SET balance = ?, updated_at = ?
            WHERE account_key = 'default'
            """,
            (max(balance, 0.0), now_iso()),
        )

    def _calculate_realized_pnl(
        self,
        side: str,
        quantity: float,
        average_price: float,
        executed_price: float,
    ) -> float:
        if side == "long":
            return (executed_price - average_price) * quantity
        return (average_price - executed_price) * quantity

    def _calculate_unrealized_pnl(
        self,
        side: str,
        quantity: float,
        average_price: float,
        latest_price: float,
    ) -> float:
        if side == "long":
            return (latest_price - average_price) * quantity
        return (average_price - latest_price) * quantity

    def _serialize_paper_position_row(self, row: tuple[Any, ...]) -> dict[str, Any]:
        return {
            "symbolId": row[0],
            "side": row[1],
            "quantity": row[2],
            "averagePrice": row[3],
            "pnl": row[4],
        }

    def _serialize_paper_trade_row(self, row: tuple[Any, ...]) -> dict[str, Any]:
        return {
            "id": str(row[0]),
            "signalId": row[1],
            "symbol": row[2],
            "side": row[3],
            "quantity": row[4],
            "entryPrice": row[5],
            "tradingMode": row[6],
            "submittedAt": row[7],
            "status": row[8],
            "executedAt": row[9],
            "executedPrice": row[10],
            "provider": row[11],
            "externalOrderId": row[12],
            "brokerStatus": row[13],
        }
