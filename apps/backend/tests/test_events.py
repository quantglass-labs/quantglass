# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

import asyncio
import unittest
from types import SimpleNamespace

from fastapi import WebSocketDisconnect

from app.api.routes.events import events_socket
from app.services.event_bus import BackendEventBus


class _DisconnectingWebSocket:
    def __init__(self) -> None:
        self.app = SimpleNamespace(
            state=SimpleNamespace(
                event_bus=BackendEventBus(),
                scheduler_service=SimpleNamespace(status=lambda: {"running": True}),
            )
        )

    async def accept(self) -> None:
        return None

    async def send_json(self, payload: dict[str, object]) -> None:
        raise WebSocketDisconnect()


class EventsRouteTests(unittest.TestCase):
    def test_events_socket_ignores_disconnect_during_ready_message(self) -> None:
        websocket = _DisconnectingWebSocket()

        asyncio.run(events_socket(websocket))

        self.assertEqual(len(websocket.app.state.event_bus._subscribers), 0)