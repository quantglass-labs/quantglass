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

from app.storage.state_store.db import connect
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
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS paper_trade_closures (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol_id TEXT NOT NULL,
                side TEXT NOT NULL,
                quantity REAL NOT NULL,
                entry_price REAL NOT NULL,
                exit_price REAL NOT NULL,
                exit_kind TEXT NOT NULL,
                pnl REAL NOT NULL,
                r_multiple REAL,
                closed_at TEXT NOT NULL
            )
            """
        )
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
        with connect(self.sqlite_path) as connection:
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
        with connect(self.sqlite_path) as connection:
            self._write_paper_account(connection, account)
            connection.commit()
        return self.get_paper_account()

    def list_paper_trade_intents(self) -> list[dict[str, Any]]:
        with connect(self.sqlite_path) as connection:
            rows = connection.execute(
                """
                SELECT id, signal_id, symbol, side, quantity, entry_price, trading_mode, submitted_at,
                       status, executed_at, executed_price, provider, external_order_id, broker_status,
                       plan_stop, plan_target, plan_risk_percent, plan_reason, plan_emotion
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
        plan: dict[str, Any] | None = None,
        order_type: str = "market",
        limit_price: float | None = None,
        tif: str = "gtc",
        expires_at: str | None = None,
        trail_percent: float | None = None,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        submitted_at = now_iso()
        symbol_id = symbol.upper().replace("/", "")

        with connect(self.sqlite_path) as connection:
            self.ensure_account_row(connection)
            plan = plan or {}

            # Account-aware guards: the venue rejects orders the account
            # cannot carry instead of silently clamping buying power to zero.
            account_row = connection.execute(
                "SELECT buying_power FROM paper_account_state WHERE account_key = 'default'"
            ).fetchone()
            buying_power = float(account_row[0]) if account_row else 0.0
            reference = float(limit_price) if limit_price is not None else float(entry_price)
            notional = float(quantity) * reference
            # Shorts reserve the same notional as margin - the simple, honest
            # paper rule, stated in the ticket.
            if notional > buying_power:
                affordable = buying_power / reference if reference > 0 else 0.0
                raise ValueError(
                    f"Insufficient buying power: this order needs "
                    f"{notional:,.2f} but {buying_power:,.2f} is available. "
                    f"Max size at this price: {affordable:.4f}."
                )
            existing = connection.execute(
                "SELECT side, quantity FROM paper_positions WHERE symbol_id = ?",
                (symbol_id,),
            ).fetchone()
            if existing is not None and str(existing[0]) != side:
                raise ValueError(
                    f"You already hold a {existing[0]} position of {float(existing[1])} "
                    f"{symbol_id}. Close it first - the paper venue does not net "
                    "opposing positions into one."
                )
            connection.execute(
                """
                INSERT INTO paper_trade_intents (
                    signal_id, symbol, side, quantity, entry_price, trading_mode, submitted_at,
                    status, provider, broker_status,
                    plan_stop, plan_target, plan_risk_percent, plan_reason, plan_emotion,
                    order_type, limit_price, tif, expires_at, trail_percent
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 'alpaca_paper', 'queued', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    signal_id,
                    symbol_id,
                    side,
                    quantity,
                    entry_price,
                    trading_mode,
                    submitted_at,
                    plan.get("stop"),
                    plan.get("target"),
                    plan.get("riskPercent"),
                    plan.get("reason"),
                    plan.get("emotion"),
                    order_type if order_type in {"market", "limit", "stop"} else "market",
                    limit_price,
                    tif if tif in {"day", "gtc", "gtd"} else "gtc",
                    expires_at,
                    trail_percent,
                ),
            )
            trade_id = connection.execute("SELECT last_insert_rowid()").fetchone()[0]
            connection.commit()

        account = self.get_paper_account()
        trade = {
            "id": str(trade_id),
            "planStop": plan.get("stop"),
            "planTarget": plan.get("target"),
            "planRiskPercent": plan.get("riskPercent"),
            "planReason": plan.get("reason"),
            "planEmotion": plan.get("emotion"),
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

        with connect(self.sqlite_path) as connection:
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

        with connect(self.sqlite_path) as connection:
            self.ensure_account_row(connection)
            rows = connection.execute(
                """
                SELECT id, signal_id, symbol, side, quantity, entry_price, trading_mode, submitted_at,
                       status, executed_at, executed_price, provider, external_order_id, broker_status,
                       order_type, limit_price, tif, expires_at
                FROM paper_trade_intents
                WHERE status = 'pending'
                ORDER BY submitted_at ASC, id ASC
                """
            ).fetchall()

            for row in rows:
                symbol_id = row[2]
                side = str(row[3])
                latest = float(latest_prices.get(symbol_id, row[5]))
                order_type = str(row[14] or "market")
                trigger = float(row[15]) if row[15] is not None else None
                tif = str(row[16] or "gtc")
                expires_at = row[17]
                # Time-in-force: day orders die after their submission day (UTC);
                # GTD orders die past their expiry. Expired orders never fill.
                submitted_day = str(row[7] or "")[:10]
                today = executed_at[:10]
                expired = (tif == "day" and submitted_day < today) or (
                    tif == "gtd" and expires_at is not None and str(expires_at) <= executed_at
                )
                if expired:
                    connection.execute(
                        "UPDATE paper_trade_intents SET status = 'expired' WHERE id = ?",
                        (row[0],),
                    )
                    continue
                # Order semantics on closed-candle prices (the venue we have):
                #   market -> fill at the latest close
                #   limit  -> long fills when price <= limit; short when >=
                #   stop   -> long fills when price >= trigger; short when <=
                if order_type == "limit" and trigger is not None:
                    if side == "long" and latest > trigger:
                        continue
                    if side == "short" and latest < trigger:
                        continue
                    executed_price = (
                        min(latest, trigger) if side == "long" else max(latest, trigger)
                    )
                elif order_type == "stop" and trigger is not None:
                    if side == "long" and latest < trigger:
                        continue
                    if side == "short" and latest > trigger:
                        continue
                    executed_price = latest
                else:
                    executed_price = latest
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

    def _record_closure(
        self,
        connection: sqlite3.Connection,
        symbol_id: str,
        side: str,
        quantity: float,
        entry_price: float,
        exit_price: float,
        exit_kind: str,
        closed_at: str,
    ) -> dict[str, Any]:
        pnl = (
            (exit_price - entry_price) * quantity
            if side == "long"
            else (entry_price - exit_price) * quantity
        )
        # R relative to the originating plan's stop, when one exists.
        stop_row = connection.execute(
            """
            SELECT plan_stop FROM paper_trade_intents
            WHERE symbol = ? AND side = ? AND status = 'executed' AND plan_stop IS NOT NULL
            ORDER BY executed_at DESC, id DESC LIMIT 1
            """,
            (symbol_id, side),
        ).fetchone()
        r_multiple = None
        if stop_row is not None and stop_row[0] is not None:
            risk = abs(entry_price - float(stop_row[0]))
            if risk > 0:
                move = exit_price - entry_price if side == "long" else entry_price - exit_price
                r_multiple = round(move / risk, 3)
        connection.execute(
            """
            INSERT INTO paper_trade_closures
                (symbol_id, side, quantity, entry_price, exit_price, exit_kind, pnl,
                 r_multiple, closed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                symbol_id,
                side,
                quantity,
                entry_price,
                exit_price,
                exit_kind,
                round(pnl, 4),
                r_multiple,
                closed_at,
            ),
        )
        return {"pnl": round(pnl, 4), "r_multiple": r_multiple}

    def list_paper_closures(self, limit: int = 200) -> list[dict[str, Any]]:
        with connect(self.sqlite_path) as connection:
            rows = connection.execute(
                """
                SELECT symbol_id, side, quantity, entry_price, exit_price, exit_kind,
                       pnl, r_multiple, closed_at
                FROM paper_trade_closures ORDER BY closed_at DESC, id DESC LIMIT ?
                """,
                (limit,),
            ).fetchall()
        keys = [
            "symbolId",
            "side",
            "quantity",
            "entryPrice",
            "exitPrice",
            "exitKind",
            "pnl",
            "rMultiple",
            "closedAt",
        ]
        return [dict(zip(keys, row)) for row in rows]

    def cancel_paper_intent(self, intent_id: str) -> bool:
        with connect(self.sqlite_path) as connection:
            cursor = connection.execute(
                "UPDATE paper_trade_intents SET status = 'cancelled' "
                "WHERE id = ? AND status = 'pending'",
                (intent_id,),
            )
            connection.commit()
            return cursor.rowcount > 0

    def close_paper_position(self, symbol_id: str, latest_price: float) -> dict[str, Any] | None:
        """Manual market close of the full position at the latest closed price."""
        closed_at = now_iso()
        with connect(self.sqlite_path) as connection:
            row = connection.execute(
                "SELECT side, quantity, average_price FROM paper_positions WHERE symbol_id = ?",
                (symbol_id,),
            ).fetchone()
            if row is None:
                return None
            side, quantity, average_price = str(row[0]), float(row[1]), float(row[2])
            self._apply_trade_fill(
                connection=connection,
                symbol_id=symbol_id,
                side="short" if side == "long" else "long",
                quantity=quantity,
                executed_price=latest_price,
                executed_at=closed_at,
            )
            ledger = self._record_closure(
                connection,
                symbol_id=symbol_id,
                side=side,
                quantity=quantity,
                entry_price=average_price,
                exit_price=latest_price,
                exit_kind="manual",
                closed_at=closed_at,
            )
            connection.commit()
        return {
            "symbolId": symbol_id,
            "side": side,
            "quantity": quantity,
            "entryPrice": average_price,
            "exitPrice": latest_price,
            "exitKind": "manual",
            "closedAt": closed_at,
            **ledger,
        }

    def enforce_paper_brackets(self, latest_prices: dict[str, float]) -> list[dict[str, Any]]:
        """OCO semantics for the plan (E-bracket): when the latest closed price
        touches a position's planned stop or target, close it at that level.
        Conservative tie-break: the stop wins if both are beyond price."""
        closures: list[dict[str, Any]] = []
        closed_at = now_iso()
        with connect(self.sqlite_path) as connection:
            self.ensure_account_row(connection)
            positions = connection.execute(
                "SELECT symbol_id, side, quantity, average_price, best_price FROM paper_positions"
            ).fetchall()
            for symbol_id, side, quantity, average_price, best_price in positions:
                price = latest_prices.get(symbol_id)
                if price is None:
                    continue
                intent = connection.execute(
                    """
                    SELECT plan_stop, plan_target, trail_percent FROM paper_trade_intents
                    WHERE symbol = ? AND side = ? AND status = 'executed'
                    ORDER BY executed_at DESC, id DESC LIMIT 1
                    """,
                    (symbol_id, side),
                ).fetchone()
                if intent is None:
                    continue
                stop, target, trail_percent = intent
                # Trailing stop: ratchet from the best closed price since entry.
                # The trail only tightens - it never moves the stop away.
                if trail_percent is not None:
                    best = float(best_price) if best_price is not None else float(average_price)
                    best = max(best, price) if side == "long" else min(best, price)
                    connection.execute(
                        "UPDATE paper_positions SET best_price = ? WHERE symbol_id = ?",
                        (best, symbol_id),
                    )
                    trail_distance = best * float(trail_percent) / 100
                    trailed = best - trail_distance if side == "long" else best + trail_distance
                    if stop is None:
                        stop = trailed
                    else:
                        stop = (
                            max(float(stop), trailed)
                            if side == "long"
                            else min(float(stop), trailed)
                        )
                exit_price: float | None = None
                exit_kind: str | None = None
                if side == "long":
                    if stop is not None and price <= float(stop):
                        exit_price, exit_kind = float(stop), "stop"
                    elif target is not None and price >= float(target):
                        exit_price, exit_kind = float(target), "target"
                else:
                    if stop is not None and price >= float(stop):
                        exit_price, exit_kind = float(stop), "stop"
                    elif target is not None and price <= float(target):
                        exit_price, exit_kind = float(target), "target"
                if exit_price is None:
                    continue
                # Closing = the opposite fill for the full quantity.
                self._apply_trade_fill(
                    connection=connection,
                    symbol_id=symbol_id,
                    side="short" if side == "long" else "long",
                    quantity=float(quantity),
                    executed_price=exit_price,
                    executed_at=closed_at,
                )
                ledger = self._record_closure(
                    connection,
                    symbol_id=symbol_id,
                    side=str(side),
                    quantity=float(quantity),
                    entry_price=float(average_price),
                    exit_price=exit_price,
                    exit_kind=str(exit_kind),
                    closed_at=closed_at,
                )
                closures.append(
                    {
                        "symbolId": symbol_id,
                        "side": side,
                        "quantity": float(quantity),
                        "entryPrice": float(average_price),
                        "exitPrice": exit_price,
                        "exitKind": exit_kind,
                        "closedAt": closed_at,
                        **ledger,
                    }
                )
            if closures:
                connection.commit()
        return closures

    def refresh_paper_position_marks(self, latest_prices: dict[str, float]) -> dict[str, Any]:
        updated_at = now_iso()
        with connect(self.sqlite_path) as connection:
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
            "planStop": row[14] if len(row) > 14 else None,
            "planTarget": row[15] if len(row) > 15 else None,
            "planRiskPercent": row[16] if len(row) > 16 else None,
            "planReason": row[17] if len(row) > 17 else None,
            "planEmotion": row[18] if len(row) > 18 else None,
        }
