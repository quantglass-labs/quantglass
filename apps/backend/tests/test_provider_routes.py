# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes.providers import router as providers_router
from app.core.config import AiSettings, ProviderSettings, SafetySettings
from app.storage.state_store import StateStore


class _ProviderManager:
    def __init__(self) -> None:
        self.custom_profiles: list[dict[str, object]] = []

    def set_custom_provider_profiles(self, profiles: list[dict[str, object]]) -> None:
        self.custom_profiles = profiles

    def get_registry(self) -> list[dict[str, object]]:
        return [
            {
                "name": profile["id"],
                "label": profile["label"],
                "capabilities": profile["capabilities"],
                "configured": False,
                "transport": "keyed" if profile["authType"] != "none" else "public",
                "source": "custom",
                "adapterStatus": "profile_only",
                "profileConfigured": False,
            }
            for profile in self.custom_profiles
        ]


def test_custom_provider_profile_crud_refreshes_registry(tmp_path) -> None:
    app = FastAPI()
    app.include_router(providers_router)
    app.state.state_store = StateStore(tmp_path / "state.db")
    app.state.state_store.initialize(ProviderSettings(), SafetySettings(), AiSettings())
    app.state.provider_manager = _ProviderManager()

    with TestClient(app) as client:
        create_response = client.post(
            "/api/providers/custom",
            json={
                "label": "Internal Feed",
                "baseUrl": "https://feed.example.test/v1",
                "authType": "bearer",
                "capabilities": ["ohlcv", "news"],
                "enabled": True,
            },
        )
        registry_response = client.get("/api/providers/registry")
        list_response = client.get("/api/providers/custom")
        delete_response = client.delete("/api/providers/custom/custom_internal_feed")

    assert create_response.status_code == 200
    provider = create_response.json()["provider"]
    assert provider["id"] == "custom_internal_feed"
    assert provider["apiKeyId"] == "custom_internal_feed-api-key"
    assert provider["capabilities"] == ["news", "ohlcv"]

    assert registry_response.status_code == 200
    registry = registry_response.json()["providers"]
    assert registry[0]["name"] == "custom_internal_feed"
    assert registry[0]["source"] == "custom"
    assert registry[0]["adapterStatus"] == "profile_only"

    assert list_response.status_code == 200
    assert list_response.json()["providers"][0]["label"] == "Internal Feed"

    assert delete_response.status_code == 200
    assert delete_response.json() == {
        "deleted": True,
        "providerId": "custom_internal_feed",
    }
