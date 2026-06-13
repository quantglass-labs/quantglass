# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from __future__ import annotations

from quantglass_sdk import ExtensionSurfaceDefinition
from quantglass_sdk.definitions import ExtensionSurfaceCategory

__all__ = [
    "ExtensionSurfaceCategory",
    "ExtensionSurfaceDefinition",
    "ExtensionSurfaceRegistry",
    "built_in_surfaces",
]


class ExtensionSurfaceRegistry:
    def __init__(self) -> None:
        self._definitions: dict[str, ExtensionSurfaceDefinition] = {}
        for definition in built_in_surfaces():
            self.register(definition)

    def register(self, definition: ExtensionSurfaceDefinition) -> None:
        self._definitions[definition.id] = definition

    def items(self, category: ExtensionSurfaceCategory | None = None) -> list[dict[str, object]]:
        definitions = self._definitions.values()
        if category is not None:
            definitions = [item for item in definitions if item.category == category]
        return [
            definition.as_dict() for definition in sorted(definitions, key=lambda item: item.id)
        ]


def built_in_surfaces() -> tuple[ExtensionSurfaceDefinition, ...]:
    return (
        ExtensionSurfaceDefinition(
            id="fixed-r-ladder-fill-model",
            name="Fixed-R Ladder Fill Model",
            category="backtest",
            description="Built-in backtest fill model using the displayed three-rung take-profit ladder.",
        ),
        ExtensionSurfaceDefinition(
            id="fee-slippage-cost-model",
            name="Fee And Slippage Cost Model",
            category="backtest",
            description="Built-in market-type cost assumptions for fees and slippage.",
        ),
        ExtensionSurfaceDefinition(
            id="paper-execution-simulator",
            name="Paper Execution Simulator",
            category="execution",
            description="Built-in paper execution path for queued trade intents and position marks.",
            permissions=("write_state",),
        ),
        ExtensionSurfaceDefinition(
            id="live-broker-adapter",
            name="Live Broker Adapter",
            category="execution",
            description="Planned adapter surface for live broker execution behind explicit safety gates.",
            permissions=("network_access", "read_secrets", "submit_orders"),
            maturity="planned",
        ),
        ExtensionSurfaceDefinition(
            id="desktop-alerts",
            name="Desktop Alerts",
            category="notification",
            description="Built-in local alert history and desktop-facing event stream.",
            permissions=("write_state",),
        ),
        ExtensionSurfaceDefinition(
            id="telegram-email-alerts",
            name="Telegram And Email Alerts",
            category="notification",
            description="Built-in keyed notification transports for Telegram and SMTP email.",
            permissions=("network_access", "read_secrets"),
        ),
        ExtensionSurfaceDefinition(
            id="state-bundle-export",
            name="State Bundle Export",
            category="import_export",
            description="Built-in backup/export surface for local state bundles.",
            permissions=("read_market_data",),
        ),
        ExtensionSurfaceDefinition(
            id="csv-watchlist-import",
            name="CSV Watchlist Import",
            category="import_export",
            description="Planned import/export surface for CSV watchlists and symbol lists.",
            permissions=("write_state",),
            maturity="planned",
        ),
        ExtensionSurfaceDefinition(
            id="market-integrity-diagnostics",
            name="Market Integrity Diagnostics",
            category="data_quality",
            description="Built-in gap, partial-candle, freshness, and provider diagnostic surface.",
            permissions=("read_market_data",),
        ),
        ExtensionSurfaceDefinition(
            id="corporate-action-quality-checks",
            name="Corporate Action Quality Checks",
            category="data_quality",
            description="Planned split/dividend adjustment and bad-tick validation surface.",
            permissions=("read_market_data", "network_access"),
            maturity="planned",
        ),
        ExtensionSurfaceDefinition(
            id="dashboard-widget-panel",
            name="Dashboard Widget Panel",
            category="ui_panel",
            description="Planned frontend extension surface for dashboard widgets.",
            permissions=("render_ui",),
            maturity="planned",
        ),
        ExtensionSurfaceDefinition(
            id="chart-overlay-panel",
            name="Chart Overlay Panel",
            category="ui_panel",
            description="Planned frontend extension surface for custom chart overlays.",
            permissions=("render_ui",),
            maturity="planned",
        ),
    )
