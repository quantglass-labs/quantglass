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
            extensions_response = client.get("/api/extensions/registry")
            extension_strategies_response = client.get("/api/extensions/strategies")
            extension_indicators_response = client.get("/api/extensions/indicators")
            extension_surfaces_response = client.get("/api/extensions/surfaces")
            extension_backtest_response = client.get("/api/extensions/backtest-models")
            extension_execution_response = client.get("/api/extensions/execution-adapters")
            extension_notifications_response = client.get("/api/extensions/notification-channels")
            extension_import_export_response = client.get("/api/extensions/import-export")
            extension_data_quality_response = client.get("/api/extensions/data-quality")
            extension_ui_panels_response = client.get("/api/extensions/ui-panels")
            api_keys_response = client.get("/api/settings/api-keys")

        self.assertEqual(health_response.status_code, 200)
        self.assertEqual(provider_settings_response.status_code, 200)
        self.assertEqual(extensions_response.status_code, 200)
        self.assertEqual(extension_strategies_response.status_code, 200)
        self.assertEqual(extension_indicators_response.status_code, 200)
        self.assertEqual(extension_surfaces_response.status_code, 200)
        self.assertEqual(extension_backtest_response.status_code, 200)
        self.assertEqual(extension_execution_response.status_code, 200)
        self.assertEqual(extension_notifications_response.status_code, 200)
        self.assertEqual(extension_import_export_response.status_code, 200)
        self.assertEqual(extension_data_quality_response.status_code, 200)
        self.assertEqual(extension_ui_panels_response.status_code, 200)
        self.assertEqual(api_keys_response.status_code, 200)
        self.assertEqual(health_response.json()["status"], "ok")
        self.assertIn("routes", provider_settings_response.json())
        self.assertIn("extensions", extensions_response.json())
        self.assertIn("strategies", extension_strategies_response.json())
        self.assertIn("indicators", extension_indicators_response.json())
        self.assertIn("surfaces", extension_surfaces_response.json())
        self.assertIn("surfaces", extension_backtest_response.json())
        self.assertIn("surfaces", extension_execution_response.json())
        self.assertIn("surfaces", extension_notifications_response.json())
        self.assertIn("surfaces", extension_import_export_response.json())
        self.assertIn("surfaces", extension_data_quality_response.json())
        self.assertIn("surfaces", extension_ui_panels_response.json())
        self.assertIn("items", api_keys_response.json())
