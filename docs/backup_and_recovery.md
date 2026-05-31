# AlphaTerminal Backup And Recovery

## Scope

This document covers the local-state backup and restore path for AlphaTerminal production use.

## Backed-Up Assets

- SQLite operational state at `.local/state/alphaterminal.db`
- DuckDB analytics state at `.local/analytics/alphaterminal.duckdb`
- Parquet archives under `.local/parquet/`
- Encrypted API key payload and encryption key under `.local/state/secrets/`

## Export Workflow

Use the root script:

```bash
npm run backend:backup
```

This exports a timestamped ZIP bundle under `.local/backups/` and prints the bundle path.

To export to a specific target:

```bash
PYTHONPATH=apps/backend ./.venv/bin/python apps/backend/scripts/manage_state_bundle.py export /absolute/path/to/alphaterminal-backup.zip
```

## Restore Workflow

Restore uses the Python script directly:

```bash
PYTHONPATH=apps/backend ./.venv/bin/python apps/backend/scripts/manage_state_bundle.py restore /absolute/path/to/alphaterminal-backup.zip
```

Before any restore, the script creates an automatic pre-restore rollback bundle in `.local/backups/`.

## Recovery Notes

- Treat backup bundles as sensitive because they contain the encrypted secret payload and its decryption key.
- Keep backup bundles outside the workspace for long-term retention.
- Prefer restoring while the desktop app and backend are not running.
- If a restore produces unexpected state, use the printed pre-restore bundle to roll back immediately.

## Parquet Candle Archive

On every closed-candle ingest, the analytics store also writes a durable Parquet copy of
each series under `.local/parquet/symbol=<SYMBOL>/timeframe=<TIMEFRAME>/candles.parquet`.
The DuckDB file is the hot query store; these Parquet partitions are the long-term,
portable archive and the recommended export surface.

To rebuild DuckDB market history from the Parquet archive (for example after a corrupt
DuckDB file), re-read the partitions directly:

```bash
./.venv/bin/python - <<'PY'
import duckdb
con = duckdb.connect(".local/analytics/alphaterminal.duckdb")
con.execute(
    "INSERT INTO market_candles "
    "SELECT * FROM read_parquet('.local/parquet/*/*/candles.parquet')"
)
con.close()
PY
```

The Parquet write is best-effort and never blocks ingest; if a partition is missing, the
next successful ingest of that series re-creates it.

