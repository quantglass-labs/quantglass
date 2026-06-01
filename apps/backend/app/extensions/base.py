# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Protocol, runtime_checkable

from app.providers.manager import Capability, ProviderManager

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
    provider_manager: ProviderManager
    strategy_registry: Any | None = None
    indicator_registry: Any | None = None
    surface_registry: Any | None = None
    diagnostics: list[str] = field(default_factory=list)

    def register_provider(
        self,
        name: str,
        capabilities: set[Capability],
        client: Any | None = None,
        transport: Literal["public", "keyed", "internal"] = "internal",
    ) -> None:
        self.provider_manager.register(
            name=name,
            capabilities=capabilities,
            client=client,
            transport=transport,
        )

    def register_strategy(self, definition: Any) -> None:
        if self.strategy_registry is None:
            self.diagnostics.append("Strategy registry is unavailable.")
            return
        self.strategy_registry.register(definition)

    def register_indicator(self, definition: Any) -> None:
        if self.indicator_registry is None:
            self.diagnostics.append("Indicator registry is unavailable.")
            return
        self.indicator_registry.register(definition)

    def register_surface(self, definition: Any) -> None:
        if self.surface_registry is None:
            self.diagnostics.append("Extension surface registry is unavailable.")
            return
        self.surface_registry.register(definition)


@runtime_checkable
class QuantGlassExtension(Protocol):
    manifest: ExtensionManifest

    def register(self, context: ExtensionContext) -> None: ...

    def health(self) -> dict[str, object]: ...
