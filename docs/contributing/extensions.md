# QuantGlass Extensions

QuantGlass extensions let contributors add provider adapters, AI model gateways,
indicators, strategies, and notification channels without changing the core app
first.

> **Where the code lives.** The authoring SDK is the standalone
> [`quantglass-sdk`](https://github.com/quantglass-labs/quantglass-sdk) package (`pip install quantglass-sdk`), and
> runnable templates plus community content packs live in
> [`quantglass-extensions`](https://github.com/quantglass-labs/quantglass-extensions). Build and unit-test an extension there
> against `quantglass_sdk` with no dependency on this repo. This guide explains
> the model; the examples below link into those repos.

## Extension model

Backend extensions can be either:

- Python packages that expose a `quantglass.extensions` entry point.
- Local development files under `extensions/*.py` in the source checkout or
  under the user data `extensions/` directory.

Loading external extension code executes Python inside the backend process, so
QuantGlass keeps extension code loading disabled by default.

Enable installed extensions explicitly:

```bash
npm run backend:dev:extensions
```

The backend reports loaded or inactive extensions at:

```text
GET /api/extensions/registry
GET /api/extensions/registry/{extension_id}
GET /api/extensions/registry/{extension_id}/health
GET /api/extensions/registry/{extension_id}/settings
PUT /api/extensions/registry/{extension_id}/settings
PUT /api/extensions/registry/{extension_id}/enabled
GET /api/extensions/strategies
GET /api/extensions/indicators
```

Installed entry points and local extension files are discovered only when
`QUANTGLASS_ENABLE_EXTENSION_ENTRY_POINTS=true`. Each discovered extension still
stays inactive until its persisted `enabled` setting is set to `true`; changing
that value requires a backend restart because third-party Python packages are
loaded inside the backend process.

For local development, place a file such as
`extensions/community_momentum_pack.py` in the repo. The file must expose either
`extension` or `Extension`. `Extension` may be a class or a factory function.
The Tauri shell passes `QUANTGLASS_WORKSPACE_ROOT` to the backend, so repo-local
extension packs are discoverable from the desktop app during development.

## Minimal package shape

```toml
[project]
name = "quantglass-example-extension"
version = "0.1.0"
dependencies = ["quantglass-backend"]

[project.entry-points."quantglass.extensions"]
example = "quantglass_example.extension:ExampleExtension"
```

`app.extensions.sdk` is the **stable authoring surface**: import every
extension-facing name from there. It carries an `SDK_VERSION` and a
compatibility promise — additions bump the minor version, breaking changes
bump the major version and are announced in the changelog. Internal modules
may reorganize without notice.

```python
from app.extensions.sdk import ExtensionContext, ExtensionManifest, ExtensionSetting


class ExampleExtension:
    manifest = ExtensionManifest(
        id="example-extension",
        name="Example Extension",
        version="0.1.0",
        description="Registers a provider or strategy with QuantGlass.",
        capabilities=("market_data", "strategy"),
        permissions=("read_market_data", "network_access"),
        settings=(
            ExtensionSetting(
                key="base_url",
                label="Base URL",
                type="string",
                default="https://api.example.com",
            ),
        ),
    )

    def register(self, context: ExtensionContext) -> None:
        context.register_provider("example_provider", {"ohlcv"}, transport="public")

    def health(self) -> dict[str, object]:
        return {"status": "ok"}
```

See [`examples/extensions/example_extension.py`](https://github.com/quantglass-labs/quantglass-extensions/blob/main/examples/extensions/example_extension.py)
for a minimal package-style extension, and
[`extensions/community_momentum_pack.py`](../../extensions/community_momentum_pack.py) (also in [quantglass-extensions](https://github.com/quantglass-labs/quantglass-extensions/blob/main/packs/community_momentum_pack.py))
for an executable repo-local strategy/indicator pack.

## Contribution areas

- Market data adapters: candles, quotes, order books, news, fundamentals.
- AI model gateways: local model servers, OpenAI-compatible routers, private
  gateways, domain-specific summarizers.
- Strategy modules: setup detection, risk filters, walk-forward validation.
- Indicators: deterministic technical/market-structure features.
- Backtest plugins: fill models, fee/slippage models, portfolio sizing,
  walk-forward methods, and validation reports.
- Broker/execution plugins: broker adapters and paper/live execution simulators.
- Notifications: Slack, Discord, webhooks, desktop integrations.
- Import/export plugins: CSV, broker statements, TradingView lists, and
  strategy/backtest exports.
- Data-quality plugins: gap checks, stale-feed checks, split/dividend handling,
  duplicate candle detection, and bad-tick filters.
- UI panels/widgets: future extension surface for custom dashboards and chart
  overlays.
- Performance: ingestion batching, cache policies, local analytics, packaging.

## Manifest fields

| Field          | Purpose                                                                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`           | Stable extension id used in settings and diagnostics.                                                                                                                                            |
| `capabilities` | Contribution surface such as `market_data`, `strategy`, `indicator`, `ai_model`, `notification`, `backtest`, `execution`, `import_export`, `data_quality`, `ui_panel`, `lessons`, or `missions`. |
| `permissions`  | Declares sensitive access: `read_market_data`, `write_state`, `network_access`, `read_secrets`, `submit_orders`, `render_ui`, `run_model`.                                                       |
| `settings`     | Generic settings schema rendered by the backend and UI.                                                                                                                                          |
| `homepage`     | Optional project/docs URL.                                                                                                                                                                       |

Permissions are enforced at registration time for sensitive surfaces. Public or
keyed provider registrations require `network_access`; trading providers require
`submit_orders`. Keep permissions narrow so users can evaluate the extension risk
before enabling it.

## Registry surfaces

- `StrategyRegistry` exposes built-in and extension strategy definitions.
  Executable strategies can register a candidate factory; matching candidates
  are consumed by the signal engine and appear in Backtesting presets with their
  strategy source metadata.
- `IndicatorRegistry` exposes deterministic feature definitions.
  Built-in entries distinguish `computed` indicators from broader `catalog`
  targets. Extension indicators should do the same so users know whether the
  indicator is actively used by a service or only advertised as metadata.
- `ProviderManager` exposes market/news/trading/AI providers.
- `ExtensionSurfaceRegistry` exposes backtest, execution, notification,
  import/export, data-quality, and UI-panel surface metadata.
- `ExtensionRegistry` exposes manifests, settings schema, diagnostics, and
  health.

UI panel surfaces are currently metadata only. They are visible in Settings so
contributors can claim and discuss a surface, but QuantGlass does not execute
third-party frontend code yet.

## Runtime contracts

Backend execution contracts live in
`apps/backend/app/extensions/contracts.py`. They define the stable shape for:

- strategy candidates and strategy plugins
- indicator plugins
- backtest/fill-model plugins
- data-quality plugins

Use these protocols for new execution work instead of passing ad hoc dicts
between extensions and core services.

## Fixture validation

Market-data and data-quality extensions should include deterministic candle
fixtures. Validate them locally before opening a pull request:

```bash
PYTHONPATH=apps/backend ./.venv/bin/python apps/backend/scripts/validate_extension_fixture.py path/to/candles.json
```

The fixture may be a JSON candle array or an object with a `candles` array. Each
candle must include `open_time_utc`, `open`, `high`, `low`, `close`, and
`volume`; timestamps must be UTC and strictly increasing.

## Acceptance checklist

- Extension declares a stable `ExtensionManifest.id`.
- Extension defaults to disabled and documents restart requirements.
- Extension declares only the permissions it needs.
- External network calls have timeouts.
- Secrets are read from QuantGlass settings or environment, never logged.
- Data returned to the core app is normalized to QuantGlass contracts.
- Candle fixtures pass `validate_extension_fixture.py` when market data is involved.
- Tests cover malformed inputs and unavailable upstream services.
- Docs describe installation, configuration, costs, and redistribution limits.
