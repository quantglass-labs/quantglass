from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.core.config import ProviderRoute, ProviderSettings, SafetySettings

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
    return serialize_provider_settings(provider_settings, payload.safety)


@router.get("/registry")
async def provider_registry(request: Request) -> dict[str, object]:
    return {
        "providers": request.app.state.provider_manager.get_registry(),
    }