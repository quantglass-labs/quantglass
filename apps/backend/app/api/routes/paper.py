# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

router = APIRouter(tags=["paper"])


class PaperPositionPayload(BaseModel):
    symbolId: str = Field(min_length=1, max_length=32)
    side: str = Field(pattern="^(long|short)$")
    quantity: float = Field(gt=0)
    averagePrice: float = Field(gt=0)
    pnl: float


class PaperAccountPayload(BaseModel):
    balance: float = Field(ge=0)
    buyingPower: float = Field(ge=0)
    openPositions: list[PaperPositionPayload] = Field(default_factory=list)
    realizedPnl: float


class PaperTradePayload(BaseModel):
    signalId: str = Field(min_length=1, max_length=96)
    symbol: str = Field(min_length=1, max_length=32)
    side: str = Field(pattern="^(long|short)$")
    quantity: float = Field(gt=0)
    entryPrice: float = Field(gt=0)
    # Trade plan (MSN-1): captured with the intent so process scores, missions,
    # and the journal can read intent-time decisions.
    planStop: float | None = Field(default=None, gt=0)
    planTarget: float | None = Field(default=None, gt=0)
    planRiskPercent: float | None = Field(default=None, gt=0, le=100)
    planReason: str | None = Field(default=None, max_length=280)
    planEmotion: str | None = Field(default=None, max_length=32)
    # Entry order semantics: market fills next tick; limit/stop wait for the
    # trigger price on closed candles (the only venue paper trading has).
    orderType: str = Field(default="market", pattern="^(market|limit|stop)$")
    limitPrice: float | None = Field(default=None, gt=0)


@router.get("/api/paper-account")
async def get_paper_account(request: Request) -> dict[str, object]:
    return {"account": request.app.state.state_store.get_paper_account()}


@router.put("/api/paper-account")
async def put_paper_account(
    payload: PaperAccountPayload,
    request: Request,
) -> dict[str, object]:
    account = request.app.state.state_store.replace_paper_account(payload.model_dump())
    return {"account": account}


@router.get("/api/paper-trades")
async def list_paper_trades(request: Request) -> dict[str, object]:
    return {"items": request.app.state.state_store.list_paper_trade_intents()}


@router.post("/api/paper-trades")
async def submit_paper_trade(
    payload: PaperTradePayload,
    request: Request,
) -> dict[str, object]:
    plan = {
        "stop": payload.planStop,
        "target": payload.planTarget,
        "riskPercent": payload.planRiskPercent,
        "reason": payload.planReason,
        "emotion": payload.planEmotion,
    }
    # Constitution (MSN-5): the user's own adopted rules gate the ticket.
    violations = request.app.state.constitution_service.check_trade(plan)
    if violations:
        raise HTTPException(
            status_code=422,
            detail={"message": "Blocked by your trading constitution.", "violations": violations},
        )

    try:
        result = request.app.state.trading_service.submit_trade(
            signal_id=payload.signalId,
            symbol=payload.symbol,
            side=payload.side,
            quantity=payload.quantity,
            entry_price=payload.entryPrice,
            plan=plan,
            order_type=payload.orderType,
            limit_price=payload.limitPrice,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "accepted": result.accepted,
        "tradingMode": result.trading_mode,
        "submittedAt": result.trade["submittedAt"],
        "account": result.account,
        "trade": result.trade,
    }


@router.get("/api/paper-trades/review")
async def review_paper_trades(request: Request) -> dict[str, object]:
    """Process scores, first-touch outcomes, and the decision/outcome 2x2."""
    return request.app.state.trade_review_service.review()
