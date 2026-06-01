# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from importlib.metadata import EntryPoint, entry_points
from typing import Any

from app.extensions.base import ExtensionContext, ExtensionManifest, QuantGlassExtension
from app.providers.manager import ProviderManager


@dataclass(slots=True)
class ExtensionRecord:
    manifest: ExtensionManifest
    loaded: bool
    diagnostics: list[str] = field(default_factory=list)
    health: dict[str, object] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            **asdict(self.manifest),
            "capabilities": list(self.manifest.capabilities),
            "permissions": list(self.manifest.permissions),
            "settings": [asdict(item) for item in self.manifest.settings],
            "loaded": self.loaded,
            "diagnostics": self.diagnostics,
            "health": self.health or {"status": "unknown"},
        }


class ExtensionRegistry:
    def __init__(self) -> None:
        self._records: dict[str, ExtensionRecord] = {}

    def register_record(self, record: ExtensionRecord) -> None:
        self._records[record.manifest.id] = record

    def items(self) -> list[dict[str, Any]]:
        return [record.as_dict() for record in sorted(self._records.values(), key=lambda item: item.manifest.id)]

    def get(self, extension_id: str) -> dict[str, Any] | None:
        record = self._records.get(extension_id)
        return record.as_dict() if record else None

    def health(self, extension_id: str) -> dict[str, object] | None:
        record = self._records.get(extension_id)
        if record is None:
            return None
        return record.health or {"status": "unknown", "loaded": record.loaded}


def load_extension_registry(
    provider_manager: ProviderManager,
    strategy_registry: Any | None = None,
    indicator_registry: Any | None = None,
    enable_entry_points: bool = False,
) -> ExtensionRegistry:
    registry = ExtensionRegistry()
    if not enable_entry_points:
        registry.register_record(
            ExtensionRecord(
                manifest=ExtensionManifest(
                    id="python-entry-points",
                    name="Python entry point extensions",
                    version="0",
                    description="External quantglass.extensions packages are available only when explicitly enabled.",
                    capabilities=(),
                ),
                loaded=False,
                diagnostics=["Set QUANTGLASS_ENABLE_EXTENSION_ENTRY_POINTS=true to load installed extension packages."],
                health={"status": "disabled", "loaded": False},
            )
        )
        return registry

    for entry_point in _extension_entry_points():
        registry.register_record(
            _load_entry_point(
                entry_point,
                provider_manager,
                strategy_registry,
                indicator_registry,
            )
        )
    return registry


def _extension_entry_points() -> list[EntryPoint]:
    selected = entry_points(group="quantglass.extensions")
    return list(selected)


def _load_entry_point(
    entry_point: EntryPoint,
    provider_manager: ProviderManager,
    strategy_registry: Any | None,
    indicator_registry: Any | None,
) -> ExtensionRecord:
    try:
        extension = entry_point.load()
        extension_instance: QuantGlassExtension = extension() if isinstance(extension, type) else extension
        context = ExtensionContext(
            provider_manager=provider_manager,
            strategy_registry=strategy_registry,
            indicator_registry=indicator_registry,
        )
        extension_instance.register(context)
        health = {"status": "ok", "loaded": True}
        health_method = getattr(extension_instance, "health", None)
        if callable(health_method):
            custom_health = health_method()
            if isinstance(custom_health, dict):
                health = custom_health
        return ExtensionRecord(
            manifest=extension_instance.manifest,
            loaded=True,
            diagnostics=context.diagnostics,
            health=health,
        )
    except Exception as exc:  # pragma: no cover - defensive boundary for third-party code
        return ExtensionRecord(
            manifest=ExtensionManifest(
                id=entry_point.name,
                name=entry_point.name,
                version="unknown",
                description="Extension failed during import or registration.",
                capabilities=(),
            ),
            loaded=False,
            diagnostics=[str(exc)],
            health={"status": "error", "loaded": False},
        )
