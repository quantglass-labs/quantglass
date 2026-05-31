from fastapi import APIRouter, HTTPException, Request

from app.services.market_corridor import MarketCorridorService
from app.services.rate_limits import RateLimitExceededError

router = APIRouter(prefix="/api/market", tags=["market"])


@router.get("/corridor")
async def get_market_corridor_status(request: Request) -> dict[str, object]:
    service = MarketCorridorService(
        provider_manager=request.app.state.provider_manager,
        analytics_store=request.app.state.analytics_store,
        rate_limiter=request.app.state.rate_limiter,
    )
    return service.get_status()


@router.get("/corridor/diagnostics")
async def get_market_corridor_diagnostics(request: Request) -> dict[str, object]:
    service = MarketCorridorService(
        provider_manager=request.app.state.provider_manager,
        analytics_store=request.app.state.analytics_store,
        rate_limiter=request.app.state.rate_limiter,
    )
    return service.get_diagnostics()


@router.get("/corridor/candles")
async def get_market_corridor_candles(
    symbol: str,
    timeframe: str,
    request: Request,
) -> dict[str, object]:
    service = MarketCorridorService(
        provider_manager=request.app.state.provider_manager,
        analytics_store=request.app.state.analytics_store,
        rate_limiter=request.app.state.rate_limiter,
    )
    return service.get_candles(symbol=symbol.upper(), timeframe=timeframe)


@router.post("/corridor/refresh")
async def refresh_market_corridor(request: Request) -> dict[str, object]:
    service = MarketCorridorService(
        provider_manager=request.app.state.provider_manager,
        analytics_store=request.app.state.analytics_store,
        rate_limiter=request.app.state.rate_limiter,
    )
    try:
        return service.refresh()
    except RateLimitExceededError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc