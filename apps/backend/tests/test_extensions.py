# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from app.core.config import ProviderSettings
from app.extensions.base import ExtensionManifest, ExtensionSetting
from app.extensions.registry import ExtensionRecord, ExtensionRegistry
from app.extensions.registry import load_extension_registry
from app.providers.manager import ProviderManager
from app.services.extension_surface_registry import ExtensionSurfaceRegistry


def test_external_entry_points_are_disabled_by_default() -> None:
    registry = load_extension_registry(ProviderManager(ProviderSettings()))
    items = registry.items()

    assert items[0]["id"] == "python-entry-points"
    assert items[0]["loaded"] is False
    assert "QUANTGLASS_ENABLE_EXTENSION_ENTRY_POINTS" in items[0]["diagnostics"][0]


def test_extension_record_serializes_permissions_settings_and_health() -> None:
    registry = ExtensionRegistry()
    registry.register_record(
        ExtensionRecord(
            manifest=ExtensionManifest(
                id="demo",
                name="Demo",
                version="0.1.0",
                description="Demo extension",
                capabilities=("strategy",),
                permissions=("read_market_data",),
                settings=(
                    ExtensionSetting(
                        key="enabled",
                        label="Enabled",
                        type="boolean",
                        default=False,
                    ),
                ),
            ),
            loaded=True,
            health={"status": "ok"},
        )
    )

    item = registry.get("demo")

    assert item is not None
    assert item["permissions"] == ["read_market_data"]
    assert item["settings"][0]["key"] == "enabled"
    assert registry.health("demo") == {"status": "ok"}


def test_extension_surface_registry_exposes_remaining_surfaces() -> None:
    registry = ExtensionSurfaceRegistry()

    categories = {item["category"] for item in registry.items()}

    assert {
        "backtest",
        "execution",
        "notification",
        "import_export",
        "data_quality",
        "ui_panel",
    }.issubset(categories)
    assert registry.items("execution")
