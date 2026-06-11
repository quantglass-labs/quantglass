# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Interactive Learning Platform API routes.

Educational use only — not financial advice.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

router = APIRouter(prefix="/api/learn", tags=["learn"])


class AnswerRequest(BaseModel):
    answer: str


# ---------------------------------------------------------------------------
# Catalog & modules
# ---------------------------------------------------------------------------


@router.get("/catalog")
async def get_catalog(request: Request) -> dict:
    """Return the full lesson catalog with per-lesson completion status."""
    svc = request.app.state.learn_service
    return svc.get_catalog()


# ---------------------------------------------------------------------------
# Individual lessons
# ---------------------------------------------------------------------------


@router.get("/lesson/{lesson_id}")
async def get_lesson(lesson_id: str, request: Request) -> dict:
    """Return full lesson content including concept, exercise, and live_apply."""
    svc = request.app.state.learn_service
    lesson = svc.get_lesson(lesson_id)
    if lesson is None:
        raise HTTPException(status_code=404, detail=f"Lesson '{lesson_id}' not found.")
    return lesson


# ---------------------------------------------------------------------------
# Exercise evaluation
# ---------------------------------------------------------------------------


@router.post("/lesson/{lesson_id}/check")
async def check_answer(lesson_id: str, body: AnswerRequest, request: Request) -> dict:
    """Submit an exercise answer and receive feedback."""
    svc = request.app.state.learn_service
    lesson = svc.get_lesson(lesson_id)
    if lesson is None:
        raise HTTPException(status_code=404, detail=f"Lesson '{lesson_id}' not found.")
    return svc.check_answer(lesson_id, body.answer)


# ---------------------------------------------------------------------------
# Progress
# ---------------------------------------------------------------------------


@router.get("/progress")
async def get_progress(request: Request) -> dict:
    """Return the user's learning progress summary."""
    svc = request.app.state.learn_service
    return svc.get_progress()


@router.post("/progress/{lesson_id}/complete")
async def mark_complete(lesson_id: str, request: Request) -> dict:
    """Manually mark a lesson as complete (e.g. after reading without exercising)."""
    svc = request.app.state.learn_service
    lesson = svc.get_lesson(lesson_id)
    if lesson is None:
        raise HTTPException(status_code=404, detail=f"Lesson '{lesson_id}' not found.")
    store = request.app.state.state_store
    store.mark_lesson_complete(lesson_id)
    return {"ok": True, "lesson_id": lesson_id}


# ---------------------------------------------------------------------------
# Lesson moments (coaching from the user's own paper trading)
# ---------------------------------------------------------------------------


@router.get("/moments")
async def get_moments(request: Request) -> dict:
    """Return teachable moments detected from the user's own paper trading."""
    svc = request.app.state.learn_moments_service
    return {"items": svc.get_moments()}
