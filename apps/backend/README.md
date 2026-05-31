# AlphaTerminal Backend

This is the Phase 1 implementation scaffold from the architecture document: a local FastAPI backend with APScheduler, SQLite state storage, DuckDB analytics storage, Parquet archive paths, and a capability-segregated provider manager.

## Run

```bash
cd apps/backend
../../.venv/bin/pip install -e .
uvicorn app.main:app --reload
```

## Validation And Release Utilities

- `npm run backend:test` runs backend unittest discovery.
- `npm run backend:smoke` runs the backend route smoke test.
- `npm run backend:openapi` regenerates the committed OpenAPI artifact under `docs/openapi/`.
- `npm run backend:backup` exports a timestamped local-state bundle.
- `npm run validate:backend` runs the backend release validation stack.

## Schema And Secret Storage

- SQLite schema is formalized in `apps/backend/migrations/0001_initial.sql`.
- API key and delivery credential values are persisted in encrypted local config under `.local/state/secrets/`, not plaintext SQLite rows.

## Included Surfaces

- `GET /health`
- `GET /api/providers/settings`
- `PUT /api/providers/settings`
- `GET /api/providers/registry`
  Returns provider capability metadata plus `configured` and `transport` flags.
- `GET /api/settings/ai`
- `PUT /api/settings/ai`
- `GET /api/strategies`
- `POST /api/strategies`
- `GET /api/paper-account`
- `PUT /api/paper-account`
- `GET /api/paper-trades`
- `POST /api/paper-trades`
- `GET /api/market/corridor`
- `GET /api/market/corridor/diagnostics`
  Diagnostics now include both warning items and per-run ingest audit records.
- `POST /api/market/corridor/refresh`
- `GET /api/alerts`
- `GET /api/alerts/history`
- `POST /api/alerts`
- `PUT /api/alerts/{id}`
- `GET /api/watchlist`
- `POST /api/watchlist`
- `DELETE /api/watchlist/{symbol}`
- `WS /ws/events`

## Storage Layout

- SQLite: persisted provider settings, AI settings, watchlist, alerts, alert history, and trade audit state
- DuckDB: analytics and backtest snapshot scaffold
- Parquet directory: reserved for long-term candle archives
- Encrypted local config: API keys and delivery credentials under `.local/state/secrets/`
