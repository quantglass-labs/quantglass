<!-- SPDX-FileCopyrightText: 2026 QuantGlass contributors -->
<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Integrations

How to connect QuantGlass to the data, AI, and tools you use. Everything here is
**opt-in** and **local-first** — nothing leaves your machine until you configure
it. For the full breakdown of what touches the network and when, see
[network-transparency.md](../network-transparency.md).

| Guide                                      | What it covers                                                                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| [Data providers](data-providers.md)        | Public market data (on by default, idle until you track a symbol) and keyed providers (Alpaca, Finnhub, Polygon, Twelve Data) |
| [AI models (bring your own)](ai-models.md) | Local Ollama (default) and optional cloud providers; the numeric fact-guard                                                   |
| [MCP server](mcp-server.md)                | Use QuantGlass as a grounded, read-only market-facts source in Claude / Claude Code or any MCP client                         |
| [Alerts](alerts.md)                        | Telegram and email (SMTP) delivery                                                                                            |
| [Strategy export](strategy-export.md)      | Export a researched strategy as a portable, versioned JSON artifact                                                           |

> **Reminder:** QuantGlass is educational and research software — **not financial
> advice**. None of these integrations turn it into a live trading service;
> built-in execution is paper-only in the public preview.
