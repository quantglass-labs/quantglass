# Changelog

All notable changes to QuantGlass are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Missions now open with a **daily briefing**: a discipline streak (consecutive
  days of Academy/mission work, rewarding consistency — never profit), a
  seven-day activity strip, your longest run, and a date-seeded "today's
  mission" so there is always one clear rep to do. Localized in all 20 languages.
- Passing a decision drill now reveals your **discipline streak** as the
  reward — the consistency of showing up, never the trade's P&L.
- A global **command palette** (⌘K / Ctrl+K, also reachable from the header
  search) to jump to any screen or symbol — fully keyboard-driven (↑/↓, ↵, esc).
  Localized in all 20 languages.
- The Dashboard now greets you by time of day with the date, and surfaces your
  **discipline streak** as a chip that links to Missions — pulling the practice
  loop onto the home screen. Localized in all 20 languages.

### Changed

- The Missions surface (catalog, daily briefing, decision drills, replay player)
  now uses the app's premium design system instead of its own off-palette
  styling, so it matches the rest of QuantGlass.
- The shared AI insight panel (present on every screen) now uses the design
  system with a subtle accent glow and reveal, and the AI-text and
  backend-status components match it — one consistent premium look app-wide.
- The last off-system screens — the Academy (catalog, lesson, practice,
  progress, library views), Review, Journal, and Portfolio — now use the design
  tokens too. The app is now at **zero raw-palette utilities**: one coherent
  premium surface from end to end.

## [0.3.1] - 2026-06-18

### Fixed

- **Orphaned backend sidecar no longer strands the analytics database.** After a
  crash or force-quit of the desktop app, the bundled backend was only stopped on
  a graceful exit — so it could be left running and keep the analytics DuckDB
  file lock, breaking the next launch with "Could not set lock on file …
  quantglass.duckdb". The sidecar now self-terminates the moment its parent app
  goes away (a cross-platform parent watchdog), so it can never outlive the app.
- **The AI numeric fact guard is now locale-robust.** When narration is generated
  in a non-English language the model may localize numerals (non-Latin digits or
  comma/dot separators); the guard now canonicalizes them before checking, so a
  correct figure is no longer spuriously rejected (and a localized number is no
  longer mis-read). The guard still fails closed.

### Added

- **Comprehensive developer documentation** for the SDK and extensions: a full
  `quantglass-sdk` API reference and changelog, and an illustrated extension
  guide suite (providers, strategies, indicators, content packs & localization,
  packaging & trust) alongside polished per-surface reference docs.

### Changed

- README now leads with the 20-language multilingual support; ROADMAP marks
  shipped work and leads with native-speaker translation review; translation
  status is described honestly (machine-translated, native review in progress);
  and `SECURITY.md` links the private vulnerability-reporting path.

## [0.3.0] - 2026-06-18

### Added

- **Multilingual interface — full coverage.** QuantGlass now speaks 20 languages
  end to end, selectable from Settings — English, 中文, हिन्दी, Español, العربية,
  Français, বাংলা, Português, Русский, اردو, Bahasa Indonesia, Deutsch, 日本語,
  فارسی, Türkçe, 한국어, Tiếng Việt, Italiano, سنڌي, and Kiswahili. Localization
  now spans every screen and surface: navigation and shared chrome, all Settings
  tabs (Providers, API keys, AI models, Extensions, Strategies), the Academy
  (121-lesson catalog across 23 tracks, the glossary/reference/progress/practice
  views, and the interactive engine-true visuals — regime scrubber, Monte Carlo,
  conformal visualizer, candlestick anatomy, risk sandbox, candle builder,
  indicator playground, order-book auction, leverage explorer), the 108-mission
  behavioral catalog with decision drills and replay scenarios, the AI Copilot,
  the daily AI insight, and the canonical Signal Detail drawer. The four
  right-to-left languages (Arabic, Urdu, Persian, Sindhi) mirror the whole
  layout. AI insights — narration, coaching, postmortems, research reviews —
  answer in the selected language; the choice is remembered locally. Engine
  formulas, indicator names, tickers, R-values, and numeric readouts stay
  verbatim across every language.

### Changed

- CI/release workflows bump their GitHub Actions to the first Node 24 majors
  (`checkout@v5`, `setup-node@v5`, `setup-python@v6`, `upload-artifact@v5`,
  `download-artifact@v5`), ahead of GitHub forcing Node 20 actions onto Node 24
  (2026-06-16) and removing the Node 20 runtime (2026-09-16).
- Refreshed the README screenshot tour with current captures of the Dashboard,
  Signals, Watchlist, Academy, Backtesting, and AI Copilot.

