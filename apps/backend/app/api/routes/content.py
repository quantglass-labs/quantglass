# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from app.services.narration import NarrationService
from app.services.news_service import NewsService
from app.services.signal_engine import SignalEngineService

router = APIRouter(tags=["content"])


class BacktestRunRequest(BaseModel):
    symbolId: str
    marketType: str
    timeframe: str
    setupType: str
    feesPercent: float
    slippagePercent: float
    trainTestSplit: int
    walkForward: bool


def _signal_engine(request: Request) -> SignalEngineService:
    state_store = request.app.state.state_store
    narrator = NarrationService(ai_settings_provider=state_store.get_ai_settings)
    return SignalEngineService(
        analytics_store=request.app.state.analytics_store,
        min_backtest_sample=state_store.get_safety_settings().min_backtest_sample,
        narrator=narrator,
        strategy_registry=request.app.state.strategy_registry,
    )


def _news_service(request: Request) -> NewsService:
    return NewsService(
        provider_manager=request.app.state.provider_manager,
        analytics_store=request.app.state.analytics_store,
        signal_engine=_signal_engine(request),
    )


@router.get("/api/signals/narrate")
async def narrate_signal(symbol: str, timeframe: str, request: Request) -> dict[str, object]:
    """On-demand model narration for one signal (drawer open)."""
    result = await run_in_threadpool(_signal_engine(request).narrate_signal, symbol, timeframe)
    if result is None:
        raise HTTPException(status_code=404, detail="No narration facts for this signal yet.")
    return result


@router.get("/api/signals/calibration")
async def get_calibration(request: Request) -> dict[str, object]:
    """Predicted vs realized win rate per confidence bucket (E3)."""
    return await run_in_threadpool(_signal_engine(request).calibration_report)


@router.get("/api/signals/risk")
async def list_risk_signals(request: Request) -> dict[str, object]:
    """Portfolio/risk meta-signals: brakes derived from the user's own account."""
    return {"items": await run_in_threadpool(request.app.state.risk_meta_service.list_risk_signals)}


@router.get("/api/signals/context")
async def list_context_signals(request: Request) -> dict[str, object]:
    """Regime context signals: environment reads, never trades."""
    return {"items": await run_in_threadpool(_signal_engine(request).list_context_signals)}


@router.get("/api/signals")
async def get_signals(request: Request) -> dict[str, object]:
    return {
        "items": await run_in_threadpool(_signal_engine(request).list_signals),
    }


@router.get("/api/news")
async def get_news(request: Request) -> dict[str, object]:
    return {
        "items": await run_in_threadpool(_news_service(request).list_news),
    }


@router.get("/api/backtests/presets")
async def get_backtest_presets(request: Request) -> dict[str, object]:
    return {
        "items": await run_in_threadpool(_signal_engine(request).list_backtest_presets),
    }


@router.post("/api/backtests/run")
async def run_backtest(request: Request, payload: BacktestRunRequest) -> dict[str, object]:
    item = await run_in_threadpool(
        _signal_engine(request).run_backtest_analysis,
        symbol_id=payload.symbolId,
        market_type=payload.marketType,
        timeframe=payload.timeframe,
        setup_type=payload.setupType,
        fees_percent=payload.feesPercent,
        slippage_percent=payload.slippagePercent,
        train_test_split=payload.trainTestSplit,
        walk_forward=payload.walkForward,
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Backtest series unavailable")
    return {
        "item": item,
    }
