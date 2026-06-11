# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Numbered schema migrations for the state store.

Base tables are created by each domain store's ``ensure_schema`` (idempotent
``CREATE TABLE IF NOT EXISTS``). Anything that alters existing tables lives
here as a numbered migration so upgrades are explicit, ordered, and recorded
in ``schema_migrations``. Add new migrations at the end; never edit or
reorder applied ones.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Callable
from datetime import UTC, datetime


def _columns(connection: sqlite3.Connection, table: str) -> set[str]:
    return {row[1] for row in connection.execute(f"PRAGMA table_info({table})").fetchall()}


def _add_alert_columns(connection: sqlite3.Connection) -> None:
    columns = _columns(connection, "alerts")
    if "channel" not in columns:
        connection.execute("ALTER TABLE alerts ADD COLUMN channel TEXT NOT NULL DEFAULT 'desktop'")
    if "status" not in columns:
        connection.execute("ALTER TABLE alerts ADD COLUMN status TEXT NOT NULL DEFAULT 'armed'")
    if "last_fired" not in columns:
        connection.execute("ALTER TABLE alerts ADD COLUMN last_fired TEXT")


def _add_trade_intent_columns(connection: sqlite3.Connection) -> None:
    columns = _columns(connection, "paper_trade_intents")
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


def _add_trade_plan_columns(connection: sqlite3.Connection) -> None:
    columns = _columns(connection, "paper_trade_intents")
    for name, ddl in [
        ("plan_stop", "ALTER TABLE paper_trade_intents ADD COLUMN plan_stop REAL"),
        ("plan_target", "ALTER TABLE paper_trade_intents ADD COLUMN plan_target REAL"),
        (
            "plan_risk_percent",
            "ALTER TABLE paper_trade_intents ADD COLUMN plan_risk_percent REAL",
        ),
        ("plan_reason", "ALTER TABLE paper_trade_intents ADD COLUMN plan_reason TEXT"),
        ("plan_emotion", "ALTER TABLE paper_trade_intents ADD COLUMN plan_emotion TEXT"),
    ]:
        if name not in columns:
            connection.execute(ddl)


MIGRATIONS: list[tuple[int, str, Callable[[sqlite3.Connection], None]]] = [
    (1, "add_alert_channel_status_columns", _add_alert_columns),
    (2, "add_trade_intent_execution_columns", _add_trade_intent_columns),
    (3, "add_trade_plan_columns", _add_trade_plan_columns),
]


def run_migrations(connection: sqlite3.Connection) -> list[int]:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL
        )
        """
    )
    applied = {
        row[0] for row in connection.execute("SELECT version FROM schema_migrations").fetchall()
    }
    newly_applied: list[int] = []
    for version, name, apply in MIGRATIONS:
        if version in applied:
            continue
        apply(connection)
        connection.execute(
            "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
            (version, name, datetime.now(UTC).isoformat()),
        )
        newly_applied.append(version)
    return newly_applied
