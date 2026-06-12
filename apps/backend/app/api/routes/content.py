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


class PostmortemRequest(BaseModel):
    kind: str
    facts: dict


@router.post("/api/ai/postmortem")
async def ai_postmortem(body: PostmortemRequest, request: Request) -> dict[str, object]:
    """AI2-4: debrief a drill run or a single trade from its own facts."""
    return await run_in_threadpool(
        request.app.state.ai_coach_service.postmortem, body.kind, body.facts
    )


@router.get("/api/ai/insight/{surface}")
async def surface_insight(surface: str, request: Request) -> dict[str, object]:
    """AI on every screen: per-surface facts narrated on the covenant."""

    def build() -> dict[str, object]:
        state = request.app.state
        facts: dict[str, object] = {}
        if surface == "journal":
            journal = state.review_coach_service.journal()
            tagged = [i for i in journal["items"] if i.get("tags") or i.get("journal_note")]
            tag_counts: dict[str, int] = {}
            for entry in journal["items"]:
                for tag in entry.get("tags") or []:
                    tag_counts[tag] = tag_counts.get(tag, 0) + 1
            repeated = sorted(tag_counts.items(), key=lambda kv: -kv[1])[:5]
            facts = {
                "journaled_trades": len(tagged),
                "total_trades": len(journal["items"]),
                "repeated_mistake_tags": [{"tag": tag, "count": count} for tag, count in repeated],
                "recent_notes": [
                    {
                        "symbol": i.get("symbol"),
                        "note": i.get("journal_note"),
                        "tags": i.get("tags"),
                    }
                    for i in tagged[:5]
                ],
                "average_process_score": journal["summary"].get("average_process_score", 0),
                "highlights": [
                    f"{len(tagged)} of {len(journal['items'])} trades journaled; "
                    f"average process score {journal['summary'].get('average_process_score', 0)}."
                ]
                + (
                    [f"Most repeated mistake tag: {repeated[0][0]} ({repeated[0][1]}x)."]
                    if repeated
                    else []
                ),
            }
        elif surface == "watchlist":
            watched = {entry["symbol"].upper() for entry in state.state_store.list_watchlist()}
            context = state.signal_engine.list_context_signals()
            regimes = [
                f"{c['symbol_id']} {c['timeframe']}: {c['display_name']}"
                for c in context
                if c.get("family") == "regime" and c.get("symbol_id") in watched
            ][:6]
            facts = {"watched_symbols": sorted(watched), "regimes": regimes, "highlights": regimes}
        elif surface == "missions":
            listing = state.mission_service.list_missions()
            active = [m for m in listing["items"] if m.get("active") and not m["completed"]]
            facts = {
                "active_missions": [
                    {
                        "title": m["title"],
                        "next_objective": next(
                            (c["label"] for c in m["criteria"] if not c["met"]), None
                        ),
                        "progress": f"{sum(1 for c in m['criteria'] if c['met'])}/{len(m['criteria'])}",
                    }
                    for m in active
                ],
                "completed_total": sum(1 for m in listing["items"] if m["completed"]),
                "highlights": [
                    f"{m['title']}: next - {next((c['label'] for c in m['criteria'] if not c['met']), 'done')}"
                    for m in active
                ][:3]
                or [
                    f"No active missions; {sum(1 for m in listing['items'] if m['completed'])} completed so far."
                ],
            }
        elif surface == "portfolio":
            account = state.state_store.get_paper_account()
            risk = state.risk_meta_service.list_risk_signals()
            positions = account.get("openPositions", [])
            facts = {
                "balance": account.get("balance"),
                "positions": [
                    {
                        "symbol": p["symbolId"],
                        "side": p["side"],
                        "quantity": p["quantity"],
                        "pnl": p["pnl"],
                    }
                    for p in positions
                ],
                "risk_warnings": [r["display_name"] for r in risk],
                "highlights": [
                    f"{len(positions)} open positions; "
                    + ("; ".join(r["display_name"] for r in risk) if risk else "no risk warnings.")
                ],
            }
        else:
            raise HTTPException(status_code=404, detail="Unknown insight surface.")
        return state.ai_coach_service.surface_insight(surface, facts)

    return await run_in_threadpool(build)


@router.get("/api/dashboard/brief")
async def daily_brief(request: Request) -> dict[str, object]:
    """AI2-2: the morning brief, narrated from the engine's own reads."""

    def build() -> dict[str, object]:
        engine = _signal_engine(request)
        context = engine.list_context_signals()
        signals = engine.list_signals()
        risk = request.app.state.risk_meta_service.list_risk_signals()
        facts = {
            "regimes": [
                {
                    "symbol": item["symbol"],
                    "timeframe": item["timeframe"],
                    "state": item["display_name"],
                }
                for item in context
                if item.get("family") == "regime"
            ][:6],
            "volatility_notes": [
                f"{item['symbol']} {item['timeframe']}: {item['display_name']}"
                for item in context
                if item.get("family") == "volatility"
            ][:4],
            "top_signals": [
                {
                    "symbol": record["signal"]["symbol"],
                    "name": record["signal"].get("display_name")
                    or record["signal"]["confidence_basis"]["setup_type"],
                    "confidence": record["signal"]["confidence"],
                    "quality": record["signal"].get("quality"),
                }
                for record in sorted(signals, key=lambda r: -r["signal"]["confidence"])[:3]
            ],
            "risk_warnings": [item["display_name"] for item in risk][:4],
        }
        return request.app.state.ai_coach_service.daily_brief(facts)

    return await run_in_threadpool(build)


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