## [0.2.6] - 2026-06-15

### Changed

- The premium visual language introduced on the Dashboard now spans **every
  primary screen**. Signals, Portfolio, Backtesting, Watchlist, Review, Journal,
  Missions, and the Learn progress view all lead with elevated metric tiles that
  **count up** on change and **fade in** with depth (all reduced-motion aware), so
  the numbers that matter — win rate, net P&L, process scores, relative strength,
  Academy completion — read consistently across the app. Presentation only; no
  change to data or behavior.

## [0.2.5] - 2026-06-15

### Changed

- The Dashboard is rebuilt as a live **market pulse**. It now leads with the
  **top active signals** (ranked by confidence across the whole universe) and a
  **market grid** of every tracked symbol — price, change, a regime-colored
  closed-candle sparkline — plus a biggest-movers list, so the full 30/30
  universe is visible at a glance instead of three fixed hero cards. The metric
  tiles gained depth and count-up motion (reduced-motion aware), and the morning
  brief is a compact strip so the numbers lead. The dashboard surfaces what's
  changing each session rather than the same static layout.

## [0.2.4] - 2026-06-15

### Fixed

- Signals now load instantly and reliably across the expanded universe. The
  signals API serves a shared, warm in-memory cache instead of recomputing
  detection and backtests for the whole universe on every request, so a poll
  returns in milliseconds (cold reads dropped from minutes to ~0.03s) and the
  cache is warmed in the background.
- The signal list is no longer empty when signals exist. A regression built a
  throwaway signal engine on every request, so each caller read an empty cache;
  the API now uses the shared engine that the background warm populates.

## [0.2.3] - 2026-06-15

### Added

- **A bigger market out of the box.** The default tracked universe expands from
  ~12 symbols to **30 stocks/ETFs + 30 crypto** — index/sector/macro ETFs plus
  large caps, and 30 USD crypto pairs — so the dashboard, signals, and rankings
  cover a real market on first launch.
- **Track any symbol.** The watchlist search now offers "Track ‹ticker›" (Stock
  or Crypto) for tickers it doesn't already know. Added symbols join the market
  corridor and flow into signals and backtests after the next refresh, so the
  tracked universe is no longer a fixed list — Yahoo fetches any stock ticker and
  the crypto providers resolve arbitrary `‹base›USD` pairs.
- **Enable extensions from the app.** Settings → Extensions has a "Load
  extensions" toggle (persisted, takes effect on the next restart), so the
  released desktop app can load installed extension packages without setting an
  environment variable. Extensions remain off by default.

### Fixed

- The macro-proxy ETFs (UUP/TLT/GLD/RSP) that feed intermarket context now fetch
  on the free provider instead of being rejected, so the dollar/rates/gold/breadth
  context signals work out of the box.
- A market refresh no longer aborts the whole cycle when one symbol fails (a rate
  limit or an unfetchable ticker) — the failure is recorded and the rest continue.

## [0.2.2] - 2026-06-15

### Added

- Docker self-host mode is safer to expose. The container now publishes to host
  loopback by default; an optional `QUANTGLASS_SERVER_AUTH_TOKEN` gates every
  request when you deliberately expose it beyond localhost; and the served app
  offers its Corresponding Source at `/source` (AGPL §13), linked from the footer.

### Changed

- AI surfaces that auto-load on a screen (per-screen insight, daily brief, signal
  narration) now use a shorter timeout so a slow local model can't leave a screen
  spinning — they fall back to the engine's deterministic content. Explicit,
  user-initiated calls (tutor, Copilot, postmortems, coach note) still wait the
  full configured timeout.

### Fixed

- The backend reported version 0.2.0 in its OpenAPI schema and Swagger UI while
  every other manifest said 0.2.1. The runtime version is now single-sourced and
  guarded by a test so it can't drift from the package version again.
- The issue-template security-report and commercial-licensing links pointed at a
  stale namespace and 404'd; both now resolve.

## [0.2.1] - 2026-06-14

### Changed

- AI text everywhere (tutor, copilot, daily brief, signal narration, coach's
  note, postmortems, on-screen insights) now renders Markdown — headings,
  bold/italic, lists, tables, and code — instead of showing the raw Markdown
  characters models emit. Embedded HTML is never rendered, so model output
  cannot inject markup.

### Fixed

- AI requests no longer time out before the model can answer. On-demand AI
  calls now honour the configured request timeout instead of a short fixed
  client deadline (the tutor previously failed in ~12s regardless of the
  setting), and the default timeout was raised from 8s to 120s so cold or
  large local models have time to respond out of the box.

