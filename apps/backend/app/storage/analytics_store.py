# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

import json
from contextlib import contextmanager
from pathlib import Path
from threading import RLock
from typing import Any

import duckdb


def _safe_partition(value: str) -> str:
    return "".join(character if character.isalnum() else "_" for character in value)


class AnalyticsStore:
    def __init__(self, duckdb_path: Path, parquet_dir: Path) -> None:
        self.duckdb_path = duckdb_path
        self.parquet_dir = parquet_dir
        self._lock = RLock()

    @contextmanager
    def _connection(self):
        with self._lock:
            with duckdb.connect(str(self.duckdb_path)) as connection:
                yield connection

    def initialize(self) -> None:
        self.duckdb_path.parent.mkdir(parents=True, exist_ok=True)
        self.parquet_dir.mkdir(parents=True, exist_ok=True)
        with self._connection() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS backtest_snapshots (
                    snapshot_id VARCHAR PRIMARY KEY,
                    setup_type VARCHAR NOT NULL,
                    timeframe VARCHAR NOT NULL,
                    created_at TIMESTAMP NOT NULL,
                    sample_size INTEGER NOT NULL,
                    expectancy_r DOUBLE NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS setup_expectancy (
                    symbol VARCHAR NOT NULL,
                    setup_type VARCHAR NOT NULL,
                    timeframe VARCHAR NOT NULL,
                    regime VARCHAR NOT NULL,
                    sample_size INTEGER NOT NULL,
                    wins INTEGER NOT NULL,
                    sum_r DOUBLE NOT NULL,
                    oos_sample_size INTEGER NOT NULL,
                    oos_wins INTEGER NOT NULL,
                    oos_sum_r DOUBLE NOT NULL,
                    updated_at TIMESTAMP NOT NULL,
                    PRIMARY KEY(symbol, setup_type, timeframe)
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS market_candles (
                    symbol VARCHAR NOT NULL,
                    market_type VARCHAR NOT NULL,
                    timeframe VARCHAR NOT NULL,
                    source VARCHAR NOT NULL,
                    open_time_utc TIMESTAMP NOT NULL,
                    open DOUBLE NOT NULL,
                    high DOUBLE NOT NULL,
                    low DOUBLE NOT NULL,
                    close DOUBLE NOT NULL,
                    volume DOUBLE NOT NULL,
                    ingested_at TIMESTAMP NOT NULL,
                    PRIMARY KEY(symbol, timeframe, open_time_utc)
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS market_integrity_diagnostics (
                    symbol VARCHAR NOT NULL,
                    market_type VARCHAR NOT NULL,
                    timeframe VARCHAR NOT NULL,
                    provider VARCHAR NOT NULL,
                    severity VARCHAR NOT NULL,
                    code VARCHAR NOT NULL,
                    detail VARCHAR NOT NULL,
                    observed_at_utc TIMESTAMP NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS market_ingest_runs (
                    run_id VARCHAR PRIMARY KEY,
                    symbol VARCHAR NOT NULL,
                    market_type VARCHAR NOT NULL,
                    timeframe VARCHAR NOT NULL,
                    provider VARCHAR NOT NULL,
                    status VARCHAR NOT NULL,
                    candles_received INTEGER NOT NULL,
                    candles_kept INTEGER NOT NULL,
                    invalid_count INTEGER NOT NULL,
                    duplicate_count INTEGER NOT NULL,
                    gap_count INTEGER NOT NULL,
                    session_gap_count INTEGER NOT NULL DEFAULT 0,
                    unexpected_gap_count INTEGER NOT NULL DEFAULT 0,
                    cadence_max_gap_seconds DOUBLE NOT NULL DEFAULT 0,
                    partial_excluded_count INTEGER NOT NULL,
                    invalid_samples_json TEXT,
                    gap_samples_json TEXT,
                    detail VARCHAR,
                    started_at_utc TIMESTAMP NOT NULL,
                    completed_at_utc TIMESTAMP NOT NULL
                )
                """
            )
            self._ensure_market_ingest_run_columns(connection)

    def status(self) -> dict[str, str]:
        return {
            "duckdb_path": str(self.duckdb_path),
            "parquet_dir": str(self.parquet_dir),
        }

    def replace_market_candles(
        self,
        symbol: str,
        market_type: str,
        timeframe: str,
        source: str,
        candles: list[dict[str, Any]],
    ) -> None:
        with self._connection() as connection:
            connection.execute(
                "DELETE FROM market_candles WHERE symbol = ? AND timeframe = ?",
                [symbol, timeframe],
            )
            for candle in candles:
                connection.execute(
                    """
                    INSERT INTO market_candles (
                        symbol,
                        market_type,
                        timeframe,
                        source,
                        open_time_utc,
                        open,
                        high,
                        low,
                        close,
                        volume,
                        ingested_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now())
                    """,
                    [
                        symbol,
                        market_type,
                        timeframe,
                        source,
                        candle["open_time_utc"],
                        candle["open"],
                        candle["high"],
                        candle["low"],
                        candle["close"],
                        candle["volume"],
                    ],
                )
        self._archive_parquet(symbol, timeframe)

    def _archive_parquet(self, symbol: str, timeframe: str) -> None:
        """Write the durable long-term candle archive for one series as Parquet.

        The DuckDB file is the hot store; this partitioned Parquet copy is the
        backup/export surface referenced in docs/backup_and_recovery.md.
        """
        partition_dir = (
            self.parquet_dir
            / f"symbol={_safe_partition(symbol)}"
            / f"timeframe={_safe_partition(timeframe)}"
        )
        partition_dir.mkdir(parents=True, exist_ok=True)
        target = partition_dir / "candles.parquet"
        escaped_target = str(target).replace("'", "''")
        try:
            with self._connection() as connection:
                connection.execute(
                    f"""
                    COPY (
                        SELECT symbol, market_type, timeframe, source, open_time_utc,
                               open, high, low, close, volume, ingested_at
                        FROM market_candles
                        WHERE symbol = ? AND timeframe = ?
                        ORDER BY open_time_utc
                    ) TO '{escaped_target}' (FORMAT PARQUET)
                    """,
                    [symbol, timeframe],
                )
        except Exception:
            # Archiving is best-effort; a failed Parquet write must not break ingest.
            return

    def upsert_setup_expectancy(self, payload: dict[str, Any]) -> None:
        with self._connection() as connection:
            connection.execute(
                "DELETE FROM setup_expectancy WHERE symbol = ? AND setup_type = ? AND timeframe = ?",
                [payload["symbol"], payload["setup_type"], payload["timeframe"]],
            )
            connection.execute(
                """
                INSERT INTO setup_expectancy (
                    symbol, setup_type, timeframe, regime, sample_size, wins, sum_r,
                    oos_sample_size, oos_wins, oos_sum_r, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now())
                """,
                [
                    payload["symbol"],
                    payload["setup_type"],
                    payload["timeframe"],
                    payload.get("regime", "unknown"),
                    int(payload["sample_size"]),
                    int(payload["wins"]),
                    float(payload["sum_r"]),
                    int(payload.get("oos_sample_size", 0)),
                    int(payload.get("oos_wins", 0)),
                    float(payload.get("oos_sum_r", 0.0)),
                ],
            )

    def get_pooled_expectancy(self, setup_type: str, timeframe: str) -> dict[str, Any]:
        with self._connection() as connection:
            row = connection.execute(
                """
                SELECT
                    COALESCE(SUM(sample_size), 0) AS sample_size,
                    COALESCE(SUM(wins), 0) AS wins,
                    COALESCE(SUM(sum_r), 0.0) AS sum_r,
                    COALESCE(SUM(oos_sample_size), 0) AS oos_sample_size,
                    COALESCE(SUM(oos_wins), 0) AS oos_wins,
                    COALESCE(SUM(oos_sum_r), 0.0) AS oos_sum_r
                FROM setup_expectancy
                WHERE setup_type = ? AND timeframe = ?
                """,
                [setup_type, timeframe],
            ).fetchone()
        sample_size = int(row[0]) if row else 0
        wins = int(row[1]) if row else 0
        sum_r = float(row[2]) if row else 0.0
        oos_sample_size = int(row[3]) if row else 0
        oos_wins = int(row[4]) if row else 0
        oos_sum_r = float(row[5]) if row else 0.0
        return {
            "sample_size": sample_size,
            "win_rate": (wins / sample_size) if sample_size else 0.0,
            "expectancy": (sum_r / sample_size) if sample_size else 0.0,
            "oos_sample_size": oos_sample_size,
            "oos_win_rate": (oos_wins / oos_sample_size) if oos_sample_size else 0.0,
            "oos_expectancy": (oos_sum_r / oos_sample_size) if oos_sample_size else 0.0,
        }

    def get_market_candle_corridor_summary(
        self,
        targets: list[tuple[str, str]],
    ) -> list[dict[str, Any]]:
        with self._connection() as connection:
            items: list[dict[str, Any]] = []
            for symbol, timeframe in targets:
                row = connection.execute(
                    """
                    SELECT symbol, market_type, timeframe, source, COUNT(*) AS candle_count,
                           MAX(open_time_utc) AS latest_open_time_utc,
                           arg_max(close, open_time_utc) AS latest_close
                    FROM market_candles
                    WHERE symbol = ? AND timeframe = ?
                    GROUP BY symbol, market_type, timeframe, source
                    """,
                    [symbol, timeframe],
                ).fetchone()
                if row is None:
                    continue
                diagnostics = connection.execute(
                    """
                    SELECT code
                    FROM market_integrity_diagnostics
                    WHERE symbol = ? AND timeframe = ? AND provider = ?
                    ORDER BY observed_at_utc DESC
                    LIMIT 10
                    """,
                    [symbol, timeframe, row[3]],
                ).fetchall()
                items.append(
                    {
                        "symbol": row[0],
                        "market_type": row[1],
                        "timeframe": row[2],
                        "provider": row[3],
                        "candles_ingested": row[4],
                        "latest_open_time_utc": row[5].isoformat() if row[5] else None,
                        "latest_close": row[6],
                        "diagnostics": [diagnostic[0] for diagnostic in diagnostics],
                    }
                )
        return items

    def list_market_candles(
        self,
        symbol: str,
        timeframe: str,
        limit: int = 300,
    ) -> dict[str, Any]:
        with self._connection() as connection:
            rows = connection.execute(
                """
                SELECT source, open_time_utc, open, high, low, close, volume
                FROM market_candles
                WHERE symbol = ? AND timeframe = ?
                ORDER BY open_time_utc DESC
                LIMIT ?
                """,
                [symbol, timeframe, limit],
            ).fetchall()

        if not rows:
            return {
                "symbol": symbol,
                "timeframe": timeframe,
                "source": None,
                "items": [],
            }

        ordered_rows = list(reversed(rows))
        return {
            "symbol": symbol,
            "timeframe": timeframe,
            "source": rows[0][0],
            "items": [
                {
                    "open_time_utc": row[1].isoformat(),
                    "open": row[2],
                    "high": row[3],
                    "low": row[4],
                    "close": row[5],
                    "volume": row[6],
                }
                for row in ordered_rows
            ],
        }

    def list_market_series(self, minimum_candles: int = 60) -> list[dict[str, Any]]:
        with self._connection() as connection:
            rows = connection.execute(
                """
                SELECT symbol,
                       market_type,
                       timeframe,
                       source,
                       COUNT(*) AS candle_count,
                       MAX(open_time_utc) AS latest_open_time_utc,
                       arg_max(close, open_time_utc) AS latest_close
                FROM market_candles
                GROUP BY symbol, market_type, timeframe, source
                HAVING COUNT(*) >= ?
                ORDER BY market_type, symbol, timeframe
                """,
                [minimum_candles],
            ).fetchall()

        return [
            {
                "symbol": row[0],
                "market_type": row[1],
                "timeframe": row[2],
                "source": row[3],
                "candle_count": row[4],
                "latest_open_time_utc": row[5].isoformat() if row[5] else None,
                "latest_close": row[6],
            }
            for row in rows
        ]

    def clear_market_integrity_diagnostics(self, symbol: str, timeframe: str) -> None:
        with self._connection() as connection:
            connection.execute(
                "DELETE FROM market_integrity_diagnostics WHERE symbol = ? AND timeframe = ?",
                [symbol, timeframe],
            )

    def record_market_integrity_diagnostics(
        self,
        diagnostics: list[dict[str, Any]],
    ) -> None:
        if not diagnostics:
            return
        with self._connection() as connection:
            for diagnostic in diagnostics:
                connection.execute(
                    """
                    INSERT INTO market_integrity_diagnostics (
                        symbol,
                        market_type,
                        timeframe,
                        provider,
                        severity,
                        code,
                        detail,
                        observed_at_utc
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    [
                        diagnostic["symbol"],
                        diagnostic["market_type"],
                        diagnostic["timeframe"],
                        diagnostic["provider"],
                        diagnostic["severity"],
                        diagnostic["code"],
                        diagnostic["detail"],
                        diagnostic["observed_at_utc"],
                    ],
                )

    def list_market_integrity_diagnostics(self, limit: int = 100) -> list[dict[str, Any]]:
        with self._connection() as connection:
            rows = connection.execute(
                """
                SELECT symbol, market_type, timeframe, provider, severity, code, detail, observed_at_utc
                FROM market_integrity_diagnostics
                ORDER BY observed_at_utc DESC
                LIMIT ?
                """,
                [limit],
            ).fetchall()
        return [
            {
                "symbol": row[0],
                "market_type": row[1],
                "timeframe": row[2],
                "provider": row[3],
                "severity": row[4],
                "code": row[5],
                "detail": row[6],
                "observed_at_utc": row[7].isoformat() if hasattr(row[7], "isoformat") else str(row[7]),
            }
            for row in rows
        ]

    def record_market_ingest_run(self, payload: dict[str, Any]) -> None:
        with self._connection() as connection:
            connection.execute(
                """
                INSERT INTO market_ingest_runs (
                    run_id,
                    symbol,
                    market_type,
                    timeframe,
                    provider,
                    status,
                    candles_received,
                    candles_kept,
                    invalid_count,
                    duplicate_count,
                    gap_count,
                    session_gap_count,
                    unexpected_gap_count,
                    cadence_max_gap_seconds,
                    partial_excluded_count,
                    invalid_samples_json,
                    gap_samples_json,
                    detail,
                    started_at_utc,
                    completed_at_utc
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    payload["run_id"],
                    payload["symbol"],
                    payload["market_type"],
                    payload["timeframe"],
                    payload["provider"],
                    payload["status"],
                    payload["candles_received"],
                    payload["candles_kept"],
                    payload["invalid_count"],
                    payload["duplicate_count"],
                    payload["gap_count"],
                    payload["session_gap_count"],
                    payload["unexpected_gap_count"],
                    payload["cadence_max_gap_seconds"],
                    payload["partial_excluded_count"],
                    json.dumps(payload.get("invalid_samples", [])),
                    json.dumps(payload.get("gap_samples", [])),
                    payload.get("detail"),
                    payload["started_at_utc"],
                    payload["completed_at_utc"],
                ],
            )

    def list_market_ingest_runs(self, limit: int = 50) -> list[dict[str, Any]]:
        with self._connection() as connection:
            rows = connection.execute(
                """
                  SELECT run_id, symbol, market_type, timeframe, provider, status,
                      candles_received, candles_kept, invalid_count, duplicate_count,
                      gap_count, session_gap_count, unexpected_gap_count, cadence_max_gap_seconds,
                      partial_excluded_count, invalid_samples_json, gap_samples_json, detail,
                      started_at_utc, completed_at_utc
                FROM market_ingest_runs
                ORDER BY completed_at_utc DESC
                LIMIT ?
                """,
                [limit],
            ).fetchall()
        return [
            {
                "run_id": row[0],
                "symbol": row[1],
                "market_type": row[2],
                "timeframe": row[3],
                "provider": row[4],
                "status": row[5],
                "candles_received": row[6],
                "candles_kept": row[7],
                "invalid_count": row[8],
                "duplicate_count": row[9],
                "gap_count": row[10],
                "session_gap_count": row[11],
                "unexpected_gap_count": row[12],
                "cadence_max_gap_seconds": row[13],
                "partial_excluded_count": row[14],
                "invalid_samples": json.loads(row[15]) if row[15] else [],
                "gap_samples": json.loads(row[16]) if row[16] else [],
                "detail": row[17],
                "started_at_utc": row[18].isoformat() if hasattr(row[18], "isoformat") else str(row[18]),
                "completed_at_utc": row[19].isoformat() if hasattr(row[19], "isoformat") else str(row[19]),
            }
            for row in rows
        ]

    def _ensure_market_ingest_run_columns(self, connection: duckdb.DuckDBPyConnection) -> None:
        columns = {
            row[1] for row in connection.execute("PRAGMA table_info('market_ingest_runs')").fetchall()
        }
        if "session_gap_count" not in columns:
            connection.execute(
                "ALTER TABLE market_ingest_runs ADD COLUMN session_gap_count INTEGER"
            )
            connection.execute(
                "UPDATE market_ingest_runs SET session_gap_count = 0 WHERE session_gap_count IS NULL"
            )
        if "unexpected_gap_count" not in columns:
            connection.execute(
                "ALTER TABLE market_ingest_runs ADD COLUMN unexpected_gap_count INTEGER"
            )
            connection.execute(
                "UPDATE market_ingest_runs SET unexpected_gap_count = 0 WHERE unexpected_gap_count IS NULL"
            )
        if "cadence_max_gap_seconds" not in columns:
            connection.execute(
                "ALTER TABLE market_ingest_runs ADD COLUMN cadence_max_gap_seconds DOUBLE"
            )
            connection.execute(
                "UPDATE market_ingest_runs SET cadence_max_gap_seconds = 0 WHERE cadence_max_gap_seconds IS NULL"
            )
        if "invalid_samples_json" not in columns:
            connection.execute(
                "ALTER TABLE market_ingest_runs ADD COLUMN invalid_samples_json TEXT"
            )
            connection.execute(
                "UPDATE market_ingest_runs SET invalid_samples_json = '[]' WHERE invalid_samples_json IS NULL"
            )
        if "gap_samples_json" not in columns:
            connection.execute(
                "ALTER TABLE market_ingest_runs ADD COLUMN gap_samples_json TEXT"
            )
            connection.execute(
                "UPDATE market_ingest_runs SET gap_samples_json = '[]' WHERE gap_samples_json IS NULL"
            )
