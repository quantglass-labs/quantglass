# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""QuantGlass Copilot (AI2-5): grounded Q&A over the read-only tool registry."""

from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from app.api.routes.mcp import TOOL_DESCRIPTIONS, build_tool_registry

router = APIRouter(tags=["copilot"])


class CopilotAskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=500)


@router.post("/api/copilot/ask")
async def copilot_ask(body: CopilotAskRequest, request: Request) -> dict[str, object]:
    tools = build_tool_registry(request.app.state)
    return await run_in_threadpool(
        request.app.state.copilot_service.ask, body.question, tools, TOOL_DESCRIPTIONS
    )
