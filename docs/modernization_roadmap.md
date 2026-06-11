# Modernization Roadmap — Pre-Public Enhancement Plan

**Date:** 2026-06-11
**Scope:** the six refactored modules (signal engine, state store, learn
platform, model gateway, desktop, extension SDK), researched against the
mid-2026 ecosystem.

## Positioning: where QuantGlass can stand out

The 2026 landscape is crowded but segmented. vectorbt (v1.0, Rust engine,
walk-forward built in) owns research-speed backtesting; NautilusTrader owns
production-parity execution; freqtrade (with FreqAI and CAGR/Calmar/Sortino/
SQN metrics in 2026.1) owns crypto bots; OpenBB owns the data platform layer
and is pushing MCP servers for AI agents; TradingAgents-style multi-agent LLM
frameworks own "AI trading firm" simulation; TradeQuest-style apps own
gamified education. **Nobody combines statistically honest signals with
guarantees, learn-by-doing tied to a live engine, fact-locked local AI, and a
trusted plugin ecosystem in one local-first desktop app.** That combination is
the moat. Four flagship differentiators fall out of the research:

1. **Coverage-guaranteed confidence** — conformal prediction on trade
   outcomes, so every confidence number carries a finite-sample statistical
   guarantee. No retail OSS tool does this.
2. **QuantGlass as an MCP server** — expose the local engine (signals,
   backtests, paper account, freshness) as Model Context Protocol tools so
   Claude/agent frameworks treat QuantGlass as their trusted local market
   brain. Rides the agentic wave without giving up local-first.
3. **Learning that watches you trade** — lessons triggered by the user's own
   paper-trading mistakes, with live engine data inside every exercise.
4. **A verified extension registry** — Obsidian-style automated review,
   permission manifests, and trust labels, which the manifest/permission
   plumbing already supports.

---

## 1. Signal engine

**Modernize**

- Adopt **incremental indicator computation** (talipp-style O(1) updates per
  candle) behind the existing pure functions, so scheduler refreshes stop
  recomputing 320-candle windows per symbol. Keep the zero-dependency pure
  Python default; expose the indicator kernel behind an interface so a
  Cython/Rust accelerator (mintalib, ta-lib-in-rust) can be an optional
  extension.
- Match freqtrade's 2026 metric surface, then exceed it: add CAGR, Calmar,
  SQN, and **probabilistic/deflated Sharpe** so multiple-testing bias is
  surfaced, not hidden.

**Extend**

