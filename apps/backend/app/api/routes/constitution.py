# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Personal Trading Constitution API routes (MSN-5).

Educational use only — not financial advice.
"""

from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/constitution", tags=["constitution"])


class ConstitutionRulesPayload(BaseModel):
    max_risk_percent: float = Field(default=1.0, gt=0, le=10)
    daily_max_trades: int = Field(default=5, ge=1, le=50)
    require_stop: bool = True
    require_reason: bool = True


@router.get("")
async def get_constitution(request: Request) -> dict:
    """The user's adopted rules, or the proposed defaults if not yet adopted."""
    return request.app.state.constitution_service.get()


@router.put("")
async def adopt_constitution(body: ConstitutionRulesPayload, request: Request) -> dict:
    """Adopt (or amend) the constitution. From now on the ticket enforces it."""
    return request.app.state.constitution_service.adopt(body.model_dump())


@router.get("/compliance")
async def get_compliance(request: Request) -> dict:
    """Rule-by-rule adherence over the scored journal."""
    journal = request.app.state.review_coach_service.journal()
    return request.app.state.constitution_service.compliance(journal["items"])
