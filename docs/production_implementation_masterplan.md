# QuantGlass Production Implementation Masterplan

## Purpose

This document is the canonical execution plan for taking QuantGlass from the current mock-first prototype into a production-grade local-first desktop application.

Milestone checklists and acceptance gates live in `docs/milestones/` and should be used as the execution companion to this plan.

It is written for autonomous execution. The intent is not "ship everything in one giant change". The intent is "execute the full program end-to-end without drifting from architecture, contracts, safety rules, or quality gates".

## Current Baseline

The repository already has the correct top-level boundaries:

```text
apps/
  backend/        FastAPI service, scheduler, SQLite/DuckDB scaffolding
  desktop/        React + Tauri desktop application
packages/
  contracts/      shared TypeScript contracts for desktop/backend integration
docs/
  financial_signal_app_vision_architecture_v2.md
  production_implementation_masterplan.md
mock/
  legacy prototypes and fixture references
```

The current implementation state is:

- Desktop routes, charts, mock views, and Tauri shell are in place.
- Backend health, watchlist, provider settings, AI settings, and alerts are implemented.
- Shared contracts exist and are the required boundary for new desktop/backend integration.
- Market corridor ingestion (public crypto + stock providers), normalization with integrity
  checks, DuckDB analytics with Parquet archival, the deterministic signal engine
  (regime gating, setup families, honest in-sample/out-of-sample backtesting, pooled
  expectancy, empirical-Bayes win-rate calibration), local-model narration with an
  anti-hallucination fact guard, encrypted/keychain secrets, the live-trading safety gate,
  and scheduled market/signal refresh jobs are implemented and unit-tested.
- Remaining/optional: cross-sectional relative-strength ranking, optional vectorbt
  parameter-robustness tooling, and retiring unused provider stubs.

### Tooling status (audited)

- **vectorbt v1.0.0** is available for optional parameter-robustness heatmaps and
  walk-forward studies but is NOT a runtime dependency; the shipped backtester is a
  pure-Python first-touch ladder simulator (no pandas/numpy in the hot path).
- **pandas-ta** is intentionally NOT used (the pinned distribution 404s and pulls a heavy
  pandas/numpy stack); all indicators (EMA, SMA, RSI/RSI2, ATR, ADX, MACD, Bollinger,
  Donchian, Keltner) are hand-rolled in pure Python in `signal_engine.py`.
- **Lightweight Charts** is Apache-2.0 licensed and used on the desktop for candle rendering.


## Program Objective

Deliver a production-grade local-first desktop application that satisfies the architecture document with these characteristics:

- Tauri desktop app with React/TypeScript frontend.
- FastAPI local backend with WebSocket event path and scheduled jobs.
- SQLite for operational state.
- DuckDB for analytics and backtest snapshots.
- Parquet for long-term candle archives.
- Capability-segregated provider adapters.
- Closed-candle-only signal pipeline with normalization and integrity checks.
- Statistically honest backtesting before any signal is trusted.
- AI narration constrained to deterministic engine facts.
- Paper trading first, live trading only after keychain-backed safety gates.

## Non-Negotiable Rules

1. Contracts-first: every desktop/backend integration starts in `packages/contracts`.
2. Closed-candle rule: no signal logic may act on a forming candle.
3. Data integrity before indicators: normalize UTC, dedupe, gap-check, validate ranges.
4. Backtesting gates trust: signal outputs are not treated as credible until Phase 7 passes.
5. Paper-first safety: no live execution path before keychain support, confirmations, and scoped credentials exist.
6. Local-first operation: desktop app must keep a usable degraded mode when backend or providers are unavailable.
7. Small validated slices: each autonomous change must finish with compile/test/smoke validation before widening scope.

## Target End-State by Boundary

### `packages/contracts`

- Canonical API request/response contracts.
- Canonical signal, alert, backtest, provider, paper-trading, and event payloads.
- Generated OpenAPI artifacts later if committed deliberately.

### `apps/backend`

