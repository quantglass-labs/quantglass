# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Protocol, runtime_checkable

from quantglass_sdk.capability import Capability, ProviderRegistrar

ExtensionCapability = Literal[
    "market_data",
    "news",
    "trading",
    "strategy",
    "indicator",
    "ai_model",
    "notification",
    "backtest",
    "execution",
    "import_export",
    "data_quality",
    "ui_panel",
    "lessons",
    "missions",
]

ExtensionPermission = Literal[
    "read_market_data",
    "write_state",
    "network_access",
    "read_secrets",
    "submit_orders",
    "render_ui",
    "run_model",
]

ExtensionSettingType = Literal["string", "number", "boolean", "select", "secret"]


@dataclass(frozen=True, slots=True)
class ExtensionSetting:
    key: str
    label: str
    type: ExtensionSettingType
    description: str = ""
    required: bool = False
    default: str | int | float | bool | None = None
    options: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class ExtensionManifest:
    id: str
    name: str
    version: str
    description: str
    capabilities: tuple[ExtensionCapability, ...] = ()
    permissions: tuple[ExtensionPermission, ...] = ()
    settings: tuple[ExtensionSetting, ...] = ()
    homepage: str | None = None


@dataclass(slots=True)
class ExtensionContext:
    provider_manager: ProviderRegistrar
    strategy_registry: Any | None = None
    indicator_registry: Any | None = None
    surface_registry: Any | None = None
    lesson_pack_registry: Any | None = None
    mission_pack_registry: Any | None = None
    extension_id: str = "unknown"
    enabled: bool = True
    permissions: tuple[ExtensionPermission, ...] = ()
    diagnostics: list[str] = field(default_factory=list)

    def require_enabled(self, operation: str) -> bool:
        if self.enabled:
            return True
        self.diagnostics.append(f"{operation} skipped because extension is disabled.")
        return False

    def require_permission(self, permission: ExtensionPermission, operation: str) -> bool:
        if permission in self.permissions:
            return True
        self.diagnostics.append(
            f"{operation} skipped because extension did not declare {permission}."
        )
        return False

    def register_provider(
        self,
        name: str,
        capabilities: set[Capability],
        client: Any | None = None,
        transport: Literal["public", "keyed", "internal"] = "internal",
    ) -> None:
        if not self.require_enabled(f"Provider {name} registration"):
            return
        if transport in {"public", "keyed"} and not self.require_permission(
            "network_access",
            f"Provider {name} registration",
        ):
            return
        if "trading" in capabilities and not self.require_permission(
            "submit_orders",
            f"Provider {name} registration",
        ):
            return
        self.provider_manager.register(
            name=name,
            capabilities=capabilities,
            client=client,
            transport=transport,
            source="extension",
        )

    def register_strategy(self, definition: Any) -> None:
        if not self.require_enabled("Strategy registration"):
            return
        if self.strategy_registry is None:
            self.diagnostics.append("Strategy registry is unavailable.")
            return
        self.strategy_registry.register(definition)

    def register_indicator(self, definition: Any) -> None:
        if not self.require_enabled("Indicator registration"):
            return
        if self.indicator_registry is None:
            self.diagnostics.append("Indicator registry is unavailable.")
            return
        self.indicator_registry.register(definition)

    def register_surface(self, definition: Any) -> None:
        if not self.require_enabled("Extension surface registration"):
            return
        if self.surface_registry is None:
            self.diagnostics.append("Extension surface registry is unavailable.")
            return
        self.surface_registry.register(definition)

    def register_lesson_pack(self, definition: Any) -> None:
        if not self.require_enabled("Lesson pack registration"):
            return
        if self.lesson_pack_registry is None:
            self.diagnostics.append("Lesson pack registry is unavailable.")
            return
        problems = self.lesson_pack_registry.register(definition)
        for problem in problems:
            self.diagnostics.append(f"Lesson pack {definition.id} rejected: {problem}")

    def register_mission_pack(self, definition: Any) -> None:
        if not self.require_enabled("Mission pack registration"):
            return
        if self.mission_pack_registry is None:
            self.diagnostics.append("Mission pack registry is unavailable.")
            return
        problems = self.mission_pack_registry.register(definition)
        for problem in problems:
            self.diagnostics.append(f"Mission pack {definition.id} rejected: {problem}")


@runtime_checkable
class QuantGlassExtension(Protocol):
    manifest: ExtensionManifest

    def register(self, context: ExtensionContext) -> None: ...

    def health(self) -> dict[str, object]: ...
