# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/strategies", tags=["strategies"])


class SavedStrategyPayload(BaseModel):
    id: str = Field(min_length=1, max_length=96)
    name: str = Field(min_length=1, max_length=120)
    symbolId: str = Field(min_length=1, max_length=32)
    setupType: str = Field(min_length=1, max_length=120)
    timeframe: str = Field(min_length=1, max_length=16)
    savedAt: str = Field(min_length=1, max_length=64)


@router.get("")
async def list_saved_strategies(request: Request) -> dict[str, object]:
    return {"items": request.app.state.state_store.list_saved_strategies()}


@router.post("")
async def create_saved_strategy(
    payload: SavedStrategyPayload,
    request: Request,
) -> dict[str, object]:
    item = request.app.state.state_store.save_strategy(payload.model_dump())
    return {"item": item}