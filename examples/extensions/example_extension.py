# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Example QuantGlass backend extension.

Package this module in a separate Python distribution and expose it with:

    [project.entry-points."quantglass.extensions"]
    example = "your_package.example_extension:ExampleExtension"
"""

from app.extensions.base import ExtensionContext, ExtensionManifest


class ExampleExtension:
    manifest = ExtensionManifest(
        id="example-extension",
        name="Example Extension",
        version="0.1.0",
        description="Registers a placeholder provider for extension development.",
        capabilities=("market_data",),
        homepage="https://github.com/quantglass-labs/quantglass",
    )

    def register(self, context: ExtensionContext) -> None:
        context.register_provider(
            name="example_provider",
            capabilities={"ohlcv"},
            client=None,
            transport="internal",
        )
        context.diagnostics.append("Registered example_provider as an unconfigured OHLCV adapter.")
