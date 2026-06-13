# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Backward-compatible re-export of the extension base types.

The canonical definitions now live in the standalone ``quantglass_sdk``
package. This module re-exports them so existing in-app imports
(``from app.extensions.base import ...``) keep working.
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

__all__ = [
    "ExtensionCapability",
    "ExtensionContext",
    "ExtensionManifest",
    "ExtensionPermission",
    "ExtensionSetting",
    "ExtensionSettingType",
    "QuantGlassExtension",
]
