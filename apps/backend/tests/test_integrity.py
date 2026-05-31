"""Integrity test for the durable Parquet archive (F2).

Closed candles written to DuckDB must also be archived to a partitioned, re-readable
Parquet file so the backup/restore path documented in backup_and_recovery.md is real.
"""

from pathlib import Path

import duckdb

from app.storage.analytics_store import AnalyticsStore


def _candles() -> list[dict[str, object]]:
    return [
        {
            "open_time_utc": f"2026-05-30T0{i}:00:00+00:00",
            "open": 100.0 + i,
            "high": 101.0 + i,
            "low": 99.0 + i,
            "close": 100.5 + i,
            "volume": 1000.0 + i,
        }
        for i in range(5)
    ]


def test_ingest_writes_readable_parquet_partition(tmp_path: Path) -> None:
    store = AnalyticsStore(tmp_path / "analytics.duckdb", tmp_path / "parquet")
    store.initialize()

    store.replace_market_candles(
        symbol="BTCUSD",
        market_type="crypto",
        timeframe="1h",
        source="coinbase",
        candles=_candles(),
    )

    partition = tmp_path / "parquet" / "symbol=BTCUSD" / "timeframe=1h" / "candles.parquet"
    assert partition.exists(), "expected a Parquet partition to be written on ingest"

    escaped = str(partition).replace("'", "''")
    with duckdb.connect() as connection:
        rows = connection.execute(f"SELECT COUNT(*) FROM read_parquet('{escaped}')").fetchone()
    assert rows is not None
    assert rows[0] == 5
