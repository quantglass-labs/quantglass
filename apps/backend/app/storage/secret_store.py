# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from __future__ import annotations

import json
import os
from pathlib import Path

from cryptography.fernet import Fernet

try:  # OS keychain is optional; degrade to the encrypted file when unavailable.
    import keyring as _keyring
    from keyring.errors import KeyringError as _KeyringError
except Exception:  # pragma: no cover - import guard
    _keyring = None

    class _KeyringError(Exception):
        pass


# Credential ids that can move money / place real orders. These are routed to the
# OS keychain (Secret Service / macOS Keychain / Windows Credential Manager) when one
# is available, instead of the on-disk encrypted file. Read-only market-data keys stay
# in the encrypted file so a missing keychain never blocks data access.
TRADE_ENABLED_KEY_IDS: frozenset[str] = frozenset(
    {
        "alpaca-trading-key-id",
        "alpaca-trading-secret-key",
        "alpaca-live-key-id",
        "alpaca-live-secret-key",
    }
)


def _is_trade_enabled(key_id: str) -> bool:
    return key_id in TRADE_ENABLED_KEY_IDS or "trading" in key_id or "live-secret" in key_id


class EncryptedSecretStore:
    """At-rest secret storage.

    Trade-enabled credentials are stored in the OS keychain when one is reachable;
    everything else (and trade keys, if no keychain is available) lives in a
    Fernet-encrypted file with 0600 permissions.
    """

    _KEYCHAIN_SERVICE = "QuantGlass"

    def __init__(self, payload_path: Path, key_path: Path) -> None:
        self.payload_path = payload_path
        self.key_path = key_path
        self._keychain_ready = self._probe_keychain()

    # -- backend introspection -------------------------------------------------
    def keychain_available(self) -> bool:
        return self._keychain_ready

    def backend_name(self) -> str:
        if self._keychain_ready and _keyring is not None:
            try:
                return type(_keyring.get_keyring()).__name__
            except Exception:  # pragma: no cover - defensive
                return "os-keychain"
        return "encrypted-file"

    # -- public API (unchanged signatures) ------------------------------------
    def read_values(self) -> dict[str, str]:
        values = self._read_file_values()
        if self._keychain_ready:
            for key_id in TRADE_ENABLED_KEY_IDS:
                stored = self._keychain_get(key_id)
                if stored:
                    values[key_id] = stored
        return values

    def write_values(self, values: dict[str, str]) -> None:
        file_values: dict[str, str] = {}
        for key_id, value in values.items():
            if self._keychain_ready and _is_trade_enabled(key_id):
                self._keychain_set(key_id, value)
            else:
                file_values[key_id] = value
        # Ensure trade keys removed from the payload are also cleared from the keychain.
        if self._keychain_ready:
            for key_id in TRADE_ENABLED_KEY_IDS:
                if not values.get(key_id):
                    self._keychain_set(key_id, "")
        self._write_file_values(file_values)

    def set_value(self, key_id: str, value: str) -> None:
        if self._keychain_ready and _is_trade_enabled(key_id):
            self._keychain_set(key_id, value)
            return
        values = self._read_file_values()
        if value:
            values[key_id] = value
        else:
            values.pop(key_id, None)
        self._write_file_values(values)

    # -- encrypted file backend ------------------------------------------------
    def _read_file_values(self) -> dict[str, str]:
        if not self.payload_path.exists():
            return {}
        encrypted_payload = self.payload_path.read_bytes()
        if not encrypted_payload:
            return {}
        decrypted_payload = self._fernet().decrypt(encrypted_payload)
        payload = json.loads(decrypted_payload.decode("utf-8"))
        if not isinstance(payload, dict):
            return {}
        return {
            key: value
            for key, value in payload.items()
            if isinstance(key, str) and isinstance(value, str)
        }

    def _write_file_values(self, values: dict[str, str]) -> None:
        self.payload_path.parent.mkdir(parents=True, exist_ok=True)
        encrypted_payload = self._fernet().encrypt(
            json.dumps(values, sort_keys=True).encode("utf-8")
        )
        self.payload_path.write_bytes(encrypted_payload)
        os.chmod(self.payload_path, 0o600)

    def _fernet(self) -> Fernet:
        return Fernet(self._load_key())

    def _load_key(self) -> bytes:
        self.key_path.parent.mkdir(parents=True, exist_ok=True)
        if self.key_path.exists():
            return self.key_path.read_bytes().strip()

        key = Fernet.generate_key()
        file_descriptor = os.open(
            self.key_path,
            os.O_WRONLY | os.O_CREAT | os.O_TRUNC,
            0o600,
        )
        with os.fdopen(file_descriptor, "wb") as file_handle:
            file_handle.write(key)
        return key

    # -- keychain backend ------------------------------------------------------
    def _probe_keychain(self) -> bool:
        if _keyring is None:
            return False
        try:
            backend = _keyring.get_keyring()
        except Exception:
            return False
        # The chainer/fail backends signal "no usable OS keychain present".
        backend_name = type(backend).__name__.lower()
        if "fail" in backend_name or "null" in backend_name:
            return False
        return True

    def _keychain_get(self, key_id: str) -> str | None:
        try:
            return _keyring.get_password(self._KEYCHAIN_SERVICE, key_id)
        except _KeyringError:
            return None
        except Exception:  # pragma: no cover - defensive
            return None

    def _keychain_set(self, key_id: str, value: str) -> None:
        try:
            if value:
                _keyring.set_password(self._KEYCHAIN_SERVICE, key_id, value)
            else:
                try:
                    _keyring.delete_password(self._KEYCHAIN_SERVICE, key_id)
                except Exception:
                    pass
        except _KeyringError:
            # Fall back to the encrypted file so the credential is not lost.
            self._keychain_ready = False
            values = self._read_file_values()
            if value:
                values[key_id] = value
            else:
                values.pop(key_id, None)
            self._write_file_values(values)
