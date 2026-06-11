# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Model Context Protocol server exposing read-only engine facts.

Implements the MCP streamable-HTTP transport's JSON-RPC core (initialize,
tools/list, tools/call, ping) on loopback so AI agents — Claude Code/Desktop
or any MCP client — can use the local QuantGlass engine as a grounded
market-facts source. Strictly read-only: no orders, no settings writes, no
secrets. Educational data only, never financial advice.
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Request, Response
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/mcp", tags=["mcp"])

PROTOCOL_VERSION = "2025-06-18"

TOOLS: list[dict[str, Any]] = [
    {
        "name": "list_signals",
        "description": (
            "List the current deterministic trading signals with entry zone, stop, "
            "take-profit ladder, confidence basis, backtest statistics, and data "
            "freshness. Educational decision support, not financial advice."
        ),
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "list_backtest_presets",
        "description": (
            "List backtest presets with honest in-sample/out-of-sample metrics "
            "(win rate, expectancy, Sharpe, Sortino, drawdown) per symbol and setup."
        ),
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "get_paper_account",
        "description": (
            "Get the paper-trading account: balance, buying power, realized PnL, "
            "and open simulated positions."
        ),
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "list_watchlist",
        "description": "List the user's watchlist symbols with market type and notes.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
]


async def _call_tool(request: Request, name: str) -> Any:
    state = request.app.state
    if name == "list_signals":
        return {"items": await run_in_threadpool(state.signal_engine.list_signals)}
    if name == "list_backtest_presets":
        return {"items": await run_in_threadpool(state.signal_engine.list_backtest_presets)}
    if name == "get_paper_account":
        return await run_in_threadpool(state.state_store.get_paper_account)
    if name == "list_watchlist":
        return {"items": await run_in_threadpool(state.state_store.list_watchlist)}
    raise KeyError(name)


def _result(message_id: Any, result: dict[str, Any]) -> JSONResponse:
    return JSONResponse({"jsonrpc": "2.0", "id": message_id, "result": result})


def _error(message_id: Any, code: int, text: str) -> JSONResponse:
    return JSONResponse(
        {"jsonrpc": "2.0", "id": message_id, "error": {"code": code, "message": text}}
    )


@router.post("")
async def mcp_endpoint(request: Request) -> Response:
    try:
        message = await request.json()
    except ValueError:
        return _error(None, -32700, "Parse error")
    if not isinstance(message, dict):
        return _error(None, -32600, "Batch requests are not supported")

    method = message.get("method")
    message_id = message.get("id")

    # Notifications (no id) are acknowledged without a body.
    if message_id is None:
        return Response(status_code=202)

    if method == "initialize":
        return _result(
            message_id,
            {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "quantglass", "version": "0.1.0"},
                "instructions": (
                    "Read-only access to a local QuantGlass research engine: "
                    "deterministic signals, honest backtests, paper account, and "
                    "watchlist. Data is educational decision support, never "
                    "financial advice."
                ),
            },
        )
    if method == "ping":
        return _result(message_id, {})
    if method == "tools/list":
        return _result(message_id, {"tools": TOOLS})
    if method == "tools/call":
        params = message.get("params") or {}
        name = params.get("name", "")
        try:
            payload = await _call_tool(request, name)
        except KeyError:
            return _error(message_id, -32602, f"Unknown tool: {name}")
        except Exception as exc:  # tool execution failure -> in-band error result
            return _result(
                message_id,
                {"content": [{"type": "text", "text": str(exc)}], "isError": True},
            )
        return _result(
            message_id,
            {
                "content": [{"type": "text", "text": json.dumps(payload, default=str)}],
                "isError": False,
            },
        )
    return _error(message_id, -32601, f"Method not found: {method}")
