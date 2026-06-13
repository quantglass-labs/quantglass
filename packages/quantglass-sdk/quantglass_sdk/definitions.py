# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""The registration contracts an extension produces.

These dataclasses are the stable shapes the host registries consume. They are
pure data with no host imports, so an extension author can build them against
``quantglass_sdk`` alone. The host's registries re-export these names for
internal continuity.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import asdict, dataclass
from typing import Any, Literal

StrategyDirection = Literal["long", "short", "both"]

ExtensionSurfaceCategory = Literal[
    "backtest",
    "execution",
    "notification",
    "import_export",
    "data_quality",
    "ui_panel",
]


@dataclass(frozen=True, slots=True)
class StrategyDefinition:
    id: str
    name: str
    description: str
    setup_types: tuple[str, ...]
    direction: StrategyDirection
    market_types: tuple[str, ...] = ("crypto", "stocks")
    timeframes: tuple[str, ...] = ("15m", "1h", "4h", "1d")
    source: Literal["built-in", "extension"] = "built-in"
    extension_id: str | None = None
    candidate_factory: Callable[[dict[str, Any]], list[dict[str, Any]]] | None = None

    def as_dict(self) -> dict[str, object]:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "setup_types": list(self.setup_types),
            "direction": self.direction,
            "market_types": list(self.market_types),
            "timeframes": list(self.timeframes),
            "source": self.source,
            "extension_id": self.extension_id,
            "executable": self.candidate_factory is not None,
        }


@dataclass(frozen=True, slots=True)
class IndicatorDefinition:
    id: str
    name: str
    category: str
    description: str
    inputs: tuple[str, ...]
    outputs: tuple[str, ...]
    maturity: Literal["computed", "catalog"] = "catalog"
    families: tuple[str, ...] = ()
    source: Literal["built-in", "extension"] = "built-in"
    extension_id: str | None = None

    def as_dict(self) -> dict[str, object]:
        return asdict(self)


@dataclass(frozen=True, slots=True)
class ExtensionSurfaceDefinition:
    id: str
    name: str
    category: ExtensionSurfaceCategory
    description: str
    permissions: tuple[str, ...] = ()
    maturity: Literal["available", "planned"] = "available"
    source: Literal["built-in", "extension"] = "built-in"
    extension_id: str | None = None

    def as_dict(self) -> dict[str, object]:
        return asdict(self)


@dataclass(frozen=True, slots=True)
class LessonPackDefinition:
    id: str
    title: str
    description: str
    level: str
    lessons: tuple[dict[str, Any], ...]
    source_extension: str = ""
    attribution: str = ""


@dataclass(frozen=True, slots=True)
class MissionPackDefinition:
    id: str
    title: str
    description: str
    missions: tuple[dict[str, Any], ...]
    source_extension: str = ""
    attribution: str = ""