- API routes grouped by domain.
- Service layer for provider orchestration, signal generation, backtesting, alerting, and paper execution.
- Repositories over SQLite/DuckDB/Parquet.
- Scheduler jobs for market refresh, signal refresh, alert scans, and cache maintenance.
- Event broadcaster for desktop updates.
- Provider adapters for crypto, stocks, news, AI, and trading.

### `apps/desktop`

- Presentation-only React screens and UI state.
- Typed API client only through `packages/contracts`.
- No business rules duplicated from backend.
- Tauri shell integration for notifications, keychain bridge, and release packaging.

## Workstreams

### A. Contracts and API Governance

- Expand contracts to cover signals, dashboards, backtest runs, strategy presets, paper orders, provider credentials metadata, and event streams.
- Add OpenAPI generation or equivalent source-of-truth flow.
- Enforce schema compatibility between backend responses and desktop types.

### B. Backend Platform Core

- Separate routes, services, repositories, domain models, and scheduler concerns.
- Add application config modules for environment, provider selection, storage, and safety policies.
- Add structured logging, health detail, and startup checks.

### C. Storage and Data Lifecycle

- Define SQLite schema migrations for settings, watchlists, alerts, signals, strategies, paper positions, and audit records.
- Define DuckDB schema for backtest runs, feature snapshots, expectancy tables, and analytics queries.
- Define Parquet partitioning for candle archives by market/symbol/timeframe/date.

### D. Provider Adapter Layer

- Implement CCXT exchange adapters for Coinbase/Kraken first.
- Implement CoinGecko metadata adapter.
- Implement Alpaca and/or Finnhub equities adapters.
- Implement provider manager routing, fallback chains, rate limiting, caching, and capability checks.

### E. Market Data Normalization Pipeline

- UTC normalization.
- Closed-candle filtering.
- Deduplication and gap detection.
- Validation of impossible values.
- Incremental updates rather than full refetch.

### F. Quant and Signal Engine

- Indicator computation in pure Python (no pandas/pandas-ta): EMA, SMA, RSI/RSI2, ATR,
  ADX, MACD, Bollinger, Donchian, Keltner.
- Support/resistance, regime, and setup classification.
- Risk engine, SL/TP ladder generation, and R:R calculation.
- Confidence basis tied to deterministic features and validated expectancy tables.
- Canonical signal object emission.

### G. Backtesting and Validation

- Strategy runner with fees, slippage, train/test split, walk-forward, and OOS scoring.
- Snapshot persistence to DuckDB.
- Expectancy lookup tables by setup type and timeframe.
- Warning surfaces for low sample and overfitting gaps.

### H. AI Layer

- Local Ollama integration first.
- Prompt templates for signal narration, risk explanation, and trade review.
- Hard constraints so AI only narrates engine facts and stored metrics.
- Optional cloud providers behind explicit opt-in.

### I. Alerts and Paper Trading

- Desktop alerts, Telegram delivery, and alert execution history.
- Paper order staging, positions, fills, and PnL journal.
- Tauri/OS keychain for trade-enabled secrets.
- Live trading gate kept disabled until hardening checklist passes.

### J. Desktop Integration

- Replace fixture-backed dashboards, signals, backtests, news, alerts, and settings with backend APIs.
- Add live refresh and WebSocket-driven updates.
- Preserve explicit loading/empty/error states for every data surface.

### K. Quality, Security, and Release Engineering

- Unit, integration, and smoke test suites.
- Lint, typecheck, schema validation, and route contract checks.
- Secrets handling through keychain or encrypted config only.
- Windows packaging, desktop signing prep, release artifacts, and rollback notes.

## Phase Plan

## Phase 0. Program Control and Guardrails

### Phase 0 Scope

- Freeze architectural rules from `financial_signal_app_vision_architecture_v2.md` into code-facing standards.
- Define the canonical implementation sequence and quality gates.
- Add missing developer tooling for repeatable validation.

### Phase 0 Deliverables

