# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Extensions can be enabled from the app, not just the backend environment."""

import tempfile
import unittest
from pathlib import Path

from app.core.config import AiSettings, ProviderSettings, SafetySettings
from app.storage.state_store import StateStore


def _store(path: Path) -> StateStore:
    store = StateStore(path)
    store.initialize(ProviderSettings(), SafetySettings(), AiSettings())
    return store


class ExtensionsEnabledStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.store = _store(Path(self._tmp.name) / "state.db")

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_defaults_to_disabled(self) -> None:
        self.assertFalse(self.store.get_extensions_enabled())

    def test_persists_the_preference(self) -> None:
        self.store.set_extensions_enabled(True)
        self.assertTrue(self.store.get_extensions_enabled())
        # A fresh store over the same db reads the persisted value (survives restart).
        reopened = _store(Path(self._tmp.name) / "state.db")
        self.assertTrue(reopened.get_extensions_enabled())

    def test_can_be_turned_back_off(self) -> None:
        self.store.set_extensions_enabled(True)
        self.store.set_extensions_enabled(False)
        self.assertFalse(self.store.get_extensions_enabled())


if __name__ == "__main__":
    unittest.main()
