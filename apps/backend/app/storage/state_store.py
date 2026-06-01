# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core.config import AiSettings, ProviderSettings, SafetySettings
from app.storage.secret_store import EncryptedSecretStore


DEFAULT_API_KEYS: list[dict[str, Any]] = [
    {
        "id": "alpaca-market-data-key-id",
        "label": "Alpaca Key ID",
        "value": "",
        "note": "Used for keyed Alpaca market data access and live trading order submission.",
        "tradeEnabled": True,
        "secret": True,
    },
    {
        "id": "alpaca-market-data-secret-key",
        "label": "Alpaca Secret Key",
        "value": "",
        "note": "Pairs with the Alpaca key ID to enable keyed market data and live trading.",
        "tradeEnabled": True,
        "secret": True,
    },
    {
        "id": "finnhub-api-key",
        "label": "Finnhub API Key",
        "value": "",
        "note": "Enables keyed Finnhub quotes, candles, and news in the provider manager.",
        "tradeEnabled": False,
        "secret": True,
    },
    {
        "id": "polygon-api-key",
        "label": "Polygon API Key",
        "value": "",
        "note": "Enables keyed Polygon stock data in the provider manager.",
        "tradeEnabled": False,
        "secret": True,
    },
    {
        "id": "twelvedata-api-key",
        "label": "Twelve Data API Key",
        "value": "",
        "note": "Enables keyed Twelve Data stock candles in the provider manager.",
        "tradeEnabled": False,
        "secret": True,
    },
    {
        "id": "telegram-bot-token",
        "label": "Telegram Bot Token",
        "value": "",
        "note": "Required for Telegram alert delivery. Pair it with the Telegram Chat ID.",
        "tradeEnabled": False,
        "secret": True,
    },
    {
        "id": "telegram-chat-id",
        "label": "Telegram Chat ID",
        "value": "",
        "note": "Target Telegram chat for alert delivery. Works with the stored bot token.",
        "tradeEnabled": False,
        "secret": False,
    },
    {
        "id": "smtp-host",
        "label": "SMTP Host",
        "value": "",
        "note": "Mail server hostname for email alert delivery.",
        "tradeEnabled": False,
        "secret": False,
    },
    {
        "id": "smtp-port",
        "label": "SMTP Port",
        "value": "587",
        "note": "Mail server port. Port 465 uses implicit TLS; other ports attempt STARTTLS when available.",
        "tradeEnabled": False,
        "secret": False,
    },
    {
        "id": "smtp-username",
        "label": "SMTP Username",
        "value": "",
        "note": "Optional username for authenticated email delivery.",
        "tradeEnabled": False,
        "secret": False,
    },
    {
        "id": "smtp-password",
        "label": "SMTP Password",
        "value": "",
        "note": "Password for the SMTP username when authentication is required.",
        "tradeEnabled": False,
        "secret": True,
    },
    {
        "id": "smtp-from-email",
        "label": "SMTP From Address",
        "value": "",
        "note": "From address used for email alert delivery.",
        "tradeEnabled": False,
        "secret": False,
    },
    {
        "id": "smtp-to-email",
        "label": "SMTP Recipient Address",
        "value": "",
        "note": "Recipient address or comma-separated recipients for email alerts and test sends.",
        "tradeEnabled": False,
        "secret": False,
    },
]


