# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(tags=["events"])


@router.websocket("/ws/events")
async def events_socket(websocket: WebSocket) -> None:
    await websocket.accept()
    queue = websocket.app.state.event_bus.subscribe()
    try:
        await websocket.send_json(
            {
                "type": "backend.ready",
                "payload": {
                    "message": "QuantGlass backend websocket is online.",
                    "scheduler": websocket.app.state.scheduler_service.status(),
                },
            }
        )
        while True:
            event = await queue.get()
            await websocket.send_json(event)
    except WebSocketDisconnect:
        return
    finally:
        websocket.app.state.event_bus.unsubscribe(queue)