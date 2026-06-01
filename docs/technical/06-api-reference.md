# 6. API reference

[← AI narration](05-ai-narration.md) · [Technical index](README.md) · [Next: Frontend →](07-frontend.md)

---

The backend exposes a REST API (JSON) and a WebSocket event stream. All routes are served from the sidecar's base URL (a free loopback port at runtime; `http://127.0.0.1:8000` in dev). The machine‑readable spec is at [docs/openapi/quantglass-backend.openapi.json](../openapi/quantglass-backend.openapi.json) and can be regenerated with `npm run backend:openapi`.

> CORS is restricted to local dev origins and the Tauri webview (`tauri://localhost`, `http://127.0.0.1:{1420,4173,5173}`, etc.) with credentials disabled. See [Security model](09-security.md#cors).

---

## Health

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Liveness + component/provider status. |

## Market

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/market/ranking` | Relative‑strength ranking across symbols. |
| `GET` | `/api/market/corridor` | Corridor overview. |
| `GET` | `/api/market/corridor/diagnostics` | Integrity diagnostics (gaps, partials, quality). |
| `GET` | `/api/market/corridor/candles?symbol=&timeframe=` | Closed candles for a symbol/timeframe. |
| `POST` | `/api/market/corridor/refresh` | Force a corridor refresh. |

## Signals & content

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/signals` | Current signal inventory (`CanonicalSignal[]`). |
| `GET` | `/api/news` | Aggregated news items. |

## Backtests & strategies

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/backtests/presets` | Available backtest presets. |
| `POST` | `/api/backtests/run` | Run a backtest; returns `BacktestMetrics`. |
| `GET` | `/api/strategies` | List saved strategies. |
| `POST` | `/api/strategies` | Save a strategy. |

## Watchlist

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/watchlist` | List watchlist entries. |
| `POST` | `/api/watchlist` | Add a symbol. |
| `DELETE` | `/api/watchlist/{symbol}` | Remove a symbol. |

## Paper trading

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/paper-account` | Account snapshot (balance, buying power, P&L). |
| `PUT` | `/api/paper-account` | Update account settings. |
| `GET` | `/api/paper-trades` | List paper trade intents. |
| `POST` | `/api/paper-trades` | Submit a paper trade intent. |

## Alerts

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/alerts` | List alerts. |
| `GET` | `/api/alerts/history` | Firing history (audit log). |
| `POST` | `/api/alerts` | Create an alert. |
| `PUT` | `/api/alerts/{id}` | Update/pause/re‑arm an alert. |

## Providers

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/providers/settings` | Current provider routing + view mode. |
| `PUT` | `/api/providers/settings` | Update routing / rate limits. |
| `GET` | `/api/providers/registry` | Registry status (capabilities, transport, configured). |

## Extensions

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/extensions/registry` | Installed extension manifests, load status, and diagnostics. |

## Settings

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/settings/ai` | AI settings. |
| `PUT` | `/api/settings/ai` | Update provider, model, endpoint, API key id, timeout, and narration flag. |
| `GET` | `/api/settings/api-keys` | List API‑key fields (masked). |
| `PUT` | `/api/settings/api-keys/{id}` | Set/clear a key value. |
| `POST` | `/api/settings/notifications/test/{channel}` | Send a test notification (`desktop`/`telegram`/`email`). |

## Events (WebSocket)

| Protocol | Path | Description |
|----------|------|-------------|
| `WS` | `/ws/events` | Push stream of backend events (signal updates, alert firings, paper fills) via the `BackendEventBus`. |

---

[← AI narration](05-ai-narration.md) · [Technical index](README.md) · [Next: Frontend →](07-frontend.md)
