# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

import unittest

from fastapi.testclient import TestClient

from app.main import app


class BackendSmokeTests(unittest.TestCase):
    def test_core_backend_routes_respond(self) -> None:
        with TestClient(app) as client:
            health_response = client.get("/health")
            provider_settings_response = client.get("/api/providers/settings")
            api_keys_response = client.get("/api/settings/api-keys")

        self.assertEqual(health_response.status_code, 200)
        self.assertEqual(provider_settings_response.status_code, 200)
        self.assertEqual(api_keys_response.status_code, 200)
        self.assertEqual(health_response.json()["status"], "ok")
        self.assertIn("routes", provider_settings_response.json())
        self.assertIn("items", api_keys_response.json())