- Orthogonal setup families behind the strategy registry (breakout/Donchian
  and mean-reversion families exist; add volatility-compression and
  cross-sectional momentum) with per-family pooled expectancy (issue #15).
- **Purged walk-forward**: embargoed train/test splits to kill leakage at the
  boundary, plus a Monte Carlo bootstrap over trade outcomes to report
  drawdown *distributions* rather than a single max-drawdown number.
- Optional **vectorbt adapter extension** for heavy parameter sweeps —
  interop rather than competition with the research-speed segment.

**Differentiate**

- **Conformal confidence (flagship)**: split-conformal prediction over pooled
  trade outcomes per setup family/regime, producing prediction sets with
  user-chosen coverage (e.g. 90%). UI shows "confidence 72% · coverage-
  guaranteed at 90% over n=214 OOS trades". Calibration tracking table
  (predicted vs realized by bucket — issue #16) makes the guarantee
  auditable in-app.

## 2. State store

**Modernize**

- Turn on **SQLite WAL mode** + busy timeouts; replace per-store ad-hoc
  `ALTER TABLE` checks with a single **numbered migration framework**
  (one `migrations/` table, per-domain migration files).
- Append-only **event journal** for signals, trades, and settings changes —
  reproducibility ("what did the engine believe at 14:00?") and the data
  source for calibration tracking.

**Extend**

- **Parquet archive via DuckDB** (already a dependency): archive closed
  candles and trade events to partitioned Parquet so the analytics store
  stays small and exports are portable; note Vortex as a watch-item format.
- Encrypted backup snapshots on schedule, building on the existing bundle
  export/restore.

**Differentiate**

- "**Your data is a dataset**": one-click export of the user's full research
  history (candles, signals, outcomes, lessons) as Parquet + JSON with a
  documented schema — uniquely honest data portability for a trading app.

## 3. Learn platform

**Modernize**

- Mastery loop: spaced-repetition review of key terms, XP/streaks, and module
  completion badges — the gamified-academy segment (TradeQuest et al.)
  validates demand, but ours stays grounded in real app surfaces.
- JSON Schema for lesson files + CI validation, so community lesson packs
  are safe pure-content PRs (content already extracted to
  `app/content/lessons/`).

**Extend**

- **Scenario replay**: drive the paper-trading sandbox through historical
  episodes (a crash week, a halving run-up) with graded outcomes and a
  debrief generated from engine facts.
- Community lesson packs via the extension SDK (a `lessons` capability), with
  localization-ready content files.

**Differentiate**

- **Lesson moments (flagship)**: detect teachable events in the user's own
  paper trading — oversized position, stop too tight for the volatility
  regime, revenge-trading cadence — and surface the matching lesson with the
  user's own trade as the worked example. No competitor ties curriculum to
  the learner's live behavior.

## 4. Model gateway

**Modernize**

- **Structured outputs everywhere**: Ollama, OpenAI-compatible, Anthropic,
  and Gemini all support JSON-schema-constrained generation in 2026 — replace
  free-text narration parsing with a `NarrationFacts` schema and make the
  anti-hallucination guard a trivial numeric diff against engine facts.
- **Tool calling for grounding**: let the narrator call read-only engine
  tools (`get_signal`, `get_backtest`, `get_freshness`) instead of stuffing
  prompts, with streaming responses in the UI.

**Extend**

- Per-provider health panel from the existing runtime-state plumbing;
  response caching keyed on fact hashes (facts unchanged → no new call).

**Differentiate**

- **MCP server mode (flagship)**: serve the same read-only engine tools over
  Model Context Protocol on loopback, so Claude Code/Desktop and agent
  frameworks (TradingAgents-style) can use the user's local QuantGlass as a
  grounded market-facts source. Optionally also act as an MCP *client* to
  consume external data MCPs (Alpha Vantage et al.) as providers. This makes
  QuantGlass infrastructure for the agentic ecosystem rather than another
  chat wrapper.

## 5. Desktop

**Modernize**

- **lightweight-charts v5**: 16% smaller bundle and native **multi-pane**
  support — render RSI/MACD/volume in their own panes; evaluate the
  community drawing-tools ecosystem (trend lines, fib retracements).
- **React 19 + React Compiler** for automatic memoization; Tailwind v4;
  finish the SettingsScreen tab extraction and restore
  `react-hooks/set-state-in-effect` to error (issue #17).
- Replace polling with **WebSocket push** from the backend events route for
  signals/alerts/freshness.

**Extend**

- Command palette (Ctrl+K) across symbols/screens/actions; persistable
  workspace layouts; keyboard-first navigation (also an accessibility win).
- Tauri 2 mobile targets (iOS/Android) as a post-1.0 exploration — the shell
  already supports it.

**Differentiate**

- A **"why" drawer on every number**: click any confidence, expectancy, or
  badge to see the engine facts, sample sizes, and guarantee behind it.
  Transparency-as-UI is the visual identity of the honesty positioning.

## 6. Extension SDK

**Modernize**

- Keep hardening `app.extensions.sdk` (SDK_VERSION shipped); add typed
  result contracts and an extension **test harness** (extend
  `validate_extension_fixture.py` into `quantglass-ext test`).
- Template repository (cookiecutter) + hot-reload dev mode for extension
  authors.

**Extend**

- **Community registry, Obsidian-model**: a `quantglass-extensions` index
  repo (manifest PRs), automated scanning on every version (ruff + bandit +
  permission-diff alerts), trust labels for verified developers, and an
  in-app browser/installer. The permission manifest already exists — surface
  it as an install-time consent screen.
- Checksummed/signed release artifacts for extensions; PyPI entry-point
  distribution stays supported.

**Differentiate**

- **Permissioned, reviewed extensions** in a domain where most ecosystems
  (freqtrade strategies, MT4/MT5 marketplaces) ship unreviewed code that
  touches money. "The extension store you can trust" is a category-defining
  claim the manifest system makes credible.

---

## Suggested sequencing

| Phase | Items | Why first |
|---|---|---|
| A (pre-public) | Structured-output narration + fact guard; lightweight-charts v5 multi-pane; WAL + migrations; finish settings tabs; lesson JSON Schema | Low risk, immediately visible quality |
| B (launch wave) | Conformal confidence + calibration table; MCP server mode; lesson moments v1 | The three loudest differentiators |
| C (community wave) | Extension registry + scanning; community lesson packs; incremental indicators; Parquet archive | Scales contributors safely |
| D (later) | vectorbt adapter, scenario replay, mobile, Vortex | Optional depth |

## Sources

- [NautilusTrader](https://github.com/nautechsystems/nautilus_trader) · [vectorbt](https://github.com/polakowo/vectorbt) · [Python backtesting landscape 2026](https://python.financial/)
- [OpenBB Open Data Platform](https://openbb.co/blog/openbb-releases-open-data-platform/) · [OpenBB](https://github.com/OpenBB-finance/OpenBB)
- [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs) · [TradingAgents](https://github.com/tauricresearch/tradingagents)
- [MCP servers for market data 2026](https://www.lambdafin.com/articles/mcp-server-stock-market-data) · [Alpha Vantage MCP](https://mcp.alphavantage.co/)
- [talipp incremental indicators](https://github.com/nardew/talipp) · [mintalib](https://pypi.org/project/mintalib/) · [ta-lib-in-rust](https://docs.rs/ta-lib-in-rust)
- [Conformal forecasting in finance (MAPIE)](https://www.tildee.com/harnessing-conformal-forecasting-in-financial-markets-quantifying-uncertainty-and-managing-risk-with-mapie/) · [awesome-conformal-prediction](https://github.com/valeman/awesome-conformal-prediction)
- [Lightweight Charts v5](https://www.tradingview.com/blog/en/tradingview-lightweight-charts-version-5-50837/) · [Tauri 2](https://v2.tauri.app/)
- [DuckDB time-series + Parquet](https://kestra.io/blogs/embedded-databases)
- [Obsidian community plugins & automated review](https://obsidian.md/blog/future-of-plugins/)
- [freqtrade 2026 / FreqAI](https://www.freqtrade.io/en/stable/freqai/) · [TradeQuest gamified academy](https://tradequest.web.app/)
