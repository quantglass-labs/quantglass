# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

import unittest
from dataclasses import dataclass

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes.settings import router as settings_router


@dataclass(frozen=True)
class _NotificationResult:
    delivered: bool
    detail: str


class _NotificationService:
    def send_test_notification(self, channel: str) -> _NotificationResult:
        return _NotificationResult(delivered=channel == "email", detail=f"{channel} test path")


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