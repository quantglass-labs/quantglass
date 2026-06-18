# Changelog

All notable changes to `quantglass-sdk` are documented here. The SDK follows the
versioning promise in its [README](README.md): **additions bump the minor**;
**removals or signature changes bump the major**.

## [0.3.0]

The stable authoring surface for QuantGlass extensions. Exposes, with zero host
imports:

- **Extension model:** `QuantGlassExtension`, `ExtensionManifest`,
  `ExtensionSetting`, `ExtensionContext`.
- **Registration definitions:** `StrategyDefinition`, `IndicatorDefinition`,
  `ExtensionSurfaceDefinition`, `LessonPackDefinition`, `MissionPackDefinition`.
- **Executable contracts:** `StrategyCandidate`, `StrategyPlugin`, `IndicatorPlugin`,
  `BacktestModelPlugin`, `DataQualityPlugin`.
- **Providers & vocabularies:** `Capability`, `ProviderRegistrar`,
  `ExtensionCapability`, `ExtensionPermission`, `ExtensionSettingType`.
- **Validation:** `quantglass_sdk.validation.validate_candles` /
  `REQUIRED_CANDLE_FIELDS`.
- `SDK_VERSION`.

See the full [API reference](docs/api-reference.md).
