# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from fastapi import APIRouter, Request

router = APIRouter(prefix="/api/extensions", tags=["extensions"])


@router.get("/registry")
async def extension_registry(request: Request) -> dict[str, object]:
    return {
        "extensions": request.app.state.extension_registry.items(),
    }
