# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

import unittest
from dataclasses import dataclass

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes.settings import router as settings_router
from app.core.config import AiSettings, AppSettings, apply_api_key_settings
from app.services.model_gateway import ModelResponse


@dataclass(frozen=True)
class _NotificationResult:
    delivered: bool
    detail: str


class _NotificationService:
    def send_test_notification(self, channel: str) -> _NotificationResult:
        return _NotificationResult(delivered=channel == "email", detail=f"{channel} test path")


class _ModelGateway:
    def list_models(self, ai_settings: AiSettings):
        return (
            [f"{ai_settings.provider}-model-a", f"{ai_settings.provider}-model-b"],
            True,
            "fake model list",
        )

    def complete(self, ai_settings: AiSettings, prompt: str):
        if not ai_settings.model:
            return None
        return ModelResponse(
            text=f"{ai_settings.model} answered: QuantGlass AI provider test succeeded.",
            source=f"{ai_settings.provider}:{ai_settings.model}",
        )


class _StateStore:
    def __init__(self) -> None:
        self.ai_settings = AiSettings()
        self.api_keys = [
            {
                "id": "finnhub-api-key",
                "label": "Finnhub API Key",
                "value": "secret-token",
                "note": "Enables Finnhub.",
                "tradeEnabled": False,
                "secret": True,
            },
            {
                "id": "smtp-port",
                "label": "SMTP Port",
                "value": "587",
                "note": "SMTP port.",
                "tradeEnabled": False,
                "secret": False,
            },
        ]

    def get_ai_settings(self) -> AiSettings:
        return self.ai_settings

    def update_ai_settings(self, ai_settings: AiSettings) -> AiSettings:
        self.ai_settings = ai_settings
        return ai_settings

    def list_api_keys(self) -> list[dict[str, object]]:
        return self.api_keys

    def update_api_key(self, key_id: str, value: str) -> dict[str, object]:
        for item in self.api_keys:
            if item["id"] == key_id:
                item["value"] = value
                return item
        raise KeyError(key_id)


class _ProviderManager:
    def set_app_settings(self, _settings: object) -> None:
        return None


