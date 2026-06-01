# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

router = APIRouter(prefix="/api/extensions", tags=["extensions"])


@router.get("/registry")
async def extension_registry(request: Request) -> dict[str, object]:
    return {
        "extensions": request.app.state.extension_registry.items(),
    }


@router.get("/registry/{extension_id}")
async def extension_detail(extension_id: str, request: Request) -> dict[str, object]:
    extension = request.app.state.extension_registry.get(extension_id)
    if extension is None:
        raise HTTPException(status_code=404, detail="Extension not found")
    return {"extension": extension}


@router.get("/registry/{extension_id}/health")
async def extension_health(extension_id: str, request: Request) -> dict[str, object]:
    health = request.app.state.extension_registry.health(extension_id)
    if health is None:
        raise HTTPException(status_code=404, detail="Extension not found")
    return {"health": health}


class ExtensionSettingsPayload(BaseModel):
    settings: dict[str, Any]


@router.get("/registry/{extension_id}/settings")
async def extension_settings(extension_id: str, request: Request) -> dict[str, object]:
    extension = request.app.state.extension_registry.get(extension_id)
    if extension is None:
        raise HTTPException(status_code=404, detail="Extension not found")
    return {
        "extensionId": extension_id,
        "settings": request.app.state.state_store.get_extension_settings(extension_id),
        "schema": extension.get("settings", []),
    }


@router.put("/registry/{extension_id}/settings")
async def update_extension_settings(
    extension_id: str,
    payload: ExtensionSettingsPayload,
    request: Request,
) -> dict[str, object]:
    extension = request.app.state.extension_registry.get(extension_id)
    if extension is None:
        raise HTTPException(status_code=404, detail="Extension not found")
    settings = request.app.state.state_store.update_extension_settings(
        extension_id,
        payload.settings,
    )
    return {
        "extensionId": extension_id,
        "settings": settings,
        "schema": extension.get("settings", []),
    }


@router.get("/strategies")
async def strategy_registry(request: Request) -> dict[str, object]:
    return {"strategies": request.app.state.strategy_registry.items()}


@router.get("/indicators")
async def indicator_registry(request: Request) -> dict[str, object]:
    return {"indicators": request.app.state.indicator_registry.items()}
