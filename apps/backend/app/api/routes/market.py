# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from fastapi import APIRouter, HTTPException, Request
from starlette.concurrency import run_in_threadpool

from app.services.market_corridor import MarketCorridorService
from app.services.ranking import RelativeStrengthRankingService
from app.services.rate_limits import RateLimitExceededError

router = APIRouter(prefix="/api/market", tags=["market"])


@router.get("/ranking")
async def get_market_ranking(request: Request) -> dict[str, object]:
    service = RelativeStrengthRankingService(
        analytics_store=request.app.state.analytics_store,
    )
    return await run_in_threadpool(service.rank)


@router.get("/corridor")
async def get_market_corridor_status(request: Request) -> dict[str, object]:
    return await run_in_threadpool(request.app.state.market_corridor_service.get_status)


@router.get("/corridor/diagnostics")
async def get_market_corridor_diagnostics(request: Request) -> dict[str, object]:
    return await run_in_threadpool(request.app.state.market_corridor_service.get_diagnostics)


@router.get("/corridor/candles")
async def get_market_corridor_candles(
    symbol: str,
    timeframe: str,
    request: Request,
) -> dict[str, object]:
    return await run_in_threadpool(
        request.app.state.market_corridor_service.get_candles,
        symbol=symbol.upper(),
        timeframe=timeframe,
    )


@router.post("/corridor/refresh")
async def refresh_market_corridor(request: Request) -> dict[str, object]:
    try:
        return await run_in_threadpool(request.app.state.market_corridor_service.refresh)
    except RateLimitExceededError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
