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

from app.version import __version__

router = APIRouter(prefix="/mcp", tags=["mcp"])

PROTOCOL_VERSION = "2025-06-18"

TOOL_DESCRIPTIONS: dict[str, str] = {
    "list_signals": (
        "List the current deterministic trading signals with entry zone, stop, "
        "take-profit ladder, confidence basis, backtest statistics, and data "
        "freshness. Educational decision support, not financial advice."
    ),
    "list_backtest_presets": (
        "List backtest presets with honest in-sample/out-of-sample metrics "
        "(win rate, expectancy, Sharpe, Sortino, drawdown) per symbol and setup."
    ),
    "get_paper_account": (
        "Get the paper-trading account: balance, buying power, realized PnL, "
        "and open simulated positions."
    ),
    "list_watchlist": "List the user's watchlist symbols with market type and notes.",
    "list_paper_closures": (
        "List closed paper trades: side, quantity, entry/exit price, exit kind "
        "(manual, stop, target, trail), PnL, and R-multiple."
    ),
    "get_trade_review": (
        "Review executed paper trades: process scores, first-touch outcomes, "
        "and the decision/outcome 2x2 (earned wins, dangerous successes...)."
    ),
}


def build_tool_registry(state: Any) -> dict[str, Any]:
    """Read-only engine facts shared by the MCP server and the in-app Copilot.

    Every callable is side-effect free: no orders, no settings writes, no secrets.
    """
    return {
        "list_signals": lambda: {"items": state.signal_engine.list_signals()},
        "list_backtest_presets": lambda: {"items": state.signal_engine.list_backtest_presets()},
        "get_paper_account": lambda: state.state_store.get_paper_account(),
        "list_watchlist": lambda: {"items": state.state_store.list_watchlist()},
        "list_paper_closures": lambda: {"items": state.state_store.list_paper_closures()},
        "get_trade_review": lambda: state.trade_review_service.review(),
    }


TOOLS: list[dict[str, Any]] = [
    {
        "name": name,
        "description": description,
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    }
    for name, description in TOOL_DESCRIPTIONS.items()
]


async def _call_tool(request: Request, name: str) -> Any:
    registry = build_tool_registry(request.app.state)
    if name not in registry:
        raise KeyError(name)
    return await run_in_threadpool(registry[name])


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
                "serverInfo": {"name": "quantglass", "version": __version__},
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
