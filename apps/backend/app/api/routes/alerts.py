# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


class NlAlertRequest(BaseModel):
    text: str = Field(min_length=1, max_length=200)


@router.post("/parse-nl")
async def parse_nl_alert(body: NlAlertRequest, request: Request) -> dict:
    """AI2-1: model proposes symbol+condition; the deterministic grammar decides."""
    symbols = [
        series["symbol"]
        for series in request.app.state.analytics_store.list_market_series(minimum_candles=10)
    ]
    return request.app.state.ai_coach_service.parse_alert(body.text, sorted(set(symbols)))


class AlertPayload(BaseModel):
    symbolId: str = Field(min_length=1, max_length=32)
    condition: str = Field(min_length=1, max_length=280)
    channel: str = Field(pattern="^(desktop|telegram|email)$")
    status: str = Field(default="armed", pattern="^(armed|paused|fired)$")


@router.get("")
async def list_alerts(request: Request) -> dict[str, object]:
    return {"items": request.app.state.state_store.list_alerts()}


@router.get("/history")
async def list_alert_history(request: Request) -> dict[str, object]:
    return {"items": request.app.state.state_store.list_alert_history()}


@router.post("")
async def create_alert(payload: AlertPayload, request: Request) -> dict[str, object]:
    item = request.app.state.state_store.create_alert(
        symbol=payload.symbolId,
        condition=payload.condition,
        channel=payload.channel,
        status=payload.status,
    )
    return {"item": item}


@router.put("/{alert_id}")
async def update_alert(
    alert_id: str,
    payload: AlertPayload,
    request: Request,
) -> dict[str, object]:
    try:
        item = request.app.state.state_store.update_alert(
            alert_id=alert_id,
            symbol=payload.symbolId,
            condition=payload.condition,
            channel=payload.channel,
            status=payload.status,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Alert not found") from exc
    return {"item": item}
