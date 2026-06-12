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


class LiveAnswerRequest(BaseModel):
    answer: str
    params: dict


class AssessmentSubmission(BaseModel):
    answers: dict[str, int]


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


# ---------------------------------------------------------------------------
# Live-data exercises (real market numbers, stateless answer checking)
# ---------------------------------------------------------------------------


@router.get("/lesson/{lesson_id}/live-exercise")
async def get_live_exercise(lesson_id: str, request: Request) -> dict:
    """Generate an exercise from live engine values for supported lessons."""
    svc = request.app.state.learn_live_service
    if not svc.supports(lesson_id):
        raise HTTPException(status_code=404, detail=f"Lesson '{lesson_id}' has no live exercise.")
    exercise = svc.build_exercise(lesson_id)
    if exercise is None:
        raise HTTPException(
            status_code=409,
            detail="Live market data is not available yet. Refresh the dashboard first.",
        )
    return exercise


@router.post("/lesson/{lesson_id}/live-check")
async def check_live_answer(lesson_id: str, body: LiveAnswerRequest, request: Request) -> dict:
    """Check a live-exercise answer by recomputing from the shown parameters."""
    svc = request.app.state.learn_live_service
    if not svc.supports(lesson_id):
        raise HTTPException(status_code=404, detail=f"Lesson '{lesson_id}' has no live exercise.")
    return svc.check_answer(lesson_id, body.answer, body.params)


@router.get("/readiness")
async def get_readiness(request: Request) -> dict:
    """Return the five readiness scores and per-level unlock requirements."""
    svc = request.app.state.learn_readiness_service
    return svc.get_readiness()


@router.get("/assessment/{level}")
async def get_assessment(level: str, request: Request) -> dict:
    """Build a level assessment from that level's lesson exercises."""
    svc = request.app.state.learn_assessment_service
    if not svc.supports(level):
        raise HTTPException(status_code=404, detail=f"Unknown level '{level}'.")
    return svc.build_assessment(level)


@router.post("/assessment/{level}")
async def submit_assessment(level: str, body: AssessmentSubmission, request: Request) -> dict:
    """Grade an assessment server-side and persist the best result."""
    svc = request.app.state.learn_assessment_service
    if not svc.supports(level):
        raise HTTPException(status_code=404, detail=f"Unknown level '{level}'.")
    return svc.grade(level, body.answers)


@router.get("/missions")
async def list_missions(request: Request) -> dict:
    """Behavioral missions evaluated over the user's own paper trading."""
    return request.app.state.mission_service.list_missions()


@router.post("/missions/{mission_id}/accept")
async def accept_mission(mission_id: str, request: Request) -> dict:
    """Take the mission on — it joins the active briefing slots (max 3)."""
    result = request.app.state.mission_service.accept(mission_id)
    if not result["ok"]:
        raise HTTPException(status_code=409, detail=result["error"])
    return result


@router.post("/missions/{mission_id}/abandon")
async def abandon_mission(mission_id: str, request: Request) -> dict:
    """Stand down from an active mission; progress is never lost."""
    return request.app.state.mission_service.abandon(mission_id)


@router.get("/mastery")
async def get_mastery(request: Request) -> dict:
    """XP, level, streak, track badges, and the review-queue count."""
    return request.app.state.learn_mastery_service.mastery()


@router.get("/review-queue")
async def get_review_queue(request: Request) -> dict:
    """Due and new spaced-repetition cards over completed lessons' key terms."""
    return request.app.state.learn_mastery_service.review_queue()


class ReviewGrade(BaseModel):
    term: str
    grade: str  # again | good | easy


@router.post("/review-grade")
async def grade_review_card(body: ReviewGrade, request: Request) -> dict:
    """Self-graded recall; reschedules the card with SM-2-lite."""
    if body.grade not in {"again", "good", "easy"}:
        raise HTTPException(status_code=422, detail="grade must be again, good, or easy")
    return request.app.state.learn_mastery_service.grade(body.term, body.grade)


@router.get("/analytics")
async def get_learn_analytics(request: Request) -> dict:
    """Per-level and per-track mastery, weekly pace, and certificate states."""
    return request.app.state.learn_mastery_service.analytics()


@router.get("/certificate/{level}")
async def get_certificate(level: str, request: Request) -> dict:
    """A local completion certificate, or the unmet requirements."""
    return request.app.state.learn_mastery_service.certificate(level)


@router.get("/glossary")
async def get_glossary(request: Request) -> dict:
    """Global glossary aggregated from every lesson's key terms."""
    return request.app.state.learn_service.get_glossary()


@router.get("/reference")
async def get_reference(request: Request) -> dict:
    """Reference library: indicators, order types, formulas, scam checklist."""
    return request.app.state.learn_service.get_reference()


@router.get("/scenarios")
async def list_scenarios(request: Request) -> dict:
    """Replay missions: historical-episode scenarios with best scores."""
    return request.app.state.scenario_service.list_scenarios()


@router.get("/scenarios/{scenario_id}")
async def get_scenario(scenario_id: str, request: Request) -> dict:
    """One scenario: candles and checkpoint questions, without the answers."""
    scenario = request.app.state.scenario_service.get_scenario(scenario_id)
    if scenario is None:
        raise HTTPException(status_code=404, detail="Unknown scenario")
    return scenario


class ScenarioAnswers(BaseModel):
    answers: dict[str, str]


@router.post("/scenarios/{scenario_id}/grade")
async def grade_scenario(scenario_id: str, body: ScenarioAnswers, request: Request) -> dict:
    """Grade the run: points, pass/fail, and the engine-fact debrief."""
    result = request.app.state.scenario_service.grade(scenario_id, body.answers)
    if result is None:
        raise HTTPException(status_code=404, detail="Unknown scenario")
    return result
