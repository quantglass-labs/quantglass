# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from datetime import UTC, datetime
from time import perf_counter

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


class AiModelListPayload(BaseModel):
    provider: AiProvider = "ollama"
    baseUrl: str = "http://127.0.0.1:11434"
    apiKeyId: str | None = None
    requestTimeoutSeconds: float = 8.0


class AiProviderTestPayload(AiModelListPayload):
    model: str
    temperature: float = 0.2
    maxTokens: int = 96


class ApiKeyPayload(BaseModel):
    value: str


SUPPORTED_NOTIFICATION_CHANNELS = {"desktop", "telegram", "email"}


def serialize_api_key(item: dict[str, object]) -> dict[str, object]:
    value = item.get("value", "")
    raw_value = value if isinstance(value, str) else ""
    secret = bool(item.get("secret", False))
    return {
        **item,
        "value": "" if secret else raw_value,
        "configured": bool(raw_value.strip()),
    }


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
    return {"ai": serialize_ai_settings(ai_settings)}


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
    return {"ai": serialize_ai_settings(ai_settings)}


@router.post("/ai/models")
async def ai_models(
    payload: AiModelListPayload,
    request: Request,
) -> dict[str, object]:
    settings = AiSettings(
        model="",
        cloud_enabled=False,
        provider=payload.provider,
        base_url=payload.baseUrl,
        api_key_id=payload.apiKeyId,
        request_timeout_seconds=payload.requestTimeoutSeconds,
    )
    model_gateway = request.app.state.model_gateway
    if hasattr(model_gateway, "list_model_catalog"):
        catalog = model_gateway.list_model_catalog(settings)
        return {
            "provider": payload.provider,
            "models": catalog.models,
            "modelItems": catalog.items,
            "fetched": catalog.fetched,
            "detail": catalog.detail,
            "source": catalog.source,
            "fetchedAtUtc": catalog.fetched_at_utc,
        }

    models, fetched, detail = model_gateway.list_models(settings)
    return {
        "provider": payload.provider,
        "models": models,
        "modelItems": [{"id": model, "label": model} for model in models],
        "fetched": fetched,
        "detail": detail,
        "source": payload.provider if fetched else "fallback",
    }


@router.post("/ai/test")
async def test_ai_provider(
    payload: AiProviderTestPayload,
    request: Request,
) -> dict[str, object]:
    tested_at_utc = datetime.now(UTC).isoformat()
    started = perf_counter()
    if payload.provider == "template":
        return {
            "provider": payload.provider,
            "model": payload.model,
            "ok": True,
            "detail": "Template narration is available. No model endpoint was called.",
            "source": "template",
            "sample": "Deterministic template narration is ready.",
            "elapsedMs": 0,
            "testedAtUtc": tested_at_utc,
        }
    if not payload.model.strip():
        return {
            "provider": payload.provider,
            "model": payload.model,
            "ok": False,
            "detail": "Select or enter a model before testing the provider.",
            "elapsedMs": 0,
            "testedAtUtc": tested_at_utc,
        }

    settings = AiSettings(
        model=payload.model.strip(),
        cloud_enabled=True,
        provider=payload.provider,
        base_url=payload.baseUrl,
        api_key_id=payload.apiKeyId,
        temperature=payload.temperature,
        max_tokens=payload.maxTokens,
        request_timeout_seconds=payload.requestTimeoutSeconds,
    )
    prompt = (
        "Reply in one short sentence. Say that QuantGlass AI provider test succeeded, "
        "and do not provide financial advice."
    )
    initial_runtime_state = (
        request.app.state.model_gateway.provider_runtime_state(settings)
        if hasattr(request.app.state.model_gateway, "provider_runtime_state")
        else {}
    )
    if initial_runtime_state.get("runtimeStatus") == "not_installed":
        return {
            "provider": payload.provider,
            "model": settings.model,
            "ok": False,
            "detail": initial_runtime_state.get("runtimeDetail")
            or "The selected model is not installed.",
            "runtimeStatus": "not_installed",
            "runtimeDetail": initial_runtime_state.get("runtimeDetail"),
            "elapsedMs": int((perf_counter() - started) * 1000),
            "testedAtUtc": tested_at_utc,
        }
    response = request.app.state.model_gateway.complete(settings, prompt)
    elapsed_ms = int((perf_counter() - started) * 1000)
    if response is None:
        error_detail = getattr(request.app.state.model_gateway, "last_error", None)
        runtime_state = (
            request.app.state.model_gateway.provider_runtime_state(settings)
            if hasattr(request.app.state.model_gateway, "provider_runtime_state")
            else initial_runtime_state
        )
        runtime_status = runtime_state.get("runtimeStatus")
        if error_detail and "HTTP 503" in error_detail and runtime_status == "loaded":
            runtime_status = "busy"
            runtime_state = {
                **runtime_state,
                "runtimeStatus": "busy",
                "runtimeDetail": (
                    f"{runtime_state.get('runtimeDetail', '')} Ollama returned service unavailable; "
                    "the runner is likely busy, queued, or still finishing another request."
                ).strip(),
            }
        elif runtime_status == "not_loaded":
            runtime_status = "loading"
            runtime_state = {
                **runtime_state,
                "runtimeStatus": "loading",
                "runtimeDetail": (
                    f"{runtime_state.get('runtimeDetail', '')} The test attempted to load it, "
                    "but no usable text returned before the timeout."
                ).strip(),
            }
        diagnostic_detail = runtime_state.get("runtimeDetail")
        # The runtime diagnostic is returned separately as runtimeDetail and
        # rendered on its own line by the client; don't fold it into detail too
        # or it shows twice.
        detail = (
            error_detail
            or "The provider did not return usable text. Check endpoint, model id, API key, and timeout."
        )
        return {
            "provider": payload.provider,
            "model": settings.model,
            "ok": False,
            "detail": detail,
            "runtimeStatus": runtime_status,
            "runtimeDetail": diagnostic_detail,
            "elapsedMs": elapsed_ms,
            "testedAtUtc": tested_at_utc,
        }

    sample = response.text.strip().replace("\r", " ")
    if len(sample) > 500:
        sample = f"{sample[:500].rstrip()}..."
    return {
        "provider": payload.provider,
        "model": settings.model,
        "ok": True,
        "detail": "Provider returned usable text.",
        "runtimeStatus": "loaded"
        if payload.provider == "ollama"
        else initial_runtime_state.get("runtimeStatus"),
        "runtimeDetail": initial_runtime_state.get("runtimeDetail"),
        "source": response.source,
        "sample": sample,
        "elapsedMs": elapsed_ms,
        "testedAtUtc": tested_at_utc,
    }


@router.get("/api-keys")
async def api_keys(request: Request) -> dict[str, object]:
    return {
        "items": [
            serialize_api_key(item) for item in request.app.state.state_store.list_api_keys()
        ],
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
        "item": serialize_api_key(updated_item),
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
