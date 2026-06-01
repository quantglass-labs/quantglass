# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from app.core.config import ProviderSettings
from app.extensions.registry import load_extension_registry
from app.providers.manager import ProviderManager


def test_external_entry_points_are_disabled_by_default() -> None:
    registry = load_extension_registry(ProviderManager(ProviderSettings()))
    items = registry.items()

    assert items[0]["id"] == "python-entry-points"
    assert items[0]["loaded"] is False
    assert "QUANTGLASS_ENABLE_EXTENSION_ENTRY_POINTS" in items[0]["diagnostics"][0]
