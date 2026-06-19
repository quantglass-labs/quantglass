# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/strategies", tags=["strategies"])

# Versioned, portable export format. Bump the version if the shape changes so
# external consumers (execution layers, scripts) can detect it.
STRATEGY_EXPORT_SCHEMA = "quantglass.strategy/v1"


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


@router.put("/{strategy_id}")
async def update_saved_strategy(
    strategy_id: str,
    payload: SavedStrategyPayload,
    request: Request,
) -> dict[str, object]:
    item = request.app.state.state_store.save_strategy({**payload.model_dump(), "id": strategy_id})
    return {"item": item}


@router.get("/{strategy_id}/export")
async def export_saved_strategy(strategy_id: str, request: Request) -> dict[str, object]:
    """Return a portable, documented record of a saved strategy.

    This is the interoperability seam: a strategy you researched in QuantGlass
    (its symbol, signal-engine setup type, and timeframe) exported as a stable,
    versioned JSON artifact that an external tool — or a future execution layer —
    can consume. It is a *definition with provenance*, not an order spec, and
    explicitly not a recommendation.
    """
    strategy = request.app.state.state_store.get_saved_strategy(strategy_id)
    if strategy is None:
        raise HTTPException(status_code=404, detail="strategy not found")
    return {
        "schema": STRATEGY_EXPORT_SCHEMA,
        "source": "QuantGlass",
        "exportedAt": datetime.now(UTC).isoformat(),
        "strategy": strategy,
        "notes": [
            "Portable record of a strategy researched in QuantGlass — its symbol, "
            "signal-engine setup type, and timeframe — for use as the basis of "
            "execution in an external tool.",
            "'setupType' is the QuantGlass signal-engine setup identifier; map it "
            "to your own execution logic.",
            "Not financial advice and not a recommendation. Validate independently "
            "before any live use.",
        ],
    }


@router.delete("/{strategy_id}")
async def delete_saved_strategy(strategy_id: str, request: Request) -> dict[str, object]:
    return {
        "deleted": request.app.state.state_store.delete_saved_strategy(strategy_id),
        "id": strategy_id,
    }
