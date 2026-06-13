# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Backward-compatible alias for the standalone ``quantglass_sdk`` package.

Prefer importing from ``quantglass_sdk`` directly. This module re-exports the
same public surface so existing ``from app.extensions.sdk import ...`` imports
keep working.
"""

from quantglass_sdk import *  # noqa: F401,F403
from quantglass_sdk import SDK_VERSION, __all__  # noqa: F401
