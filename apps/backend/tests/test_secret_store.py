import json
import sqlite3
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from app.core.config import AiSettings, ProviderSettings, SafetySettings
from app.storage.state_store import StateStore


class SecretStorageTests(unittest.TestCase):
    def test_api_keys_are_not_stored_as_plaintext_in_sqlite(self) -> None:
        with TemporaryDirectory() as tmpdir:
            sqlite_path = Path(tmpdir) / "state.db"
            store = StateStore(sqlite_path)
            store.initialize(ProviderSettings(), SafetySettings(), AiSettings())

            updated_item = store.update_api_key(
                "telegram-bot-token",
                "super-secret-token",
            )
            listed_keys = {
                item["id"]: item["value"]
                for item in store.list_api_keys()
            }

            self.assertEqual(updated_item["value"], "super-secret-token")
            self.assertEqual(listed_keys["telegram-bot-token"], "super-secret-token")

            with sqlite3.connect(sqlite_path) as connection:
                row = connection.execute(
                    "SELECT payload FROM provider_settings WHERE settings_key = ?",
                    ("api_keys",),
                ).fetchone()

            self.assertIsNotNone(row)
            self.assertNotIn("super-secret-token", row[0])

            payload = json.loads(row[0])
            telegram_entry = next(
                item for item in payload if item["id"] == "telegram-bot-token"
            )
            self.assertEqual(telegram_entry["value"], "")

            encrypted_payload = (
                sqlite_path.parent / "secrets" / "api_keys.enc"
            ).read_bytes()
            self.assertNotIn(b"super-secret-token", encrypted_payload)