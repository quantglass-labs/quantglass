# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes.extensions import router as extensions_router
from app.core.config import ProviderSettings
from app.extensions.base import ExtensionContext, ExtensionManifest, ExtensionSetting
from app.extensions.registry import ExtensionRecord, ExtensionRegistry, load_extension_registry
from app.extensions.validation import validate_candles
from app.providers.manager import ProviderManager
from app.services.extension_surface_registry import ExtensionSurfaceRegistry
from app.services.strategy_registry import StrategyDefinition, StrategyRegistry


class _StateStore:
    def __init__(self) -> None:
        self.settings: dict[str, dict[str, object]] = {}

    def get_extension_settings(self, extension_id: str) -> dict[str, object]:
        return self.settings.get(extension_id, {})

    def update_extension_settings(
        self,
        extension_id: str,
        settings: dict[str, object],
    ) -> dict[str, object]:
        self.settings[extension_id] = settings
        return settings


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
                        key="api_key",
                        label="API key",
                        type="secret",
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
    assert item["settings"][0]["key"] == "api_key"
    assert item["enabled"] is False
    assert registry.health("demo") == {"status": "ok"}


def test_extension_enable_endpoint_persists_restart_bound_state() -> None:
    registry = ExtensionRegistry()
    registry.register_record(
        ExtensionRecord(
            manifest=ExtensionManifest(
                id="demo",
                name="Demo",
                version="0.1.0",
                description="Demo extension",
            ),
            loaded=False,
        )
    )
    app = FastAPI()
    app.include_router(extensions_router)
    app.state.extension_registry = registry
    app.state.state_store = _StateStore()

    with TestClient(app) as client:
        response = client.put("/api/extensions/registry/demo/enabled", json={"enabled": True})

    assert response.status_code == 200
    assert response.json()["settings"] == {"enabled": True}
    assert response.json()["requiresRestart"] is True


def test_extension_context_blocks_disabled_strategy_registration() -> None:
    strategy_registry = StrategyRegistry()
    context = ExtensionContext(
        provider_manager=ProviderManager(ProviderSettings()),
        strategy_registry=strategy_registry,
        enabled=False,
    )

    context.register_strategy(
        StrategyDefinition(
            id="extension-demo",
            name="Extension Demo",
            description="Demo",
            setup_types=("demo",),
            direction="long",
            source="extension",
            extension_id="demo",
        )
    )

    assert strategy_registry.get("extension-demo") is None
    assert context.diagnostics == ["Strategy registration skipped because extension is disabled."]


def test_extension_context_requires_network_permission_for_external_provider() -> None:
    provider_manager = ProviderManager(ProviderSettings())
    context = ExtensionContext(
        provider_manager=provider_manager,
        enabled=True,
        permissions=("read_market_data",),
    )

    context.register_provider("extension_public", {"ohlcv"}, transport="public")

    provider_names = {item["name"] for item in provider_manager.get_registry()}
    assert "extension_public" not in provider_names
    assert context.diagnostics == [
        "Provider extension_public registration skipped because extension did not declare network_access."
    ]


def test_extension_context_allows_declared_provider_permissions() -> None:
    provider_manager = ProviderManager(ProviderSettings())
    context = ExtensionContext(
        provider_manager=provider_manager,
        enabled=True,
        permissions=("read_market_data", "network_access"),
    )

    context.register_provider("extension_public", {"ohlcv"}, transport="public")

    provider_names = {item["name"] for item in provider_manager.get_registry()}
    assert "extension_public" in provider_names
    assert context.diagnostics == []


