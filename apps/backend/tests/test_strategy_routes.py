# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes.strategies import router as strategies_router


class _StateStore:
    def __init__(self) -> None:
        self.items: dict[str, dict[str, object]] = {}

    def list_saved_strategies(self) -> list[dict[str, object]]:
        return list(self.items.values())

    def save_strategy(self, payload: dict[str, object]) -> dict[str, object]:
        self.items[str(payload["id"])] = payload
        return payload

    def delete_saved_strategy(self, strategy_id: str) -> bool:
        return self.items.pop(strategy_id, None) is not None


class StrategyRouteTests(unittest.TestCase):
    def test_saved_strategies_can_be_created_updated_and_deleted(self) -> None:
        app = FastAPI()
        app.include_router(strategies_router)
        app.state.state_store = _StateStore()

        payload = {
            "id": "strategy-1",
            "name": "Breakout",
            "symbolId": "SPY",
            "setupType": "Momentum",
            "timeframe": "1h",
            "savedAt": "2026-06-01T12:00:00Z",
        }

        with TestClient(app) as client:
            create_response = client.post("/api/strategies", json=payload)
            update_response = client.put(
                "/api/strategies/strategy-1",
                json={**payload, "id": "ignored-client-id", "name": "Breakout v2"},
            )
            list_response = client.get("/api/strategies")
            delete_response = client.delete("/api/strategies/strategy-1")
            missing_delete_response = client.delete("/api/strategies/strategy-1")

        self.assertEqual(create_response.status_code, 200)
        self.assertEqual(create_response.json()["item"], payload)
        self.assertEqual(update_response.status_code, 200)
        self.assertEqual(update_response.json()["item"]["id"], "strategy-1")
        self.assertEqual(update_response.json()["item"]["name"], "Breakout v2")
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(len(list_response.json()["items"]), 1)
        self.assertEqual(delete_response.status_code, 200)
        self.assertEqual(delete_response.json(), {"deleted": True, "id": "strategy-1"})
        self.assertEqual(missing_delete_response.status_code, 200)
        self.assertEqual(missing_delete_response.json(), {"deleted": False, "id": "strategy-1"})
