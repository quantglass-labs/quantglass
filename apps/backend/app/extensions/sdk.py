# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Stable authoring surface for QuantGlass extensions.

Extension authors should import everything from this module:

    from app.extensions.sdk import ExtensionManifest, ExtensionSetting, ...

Names exported here follow the SDK versioning promise: additions bump the
minor version, removals or signature changes bump the major version and are
announced in the changelog. Internal modules (``app.extensions.base``, the
registries) may reorganize without notice; this module will keep re-exporting.
"""

from app.extensions.base import (
    ExtensionCapability,
    ExtensionContext,
    ExtensionManifest,
    ExtensionPermission,
    ExtensionSetting,
    ExtensionSettingType,
    QuantGlassExtension,
)
from app.services.extension_surface_registry import ExtensionSurfaceDefinition
from app.services.indicator_registry import IndicatorDefinition
from app.services.lesson_pack_registry import LessonPackDefinition
from app.services.mission_pack_registry import MissionPackDefinition
from app.services.strategy_registry import StrategyDefinition

SDK_VERSION = "0.3.0"

__all__ = [
    "SDK_VERSION",
    "ExtensionCapability",
    "ExtensionContext",
    "ExtensionManifest",
    "ExtensionPermission",
    "ExtensionSetting",
    "ExtensionSettingType",
    "ExtensionSurfaceDefinition",
    "IndicatorDefinition",
    "LessonPackDefinition",
    "MissionPackDefinition",
    "QuantGlassExtension",
    "StrategyDefinition",
]
