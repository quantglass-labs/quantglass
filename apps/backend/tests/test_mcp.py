# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""MCP server endpoint: JSON-RPC core and read-only tool dispatch."""

import json
import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes.mcp import router as mcp_router


class _SignalEngine:
    def list_signals(self):
        return [{"id": "BTCUSD-1h-BUY_ZONE", "symbolId": "BTCUSD"}]

    def list_backtest_presets(self):
        return [{"id": "btcusd-1h-trend", "metrics": {"tradeCount": 41}}]


class _StateStore:
    def get_paper_account(self):
        return {"balance": 100000.0, "openPositions": []}

    def list_watchlist(self):
        return [{"symbol": "BTCUSD", "market_type": "crypto"}]

    def list_paper_closures(self):
        return [{"symbolId": "BTCUSD", "pnl": 12.5}]


class _TradeReview:
    def review(self):
        return {"summary": {"trades": 2, "average_process_score": 80}}


def _client() -> TestClient:
    app = FastAPI()
    app.state.signal_engine = _SignalEngine()
    app.state.state_store = _StateStore()
    app.state.trade_review_service = _TradeReview()
    app.include_router(mcp_router)
    return TestClient(app)


def _rpc(client: TestClient, method: str, params=None, message_id=1):
    payload = {"jsonrpc": "2.0", "id": message_id, "method": method}
    if params is not None:
        payload["params"] = params
    return client.post("/mcp", json=payload)


class McpServerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = _client()

    def test_initialize_reports_server_info_and_tools_capability(self) -> None:
        response = _rpc(self.client, "initialize")
        result = response.json()["result"]
        self.assertEqual(result["serverInfo"]["name"], "quantglass")
        self.assertIn("tools", result["capabilities"])
        self.assertIn("not financial advice", result["instructions"].replace("never", "not"))

    def test_tools_list_exposes_read_only_tools(self) -> None:
        result = _rpc(self.client, "tools/list").json()["result"]
        names = {tool["name"] for tool in result["tools"]}
        self.assertEqual(
            names,
            {
                "list_signals",
                "list_backtest_presets",
                "get_paper_account",
                "list_watchlist",
                "list_paper_closures",
                "get_trade_review",
            },
        )
        for tool in result["tools"]:
            self.assertIn("inputSchema", tool)

    def test_tools_call_returns_signal_payload(self) -> None:
        result = _rpc(self.client, "tools/call", {"name": "list_signals"}).json()["result"]
        self.assertFalse(result["isError"])
        payload = json.loads(result["content"][0]["text"])
        self.assertEqual(payload["items"][0]["symbolId"], "BTCUSD")

    def test_tools_call_paper_account(self) -> None:
        result = _rpc(self.client, "tools/call", {"name": "get_paper_account"}).json()["result"]
        payload = json.loads(result["content"][0]["text"])
        self.assertEqual(payload["balance"], 100000.0)

    def test_unknown_tool_returns_invalid_params(self) -> None:
        body = _rpc(self.client, "tools/call", {"name": "submit_order"}).json()
        self.assertEqual(body["error"]["code"], -32602)

    def test_unknown_method_returns_method_not_found(self) -> None:
        body = _rpc(self.client, "resources/list").json()
        self.assertEqual(body["error"]["code"], -32601)

    def test_notification_is_acknowledged_without_body(self) -> None:
        response = self.client.post(
            "/mcp", json={"jsonrpc": "2.0", "method": "notifications/initialized"}
        )
        self.assertEqual(response.status_code, 202)

    def test_ping_round_trips(self) -> None:
        self.assertEqual(_rpc(self.client, "ping").json()["result"], {})


if __name__ == "__main__":
    unittest.main()
