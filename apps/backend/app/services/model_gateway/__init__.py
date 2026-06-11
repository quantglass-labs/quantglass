# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Local/API model gateway split into per-provider modules.

Adding a provider family means adding one mixin module and listing it in
``gateway.ModelGateway``; the rest of the app only imports this package.
"""

from app.services.model_gateway.gateway import ModelGateway
from app.services.model_gateway.models import (
    KEY_REQUIRED_PROVIDERS,
    LOCAL_OPENAI_COMPATIBLE_PROVIDERS,
    OPENAI_COMPATIBLE_PROVIDERS,
    ModelCatalog,
    ModelResponse,
)

__all__ = [
    "KEY_REQUIRED_PROVIDERS",
    "LOCAL_OPENAI_COMPATIBLE_PROVIDERS",
    "OPENAI_COMPATIBLE_PROVIDERS",
    "ModelCatalog",
    "ModelGateway",
    "ModelResponse",
]
