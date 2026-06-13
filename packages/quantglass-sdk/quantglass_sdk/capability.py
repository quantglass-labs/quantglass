# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Provider capability vocabulary and the structural registrar contract.

The SDK never imports the host application. ``ProviderRegistrar`` is a
structural Protocol describing only what an extension needs from the host's
provider manager, so the real ``ProviderManager`` satisfies it without the SDK
depending on it.
"""

from __future__ import annotations

from typing import Any, Literal, Protocol

Capability = Literal["ohlcv", "order_book", "news", "trading", "ai"]


class ProviderRegistrar(Protocol):
    """The subset of the host provider manager an extension calls into."""

    def register(
        self,
        name: str,
        capabilities: set[Capability],
        client: Any | None = ...,
        transport: Literal["public", "keyed", "internal"] = ...,
        label: str | None = ...,
        source: Literal["builtin", "custom", "extension"] = ...,
        base_url: str | None = ...,
        auth_type: str | None = ...,
        profile_configured: bool | None = ...,
        adapter_status: Literal["available", "profile_only"] = ...,
        notes: str | None = ...,
    ) -> None: ...
