# quantglass-sdk — API reference

The complete public surface of `quantglass-sdk` (v0.3.0). Everything here is pure
data and Protocols with **no host imports**, so you can build and unit-test an
extension against this package alone.

For step-by-step, illustrated walkthroughs, see the
[extension guides](https://github.com/quantglass-labs/quantglass-extensions/blob/main/docs/guides/README.md).

```python
from quantglass_sdk import (
    # extension object
    QuantGlassExtension, ExtensionManifest, ExtensionSetting, ExtensionContext,
    # registration definitions
    StrategyDefinition, IndicatorDefinition, ExtensionSurfaceDefinition,
    LessonPackDefinition, MissionPackDefinition,
    # executable contracts
    StrategyCandidate, StrategyPlugin, IndicatorPlugin,
    BacktestModelPlugin, DataQualityPlugin,
    # providers & vocabularies
    Capability, ProviderRegistrar,
    ExtensionCapability, ExtensionPermission, ExtensionSettingType,
    SDK_VERSION,
)
from quantglass_sdk.validation import validate_candles, REQUIRED_CANDLE_FIELDS
```

> **Note:** `validate_candles` / `REQUIRED_CANDLE_FIELDS` live in
> `quantglass_sdk.validation` (not re-exported at the top level).

---

## The extension object

### `QuantGlassExtension` (Protocol)

What every extension implements. It is a structural Protocol — no base class to
inherit.

```python
class QuantGlassExtension(Protocol):
    manifest: ExtensionManifest
    def register(self, context: ExtensionContext) -> None: ...
    def health(self) -> dict[str, object]: ...
```

### `ExtensionManifest`

Identity and declared surface — read by the host *before* the extension loads.

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `id` | `str` | — | Unique extension id. |
| `name` | `str` | — | Display name. |
| `version` | `str` | — | Your extension's version. |
| `description` | `str` | — | One line. |
| `capabilities` | `tuple[ExtensionCapability, ...]` | `()` | What it provides. |
| `permissions` | `tuple[ExtensionPermission, ...]` | `()` | What the host must grant. |
| `settings` | `tuple[ExtensionSetting, ...]` | `()` | User-editable config. |
| `homepage` | `str \| None` | `None` | |

### `ExtensionSetting`

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `key` | `str` | — | Stable identifier. |
| `label` | `str` | — | Shown in Settings. |
| `type` | `ExtensionSettingType` | — | See vocabulary. |
| `description` | `str` | `""` | |
| `required` | `bool` | `False` | |
| `default` | `str \| int \| float \| bool \| None` | `None` | |
| `options` | `tuple[str, ...]` | `()` | For `type="select"`. |

---

## `ExtensionContext`

What the host hands `register()`. You call `register_*` on it; each call routes to a
host registry (or records a diagnostic when that registry is absent — useful in
tests).

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `provider_manager` | `ProviderRegistrar` | — | **Required.** |
| `strategy_registry` | `Any \| None` | `None` | |
| `indicator_registry` | `Any \| None` | `None` | |
| `surface_registry` | `Any \| None` | `None` | |
| `lesson_pack_registry` | `Any \| None` | `None` | |
| `mission_pack_registry` | `Any \| None` | `None` | |
| `extension_id` | `str` | `"unknown"` | |
| `enabled` | `bool` | `True` | Gates every `register_*`. |
| `permissions` | `tuple[ExtensionPermission, ...]` | `()` | Enforced on registration. |
| `diagnostics` | `list[str]` | `[]` | Skipped/rejected reasons collect here. |

### Methods

```python
register_provider(name: str, capabilities: set[Capability],
                  client: Any | None = None,
                  transport: Literal["public","keyed","internal"] = "internal") -> None
register_strategy(definition: StrategyDefinition) -> None
register_indicator(definition: IndicatorDefinition) -> None
register_surface(definition: ExtensionSurfaceDefinition) -> None
register_lesson_pack(definition: LessonPackDefinition) -> None    # validates; rejects -> diagnostics
register_mission_pack(definition: MissionPackDefinition) -> None  # validates; rejects -> diagnostics
require_enabled(operation: str) -> bool
require_permission(permission: ExtensionPermission, operation: str) -> bool
```

**Gating:** every `register_*` first checks `enabled`. `register_provider`
additionally requires the `network_access` permission for `public`/`keyed`
transports and `submit_orders` for a `trading` capability. A failed gate **skips**
the registration and appends to `diagnostics` — it never raises.

---

## Vocabularies

### `ExtensionCapability` — manifest capabilities

`market_data` · `news` · `trading` · `strategy` · `indicator` · `ai_model` ·
`notification` · `backtest` · `execution` · `import_export` · `data_quality` ·
`ui_panel` · `lessons` · `missions`

### `ExtensionPermission` — host grants

`read_market_data` · `write_state` · `network_access` · `read_secrets` ·
`submit_orders` · `render_ui` · `run_model`

### `Capability` — provider capabilities

`ohlcv` · `order_book` · `news` · `trading` · `ai`

### `ExtensionSettingType`

`string` · `number` · `boolean` · `select` · `secret`

### Other literals

- `StrategyDirection` = `"long" | "short" | "both"`
- `ExtensionSurfaceCategory` = `"backtest" | "execution" | "notification" | "import_export" | "data_quality" | "ui_panel"`

---

## Registration definitions

### `StrategyDefinition`

| Field | Type | Default |
| --- | --- | --- |
| `id`, `name`, `description` | `str` | — |
| `setup_types` | `tuple[str, ...]` | — |
| `direction` | `StrategyDirection` | — |
| `market_types` | `tuple[str, ...]` | `("crypto", "stocks")` |
| `timeframes` | `tuple[str, ...]` | `("15m", "1h", "4h", "1d")` |
| `source` | `"built-in" \| "extension"` | `"built-in"` |
| `extension_id` | `str \| None` | `None` |
| `candidate_factory` | `Callable[[dict], list[dict]] \| None` | `None` |

`.as_dict()` exposes `"executable": candidate_factory is not None`.

### `IndicatorDefinition`

| Field | Type | Default |
| --- | --- | --- |
| `id`, `name`, `category`, `description` | `str` | — |
| `inputs`, `outputs` | `tuple[str, ...]` | — |
| `maturity` | `"computed" \| "catalog"` | `"catalog"` |
| `families` | `tuple[str, ...]` | `()` |
| `source` | `"built-in" \| "extension"` | `"built-in"` |
| `extension_id` | `str \| None` | `None` |

### `ExtensionSurfaceDefinition`

| Field | Type | Default |
| --- | --- | --- |
| `id`, `name`, `description` | `str` | — |
| `category` | `ExtensionSurfaceCategory` | — |
| `permissions` | `tuple[str, ...]` | `()` |
| `maturity` | `"available" \| "planned"` | `"available"` |
| `source` | `"built-in" \| "extension"` | `"built-in"` |
| `extension_id` | `str \| None` | `None` |

### `LessonPackDefinition` / `MissionPackDefinition`

| Field | Type | Default |
| --- | --- | --- |
| `id`, `title`, `description` | `str` | — |
| `level` *(lessons only)* | `str` | — |
| `lessons` / `missions` | `tuple[dict[str, Any], ...]` | — |
| `source_extension` | `str` | `""` |
| `attribution` | `str` | `""` |

The `lessons` / `missions` dicts are declarative content (see the
[content-pack guide](https://github.com/quantglass-labs/quantglass-extensions/blob/main/docs/guides/content-packs-localization.md)
for their shapes). Packs are validated whole at registration.

---

## Executable contracts

### `StrategyCandidate`

```python
@dataclass
class StrategyCandidate:
    setup_type: str
    signal_type: Literal["BUY_ZONE", "SELL", "HOLD", "WAIT", "WATCH"]
    direction: Literal["long", "short"]
    confidence_hint: float        # a hint; the engine decides what is shown
    reasons: tuple[str, ...]
    metadata: dict[str, Any] = {}
```

### Plugin Protocols

```python
class StrategyPlugin(Protocol):
    def evaluate(self, candles: list[dict], features: dict[str, list[float | None]],
                 context: dict) -> list[StrategyCandidate]: ...

class IndicatorPlugin(Protocol):
    def compute(self, candles: list[dict], context: dict) -> dict[str, list[float | None]]: ...

class BacktestModelPlugin(Protocol):
    def simulate(self, candles: list[dict], entries: list[dict],
                 costs: dict[str, float], context: dict) -> dict: ...

class DataQualityPlugin(Protocol):
    def inspect(self, candles: list[dict], context: dict) -> list[dict]: ...
```

---

## Providers

### `ProviderRegistrar` (Protocol)

The subset of the host's provider manager an extension calls into. The common path
is `context.register_provider(...)`; the full signature:

```python
class ProviderRegistrar(Protocol):
    def register(
        self,
        name: str,
        capabilities: set[Capability],
        client: Any | None = ...,
        transport: Literal["public", "keyed", "internal"] = ...,
        label: str | None = ...,
        source: Literal["builtin", "custom", "extension"] = ...,
        base_url: str | None = ...,
        auth_type: str | None = ...,
        profile_configured: bool | None = ...,
        adapter_status: Literal["available", "profile_only"] = ...,
        notes: str | None = ...,
    ) -> None: ...
```

---

## Validation

```python
from quantglass_sdk.validation import validate_candles, REQUIRED_CANDLE_FIELDS

problems: list[str] = validate_candles(candles)   # [] means clean
```

`REQUIRED_CANDLE_FIELDS` = `("open_time_utc", "open", "high", "low", "close", "volume")`.
`validate_candles` also enforces UTC-parseable, **monotonic, de-duplicated** open
times and numeric OHLCV — the same checker the host uses on ingest.

---

## Versioning

`SDK_VERSION` (currently `"0.3.0"`) exposes the package version. The surface follows
a promise: **additions bump the minor**; **removals or signature changes bump the
major** and are announced in [CHANGELOG.md](../CHANGELOG.md) and the
[release notes](https://github.com/quantglass-labs/quantglass-sdk/releases).

## See also

- [Extension guides](https://github.com/quantglass-labs/quantglass-extensions/blob/main/docs/guides/README.md) — illustrated, end-to-end tutorials.
- [Extension reference docs](https://github.com/quantglass-labs/quantglass-extensions/tree/main/docs) — per-surface contracts, rules, and checklists.

> Educational and research tooling. Nothing here is financial advice.
