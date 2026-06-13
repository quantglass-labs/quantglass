# quantglass-sdk

The stable authoring surface for **QuantGlass** extensions. Build providers,
strategies, indicators, and lesson/mission packs against this package alone —
it has zero runtime dependencies and never imports the host application.

```python
from quantglass_sdk import (
    ExtensionManifest, ExtensionContext, QuantGlassExtension,
    StrategyDefinition, IndicatorDefinition,
    LessonPackDefinition, MissionPackDefinition,
)
```

## Install

```bash
pip install quantglass-sdk
```

## What's here

| Symbol | Purpose |
| ------ | ------- |
| `ExtensionManifest`, `ExtensionSetting` | Declare an extension's identity, capabilities, permissions, and settings. |
| `QuantGlassExtension` | The Protocol an extension implements (`register`, `health`). |
| `ExtensionContext` | What the host hands an extension at load time; call `register_*` on it. |
| `StrategyDefinition`, `IndicatorDefinition`, `ExtensionSurfaceDefinition` | Register engine surfaces. |
| `LessonPackDefinition`, `MissionPackDefinition` | Register declarative curriculum content. |
| `StrategyCandidate`, `*Plugin` | Plugin contracts for strategy/indicator/backtest/data-quality surfaces. |
| `Capability`, `ProviderRegistrar` | Provider capability vocabulary and the structural registrar contract. |

The SDK follows a versioning promise: additions bump the minor version;
removals or signature changes bump the major and are announced in the
changelog. `SDK_VERSION` exposes the current version.

## License

AGPL-3.0-or-later. See [LICENSE](LICENSE).
