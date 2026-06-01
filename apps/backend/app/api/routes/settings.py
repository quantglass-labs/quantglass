# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.core.config import AiProvider, AiSettings, apply_api_key_settings

router = APIRouter(prefix="/api/settings", tags=["settings"])


class AiSettingsPayload(BaseModel):
    model: str
    cloudEnabled: bool
    provider: AiProvider = "ollama"
    baseUrl: str = "http://127.0.0.1:11434"
    apiKeyId: str | None = None
    temperature: float = 0.2
    maxTokens: int = 180
    requestTimeoutSeconds: float = 8.0


class ApiKeyPayload(BaseModel):
    value: str


SUPPORTED_NOTIFICATION_CHANNELS = {"desktop", "telegram", "email"}


def serialize_ai_settings(ai_settings: AiSettings) -> dict[str, object]:
    return {
        "model": ai_settings.model,
        "cloudEnabled": ai_settings.cloud_enabled,
        "provider": ai_settings.provider,
        "baseUrl": ai_settings.base_url,
        "apiKeyId": ai_settings.api_key_id,
        "temperature": ai_settings.temperature,
        "maxTokens": ai_settings.max_tokens,
        "requestTimeoutSeconds": ai_settings.request_timeout_seconds,
    }


@router.get("/ai")
async def ai_settings(request: Request) -> dict[str, object]:
    ai_settings = request.app.state.state_store.get_ai_settings()
    return {
        "ai": serialize_ai_settings(ai_settings)
    }


@router.put("/ai")
async def update_ai_settings(
    payload: AiSettingsPayload,
    request: Request,
) -> dict[str, object]:
    ai_settings = request.app.state.state_store.update_ai_settings(
        AiSettings(
            model=payload.model,
            cloud_enabled=payload.cloudEnabled,
            provider=payload.provider,
            base_url=payload.baseUrl,
            api_key_id=payload.apiKeyId,
            temperature=payload.temperature,
            max_tokens=payload.maxTokens,
            request_timeout_seconds=payload.requestTimeoutSeconds,
        )
    )
    return {
        "ai": serialize_ai_settings(ai_settings)
    }


@router.get("/api-keys")
async def api_keys(request: Request) -> dict[str, object]:
    return {
        "items": request.app.state.state_store.list_api_keys(),
    }


@router.put("/api-keys/{key_id}")
async def update_api_key(
    key_id: str,
    payload: ApiKeyPayload,
    request: Request,
) -> dict[str, object]:
    updated_item = request.app.state.state_store.update_api_key(key_id, payload.value)
    request.app.state.provider_manager.set_app_settings(
        apply_api_key_settings(
            request.app.state.settings,
            request.app.state.state_store.list_api_keys(),
        )
    )
    return {
        "item": updated_item,
    }


@router.post("/notifications/test/{channel}")
async def test_notification(
    channel: str,
    request: Request,
) -> dict[str, object]:
    if channel not in SUPPORTED_NOTIFICATION_CHANNELS:
        raise HTTPException(status_code=400, detail="Unsupported notification test channel")

    result = request.app.state.notification_service.send_test_notification(channel)
    return {
        "channel": channel,
        "delivered": result.delivered,
        "detail": result.detail or f"{channel.title()} test finished.",
    }
