# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from pydantic import BaseModel, Field
from fastapi import APIRouter, Request

router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])


class WatchlistEntryCreate(BaseModel):
    symbol: str = Field(min_length=1, max_length=32)
    market_type: str = Field(default="stocks", min_length=3, max_length=16)
    notes: str | None = Field(default=None, max_length=280)


@router.get("")
async def list_watchlist(request: Request) -> dict[str, object]:
    return {
        "items": request.app.state.state_store.list_watchlist(),
    }


@router.post("")
async def add_watchlist_item(
    payload: WatchlistEntryCreate,
    request: Request,
) -> dict[str, object]:
    item = request.app.state.state_store.add_watchlist_symbol(
        symbol=payload.symbol,
        market_type=payload.market_type,
        notes=payload.notes,
    )
    return {"item": item}


@router.delete("/{symbol}")
async def delete_watchlist_item(symbol: str, request: Request) -> dict[str, object]:
    deleted = request.app.state.state_store.delete_watchlist_symbol(symbol)
    return {
        "deleted": deleted,
        "symbol": symbol.upper(),
    }