class StateStore:
    def __init__(
        self,
        sqlite_path: Path,
        secret_store: EncryptedSecretStore | None = None,
    ) -> None:
        self.sqlite_path = sqlite_path
        self._secret_store = secret_store or EncryptedSecretStore(
            sqlite_path.parent / "secrets" / "api_keys.enc",
            sqlite_path.parent / "secrets" / "api_keys.key",
        )

    def initialize(
        self,
        provider_settings: ProviderSettings,
        safety_settings: SafetySettings,
        ai_settings: AiSettings,
    ) -> None:
        self.sqlite_path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(self.sqlite_path) as connection:
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
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS provider_settings (
                    settings_key TEXT PRIMARY KEY,
                    payload TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
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
            self._ensure_alerts_columns(connection)
            self._ensure_paper_trade_intent_columns(connection)
            self._ensure_paper_account_row(connection)
            self._ensure_settings_row(
                connection,
                "provider_settings",
                provider_settings.model_dump(),
            )
            self._ensure_settings_row(
                connection,
                "safety_settings",
                safety_settings.model_dump(),
            )
            self._ensure_settings_row(
                connection,
                "ai_settings",
                ai_settings.model_dump(),
            )
            self._ensure_settings_row(
                connection,
                "api_keys",
                DEFAULT_API_KEYS,
            )
            connection.commit()

    def get_provider_settings(self) -> ProviderSettings:
        payload = self._read_settings_payload(
            "provider_settings", ProviderSettings().model_dump()
        )
        normalized_payload = self._normalize_provider_settings_payload(payload)
        if normalized_payload != payload:
            with sqlite3.connect(self.sqlite_path) as connection:
                self._write_settings_payload(
                    connection,
                    "provider_settings",
                    normalized_payload,
                )
                connection.commit()
        return ProviderSettings.model_validate(normalized_payload)

    def get_safety_settings(self) -> SafetySettings:
        return SafetySettings.model_validate(
            self._read_settings_payload("safety_settings", SafetySettings().model_dump())
        )

    def update_provider_settings(
        self,
        provider_settings: ProviderSettings,
        safety_settings: SafetySettings,
    ) -> None:
        with sqlite3.connect(self.sqlite_path) as connection:
            self._write_settings_payload(
                connection,
                "provider_settings",
                provider_settings.model_dump(),
            )
            self._write_settings_payload(
                connection,
                "safety_settings",
                safety_settings.model_dump(),
            )
            connection.commit()

    def get_ai_settings(self) -> AiSettings:
        return AiSettings.model_validate(
            self._read_settings_payload("ai_settings", AiSettings().model_dump())
        )

    def update_ai_settings(self, ai_settings: AiSettings) -> AiSettings:
        with sqlite3.connect(self.sqlite_path) as connection:
            self._write_settings_payload(
                connection,
                "ai_settings",
                ai_settings.model_dump(),
            )
            connection.commit()
        return ai_settings

    def list_api_keys(self) -> list[dict[str, Any]]:
        metadata = self._get_api_key_metadata()
        secret_values = self._secret_store.read_values()
        return [
            {
                **item,
                "value": secret_values.get(item["id"], ""),
            }
            for item in metadata
        ]

    def update_api_key(self, key_id: str, value: str) -> dict[str, Any]:
        api_keys = self._get_api_key_metadata()
        updated_item: dict[str, Any] | None = None
        for item in api_keys:
            if item["id"] == key_id:
                item["value"] = value
                updated_item = item
                break

        if updated_item is None:
            raise KeyError(key_id)

        self._secret_store.set_value(key_id, value)
        return updated_item

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
            "created_at": self._now_iso(),
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
        created_at = self._now_iso()
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
        observed_at = fired_at or self._now_iso()
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

    def list_saved_strategies(self) -> list[dict[str, Any]]:
        with sqlite3.connect(self.sqlite_path) as connection:
            rows = connection.execute(
                """
                SELECT id, name, symbol_id, setup_type, timeframe, saved_at
                FROM saved_strategies
                ORDER BY saved_at DESC, id DESC
                """
            ).fetchall()
        return [self._serialize_saved_strategy_row(row) for row in rows]

    def save_strategy(self, payload: dict[str, Any]) -> dict[str, Any]:
        with sqlite3.connect(self.sqlite_path) as connection:
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
            return self._default_paper_account()

        return {
            "balance": row[0],
            "buyingPower": row[1],
            "realizedPnl": row[2],
            "openPositions": [self._serialize_paper_position_row(position) for position in positions],
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
        submitted_at = self._now_iso()
        symbol_id = symbol.upper().replace("/", "")

        with sqlite3.connect(self.sqlite_path) as connection:
            self._ensure_paper_account_row(connection)
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
        submitted_at = str(broker_trade.get("submitted_at") or self._now_iso())
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
        executed_at = self._now_iso()

        with sqlite3.connect(self.sqlite_path) as connection:
            self._ensure_paper_account_row(connection)
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
        updated_at = self._now_iso()
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

    def _ensure_settings_row(
        self,
        connection: sqlite3.Connection,
        settings_key: str,
        payload: Any,
    ) -> None:
        existing = connection.execute(
            "SELECT 1 FROM provider_settings WHERE settings_key = ?",
            (settings_key,),
        ).fetchone()
        if existing is None:
            self._write_settings_payload(connection, settings_key, payload)

    def _ensure_paper_account_row(self, connection: sqlite3.Connection) -> None:
        existing = connection.execute(
            "SELECT 1 FROM paper_account_state WHERE account_key = 'default'"
        ).fetchone()
        if existing is None:
            default_account = self._default_paper_account()
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
                    self._now_iso(),
                ),
            )

    def _write_paper_account(
        self,
        connection: sqlite3.Connection,
        account: dict[str, Any],
    ) -> None:
        updated_at = self._now_iso()
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

    def _normalize_api_keys_payload(self, payload: Any) -> list[dict[str, Any]]:
        indexed_payload = {
            item.get("id"): item
            for item in payload
            if isinstance(item, dict) and isinstance(item.get("id"), str)
        } if isinstance(payload, list) else {}

        normalized: list[dict[str, Any]] = []
        for default_item in DEFAULT_API_KEYS:
            raw_item = indexed_payload.get(default_item["id"], {})
            normalized.append(
                {
                    "id": default_item["id"],
                    "label": default_item["label"],
                    "value": raw_item.get("value", default_item["value"])
                    if isinstance(raw_item.get("value", default_item["value"]), str)
                    else default_item["value"],
                    "note": default_item["note"],
                    "tradeEnabled": default_item["tradeEnabled"],
                    "secret": default_item["secret"],
                }
            )
        return normalized

    def _get_api_key_metadata(self) -> list[dict[str, Any]]:
        payload = self._read_settings_payload("api_keys", DEFAULT_API_KEYS)
        normalized_payload = self._normalize_api_keys_payload(payload)
        scrubbed_payload = [{**item, "value": ""} for item in normalized_payload]

        existing_secret_values = self._secret_store.read_values()
        migrated_secret_values = dict(existing_secret_values)
        migrated = False
        for item in normalized_payload:
            if item["value"] and not migrated_secret_values.get(item["id"]):
                migrated_secret_values[item["id"]] = item["value"]
                migrated = True

        if migrated:
            self._secret_store.write_values(migrated_secret_values)

        if payload != scrubbed_payload:
            with sqlite3.connect(self.sqlite_path) as connection:
                self._write_settings_payload(connection, "api_keys", scrubbed_payload)
                connection.commit()

        return scrubbed_payload
        connection.execute("DELETE FROM paper_positions")
        for position in account.get("openPositions", []):
            connection.execute(
                """
                INSERT INTO paper_positions (symbol_id, side, quantity, average_price, pnl, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    position["symbolId"],
                    position["side"],
                    position["quantity"],
                    position["averagePrice"],
                    position["pnl"],
                    updated_at,
                ),
            )

    def _write_settings_payload(
        self,
        connection: sqlite3.Connection,
        settings_key: str,
        payload: dict[str, Any],
    ) -> None:
        connection.execute(
            """
            INSERT INTO provider_settings (settings_key, payload, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(settings_key) DO UPDATE SET
                payload = excluded.payload,
                updated_at = excluded.updated_at
            """,
            (
                settings_key,
                json.dumps(payload),
                self._now_iso(),
            ),
        )

    def _read_settings_payload(
        self,
        settings_key: str,
        fallback: dict[str, Any],
    ) -> dict[str, Any]:
        with sqlite3.connect(self.sqlite_path) as connection:
            row = connection.execute(
                "SELECT payload FROM provider_settings WHERE settings_key = ?",
                (settings_key,),
            ).fetchone()
        if row is None:
            return fallback
        return json.loads(row[0])

    def _normalize_provider_settings_payload(
        self,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        normalized = json.loads(json.dumps(payload))

        crypto_route = normalized.get("crypto", {})
        if (
            crypto_route.get("primary") == "ccxt_coinbase"
            and crypto_route.get("secondary") in {"coingecko", None}
            and crypto_route.get("fallback") == "ccxt_kraken"
        ):
            normalized["crypto"] = {
                "primary": "ccxt_coinbase",
                "secondary": "ccxt_kraken",
                "fallback": "gemini",
            }

        stocks_route = normalized.get("stocks", {})
        if stocks_route.get("primary") in {"alpaca", "finnhub", "twelvedata", "polygon"}:
            normalized["stocks"] = {
                "primary": "yahoo_public",
                "secondary": None,
                "fallback": None,
            }

        return normalized

    def _ensure_alerts_columns(self, connection: sqlite3.Connection) -> None:
        columns = {
            row[1] for row in connection.execute("PRAGMA table_info(alerts)").fetchall()
        }
        if "channel" not in columns:
            connection.execute(
                "ALTER TABLE alerts ADD COLUMN channel TEXT NOT NULL DEFAULT 'desktop'"
            )
        if "status" not in columns:
            connection.execute(
                "ALTER TABLE alerts ADD COLUMN status TEXT NOT NULL DEFAULT 'armed'"
            )
        if "last_fired" not in columns:
            connection.execute("ALTER TABLE alerts ADD COLUMN last_fired TEXT")

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
            connection.execute(
                "ALTER TABLE paper_trade_intents ADD COLUMN executed_at TEXT"
            )
        if "executed_price" not in columns:
            connection.execute(
                "ALTER TABLE paper_trade_intents ADD COLUMN executed_price REAL"
            )
        if "provider" not in columns:
            connection.execute(
                "ALTER TABLE paper_trade_intents ADD COLUMN provider TEXT"
            )
        if "external_order_id" not in columns:
            connection.execute(
                "ALTER TABLE paper_trade_intents ADD COLUMN external_order_id TEXT"
            )
        if "broker_status" not in columns:
            connection.execute(
                "ALTER TABLE paper_trade_intents ADD COLUMN broker_status TEXT"
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
            self._ensure_paper_account_row(connection)
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
        allocated_notional = sum(float(quantity) * float(average_price) for quantity, average_price, _ in positions)
        unrealized_pnl = sum(float(pnl) for _, _, pnl in positions)
        balance = float(account_row[0]) + allocated_notional + float(account_row[1]) + unrealized_pnl
        connection.execute(
            """
            UPDATE paper_account_state
            SET balance = ?, updated_at = ?
            WHERE account_key = 'default'
            """,
            (max(balance, 0.0), self._now_iso()),
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

    def _serialize_alert_row(self, row: tuple[Any, ...]) -> dict[str, Any]:
        return {
            "id": str(row[0]),
            "symbolId": row[1],
            "condition": row[2],
            "channel": row[3],
            "status": row[4],
            "lastFired": row[5],
        }

    def _serialize_saved_strategy_row(self, row: tuple[Any, ...]) -> dict[str, Any]:
        return {
            "id": row[0],
            "name": row[1],
            "symbolId": row[2],
            "setupType": row[3],
            "timeframe": row[4],
            "savedAt": row[5],
        }

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

    @staticmethod
    def _default_paper_account() -> dict[str, Any]:
        return {
            "balance": 100000.0,
            "buyingPower": 100000.0,
            "realizedPnl": 0.0,
            "openPositions": [],
        }

    @staticmethod
    def _now_iso() -> str:
        return datetime.now(timezone.utc).isoformat()