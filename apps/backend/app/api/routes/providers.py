# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.core.config import ProviderRoute, ProviderSettings, SafetySettings
from app.providers.manager import Capability

router = APIRouter(prefix="/api/providers", tags=["providers"])


class RateLimitSettings(BaseModel):
    crypto_per_minute: int
    stocks_per_minute: int


class ProviderRoutesPayload(BaseModel):
    crypto: ProviderRoute
    stocks: ProviderRoute
    news: ProviderRoute
    ai: ProviderRoute
    trading: ProviderRoute


class ProviderSettingsPayload(BaseModel):
    view_mode: str
    routes: ProviderRoutesPayload
    rate_limits: RateLimitSettings
    safety: SafetySettings


class CustomProviderPayload(BaseModel):
    id: str | None = None
    label: str
    baseUrl: str = ""
    authType: str = "none"
    apiKeyId: str | None = None
    apiKeyHeader: str | None = None
    apiKeyQueryParam: str | None = None
    capabilities: list[Capability] = ["ohlcv"]
    enabled: bool = True
    notes: str = ""


def refresh_custom_provider_profiles(request: Request) -> None:
    request.app.state.provider_manager.set_custom_provider_profiles(
        request.app.state.state_store.list_custom_provider_profiles()
    )


def serialize_provider_settings(
    provider_settings: ProviderSettings,
    safety_settings: SafetySettings,
) -> dict[str, object]:
    return {
        "view_mode": provider_settings.view_mode,
        "routes": {
            "crypto": provider_settings.crypto.model_dump(),
            "stocks": provider_settings.stocks.model_dump(),
            "news": provider_settings.news.model_dump(),
            "ai": provider_settings.ai.model_dump(),
            "trading": provider_settings.trading.model_dump(),
        },
        "rate_limits": {
            "crypto_per_minute": provider_settings.crypto_rate_limit_per_minute,
            "stocks_per_minute": provider_settings.stocks_rate_limit_per_minute,
        },
        "safety": safety_settings.model_dump(),
    }


@router.get("/settings")
async def provider_settings(request: Request) -> dict[str, object]:
    provider_settings = request.app.state.state_store.get_provider_settings()
    safety_settings = request.app.state.state_store.get_safety_settings()
    request.app.state.provider_manager.set_settings(provider_settings)
    return serialize_provider_settings(provider_settings, safety_settings)


@router.put("/settings")
async def update_provider_settings(
    payload: ProviderSettingsPayload,
    request: Request,
) -> dict[str, object]:
    provider_settings = ProviderSettings(
        view_mode=payload.view_mode,
        crypto_rate_limit_per_minute=payload.rate_limits.crypto_per_minute,
        stocks_rate_limit_per_minute=payload.rate_limits.stocks_per_minute,
        crypto=payload.routes.crypto,
        stocks=payload.routes.stocks,
        news=payload.routes.news,
        ai=payload.routes.ai,
        trading=payload.routes.trading,
    )
    request.app.state.state_store.update_provider_settings(
        provider_settings,
        payload.safety,
    )
    request.app.state.provider_manager.set_settings(provider_settings)
    request.app.state.provider_manager.set_safety_settings(payload.safety)
    return serialize_provider_settings(provider_settings, payload.safety)


@router.get("/registry")
async def provider_registry(request: Request) -> dict[str, object]:
    refresh_custom_provider_profiles(request)
    return {
        "providers": request.app.state.provider_manager.get_registry(),
    }


@router.get("/custom")
async def custom_providers(request: Request) -> dict[str, object]:
    return {
        "providers": request.app.state.state_store.list_custom_provider_profiles(),
    }


@router.post("/custom")
async def create_custom_provider(
    payload: CustomProviderPayload,
    request: Request,
) -> dict[str, object]:
    provider = request.app.state.state_store.upsert_custom_provider_profile(payload.model_dump())
    refresh_custom_provider_profiles(request)
    return {"provider": provider}


@router.put("/custom/{provider_id}")
async def update_custom_provider(
    provider_id: str,
    payload: CustomProviderPayload,
    request: Request,
) -> dict[str, object]:
    provider = request.app.state.state_store.upsert_custom_provider_profile(
        {**payload.model_dump(), "id": provider_id}
    )
    refresh_custom_provider_profiles(request)
    return {"provider": provider}


@router.delete("/custom/{provider_id}")
async def delete_custom_provider(provider_id: str, request: Request) -> dict[str, object]:
    deleted = request.app.state.state_store.delete_custom_provider_profile(provider_id)
    refresh_custom_provider_profiles(request)
    return {"deleted": deleted, "providerId": provider_id}
