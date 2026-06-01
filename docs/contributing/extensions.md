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
from app.extensions.base import ExtensionContext, ExtensionManifest


class ExampleExtension:
    manifest = ExtensionManifest(
        id="example-extension",
        name="Example Extension",
        version="0.1.0",
        description="Registers a provider or strategy with QuantGlass.",
        capabilities=("market_data",),
    )

    def register(self, context: ExtensionContext) -> None:
        context.register_provider("example_provider", {"ohlcv"})
```

See [`examples/extensions/example_extension.py`](../../examples/extensions/example_extension.py)
for a complete minimal extension.

## Contribution areas

- Market data adapters: candles, quotes, order books, news, fundamentals.
- AI model gateways: local model servers, OpenAI-compatible routers, private
  gateways, domain-specific summarizers.
- Strategy modules: setup detection, risk filters, walk-forward validation.
- Indicators: deterministic technical/market-structure features.
- Notifications: Slack, Discord, webhooks, desktop integrations.
- Performance: ingestion batching, cache policies, local analytics, packaging.

## Acceptance checklist

- Extension declares a stable `ExtensionManifest.id`.
- External network calls have timeouts.
- Secrets are read from QuantGlass settings or environment, never logged.
- Data returned to the core app is normalized to QuantGlass contracts.
- Tests cover malformed inputs and unavailable upstream services.
- Docs describe installation, configuration, costs, and redistribution limits.
