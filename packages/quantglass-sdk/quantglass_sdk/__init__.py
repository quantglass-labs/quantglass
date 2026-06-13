# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Stable authoring surface for QuantGlass extensions.

Extension authors import everything from this package:

    from quantglass_sdk import ExtensionManifest, StrategyDefinition, ...

Names exported here follow the SDK versioning promise: additions bump the
minor version; removals or signature changes bump the major version and are
announced in the changelog. Submodules may reorganize without notice; this
package keeps re-exporting the public names.
"""

from quantglass_sdk.base import (
    ExtensionCapability,
    ExtensionContext,
    ExtensionManifest,
    ExtensionPermission,
    ExtensionSetting,
    ExtensionSettingType,
    QuantGlassExtension,
)
from quantglass_sdk.capability import Capability, ProviderRegistrar
from quantglass_sdk.contracts import (
    BacktestModelPlugin,
    DataQualityPlugin,
    IndicatorPlugin,
    StrategyCandidate,
    StrategyPlugin,
)
from quantglass_sdk.definitions import (
    ExtensionSurfaceDefinition,
    IndicatorDefinition,
    LessonPackDefinition,
    MissionPackDefinition,
    StrategyDefinition,
)

SDK_VERSION = "0.3.0"

__all__ = [
    "SDK_VERSION",
    "BacktestModelPlugin",
    "Capability",
    "DataQualityPlugin",
    "ExtensionCapability",
    "ExtensionContext",
    "ExtensionManifest",
    "ExtensionPermission",
    "ExtensionSetting",
    "ExtensionSettingType",
    "ExtensionSurfaceDefinition",
    "IndicatorDefinition",
    "IndicatorPlugin",
    "LessonPackDefinition",
    "MissionPackDefinition",
    "ProviderRegistrar",
    "QuantGlassExtension",
    "StrategyCandidate",
    "StrategyDefinition",
    "StrategyPlugin",
]
