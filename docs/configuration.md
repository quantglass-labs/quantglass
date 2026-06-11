# QuantGlass Configuration

QuantGlass is local-first. Most settings are stored in the local state database
through the Settings screen, while deployment and development overrides can be
provided with environment variables.

Environment variables use the `QUANTGLASS_` prefix. Nested settings use double
underscores, for example `QUANTGLASS_AI__PROVIDER=ollama`.

## Development Commands

| Command | Purpose |
|---------|---------|
| `npm run backend:dev` | Start the backend on `127.0.0.1:8000` with reload. |
| `npm run backend:dev:extensions` | Start the backend with extension loading enabled. |
| `npm run desktop:dev` | Start the Vite UI against a backend. |
| `npm run desktop:tauri:dev` | Start the Tauri shell. |
| `npm run validate:backend` | Run backend import, tests, smoke, and OpenAPI export. |

## Core Paths

| Environment variable | Default | Notes |
|----------------------|---------|-------|
| `QUANTGLASS_WORKSPACE_ROOT` | Source checkout root | Used to discover repo-local extension packs under `extensions/`. The Tauri shell sets this during desktop development. |
| `QUANTGLASS_DATA_DIR` | `apps/backend/.local` in source, OS app-data in frozen builds | Relocates local state, analytics, parquet, secrets, and user extension packs. |
| `QUANTGLASS_SQLITE_PATH` | `<data_dir>/state/quantglass.db` | Operational state database. |
| `QUANTGLASS_DUCKDB_PATH` | `<data_dir>/analytics/quantglass.duckdb` | Analytics database. |
| `QUANTGLASS_PARQUET_DIR` | `<data_dir>/parquet` | Durable candle archive. |

## Provider Routing

Provider routes can be changed from Settings -> Providers. Environment overrides
are useful for repeatable dev or CI runs.

| Environment variable | Default |
|----------------------|---------|
| `QUANTGLASS_PROVIDER_SETTINGS__CRYPTO__PRIMARY` | `ccxt_coinbase` |
| `QUANTGLASS_PROVIDER_SETTINGS__CRYPTO__SECONDARY` | `ccxt_kraken` |
| `QUANTGLASS_PROVIDER_SETTINGS__CRYPTO__FALLBACK` | `gemini` |
| `QUANTGLASS_PROVIDER_SETTINGS__STOCKS__PRIMARY` | `yahoo_public` |
| `QUANTGLASS_PROVIDER_SETTINGS__NEWS__PRIMARY` | `finnhub_news` |
| `QUANTGLASS_PROVIDER_SETTINGS__AI__PRIMARY` | `ollama` |
| `QUANTGLASS_PROVIDER_SETTINGS__AI__SECONDARY` | `openai` |
| `QUANTGLASS_PROVIDER_SETTINGS__TRADING__PRIMARY` | `alpaca_paper` |
| `QUANTGLASS_PROVIDER_SETTINGS__TRADING__FALLBACK` | `ccxt_trade` |
| `QUANTGLASS_PROVIDER_SETTINGS__CRYPTO_RATE_LIMIT_PER_MINUTE` | `24` |
| `QUANTGLASS_PROVIDER_SETTINGS__STOCKS_RATE_LIMIT_PER_MINUTE` | `58` |

## Market Data Keys

Keys can be saved from Settings -> API Keys. The following environment
variables are also supported and are merged into runtime provider settings when
no stored key is present.

| Environment variable | Enables |
|----------------------|---------|
| `QUANTGLASS_ALPACA_MARKET_DATA_KEY_ID` | Alpaca keyed market data when paired with the secret. |
| `QUANTGLASS_ALPACA_MARKET_DATA_SECRET_KEY` | Alpaca keyed market data when paired with the key id. |
| `QUANTGLASS_FINNHUB_API_KEY` | Finnhub news/data paths. |
| `QUANTGLASS_POLYGON_API_KEY` | Polygon equity candles. |
| `QUANTGLASS_TWELVEDATA_API_KEY` | Twelve Data equity candles. |

## Risk And Safety

