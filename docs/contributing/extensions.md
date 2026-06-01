# QuantGlass Extensions

QuantGlass extensions let contributors add provider adapters, AI model gateways,
indicators, strategies, and notification channels without changing the core app
first.

## Extension model

Backend extensions are Python packages that expose a `quantglass.extensions`
entry point. Loading external packages executes Python code, so QuantGlass keeps
entry-point loading disabled by default.

Enable installed extensions explicitly:

```bash
QUANTGLASS_ENABLE_EXTENSION_ENTRY_POINTS=true npm run backend:dev
```

The backend reports loaded or inactive extensions at:

```text
GET /api/extensions/registry
GET /api/extensions/registry/{extension_id}
GET /api/extensions/registry/{extension_id}/health
GET /api/extensions/registry/{extension_id}/settings
PUT /api/extensions/registry/{extension_id}/settings
GET /api/extensions/strategies
GET /api/extensions/indicators
```

## Minimal package shape

```toml
[project]
name = "quantglass-example-extension"
version = "0.1.0"
dependencies = ["quantglass-backend"]

[project.entry-points."quantglass.extensions"]
example = "quantglass_example.extension:ExampleExtension"
```

```python
from app.extensions.base import ExtensionContext, ExtensionManifest, ExtensionSetting


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
                key="enabled",
                label="Enabled",
                type="boolean",
                default=False,
            ),
        ),
    )

    def register(self, context: ExtensionContext) -> None:
        context.register_provider("example_provider", {"ohlcv"})

    def health(self) -> dict[str, object]:
        return {"status": "ok"}
```

See [`examples/extensions/example_extension.py`](../../examples/extensions/example_extension.py)
for a complete minimal extension.

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

| Field | Purpose |
|-------|---------|
| `id` | Stable extension id used in settings and diagnostics. |
| `capabilities` | Contribution surface such as `market_data`, `strategy`, `indicator`, `ai_model`, `notification`, or `trading`. |
| `permissions` | Declares sensitive access: `read_market_data`, `write_state`, `network_access`, `read_secrets`, `submit_orders`, `render_ui`, `run_model`. |
| `settings` | Generic settings schema rendered by the backend and UI. |
| `homepage` | Optional project/docs URL. |

Permissions are declarative in this stage. They make extension risk visible to
users and maintainers before deeper sandboxing is added.

## Registry surfaces

- `StrategyRegistry` exposes built-in and extension strategy definitions.
- `IndicatorRegistry` exposes deterministic feature definitions.
- `ProviderManager` exposes market/news/trading/AI providers.
- `ExtensionRegistry` exposes manifests, settings schema, diagnostics, and
  health.

## Acceptance checklist

- Extension declares a stable `ExtensionManifest.id`.
- External network calls have timeouts.
- Secrets are read from QuantGlass settings or environment, never logged.
- Data returned to the core app is normalized to QuantGlass contracts.
- Tests cover malformed inputs and unavailable upstream services.
- Docs describe installation, configuration, costs, and redistribution limits.
