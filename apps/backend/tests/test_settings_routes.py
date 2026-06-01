# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

import unittest
from dataclasses import dataclass

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes.settings import router as settings_router
from app.core.config import AiSettings


@dataclass(frozen=True)
class _NotificationResult:
    delivered: bool
    detail: str


class _NotificationService:
    def send_test_notification(self, channel: str) -> _NotificationResult:
        return _NotificationResult(delivered=channel == "email", detail=f"{channel} test path")


class _StateStore:
    def __init__(self) -> None:
        self.ai_settings = AiSettings()

    def get_ai_settings(self) -> AiSettings:
        return self.ai_settings

    def update_ai_settings(self, ai_settings: AiSettings) -> AiSettings:
        self.ai_settings = ai_settings
        return ai_settings


class SettingsRouteTests(unittest.TestCase):
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
