# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Journal and Review coach API routes (MSN-4).

Educational use only — not financial advice.
"""

from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.storage.state_store.journal import MISTAKE_TAGS

router = APIRouter(prefix="/api", tags=["journal"])


class JournalAnnotation(BaseModel):
    note: str = ""
    tags: list[str] = []


@router.get("/journal")
async def get_journal(request: Request) -> dict:
    """Every scored trade merged with the user's reflection note and tags."""
    payload = request.app.state.review_coach_service.journal()
    return {**payload, "mistake_tags": list(MISTAKE_TAGS)}


@router.post("/journal/{intent_id}")
async def annotate_trade(intent_id: str, body: JournalAnnotation, request: Request) -> dict:
    """Attach or update a reflection note and mistake tags on a trade."""
    return request.app.state.review_coach_service.annotate(intent_id, body.note, body.tags)


@router.get("/review/coach")
async def get_coach(request: Request) -> dict:
    """Weekly summary, repeated-mistake detections, and prescriptions."""
    return request.app.state.review_coach_service.coach()
