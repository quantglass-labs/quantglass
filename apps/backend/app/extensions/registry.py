# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from importlib.metadata import EntryPoint, entry_points
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from types import ModuleType
from collections.abc import Callable
from typing import Any

from app.extensions.base import ExtensionContext, ExtensionManifest, QuantGlassExtension
from app.providers.manager import ProviderManager


@dataclass(slots=True)
class ExtensionRecord:
    manifest: ExtensionManifest
    loaded: bool
    enabled: bool = False
    diagnostics: list[str] = field(default_factory=list)
    health: dict[str, object] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            **asdict(self.manifest),
            "capabilities": list(self.manifest.capabilities),
            "permissions": list(self.manifest.permissions),
            "settings": [asdict(item) for item in self.manifest.settings],
            "loaded": self.loaded,
            "enabled": self.enabled,
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
    surface_registry: Any | None = None,
    extension_settings_provider: Any | None = None,
    enable_entry_points: bool = False,
    extension_paths: tuple[Path, ...] = (),
) -> ExtensionRegistry:
    registry = ExtensionRegistry()
    if not enable_entry_points:
        registry.register_record(
            ExtensionRecord(
                manifest=ExtensionManifest(
                    id="python-entry-points",
                    name="Python entry point extensions",
                    version="0",
                    description="External quantglass.extensions packages and local extension files are available only when explicitly enabled.",
                    capabilities=(),
                ),
                loaded=False,
                enabled=False,
                diagnostics=["Set QUANTGLASS_ENABLE_EXTENSION_ENTRY_POINTS=true or run npm run backend:dev:extensions to load trusted local extension files and installed extension packages."],
                health={"status": "disabled", "loaded": False},
            )
        )
        return registry

    for entry_point in _extension_entry_points():
        registry.register_record(
            _load_extension(
                entry_point.name,
                entry_point.load,
                provider_manager,
                strategy_registry,
                indicator_registry,
                surface_registry,
                extension_settings_provider,
            )
        )
    for extension_path in _local_extension_files(extension_paths):
        registry.register_record(
            _load_extension(
                extension_path.stem,
                lambda path=extension_path: _load_local_extension(path),
                provider_manager,
                strategy_registry,
                indicator_registry,
                surface_registry,
                extension_settings_provider,
            )
        )
    return registry


def _extension_entry_points() -> list[EntryPoint]:
    selected = entry_points(group="quantglass.extensions")
    return list(selected)


def _local_extension_files(extension_paths: tuple[Path, ...]) -> list[Path]:
    files: list[Path] = []
    for root in extension_paths:
        if not root.exists() or not root.is_dir():
            continue
        files.extend(
            path
            for path in sorted(root.glob("*.py"))
            if path.name != "__init__.py" and not path.name.startswith("_")
        )
    return files


def _load_local_extension(path: Path) -> Any:
    spec = spec_from_file_location(f"quantglass_local_extension_{path.stem}", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load local extension module {path}")
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return _extension_from_module(module)


def _extension_from_module(module: ModuleType) -> Any:
    if hasattr(module, "extension"):
        return getattr(module, "extension")
    if hasattr(module, "Extension"):
        return getattr(module, "Extension")
    raise RuntimeError("Local extension must expose `extension` or `Extension`.")


def _load_extension(
    name: str,
    loader: Callable[[], Any],
    provider_manager: ProviderManager,
    strategy_registry: Any | None,
    indicator_registry: Any | None,
    surface_registry: Any | None,
    extension_settings_provider: Any | None,
) -> ExtensionRecord:
    try:
        extension = loader()
        extension_instance: QuantGlassExtension = extension() if isinstance(extension, type) else extension
        manifest = extension_instance.manifest
        extension_settings = (
            extension_settings_provider(manifest.id)
            if callable(extension_settings_provider)
            else {}
        )
        enabled = bool(extension_settings.get("enabled", False))
        context = ExtensionContext(
            provider_manager=provider_manager,
            strategy_registry=strategy_registry,
            indicator_registry=indicator_registry,
            surface_registry=surface_registry,
            extension_id=manifest.id,
            enabled=enabled,
            permissions=manifest.permissions,
        )
        if enabled:
            extension_instance.register(context)
        else:
            context.diagnostics.append("Extension discovered but disabled by settings.")
        health = {
            "status": "ok" if enabled else "disabled",
            "loaded": enabled,
            "enabled": enabled,
        }
        health_method = getattr(extension_instance, "health", None)
        if enabled and callable(health_method):
            custom_health = health_method()
            if isinstance(custom_health, dict):
                health = custom_health
        return ExtensionRecord(
            manifest=manifest,
            loaded=enabled,
            enabled=enabled,
            diagnostics=context.diagnostics,
            health=health,
        )
    except Exception as exc:  # pragma: no cover - defensive boundary for third-party code
        return ExtensionRecord(
            manifest=ExtensionManifest(
                id=name,
                name=name,
                version="unknown",
                description="Extension failed during import or registration.",
                capabilities=(),
            ),
            loaded=False,
            enabled=False,
            diagnostics=[str(exc)],
            health={"status": "error", "loaded": False},
        )
