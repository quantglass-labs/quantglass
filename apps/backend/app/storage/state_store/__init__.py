# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Per-domain SQLite stores behind the :class:`StateStore` facade.

Modules:
- ``settings`` — provider/safety/AI settings, API keys, custom providers
- ``watchlist`` — watchlist entries
- ``alerts`` — alert definitions and fire history
- ``strategies`` — saved strategies
- ``trading`` — paper account, positions, trade intents
- ``learn`` — learning progress
- ``facade`` — the composed :class:`StateStore`
"""

from app.storage.state_store.defaults import (
    CUSTOM_PROVIDER_AUTH_TYPES,
    CUSTOM_PROVIDER_CAPABILITIES,
    DEFAULT_API_KEYS,
)
from app.storage.state_store.facade import StateStore

__all__ = [
    "CUSTOM_PROVIDER_AUTH_TYPES",
    "CUSTOM_PROVIDER_CAPABILITIES",
    "DEFAULT_API_KEYS",
    "StateStore",
]