- Masterplan approved as source of truth.
- Root scripts for desktop build, backend check, test, lint, and smoke.
- Code ownership conventions for `apps/desktop`, `apps/backend`, and `packages/contracts`.

### Phase 0 Exit Criteria

- New work can be routed to a single phase and workstream without ambiguity.

## Phase 1. Contracts-First API Surface

### Phase 1 Scope

- Complete the shared contracts package for all remaining production surfaces.
- Align backend response payloads to contracts and remove duplicate desktop-only definitions.

### Phase 1 Deliverables

- Contracts for dashboard, signals, backtests, news, alerts, paper orders, and WebSocket events.
- Backend route stubs and response shims for each contract.
- Desktop client modules grouped by contract domain.

### Phase 1 Exit Criteria

- Desktop compiles using shared contracts only for all backend-backed data domains.

## Phase 2. Backend Internal Architecture Refactor

### Phase 2 Scope

- Move from route-heavy logic to service/repository separation.
- Introduce migrations and repository interfaces.

### Phase 2 Deliverables

- `api/`, `services/`, `repositories/`, `providers/`, `jobs/`, `domain/`, and `events/` layout inside `apps/backend`.
- SQLite migration strategy and first committed schema.

### Phase 2 Exit Criteria

- No persistence or orchestration logic lives inline in route modules.

## Phase 3. Settings, Alerts, and Paper State Completion

### Phase 3 Scope

- Finish the currently started persistence slice.
- Add missing audit history, strategy presets, paper positions, and settings mutation coverage.

### Phase 3 Deliverables

- Full CRUD or required mutation surfaces for settings, alerts, strategies, and paper account state.
- Desktop integration for all corresponding screens.

### Phase 3 Exit Criteria

- Settings and alerts are fully backend-backed.
- Paper state is persisted, even if market execution remains mock/paper only.

## Phase 4. Provider Adapters and Market Data Ingest

### Phase 4 Scope

- Build crypto and equities provider adapters and local caches.
- Implement market refresh jobs and cold-start backfill path.

### Phase 4 Deliverables

- CCXT Coinbase/Kraken adapters.
- CoinGecko metadata adapter.
- Alpaca/Finnhub equities data adapter.
- Local cache tables and archive write path.

### Phase 4 Exit Criteria

- Backend can fetch, normalize, cache, and serve symbol data without using frontend fixtures.

## Phase 5. Normalization and Integrity Layer

### Phase 5 Scope

- Apply UTC normalization, closed-candle enforcement, dedupe, gap checks, and value validation before analytics.

### Phase 5 Deliverables

- Data quality module with explicit integrity status outputs.
- Failed-ingest diagnostics and retry paths.

### Phase 5 Exit Criteria

- Indicator engine and signal engine can only consume validated datasets.

## Phase 6. Quant Indicators and Feature Pipeline

### Phase 6 Scope

- Compute indicators locally and persist reusable feature sets.

### Phase 6 Deliverables

- EMA/SMA/RSI/MACD/Bollinger/ATR/volume features.
- Support/resistance and regime features.
- Feature snapshot persistence to DuckDB where useful.

### Phase 6 Exit Criteria

- Symbol detail and signal preparation no longer depend on handcrafted fixtures for indicator views.

## Phase 7. Signal Engine and Canonical Signal Output

### Phase 7 Scope

- Build deterministic setup detection and confidence basis generation.

### Phase 7 Deliverables

- Buy/Sell/Hold/Wait/Watch engine.
- Risk engine and TP ladder generation.
- Canonical signal object stored and queryable through backend APIs.

### Phase 7 Exit Criteria

- Desktop signals screen and symbol detail are served from backend signal objects.

## Phase 8. Backtesting and Validation Harness

### Phase 8 Scope

- Build validation early enough to gate Phase 7 trustworthiness.

### Phase 8 Deliverables

- Backtest runner with fees, slippage, OOS split, walk-forward, and snapshot persistence.
- Expectancy lookup tables used by signal confidence basis.

### Phase 8 Exit Criteria

