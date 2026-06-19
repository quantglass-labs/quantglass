<!-- SPDX-FileCopyrightText: 2026 QuantGlass contributors -->
<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Network transparency

QuantGlass is local-first. The app, your data, and the Academy run on your
machine; the research lab fetches **public market data for the symbols you
choose to track**, and every other network feature is **opt-in**. This document
is an audited, line-cited breakdown of exactly what touches the network and when,
so you never have to take that claim on faith — you can check it against the
source.

> **Honest framing:** we deliberately do **not** say "fully offline" or "never
> touches the internet." The Academy and your stored data are local; the research
> lab pulls public market data for symbols you track; cloud features are opt-in.
> The table below is the precise version.

## What touches the network

| Feature                | Hosts                                                                                                                  | Default                                     | Trigger                                                                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Public market data** | `api.exchange.coinbase.com`, `api.kraken.com`, `api.gemini.com`, `query1.finance.yahoo.com`                            | **On**, but idle                            | Nothing is fetched until **you add a symbol to track** — there is no seed watchlist                                                               |
| **Keyed market data**  | `data.alpaca.markets`, `finnhub.io`, `api.polygon.io`, `api.twelvedata.com`                                            | **Off**                                     | You add that provider's **API key** in Settings                                                                                                   |
| **Paper trading**      | `paper-api.alpaca.markets`                                                                                             | **Off**                                     | You connect Alpaca paper credentials                                                                                                              |
| **Live trading**       | `api.alpaca.markets`                                                                                                   | **Off** (not enabled in the public preview) | The live endpoint is selected only if you add **live** Alpaca credentials; built-in live order execution is not wired in the preview (paper only) |
| **Cloud AI**           | your chosen provider (OpenAI, Anthropic, Google Gemini, Azure, AWS Bedrock, Vertex, or any OpenAI-compatible endpoint) | **Off**                                     | You enable cloud AI **and** add a key; otherwise AI runs **locally via Ollama**                                                                   |
| **Alerts**             | `api.telegram.org` and/or your own SMTP server                                                                         | **Off**                                     | You configure a Telegram bot or SMTP credentials                                                                                                  |

Out of the box, with nothing tracked and no keys entered, QuantGlass makes **zero
outbound market calls** and runs AI against a **local** model.

## How each row is enforced (source-cited)

### No telemetry, ever

There is no analytics, crash-reporting, or usage SDK anywhere in the app — no
PostHog, Sentry, Segment, Mixpanel, Datadog, Amplitude, or Google Analytics. The
internal "analytics" store is a **local DuckDB of market candles**, not usage
tracking. You can verify the absence by grep:

```bash
grep -rEi "posthog|sentry|segment|mixpanel|datadog|amplitude|google-analytics" apps/ packages/
```

### The backend is loopback-only

The bundled engine binds to `127.0.0.1` and its CORS allow-list contains only
localhost / `tauri://localhost` origins — it is not reachable from another
machine.
See [`apps/backend/app/main.py`](../apps/backend/app/main.py) (the
`allow_origins` list).

### No auto-updater, no launch ping

`apps/desktop/src-tauri/tauri.conf.json` declares **no updater plugin** and no
launch-time network calls. The app does not phone home on start.

### Public market data — on, but idle until you track a symbol

The default providers are Coinbase, Kraken, Gemini, and Yahoo, registered in
[`apps/backend/app/providers/manager.py`](../apps/backend/app/providers/manager.py)
(`_register_defaults`) and implemented in
[`apps/backend/app/providers/public.py`](../apps/backend/app/providers/public.py).
They are _capable_ of fetching immediately, but a fresh install tracks nothing,
so **no request is made until you add a ticker**.

### Keyed providers — off until you add a key

Alpaca, Finnhub, Polygon, and Twelve Data live in
[`apps/backend/app/providers/keyed.py`](../apps/backend/app/providers/keyed.py).
Each is constructed with an API key and stays dormant until you enter one in
Settings.

### Paper is the wired path; live is a deliberate, separate opt-in

The Alpaca provider defines both endpoints explicitly
([`apps/backend/app/providers/keyed.py`](../apps/backend/app/providers/keyed.py)):

```python
PAPER_TRADING_BASE_URL = "https://paper-api.alpaca.markets"
LIVE_TRADING_BASE_URL  = "https://api.alpaca.markets"
```

Paper trading is the supported, wired execution path — the scheduler runs a
paper-only cycle
([`run_paper_cycle`](../apps/backend/app/services/execution_engine.py)), and
**built-in live order execution is not enabled in the public preview**. The live
endpoint above is _selected_ only when you add **live** Alpaca credentials —
distinct trade-enabled key IDs tracked in
[`apps/backend/app/storage/secret_store.py`](../apps/backend/app/storage/secret_store.py)
(`TRADE_ENABLED_KEY_IDS`, the `alpaca-live-*` keys) — and is chosen by the
provider profile at
[`apps/backend/app/providers/manager.py`](../apps/backend/app/providers/manager.py).
**Nothing hits real markets by default.**

### Cloud AI is off by default — local Ollama is the default path

The default AI provider is `ollama`, pointed at a **local** endpoint, with cloud
disabled:

```python
provider: AiProvider = "ollama"
base_url: str = "http://127.0.0.1:11434"
cloud_enabled: bool = False
```

See [`apps/backend/app/core/config.py`](../apps/backend/app/core/config.py). With
cloud off, the coach runs entirely against your local model. Cloud providers
(OpenAI, Anthropic, Gemini, Azure, Bedrock, Vertex, OpenAI-compatible) live in
[`apps/backend/app/services/model_gateway/`](../apps/backend/app/services/model_gateway/)
and are reached only after you enable cloud AI and add a key.

Whatever the provider, AI answers pass a **numeric fact-guard**: the model
narrates only values produced by the engine's read-only tools, so it cannot
invent a number.

### Alerts are off until you configure them

Telegram (`api.telegram.org`) and email (your own SMTP server) delivery is
implemented in
[`apps/backend/app/services/notifications.py`](../apps/backend/app/services/notifications.py)
and only sends once you supply a bot token / chat ID or SMTP credentials.

## Self-host / server mode

If you run the backend in server mode (e.g. Docker) and expose it beyond
localhost, **you** become responsible for the network boundary — see the
"Exposing it beyond localhost" section of the [README](../README.md). The
loopback default above applies to the bundled desktop app.

---

_This document is verified against the source at the paths cited above. If you
find a discrepancy, please open an issue — accuracy here is the whole point._