def test_local_extension_file_registers_executable_strategy_indicator_and_surface(tmp_path) -> None:
    extension_file = tmp_path / "local_pack.py"
    extension_file.write_text(
        """
from app.extensions.base import ExtensionManifest
from app.services.extension_surface_registry import ExtensionSurfaceDefinition
from app.services.indicator_registry import IndicatorDefinition
from app.services.strategy_registry import StrategyDefinition

def candidates(context):
    return [{
        "signal": "WATCH",
        "setup_type": "local_extension_setup",
        "direction": "long",
        "reference_price": 100.0,
        "entry_zone": [99.0, 101.0],
        "stop_loss": 95.0,
        "take_profit": [105.0, 108.0, 111.0],
        "confluence_score": 0.7,
    }]

class Extension:
    manifest = ExtensionManifest(
        id="local-pack",
        name="Local Pack",
        version="0.1.0",
        description="Local extension",
        capabilities=("strategy", "indicator", "ui_panel"),
        permissions=("read_market_data", "render_ui"),
    )

    def register(self, context):
        context.register_strategy(StrategyDefinition(
            id="local-extension-strategy",
            name="Local Extension Strategy",
            description="Executable local strategy",
            setup_types=("local_extension_setup",),
            direction="long",
            source="extension",
            extension_id="local-pack",
            candidate_factory=candidates,
        ))
        context.register_indicator(IndicatorDefinition(
            id="local-indicator",
            name="Local Indicator",
            category="extension",
            description="Local indicator",
            inputs=("close",),
            outputs=("local",),
            source="extension",
            extension_id="local-pack",
        ))
        context.register_surface(ExtensionSurfaceDefinition(
            id="local-surface",
            name="Local Surface",
            category="ui_panel",
            description="Local surface",
            source="extension",
            extension_id="local-pack",
        ))
""",
        encoding="utf-8",
    )
    provider_manager = ProviderManager(ProviderSettings())
    strategy_registry = StrategyRegistry()
    surface_registry = ExtensionSurfaceRegistry()
    from app.services.indicator_registry import IndicatorRegistry

    indicator_registry = IndicatorRegistry()
    registry = load_extension_registry(
        provider_manager,
        strategy_registry=strategy_registry,
        indicator_registry=indicator_registry,
        surface_registry=surface_registry,
        extension_settings_provider=lambda extension_id: {"enabled": extension_id == "local-pack"},
        enable_entry_points=True,
        extension_paths=(tmp_path,),
    )

    extension = registry.get("local-pack")
    assert extension is not None
    assert extension["loaded"] is True
    strategy = strategy_registry.get("local-extension-strategy")
    assert strategy is not None
    assert strategy.as_dict()["executable"] is True
    assert indicator_registry.get("local-indicator") is not None
    assert any(surface["id"] == "local-surface" for surface in surface_registry.items("ui_panel"))
    candidates = strategy_registry.candidate_setups({"market_type": "crypto", "timeframe": "1h"})
    assert candidates[0]["setup_type"] == "local_extension_setup"
    assert candidates[0]["extension_id"] == "local-pack"


def test_validate_candles_accepts_clean_fixture() -> None:
    diagnostics = validate_candles(
        [
            {
                "open_time_utc": "2026-01-01T00:00:00Z",
                "open": 100.0,
                "high": 102.0,
                "low": 99.0,
                "close": 101.0,
                "volume": 5000.0,
            },
            {
                "open_time_utc": "2026-01-01T00:01:00Z",
                "open": 101.0,
                "high": 103.0,
                "low": 100.0,
                "close": 102.0,
                "volume": 2500.0,
            },
        ]
    )

    assert diagnostics == []


def test_validate_candles_reports_bad_fixture() -> None:
    diagnostics = validate_candles(
        [
            {
                "open_time_utc": "2026-01-01T00:00:00Z",
                "open": 100.0,
                "high": 98.0,
                "low": 99.0,
                "close": 101.0,
                "volume": -1,
            },
            {
                "open_time_utc": "2026-01-01T00:00:00Z",
                "open": "100",
                "high": 101.0,
                "low": 99.0,
                "volume": 10.0,
            },
        ]
    )

    assert "candle[0] high is below low" in diagnostics
    assert "candle[0] volume is negative" in diagnostics
    assert "candle[1] duplicate open_time_utc 2026-01-01T00:00:00Z" in diagnostics
    assert "candle[1] close must be numeric" in diagnostics


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


def _trust_manifest(**overrides):
    defaults = {
        "id": "x",
        "name": "X",
        "version": "1.0",
        "description": "Does things.",
        "capabilities": (),
        "permissions": (),
    }
    defaults.update(overrides)
    return ExtensionManifest(**defaults)


def test_content_only_pack_is_trusted_content():
    from app.extensions.validation import review_extension

    review = review_extension(_trust_manifest(capabilities=("lessons",)), [])
    assert review["level"] == "trusted-content"
    assert "content-only" in review["labels"]


def test_high_risk_permissions_flag_caution():
    from app.extensions.validation import review_extension

    review = review_extension(
        _trust_manifest(capabilities=("trading",), permissions=("submit_orders",)), []
    )
    assert review["level"] == "caution"
    assert "high-risk permissions" in review["labels"]


def test_trading_without_permission_is_finding():
    from app.extensions.validation import review_extension

    review = review_extension(_trust_manifest(capabilities=("trading",)), [])
    assert any("submit_orders" in finding for finding in review["findings"])


def test_rejected_pack_diagnostics_force_caution():
    from app.extensions.validation import review_extension

    review = review_extension(
        _trust_manifest(capabilities=("lessons",)),
        ["Lesson pack x rejected: lesson[0] missing concept"],
    )
    assert review["level"] == "caution"
