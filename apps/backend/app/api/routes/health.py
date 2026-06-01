# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from fastapi import APIRouter, Request

router = APIRouter(tags=["health"])


@router.get("/health")
async def health(request: Request) -> dict[str, object]:
    scheduler = request.app.state.scheduler_service
    analytics_store = request.app.state.analytics_store
    state_store = request.app.state.state_store

    return {
        "service": "quantglass-backend",
        "status": "ok",
        "scheduler": scheduler.status(),
        "storage": {
            "sqlite_path": str(state_store.sqlite_path),
            "analytics": analytics_store.status(),
        },
    }