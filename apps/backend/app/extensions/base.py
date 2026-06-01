# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Protocol

from app.providers.manager import Capability, ProviderManager

ExtensionCapability = Literal[
    "market_data",
    "news",
    "trading",
    "strategy",
    "indicator",
    "ai_model",
    "notification",
]


@dataclass(frozen=True, slots=True)
class ExtensionManifest:
    id: str
    name: str
    version: str
    description: str
    capabilities: tuple[ExtensionCapability, ...] = ()
    homepage: str | None = None


@dataclass(slots=True)
class ExtensionContext:
    provider_manager: ProviderManager
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


class QuantGlassExtension(Protocol):
    manifest: ExtensionManifest

    def register(self, context: ExtensionContext) -> None: ...
