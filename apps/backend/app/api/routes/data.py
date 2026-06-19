# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""First-run sample data + reset.

The default install stays empty (no auto-fetched market data). These endpoints
let the user *opt in* to a small starter setup so they never face blank screens,
and wipe everything back to a fresh install on demand.
"""

from fastapi import APIRouter, Request
from pydantic import BaseModel

router = APIRouter(prefix="/api/data", tags=["data"])


class OnboardingPayload(BaseModel):
    completed: bool = True


@router.get("/state")
async def data_state(request: Request) -> dict[str, object]:
    store = request.app.state.state_store
    return {
        "onboardingCompleted": store.get_onboarding_completed(),
        "hasData": store.has_user_data(),
    }


@router.post("/sample")
async def load_sample(request: Request) -> dict[str, object]:
    store = request.app.state.state_store
    store.seed_sample_data()
    store.set_onboarding_completed(True)
    return {"ok": True, "watchlist": store.list_watchlist()}


@router.post("/clear")
async def clear_data(request: Request) -> dict[str, object]:
    request.app.state.state_store.clear_user_data()
    return {"ok": True}


@router.put("/onboarding")
async def set_onboarding(payload: OnboardingPayload, request: Request) -> dict[str, object]:
    completed = request.app.state.state_store.set_onboarding_completed(payload.completed)
    return {"onboardingCompleted": completed}
