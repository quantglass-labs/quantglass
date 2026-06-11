# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Example QuantGlass backend extension.

Package this module in a separate Python distribution and expose it with:

    [project.entry-points."quantglass.extensions"]
    example = "your_package.example_extension:ExampleExtension"
"""

from app.extensions.sdk import (
    ExtensionContext,
    ExtensionManifest,
    ExtensionSetting,
    ExtensionSurfaceDefinition,
    IndicatorDefinition,
    StrategyDefinition,
)


class ExampleExtension:
    manifest = ExtensionManifest(
        id="example-extension",
        name="Example Extension",
        version="0.1.0",
        description="Registers a placeholder provider for extension development.",
        capabilities=("market_data", "strategy", "indicator", "data_quality", "import_export"),
        permissions=("read_market_data", "network_access"),
        settings=(
            ExtensionSetting(
                key="enabled",
                label="Enabled",
                type="boolean",
                description="Controls whether this extension participates in registry routing.",
                default=False,
            ),
            ExtensionSetting(
                key="base_url",
                label="Base URL",
                type="string",
                description="Optional upstream service URL for the example provider.",
                required=False,
            ),
        ),
        homepage="https://github.com/quantglass-labs/quantglass",
    )

    def register(self, context: ExtensionContext) -> None:
        context.register_provider(
            name="example_provider",
            capabilities={"ohlcv"},
            client=None,
            transport="internal",
        )
        context.register_indicator(
            IndicatorDefinition(
                id="example-liquidity-score",
                name="Example Liquidity Score",
                category="liquidity",
                description="Placeholder indicator definition for extension authors.",
                inputs=("close", "volume"),
                outputs=("liquidity_score",),
                source="extension",
                extension_id=self.manifest.id,
            )
        )
        context.register_strategy(
            StrategyDefinition(
                id="example-liquidity-pullback",
                name="Example Liquidity Pullback",
                description="Placeholder strategy definition for extension authors.",
                setup_types=("example_liquidity_pullback",),
                direction="long",
                source="extension",
                extension_id=self.manifest.id,
            )
        )
        context.register_surface(
            ExtensionSurfaceDefinition(
                id="example-data-quality-check",
                name="Example Data Quality Check",
                category="data_quality",
                description="Placeholder diagnostic surface for extension authors.",
                permissions=("read_market_data",),
                source="extension",
                extension_id=self.manifest.id,
            )
        )
        context.register_surface(
            ExtensionSurfaceDefinition(
                id="example-csv-export",
                name="Example CSV Export",
                category="import_export",
                description="Placeholder import/export surface for extension authors.",
                permissions=("read_market_data",),
                source="extension",
                extension_id=self.manifest.id,
            )
        )
        context.diagnostics.append("Registered example_provider as an unconfigured OHLCV adapter.")

    def health(self) -> dict[str, object]:
        return {"status": "ok", "loaded": True}