| Environment variable | Default | Notes |
|----------------------|---------|-------|
| `QUANTGLASS_SAFETY__TRADING_MODE` | `paper` | `paper` or `live`. Public preview supports paper execution. |
| `QUANTGLASS_SAFETY__ACT_ON_PARTIAL_CANDLES` | `false` | Signals should use closed candles only. |
| `QUANTGLASS_SAFETY__MIN_BACKTEST_SAMPLE` | `50` | Below this count, Backtesting shows instability warnings. |
| `QUANTGLASS_SAFETY__LIVE_TRADING_CONFIRMED` | `false` | Reserved safety gate; public preview does not enable built-in live broker execution. |

## AI Narration

AI settings can be configured from Settings -> AI. The backend supports local
model servers and cloud/API providers through the model gateway.

| Environment variable | Default | Notes |
|----------------------|---------|-------|
| `QUANTGLASS_AI__PROVIDER` | `ollama` | `template`, `ollama`, `lm_studio`, `vllm`, `llama_cpp`, `openai`, `anthropic`, `google_gemini`, `deepseek`, `mistral`, `groq`, `openrouter`, `together`, `azure_openai`, `bedrock`, `vertex`, or `openai_compatible`. |
| `QUANTGLASS_AI__MODEL` | `qwen3:14b-q4_K_M` | Provider model id. |
| `QUANTGLASS_AI__BASE_URL` | `http://127.0.0.1:11434` | Ollama native endpoint or OpenAI-compatible `/v1` base URL. |
| `QUANTGLASS_AI__API_KEY_ID` | unset | Id of the key stored in Settings -> API Keys. |
| `QUANTGLASS_AI__CLOUD_ENABLED` | `false` | Keeps cloud narration opt-in. |
| `QUANTGLASS_AI__TEMPERATURE` | `0.2` | Narration sampling temperature. |
| `QUANTGLASS_AI__MAX_TOKENS` | `180` | Response token cap. |
| `QUANTGLASS_AI__REQUEST_TIMEOUT_SECONDS` | `8.0` | Hard timeout before template fallback. |

Common local configurations:

```bash
# Ollama native API
QUANTGLASS_AI__PROVIDER=ollama
QUANTGLASS_AI__BASE_URL=http://127.0.0.1:11434

# LM Studio or other OpenAI-compatible local server
QUANTGLASS_AI__PROVIDER=lm_studio
QUANTGLASS_AI__BASE_URL=http://127.0.0.1:1234/v1

# Generic OpenAI-compatible gateway
QUANTGLASS_AI__PROVIDER=openai_compatible
QUANTGLASS_AI__BASE_URL=http://127.0.0.1:1234/v1
```

## Extensions

Extension code loading is disabled by default because extensions execute Python
inside the backend process.

| Environment variable | Default | Notes |
|----------------------|---------|-------|
| `QUANTGLASS_ENABLE_EXTENSION_ENTRY_POINTS` | `false` | Enables installed `quantglass.extensions` entry points and local `extensions/*.py` files. |

Local extension discovery paths:

- `<workspace_root>/extensions`
- `<data_dir>/extensions`

Workflow for a local development pack:

1. Add a file under `extensions/*.py` that exposes `Extension` or `extension`.
2. Run `npm run backend:dev:extensions`.
3. Open Settings -> Extensions and enable the discovered extension.
4. Restart the backend so registration runs with the persisted enablement flag.
5. Check Settings -> Extensions for registered strategies, indicators, and
   surfaces.

The sample pack at `extensions/community_momentum_pack.py` registers an
executable strategy, an indicator, and a UI-panel metadata surface.

UI-panel surfaces are discoverable metadata only. QuantGlass does not execute
third-party frontend code yet.

## Precedence

Runtime settings are resolved in this order:

1. Pydantic defaults in `apps/backend/app/core/config.py`.
2. `QUANTGLASS_*` environment variables.
3. Persisted Settings-screen state for provider routes, safety, AI, API keys,
   and extension enablement.

Stored API keys override environment keys when a stored value exists. If no
stored key exists, supported environment keys remain active.

## MCP server

The backend exposes a read-only [Model Context Protocol](https://modelcontextprotocol.io)
endpoint at `POST http://127.0.0.1:8000/mcp` (streamable HTTP transport).
Tools: `list_signals`, `list_backtest_presets`, `get_paper_account`,
`list_watchlist`. Point an MCP client at the URL while the backend is
running, e.g. for Claude Code:

```bash
claude mcp add --transport http quantglass http://127.0.0.1:8000/mcp
```

The server never exposes secrets and accepts no write operations. All data
is educational decision support, not financial advice.