class SettingsRouteTests(unittest.TestCase):
    def test_apply_api_key_settings_keeps_environment_provider_keys(self) -> None:
        settings = AppSettings(
            alpaca_market_data_key_id="alpaca-env-key",
            alpaca_market_data_secret_key="alpaca-env-secret",
            finnhub_api_key="finnhub-env-key",
            polygon_api_key="polygon-env-key",
            twelvedata_api_key="twelve-env-key",
        )

        runtime_settings = apply_api_key_settings(settings, [])

        self.assertTrue(runtime_settings.enable_alpaca_market_data)
        self.assertEqual(runtime_settings.alpaca_market_data_key_id, "alpaca-env-key")
        self.assertEqual(runtime_settings.alpaca_market_data_secret_key, "alpaca-env-secret")
        self.assertTrue(runtime_settings.enable_finnhub_market_data)
        self.assertEqual(runtime_settings.finnhub_api_key, "finnhub-env-key")
        self.assertTrue(runtime_settings.enable_polygon_market_data)
        self.assertEqual(runtime_settings.polygon_api_key, "polygon-env-key")
        self.assertTrue(runtime_settings.enable_twelvedata_market_data)
        self.assertEqual(runtime_settings.twelvedata_api_key, "twelve-env-key")

    def test_notification_test_endpoint_returns_backend_result(self) -> None:
        app = FastAPI()
        app.include_router(settings_router)
        app.state.notification_service = _NotificationService()

        with TestClient(app) as client:
            response = client.post("/api/settings/notifications/test/email")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "channel": "email",
                "delivered": True,
                "detail": "email test path",
            },
        )

    def test_desktop_notification_test_endpoint_is_supported(self) -> None:
        app = FastAPI()
        app.include_router(settings_router)
        app.state.notification_service = _NotificationService()

        with TestClient(app) as client:
            response = client.post("/api/settings/notifications/test/desktop")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["channel"], "desktop")
        self.assertFalse(response.json()["delivered"])
        self.assertEqual(response.json()["detail"], "desktop test path")

    def test_ai_settings_support_openai_compatible_payload(self) -> None:
        app = FastAPI()
        app.include_router(settings_router)
        app.state.state_store = _StateStore()

        payload = {
            "model": "local-model",
            "cloudEnabled": True,
            "provider": "openai_compatible",
            "baseUrl": "http://127.0.0.1:1234/v1",
            "apiKeyId": "openai-compatible-api-key",
            "temperature": 0.1,
            "maxTokens": 120,
            "requestTimeoutSeconds": 4,
        }

        with TestClient(app) as client:
            response = client.put("/api/settings/ai", json=payload)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["ai"], payload)

    def test_ai_models_endpoint_returns_provider_model_options(self) -> None:
        app = FastAPI()
        app.include_router(settings_router)
        app.state.model_gateway = _ModelGateway()

        with TestClient(app) as client:
            response = client.post(
                "/api/settings/ai/models",
                json={
                    "provider": "ollama",
                    "baseUrl": "http://127.0.0.1:11434",
                    "apiKeyId": None,
                    "requestTimeoutSeconds": 1,
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "provider": "ollama",
                "models": ["ollama-model-a", "ollama-model-b"],
                "modelItems": [
                    {"id": "ollama-model-a", "label": "ollama-model-a"},
                    {"id": "ollama-model-b", "label": "ollama-model-b"},
                ],
                "fetched": True,
                "detail": "fake model list",
                "source": "ollama",
            },
        )

    def test_ai_provider_test_endpoint_returns_generation_sample(self) -> None:
        app = FastAPI()
        app.include_router(settings_router)
        app.state.model_gateway = _ModelGateway()

        with TestClient(app) as client:
            response = client.post(
                "/api/settings/ai/test",
                json={
                    "provider": "ollama",
                    "baseUrl": "http://127.0.0.1:11434",
                    "apiKeyId": None,
                    "requestTimeoutSeconds": 1,
                    "model": "qwen3.6:35b",
                    "temperature": 0.1,
                    "maxTokens": 64,
                },
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["provider"], "ollama")
        self.assertEqual(payload["model"], "qwen3.6:35b")
        self.assertEqual(payload["source"], "ollama:qwen3.6:35b")
        self.assertIn("QuantGlass AI provider test succeeded", payload["sample"])

    def test_ai_provider_test_endpoint_rejects_missing_model(self) -> None:
        app = FastAPI()
        app.include_router(settings_router)
        app.state.model_gateway = _ModelGateway()

        with TestClient(app) as client:
            response = client.post(
                "/api/settings/ai/test",
                json={
                    "provider": "ollama",
                    "baseUrl": "http://127.0.0.1:11434",
                    "apiKeyId": None,
                    "requestTimeoutSeconds": 1,
                    "model": "",
                },
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["detail"], "Select or enter a model before testing the provider.")

    def test_api_keys_endpoint_redacts_secret_values(self) -> None:
        app = FastAPI()
        app.include_router(settings_router)
        app.state.state_store = _StateStore()

        with TestClient(app) as client:
            response = client.get("/api/settings/api-keys")

        self.assertEqual(response.status_code, 200)
        items = {item["id"]: item for item in response.json()["items"]}
        self.assertEqual(items["finnhub-api-key"]["value"], "")
        self.assertTrue(items["finnhub-api-key"]["configured"])
        self.assertEqual(items["smtp-port"]["value"], "587")
        self.assertTrue(items["smtp-port"]["configured"])

    def test_api_key_update_response_redacts_secret_value(self) -> None:
        app = FastAPI()
        app.include_router(settings_router)
        app.state.state_store = _StateStore()
        app.state.provider_manager = _ProviderManager()
        app.state.settings = AppSettings()

        with TestClient(app) as client:
            response = client.put(
                "/api/settings/api-keys/finnhub-api-key", json={"value": "replacement"}
            )

        self.assertEqual(response.status_code, 200)
        item = response.json()["item"]
        self.assertEqual(item["id"], "finnhub-api-key")
        self.assertEqual(item["value"], "")
        self.assertTrue(item["configured"])
