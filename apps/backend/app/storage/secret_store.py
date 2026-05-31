from __future__ import annotations

import json
import os
from pathlib import Path

from cryptography.fernet import Fernet


class EncryptedSecretStore:
    def __init__(self, payload_path: Path, key_path: Path) -> None:
        self.payload_path = payload_path
        self.key_path = key_path

    def read_values(self) -> dict[str, str]:
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

    def write_values(self, values: dict[str, str]) -> None:
        self.payload_path.parent.mkdir(parents=True, exist_ok=True)
        encrypted_payload = self._fernet().encrypt(
            json.dumps(values, sort_keys=True).encode("utf-8")
        )
        self.payload_path.write_bytes(encrypted_payload)
        os.chmod(self.payload_path, 0o600)

    def set_value(self, key_id: str, value: str) -> None:
        values = self.read_values()
        if value:
            values[key_id] = value
        else:
            values.pop(key_id, None)
        self.write_values(values)

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