# 6. API reference

[← AI narration](05-ai-narration.md) · [Technical index](README.md) · [Next: Frontend →](07-frontend.md)

---

The backend exposes a REST API (JSON), a WebSocket event stream, and an MCP
server. All routes are served from the sidecar's base URL (a free loopback port
at runtime; `http://127.0.0.1:8000` in dev). The machine‑readable spec is at
[docs/openapi/quantglass-backend.openapi.json](../openapi/quantglass-backend.openapi.json)
and can be regenerated with `npm run backend:openapi`.

> CORS is restricted to local dev origins and the Tauri webview (`tauri://localhost`, `http://127.0.0.1:{1420,4173,5173}`, etc.) with credentials disabled. See [Security model](09-security.md#cors).

---

## Health

| Method | Path      | Description                           |
| ------ | --------- | ------------------------------------- |
| `GET`  | `/health` | Liveness + component/provider status. |

## Market

| Method | Path                                              | Description                                      |
| ------ | ------------------------------------------------- | ------------------------------------------------ |
| `GET`  | `/api/market/ranking`                             | Relative‑strength ranking across symbols.        |
| `GET`  | `/api/market/corridor`                            | Corridor overview.                               |
| `GET`  | `/api/market/corridor/diagnostics`                | Integrity diagnostics (gaps, partials, quality). |
| `GET`  | `/api/market/corridor/candles?symbol=&timeframe=` | Closed candles for a symbol/timeframe.           |
| `POST` | `/api/market/corridor/refresh`                    | Force a corridor refresh.                        |

## Signals & content

| Method | Path                                      | Description                                                        |
| ------ | ----------------------------------------- | ------------------------------------------------------------------ |
| `GET`  | `/api/signals`                            | Current signal inventory (`CanonicalSignal[]`, taxonomy fields).   |
| `GET`  | `/api/signals/context`                    | Context signals: regime / structure reads per symbol & timeframe.  |
| `GET`  | `/api/signals/risk`                       | Risk signals: portfolio heat, correlation, invalidation proximity. |
| `GET`  | `/api/signals/calibration`                | Confidence calibration: stated confidence vs realized hit rate.    |
| `GET`  | `/api/signals/narrate?symbol=&timeframe=` | On‑demand model narration for one signal (template fallback).      |
| `GET`  | `/api/news`                               | Aggregated news items.                                             |
| `GET`  | `/api/dashboard/brief`                    | AI daily brief: regimes, top signals, risk warnings, narrated.     |

## AI surfaces

All AI endpoints follow the narration covenant: facts are assembled by the
engine, the model only narrates, every answer is fact‑guarded, and the
`source` field says who spoke (`<model id>`, `template`, `template-fallback`,
`template-guarded`). See [AI narration](05-ai-narration.md).

| Method | Path                        | Description                                                             |
| ------ | --------------------------- | ----------------------------------------------------------------------- |
| `GET`  | `/api/ai/insight/{surface}` | Surface insight for `journal` / `watchlist` / `missions` / `portfolio`. |
| `POST` | `/api/ai/postmortem`        | Narrated debrief of a drill run or a resolved trade (`{kind, facts}`).  |
| `POST` | `/api/copilot/ask`          | QuantGlass Copilot: grounded Q&A over the read‑only tool registry.      |

## Backtests & strategies

| Method   | Path                     | Description                                                                                           |
| -------- | ------------------------ | ----------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/backtests/presets` | Available backtest presets (with honest IS/OOS metrics).                                              |
| `POST`   | `/api/backtests/run`     | Run the workbench: metrics, stress table, Monte Carlo, bias gates, experiment fingerprint, AI review. |
| `GET`    | `/api/strategies`        | List saved strategies.                                                                                |
| `POST`   | `/api/strategies`        | Save a strategy.                                                                                      |
| `PUT`    | `/api/strategies/{id}`   | Update a saved strategy.                                                                              |
| `DELETE` | `/api/strategies/{id}`   | Delete a saved strategy.                                                                              |

## Watchlist

| Method   | Path                      | Description      |
| -------- | ------------------------- | ---------------- |
| `GET`    | `/api/watchlist`          | List entries.    |
| `POST`   | `/api/watchlist`          | Add a symbol.    |
| `DELETE` | `/api/watchlist/{symbol}` | Remove a symbol. |

## Paper & live trading

| Method | Path                                               | Description                                                                                                                                                                                                       |
| ------ | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/paper-account`                               | Account snapshot (balance, buying power, P&L, open positions).                                                                                                                                                    |
| `PUT`  | `/api/paper-account`                               | Replace the account state.                                                                                                                                                                                        |
| `GET`  | `/api/paper-trades`                                | List trade intents (order type, trigger, TIF, status).                                                                                                                                                            |
| `POST` | `/api/paper-trades`                                | Submit a ticket: market/limit/stop, TIF Day/GTC/GTD, trailing %, plan. Constitution‑gated; account guards reject over‑size and opposing positions. Routes to the live broker mapping when live mode is confirmed. |
| `POST` | `/api/paper-trades/{intent_id}/cancel`             | Cancel a pending (working) order.                                                                                                                                                                                 |
| `POST` | `/api/paper-positions/{symbol_id}/close?quantity=` | Close a position at the latest closed price; `quantity` for partial close.                                                                                                                                        |
| `GET`  | `/api/paper-trades/closures`                       | Closure ledger: every exit with PnL, R‑multiple, and exit kind.                                                                                                                                                   |
| `GET`  | `/api/paper-trades/review`                         | Process scores, first‑touch outcomes, decision/outcome 2×2.                                                                                                                                                       |

## Journal & review

| Method | Path                          | Description                                      |
| ------ | ----------------------------- | ------------------------------------------------ |
| `GET`  | `/api/journal`                | Executed trades with plans, scores, notes, tags. |
| `POST` | `/api/journal/{intent_id}`    | Annotate a trade (note + mistake tags).          |
| `GET`  | `/api/review/coach`           | Review coach facts (weekly metrics, detections). |
| `GET`  | `/api/review/coach/narrative` | AI weekly narrative over those facts.            |
| `POST` | `/api/export/dataset`         | Export the research dataset (Parquet/CSV).       |

## Alerts

| Method | Path                   | Description                                                           |
| ------ | ---------------------- | --------------------------------------------------------------------- |
| `GET`  | `/api/alerts`          | List alerts.                                                          |
| `GET`  | `/api/alerts/history`  | Firing history (audit log).                                           |
| `POST` | `/api/alerts`          | Create an alert (deterministic condition grammar).                    |
| `POST` | `/api/alerts/parse-nl` | Parse a natural‑language condition; model proposes, parser validates. |
| `PUT`  | `/api/alerts/{id}`     | Update/pause/re‑arm an alert.                                         |

## Learn, missions & drills

All under `/api/learn`:

| Method       | Path                                                                                          | Description                                                          |
| ------------ | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `GET`        | `/catalog`, `/progress`, `/glossary`, `/reference`                                            | Curriculum catalog, progress, glossary, reference cards.             |
| `GET`/`POST` | `/lesson/{id}`, `/lesson/{id}/check`, `/lesson/{id}/live-exercise`, `/lesson/{id}/live-check` | Lesson content, quizzes, live‑data exercises.                        |
| `POST`       | `/lesson/{id}/tutor`                                                                          | Lesson tutor: ask a question grounded in the lesson.                 |
| `POST`       | `/progress/{lesson_id}/complete`                                                              | Mark a lesson complete (unlocks e.g. order types).                   |
| `GET`        | `/missions`, `/moments`, `/readiness`, `/mastery`, `/analytics`                               | Missions, teachable moments, readiness, mastery, learning analytics. |
| `POST`       | `/missions/{id}/accept`, `/missions/{id}/abandon`                                             | Mission lifecycle.                                                   |
| `GET`/`POST` | `/missions/drills/{category}`, `/missions/drills/{category}/grade`                            | Decision drills + grading (feeds the AI debrief).                    |
| `GET`/`POST` | `/scenarios`, `/scenarios/{id}`, `/scenarios/{id}/grade`                                      | Scenario replays.                                                    |
| `GET`/`POST` | `/review-queue`, `/review-grade`                                                              | Spaced‑repetition review queue.                                      |
| `GET`/`POST` | `/assessment/{level}`, `/certificate/{level}`                                                 | Level assessments and certificates.                                  |

## Constitution

| Method      | Path                           | Description                                |
| ----------- | ------------------------------ | ------------------------------------------ |
| `GET`/`PUT` | `/api/constitution`            | The user's adopted trading rules.          |
| `GET`       | `/api/constitution/compliance` | Compliance report against executed trades. |

## Providers

| Method         | Path                         | Description                                            |
| -------------- | ---------------------------- | ------------------------------------------------------ |
| `GET`/`PUT`    | `/api/providers/settings`    | Provider routing + rate limits.                        |
| `GET`          | `/api/providers/registry`    | Registry status (capabilities, transport, configured). |
| `GET`/`POST`   | `/api/providers/custom`      | Custom provider profiles.                              |
| `PUT`/`DELETE` | `/api/providers/custom/{id}` | Update/remove a custom profile.                        |

## Extensions

| Method      | Path                                     | Description                                                                                                                                                               |
| ----------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`       | `/api/extensions/registry`               | Installed extension manifests, load status, diagnostics.                                                                                                                  |
| `GET`       | `/api/extensions/registry/{id}`          | Single extension manifest and diagnostics.                                                                                                                                |
| `GET`       | `/api/extensions/registry/{id}/health`   | Extension health payload.                                                                                                                                                 |
| `GET`/`PUT` | `/api/extensions/registry/{id}/settings` | Persisted extension settings and settings schema.                                                                                                                         |
| `PUT`       | `/api/extensions/registry/{id}/enabled`  | Persist enable/disable state; restart required.                                                                                                                           |
| `GET`       | `/api/extensions/{surface}`              | Surface listings: `strategies`, `indicators`, `surfaces`, `backtest-models`, `execution-adapters`, `notification-channels`, `import-export`, `data-quality`, `ui-panels`. |

## Settings

| Method      | Path                                         | Description                                                        |
| ----------- | -------------------------------------------- | ------------------------------------------------------------------ |
| `GET`/`PUT` | `/api/settings/ai`                           | AI provider, model, endpoint, API key id, timeout, narration flag. |
| `POST`      | `/api/settings/ai/models`                    | List models available at the configured endpoint.                  |
| `POST`      | `/api/settings/ai/test`                      | Round‑trip test of the configured model.                           |
| `GET`       | `/api/settings/api-keys`                     | List API‑key fields (masked).                                      |
| `PUT`       | `/api/settings/api-keys/{id}`                | Set/clear a key value.                                             |
| `POST`      | `/api/settings/notifications/test/{channel}` | Send a test notification (`desktop`/`telegram`/`email`).           |

## Events (WebSocket)

| Protocol | Path         | Description                                                                                                                                                              |
| -------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `WS`     | `/ws/events` | Push stream of backend events: signal updates, `alert.fired`, `alert.delivery_failed`, paper fills, `paper.position.closed`, `live.trade.submitted`, scheduler warnings. |

## MCP server

| Protocol | Path   | Description                                                                                                                                                                                                                                                                    |
| -------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST`   | `/mcp` | MCP streamable‑HTTP JSON‑RPC (`initialize`, `ping`, `tools/list`, `tools/call`). Strictly read‑only tools: `list_signals`, `list_backtest_presets`, `get_paper_account`, `list_watchlist`, `list_paper_closures`, `get_trade_review`. The in‑app Copilot shares this registry. |

---

[← AI narration](05-ai-narration.md) · [Technical index](README.md) · [Next: Frontend →](07-frontend.md)