- Ollama reasoning models (qwen3, deepseek-r1, …) now narrate: the gateway
  sends `think: false` so the model returns its answer instead of leaving
  `response` empty while it reasons. (#86)

- AI provider test: the runtime diagnostic no longer appears twice on a failed
  test, and the runtime badge uses a warning tone instead of success-green when
  the test fails (the model can be loaded yet the test fail). (#83, #84)

## [0.2.0] - 2026-06-12

### Added

**QuantGlass Academy** — the learning platform became the spine of the product:

- 121 lessons across 23 tracks and 4 levels (novice → expert), with level
  exams (80% bar, persisted best), test-out placement, key terms, common
  mistakes, and lesson → mission bridges.
- Visual learning system: declarative diagrams, interactive widgets (risk
  sandbox, candle builder, indicator playground, auction sim, payoff
  explorer) and engine-true explorers (regime scrubber, Monte Carlo
  animator, conformal visualizer) on 62 lessons.
- Mastery loop: spaced-repetition flashcards (SM-2-lite) over completed
  lessons' key terms, derived XP with named levels, daily streaks, and
  per-track badges in a Practice view.
- Library views: global glossary (460+ deduped terms), reference library
  (indicators, order types, formulas, scam checklist), progress analytics
  with weekly pace, and local completion certificates.
- AI lesson tutor: ask any lesson a question, grounded in its own content.

**Missions & the behavioral feedback loop** (capture → score → detect →
prescribe → gate):

- Plan-aware paper ticket (stop, target, risk %, reason, emotion) with
  process scores and the decision-vs-outcome 2×2 (earned win, well-played
  loss, honest tuition, dangerous success).
- A 108-mission catalog across 12 categories with tiered ladders for every
  level, active mission slots (accept / stand down, max 3), per-objective
  deep links, and decision drills: 12 interactive scenario drills scored on
  Process / Risk / Discipline where severe choices fail the run.
- Replay missions: stylized market episodes played bar-by-bar with graded,
  engine-fact debriefs.
- Journal (notes + mistake tags) and Review (weekly summary, repeated-
  mistake detection with lesson/mission prescriptions, AI coach narrative).
- Personal Trading Constitution: user-authored rules enforced at the
  ticket; violating submissions are rejected with the rules named.
- Community lesson packs and mission packs via the extension SDK
  (validated declarative content; SDK 0.3.0).

**Signal engine v3**:

- Signal taxonomy: 32 setup types across 10 families with family/layer/
  class placement, taxonomy display names, quality scored separately from
  confidence, and Academy-gated expert-layer signals.
- Context signals (regimes, volatility states, z-score extremes,
  relative-strength ranks, ETF-proxy macro/breadth reads, FOMC/CPI event
  watches) and portfolio/risk meta-signals (heat, clusters, drawdown,
  cooldown, kill switch) wired to the constitution.
- Honest composite flags derived from pooled backtests (follow-through
  probability, false-break probability, signal decay).
- Confidence calibration ledger: predicted vs realized win rate per
  confidence decile with drift reporting.
- Multi-timeframe corridor matrix (26 series) including macro proxy ETFs.

**Backtesting workbench**:

- Cost-stress scenarios, out-of-sample Monte Carlo drawdown distribution,
  seven bias/quality gates, experiment fingerprint, and an AI research
  review whose verdict is computed deterministically from the run.
- Workflow redesign: collapsible explainer, readiness checklist, primary
  Run action, guided empty states with a demo strategy, result previews,
  and a manual composer (symbol × setup family × timeframe) constrained to
  timeframes the corridor actually stores.
- Behavioral dataset export (trades, journal, calibration as local CSVs).

**Trading at platform parity** (paper venue, honest closed-candle fills):

- Order types on the ticket: market, limit, and stop entries; Day/GTC/GTD
  time in force with self-expiry; trailing stops that ratchet from the
  best closed price; the plan's stop and target enforced as a live OCO
  bracket. Limit/stop unlock with the Order Types lesson; stop-limit is
  deliberately not simulated and is taught in a drill instead.
- Portfolio screen: account tiles, open positions with full and partial
  close (Close ½), working orders with cancel, and a permanent closure
  ledger recording every exit with PnL, R-multiple, and exit kind.
- Account guards: orders above buying power are rejected with the maximum
  affordable size; opposing positions must be closed first (no netting);
  shorts reserve full notional.
- Live order-type mapping: the full ticket reaches broker clients; the
  Alpaca reference mapping produces native limit/stop/bracket/OTO orders
  and refuses what the broker cannot express (GTD, entry-attached trails)
  instead of silently downgrading.

**AI everywhere v2**:

- QuantGlass Copilot: a chat drawer on every screen answering questions
  about your own workstation over the read-only tool registry — the model
  proposes tools, the engine executes them, the model narrates only those
  results behind the fact guard.
- AI daily brief on the Dashboard; natural-language alert creation
  (model proposes, deterministic parser validates); per-screen AI insights
  for journal, watchlist, missions, and portfolio; drill instructor
  debriefs and per-trade postmortems that grade the decision, not the
  outcome.
- Every AI panel renders three states (loading / narration with source
  chip / explicit unavailable) — an AI surface is never silently absent.
- The MCP server registry extended with closed-trade and trade-review
  tools and shared with the in-app Copilot.

**Platform**:

- AI everywhere on the narration covenant: backtest research review,
  weekly coach narrative, lesson tutor, and on-demand signal narration —
  fact-guarded, template fallback, source always labeled, with a header
  chip showing the active model.
- Volume/RSI/MACD in dedicated chart panes (lightweight-charts v5 panes).
- Local automated extension review with trust labels (trusted-content /
  reviewed / caution).
- OS keychain enforcement: live-trading confirmation refuses without a
  usable keychain.
- Boot splash, backend-status notices on every screen, signal feed error
  surfacing, and signal polling with per-candle caching.
- Modals cap at viewport height with a pinned header and scrollable body,
  and close on Escape and backdrop click; drawers close on Escape.
- Documentation refresh: Portfolio and AI-features user-guide chapters,
  full API reference, AI surface map, and a streaming-quotes assessment
  (websockets deferred; fills stay on closed candles).

### Changed

- Coverage-guaranteed signal confidence: split-conformal next-trade R
  intervals over out-of-sample trades, shown in the signal drawer.
- Model Context Protocol server at `POST /mcp` exposing read-only engine
  facts (signals, backtest presets, paper account, watchlist).
- Structured-output narration with a numeric fact guard across Ollama and
  OpenAI-compatible providers; feed narration is always the instant
  deterministic template, model narration runs per signal on demand.
- lightweight-charts upgraded to v5; signal engine, state store, model
  gateway, and learn content refactored into focused packages.
- Numbered SQLite migration framework with WAL journaling; JSON Schema
  validation for lesson content in CI; stable extension SDK surface.
- `react-hooks/set-state-in-effect` restored to error with zero
  violations; eslint runs clean at full strictness.
- CI and release workflows skip on private repositories so no metered
  Actions minutes are ever consumed; they activate automatically when the
  repository goes public.

### Security

- Trade-enabled credentials require the OS keychain; file fallback is
  refused for live-trading enablement.
- glib advisory (GHSA, medium) triaged as upstream-blocked: pinned by
  tauri 2.x → gtk 0.18; the unsound API is not invoked. Re-evaluated on
  each Tauri bump.

## [0.1.0] - 2026-06-11

First public preview release.

### Added

- FastAPI backend with deterministic indicators, signal generation,
  cost-aware backtesting, alerts, saved strategies, and paper-trading state.
- React + Tauri desktop app with dashboard, watchlist, signals, symbol
  detail, backtesting, alerts, learning, and settings screens.
- Provider adapters for public crypto and US equity market data, plus keyed
  Alpaca, Finnhub, Polygon, and Twelve Data support with custom provider
  profiles.
- AI narration through template fallback and a local/API model gateway
  (Ollama, LM Studio, OpenAI-compatible endpoints, and native providers)
  with fact guards.
- Extension registries for providers, AI gateways, strategies, indicators,
  backtest models, execution adapters, notifications, import/export,
  data-quality checks, and UI surfaces, with workspace extension loading.
- Interactive learning platform with a four-tier curriculum tied to live
  app data.
- Signal data freshness badges and native desktop alerts.
- Encrypted local secret storage with optional OS keychain routing for
  trade-capable keys.
- Backup/restore state bundles and license report generation.
- CI covering lint (ruff, ESLint, Prettier, rustfmt, clippy), tests
  (pytest, Vitest, cargo test), builds, and license reports; tag-driven
  release builds for Linux, Windows, and macOS.

### Security

- Backend binds to loopback only; the desktop shell manages it as a
  sidecar.
- Live broker execution is unavailable in the public preview; paper
  trading is the supported execution path.

[Unreleased]: https://github.com/quantglass-labs/quantglass/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/quantglass-labs/quantglass/releases/tag/v0.1.0