- Signals reference validated expectancy and sample-size metrics rather than placeholder values.

## Phase 9. AI Narration Layer

### Phase 9 Scope

- Add constrained AI narration on top of deterministic results.

### Phase 9 Deliverables

- Ollama client and prompt templates.
- Narration service that only consumes canonical signal and backtest facts.
- Optional cloud provider adapter behind opt-in.

### Phase 9 Exit Criteria

- AI surfaces never invent unsupported claims and degrade cleanly when unavailable.

## Phase 10. Alerts and Paper Trading Execution

### Phase 10 Scope

- Move from configuration persistence to real local evaluation and paper execution flows.

### Phase 10 Deliverables

- Alert evaluator jobs and desktop notification delivery.
- Telegram alert delivery.
- Paper order submission, fill simulation or broker-paper integration, and position/PnL updates.

### Phase 10 Exit Criteria

- Alert history is generated by execution, not just seeded fixtures.
- Paper account screens are backend-backed.

## Phase 11. Desktop Data Migration

### Phase 11 Scope

- Remove remaining screen dependence on static fixtures.

### Phase 11 Deliverables

- Dashboard, signals, watchlist, alerts, settings, symbol detail, and backtesting screens served from backend APIs.
- Fixture layer kept only for development fallback or deleted where obsolete.

### Phase 11 Exit Criteria

- Desktop app is functionally driven by backend state and provider data.

## Phase 12. Security, Hardening, and Release Readiness

### Phase 12 Scope

- Complete the production hardening pass.

### Phase 12 Deliverables

- Keychain-backed trade credentials.
- Audit logs for critical state changes.
- Structured error reporting and recovery paths.
- Windows release pipeline and installer packaging strategy.
- Release checklist, rollback notes, and backup/export strategy.

### Phase 12 Exit Criteria

- Application is ready for controlled production use.

## Autonomous Execution Protocol

Autopilot execution must follow this exact loop:

1. Pick the next unfinished phase with the strongest dependency priority.
2. Define the smallest end-to-end slice inside that phase.
3. Update contracts first when the slice crosses desktop/backend boundaries.
4. Implement backend support.
5. Implement desktop integration.
6. Run the narrowest validation available.
7. Fix only defects from that slice.
8. Repeat until the phase exit criteria are satisfied.
9. Move to the next phase only when the current phase has a stable baseline.

## Validation Matrix

Every slice must leave behind executable validation.

### Desktop

- `npm run desktop:build`
- route-level smoke checks where behavior changed
- Tauri build checks when shell behavior changed

### Backend

- `npm run backend:check`
- route smoke tests for any new or changed endpoint
- repository/service tests as they are introduced

### Cross-Boundary

- contract compatibility checks
- desktop client to backend smoke tests
- persistence verification for any stateful mutation path

## Definition of Done

QuantGlass is only considered production-grade when all of the following are true:

1. Core screens are backend-driven rather than fixture-driven.
2. Market data is provider-backed, normalized, and cached locally.
3. Signals are deterministic, closed-candle-only, and tied to validated expectancy metrics.
4. Backtesting includes fees, slippage, OOS evaluation, and visible warnings for low sample or overfit conditions.
5. AI narration is constrained to engine facts.
6. Alerts execute locally and produce history records.
7. Paper trading is persistent and auditable.
8. Secrets are stored in the OS keychain or encrypted config, never plaintext in SQLite.
9. Desktop and backend both have repeatable validation and release procedures.
10. Windows client packaging is reproducible.

## Immediate Next Slices

Execute the next slices in this order:

1. Finish Phase 3 by adding paper account persistence, strategy persistence, and alert-history generation.
2. Start Phase 4 with provider adapter implementations and a minimal ingest/caching path for BTC/USD and SPY.
3. Start Phase 5 normalization on the same symbols before expanding coverage.
4. Use those two symbols as the validation corridor for Phase 6 to Phase 8 before widening to the rest of the universe.

This document is the master plan. All future implementation work should be justified against one of its phases and exit criteria.
