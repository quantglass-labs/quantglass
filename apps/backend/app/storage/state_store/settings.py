# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Settings, API keys, custom provider profiles, and extension settings.

JSON payloads live in the ``provider_settings`` key/value table; secret values
live in the encrypted secret store, never in SQLite rows.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

from app.core.config import AiSettings, ProviderSettings, SafetySettings
from app.storage.secret_store import EncryptedSecretStore
from app.storage.state_store.db import connect
from app.storage.state_store.defaults import (
    CUSTOM_PROVIDER_AUTH_TYPES,
    CUSTOM_PROVIDER_CAPABILITIES,
    DEFAULT_API_KEYS,
    now_iso,
)


class SettingsStore:
    def __init__(self, sqlite_path: Path, secret_store: EncryptedSecretStore) -> None:
        self.sqlite_path = sqlite_path
        self._secret_store = secret_store

    def ensure_schema(self, connection: sqlite3.Connection) -> None:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS provider_settings (
                settings_key TEXT PRIMARY KEY,
                payload TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )

    def ensure_defaults(
        self,
        connection: sqlite3.Connection,
        provider_settings: ProviderSettings,
        safety_settings: SafetySettings,
        ai_settings: AiSettings,
    ) -> None:
        self._ensure_settings_row(connection, "provider_settings", provider_settings.model_dump())
        self._ensure_settings_row(connection, "safety_settings", safety_settings.model_dump())
        self._ensure_settings_row(connection, "ai_settings", ai_settings.model_dump())
        self._ensure_settings_row(connection, "api_keys", DEFAULT_API_KEYS)

    # ------------------------------------------------------------------
    # Provider / safety / AI settings
    # ------------------------------------------------------------------

    def get_provider_settings(self) -> ProviderSettings:
        payload = self._read_settings_payload("provider_settings", ProviderSettings().model_dump())
        normalized_payload = self._normalize_provider_settings_payload(payload)
        if normalized_payload != payload:
            with connect(self.sqlite_path) as connection:
                self._write_settings_payload(
                    connection,
                    "provider_settings",
                    normalized_payload,
                )
                connection.commit()
        return ProviderSettings.model_validate(normalized_payload)

    def get_safety_settings(self) -> SafetySettings:
        return SafetySettings.model_validate(
            self._read_settings_payload("safety_settings", SafetySettings().model_dump())
        )

    def update_provider_settings(
        self,
        provider_settings: ProviderSettings,
        safety_settings: SafetySettings,
    ) -> None:
        with connect(self.sqlite_path) as connection:
            self._write_settings_payload(
                connection,
                "provider_settings",
                provider_settings.model_dump(),
            )
            self._write_settings_payload(
                connection,
                "safety_settings",
                safety_settings.model_dump(),
            )
            connection.commit()

    def get_ai_settings(self) -> AiSettings:
        payload = self._read_settings_payload("ai_settings", AiSettings().model_dump())
        normalized_payload = self._normalize_ai_settings_payload(payload)
        if normalized_payload != payload:
            with connect(self.sqlite_path) as connection:
                self._write_settings_payload(connection, "ai_settings", normalized_payload)
                connection.commit()
        return AiSettings.model_validate(normalized_payload)

    def update_ai_settings(self, ai_settings: AiSettings) -> AiSettings:
        with connect(self.sqlite_path) as connection:
            self._write_settings_payload(
                connection,
                "ai_settings",
                ai_settings.model_dump(),
            )
            connection.commit()
        return ai_settings

    # ------------------------------------------------------------------
    # Custom provider profiles
    # ------------------------------------------------------------------

    def list_custom_provider_profiles(self) -> list[dict[str, Any]]:
        payload = self._read_settings_payload("custom_provider_profiles", [])
        return self._normalize_custom_provider_profiles_payload(payload)

    def upsert_custom_provider_profile(self, profile: dict[str, Any]) -> dict[str, Any]:
        normalized_profile = self._normalize_custom_provider_profile(profile)
        profiles = [
            item
            for item in self.list_custom_provider_profiles()
            if item["id"] != normalized_profile["id"]
        ]
        profiles.append(normalized_profile)
        profiles = sorted(profiles, key=lambda item: item["id"])
        with connect(self.sqlite_path) as connection:
            self._write_settings_payload(connection, "custom_provider_profiles", profiles)
            connection.commit()
        return normalized_profile

    def delete_custom_provider_profile(self, profile_id: str) -> bool:
        normalized_id = self._provider_profile_id(profile_id)
        profiles = self.list_custom_provider_profiles()
        remaining = [item for item in profiles if item["id"] != normalized_id]
        deleted = len(remaining) != len(profiles)
        if deleted:
            with connect(self.sqlite_path) as connection:
                self._write_settings_payload(connection, "custom_provider_profiles", remaining)
                connection.commit()
        return deleted

    # ------------------------------------------------------------------
    # Extension settings
    # ------------------------------------------------------------------

    def get_extensions_enabled(self) -> bool:
        """User preference: load third-party extension packages and local files.

        Read at backend startup (alongside the QUANTGLASS_ENABLE_EXTENSION_ENTRY_POINTS
        env var) so the desktop app can turn extensions on without an env var.
        Takes effect on the next backend start.
        """
        payload = self._read_settings_payload("extensions_enabled", {"enabled": False})
        return bool(payload.get("enabled", False))

    def set_extensions_enabled(self, enabled: bool) -> bool:
        with connect(self.sqlite_path) as connection:
            self._write_settings_payload(
                connection, "extensions_enabled", {"enabled": bool(enabled)}
            )
            connection.commit()
        return bool(enabled)

    def get_extension_settings(self, extension_id: str) -> dict[str, Any]:
        payload = self._read_settings_payload("extension_settings", {})
        item = payload.get(extension_id, {})
        return item if isinstance(item, dict) else {}

    def update_extension_settings(
        self,
        extension_id: str,
        settings: dict[str, Any],
    ) -> dict[str, Any]:
        with connect(self.sqlite_path) as connection:
            payload = self._read_settings_payload("extension_settings", {})
            payload[extension_id] = settings
            self._write_settings_payload(connection, "extension_settings", payload)
            connection.commit()
        return settings

    # ------------------------------------------------------------------
    # API keys (metadata in SQLite, secret values in the secret store)
    # ------------------------------------------------------------------

    def get_api_key_value(self, key_id: str | None) -> str:
        if not key_id:
            return ""
        return self._secret_store.read_values().get(key_id, "")

    def list_api_keys(self) -> list[dict[str, Any]]:
        metadata = self._get_api_key_metadata()
        secret_values = self._secret_store.read_values()
        return [
            {
                **item,
                "value": secret_values.get(item["id"], ""),
            }
            for item in metadata
        ]

    def update_api_key(self, key_id: str, value: str) -> dict[str, Any]:
        api_keys = self._get_api_key_metadata()
        updated_item: dict[str, Any] | None = None
        for item in api_keys:
            if item["id"] == key_id:
                item["value"] = value
                updated_item = item
                break

        if updated_item is None:
            raise KeyError(key_id)

        self._secret_store.set_value(key_id, value)
        return updated_item

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _ensure_settings_row(
        self,
        connection: sqlite3.Connection,
        settings_key: str,
        payload: Any,
    ) -> None:
        existing = connection.execute(
            "SELECT 1 FROM provider_settings WHERE settings_key = ?",
            (settings_key,),
        ).fetchone()
        if existing is None:
            self._write_settings_payload(connection, settings_key, payload)

    def _write_settings_payload(
        self,
        connection: sqlite3.Connection,
        settings_key: str,
        payload: dict[str, Any],
    ) -> None:
        connection.execute(
            """
            INSERT INTO provider_settings (settings_key, payload, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(settings_key) DO UPDATE SET
                payload = excluded.payload,
                updated_at = excluded.updated_at
            """,
            (
                settings_key,
                json.dumps(payload),
                now_iso(),
            ),
        )

    def _read_settings_payload(
        self,
        settings_key: str,
        fallback: dict[str, Any],
    ) -> dict[str, Any]:
        with connect(self.sqlite_path) as connection:
            row = connection.execute(
                "SELECT payload FROM provider_settings WHERE settings_key = ?",
                (settings_key,),
            ).fetchone()
        if row is None:
            return fallback
        return json.loads(row[0])

    def _normalize_provider_settings_payload(
        self,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        normalized = json.loads(json.dumps(payload))

        crypto_route = normalized.get("crypto", {})
        if (
            crypto_route.get("primary") == "ccxt_coinbase"
            and crypto_route.get("secondary") in {"coingecko", None}
            and crypto_route.get("fallback") == "ccxt_kraken"
        ):
            normalized["crypto"] = {
                "primary": "ccxt_coinbase",
                "secondary": "ccxt_kraken",
                "fallback": "gemini",
            }

        stocks_route = normalized.get("stocks", {})
        if stocks_route.get("primary") in {"alpaca", "finnhub", "twelvedata", "polygon"}:
            normalized["stocks"] = {
                "primary": "yahoo_public",
                "secondary": None,
                "fallback": None,
            }

        return normalized

    def _normalize_ai_settings_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        defaults = AiSettings().model_dump()
        normalized = {**defaults, **payload}
        legacy_base_url = payload.get("ollama_base_url")
        if legacy_base_url and not payload.get("base_url"):
            normalized["base_url"] = legacy_base_url
        normalized.pop("ollama_base_url", None)
        if normalized.get("provider") == "openai" and not normalized.get("api_key_id"):
            normalized["api_key_id"] = "openai-api-key"
        if normalized.get("provider") == "anthropic" and not normalized.get("api_key_id"):
            normalized["api_key_id"] = "anthropic-api-key"
        if normalized.get("provider") == "google_gemini" and not normalized.get("api_key_id"):
            normalized["api_key_id"] = "google-gemini-api-key"
        return normalized

    def _provider_profile_id(self, value: Any) -> str:
        raw = str(value or "").strip().lower()
        if raw.startswith("custom_"):
            raw = raw.removeprefix("custom_")
        cleaned = "".join(character if character.isalnum() else "_" for character in raw)
        cleaned = "_".join(part for part in cleaned.split("_") if part)
        fallback = "".join(character if character.isalnum() else "_" for character in now_iso())
        return f"custom_{cleaned or fallback}"

    def _normalize_custom_provider_profile(self, payload: dict[str, Any]) -> dict[str, Any]:
        label = str(payload.get("label") or payload.get("name") or "Custom provider").strip()
        profile_id = self._provider_profile_id(payload.get("id") or label)
        auth_type = str(payload.get("authType") or payload.get("auth_type") or "none")
        if auth_type not in CUSTOM_PROVIDER_AUTH_TYPES:
            auth_type = "none"
        capabilities = [
            str(capability)
            for capability in payload.get("capabilities", [])
            if str(capability) in CUSTOM_PROVIDER_CAPABILITIES
        ]
        if not capabilities:
            capabilities = ["ohlcv"]
        api_key_id = str(payload.get("apiKeyId") or payload.get("api_key_id") or "").strip()
        if auth_type != "none" and not api_key_id:
            api_key_id = f"{profile_id}-api-key"
        return {
            "id": profile_id,
            "label": label,
            "baseUrl": str(payload.get("baseUrl") or payload.get("base_url") or "").strip(),
            "authType": auth_type,
            "apiKeyId": api_key_id or None,
            "apiKeyHeader": str(
                payload.get("apiKeyHeader") or payload.get("api_key_header") or "Authorization"
            ).strip()
            or None,
            "apiKeyQueryParam": str(
                payload.get("apiKeyQueryParam") or payload.get("api_key_query_param") or "apikey"
            ).strip()
            or None,
            "capabilities": sorted(set(capabilities)),
            "enabled": bool(payload.get("enabled", True)),
            "notes": str(payload.get("notes") or "").strip(),
        }

    def _normalize_custom_provider_profiles_payload(self, payload: Any) -> list[dict[str, Any]]:
        if not isinstance(payload, list):
            return []
        normalized: list[dict[str, Any]] = []
        seen: set[str] = set()
        for item in payload:
            if not isinstance(item, dict):
                continue
            profile = self._normalize_custom_provider_profile(item)
            if profile["id"] in seen:
                continue
            seen.add(profile["id"])
            normalized.append(profile)
        return sorted(normalized, key=lambda item: item["id"])

    def _custom_provider_api_key_metadata(self) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        for profile in self.list_custom_provider_profiles():
            if profile["authType"] == "none":
                continue
            items.append(
                {
                    "id": profile["apiKeyId"],
                    "label": f"{profile['label']} API Key",
                    "value": "",
                    "note": f"Bearer/header/query credential for custom provider profile {profile['label']}. Adapter execution still requires a provider extension.",
                    "tradeEnabled": "trading" in profile["capabilities"],
                    "secret": True,
                }
            )
        return items

    def _normalize_api_keys_payload(self, payload: Any) -> list[dict[str, Any]]:
        indexed_payload = (
            {
                item["id"]: item
                for item in payload
                if isinstance(item, dict) and isinstance(item.get("id"), str)
            }
            if isinstance(payload, list)
            else {}
        )

        normalized: list[dict[str, Any]] = []
        for default_item in [*DEFAULT_API_KEYS, *self._custom_provider_api_key_metadata()]:
            raw_item = indexed_payload.get(default_item["id"], {})
            normalized.append(
                {
                    "id": default_item["id"],
                    "label": default_item["label"],
                    "value": raw_item.get("value", default_item["value"])
                    if isinstance(raw_item.get("value", default_item["value"]), str)
                    else default_item["value"],
                    "note": default_item["note"],
                    "tradeEnabled": default_item["tradeEnabled"],
                    "secret": default_item["secret"],
                }
            )
        return normalized

    def _get_api_key_metadata(self) -> list[dict[str, Any]]:
        payload = self._read_settings_payload("api_keys", DEFAULT_API_KEYS)
        normalized_payload = self._normalize_api_keys_payload(payload)
        scrubbed_payload = [{**item, "value": ""} for item in normalized_payload]

        existing_secret_values = self._secret_store.read_values()
        migrated_secret_values = dict(existing_secret_values)
        migrated = False
        for item in normalized_payload:
            if item["value"] and not migrated_secret_values.get(item["id"]):
                migrated_secret_values[item["id"]] = item["value"]
                migrated = True

        if migrated:
            self._secret_store.write_values(migrated_secret_values)

        if payload != scrubbed_payload:
            with connect(self.sqlite_path) as connection:
                self._write_settings_payload(connection, "api_keys", scrubbed_payload)
                connection.commit()

        return scrubbed_payload
