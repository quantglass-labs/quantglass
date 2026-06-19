<!-- SPDX-FileCopyrightText: 2026 QuantGlass contributors -->
<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# MCP server

QuantGlass exposes its **read-only** engine tools over the
[Model Context Protocol](https://modelcontextprotocol.io), so Claude Desktop,
Claude Code, or any MCP client can use your local engine as a grounded
market-facts source. The server is implemented in
[`apps/backend/app/api/routes/mcp.py`](../../apps/backend/app/api/routes/mcp.py)
and is served on **loopback only**.

## Endpoint

JSON-RPC over `POST /mcp`. It implements `initialize`, `tools/list`,
`tools/call`, and `ping`. The server identifies itself as `quantglass`.

## Available tools (all read-only)

| Tool                    | Returns                                    |
| ----------------------- | ------------------------------------------ |
| `list_signals`          | Current actionable signals                 |
| `list_backtest_presets` | Available backtest presets                 |
| `get_paper_account`     | Paper account balance and positions        |
| `list_watchlist`        | Tracked symbols with market type and notes |
| `list_paper_closures`   | Closed paper positions (the ledger)        |
| `get_trade_review`      | The behavioral trade-review summary        |

There are **no write tools** — an MCP client can read engine facts but cannot
place trades, change settings, or modify your data.

## Connecting a client

The bundled desktop app binds the backend to a **dynamically chosen free
loopback port**, so for a stable MCP connection run the backend yourself on a
known port:

```bash
# from the repo, or via the Docker server-mode image (see the README)
PYTHONPATH=apps/backend python apps/backend/run_server.py --host 127.0.0.1 --port 8000
```

Then point your MCP client at:

```
http://127.0.0.1:8000/mcp
```

Quick smoke test:

```bash
curl -s http://127.0.0.1:8000/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Because the tools are read-only and loopback-bound, exposing QuantGlass to an AI
agent never risks unintended trades or data changes.
