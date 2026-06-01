# QuantGlass Production Fix Roadmap

**Companion to:** `docs/production_audit_report.md` (audit dated 2026-05-31)
**Target profile:** single-user, single-machine, local-first desktop app. No cloud, no shared backend, no multi-user concerns.
**How to read this:** phases are ordered by dependency and risk. Each item lists the originating gap (Gxx from the audit), affected files, complexity (S/M/L), dependencies, acceptance criteria, and suggested tests. Complexity is relative effort, not a time estimate.

> **Status note:** this roadmap was created from the 2026-05-31 production audit.
> Some items may now be partially complete. Use it as a hardening backlog, and
> verify each item against current code before starting implementation.

Priority bands:
- **P0 — Honesty/safety:** ship-blockers; do first.
- **P1 — Must-fix for production:** core product completeness.
- **P2 — Should-improve soon.**
- **P3 — Optional enhancements.**

---

## Phase A — Immediate honesty & safety guardrails (P0)

Goal: stop the app from claiming things it doesn't do, before deeper work. Low effort, removes the two critical risks (R1, R2) and de-risks live trading.

### A1. Relabel/withhold unearned claims in the UI (G1, G2 / R1, R2)
- **Affected:** `apps/desktop/src/screens/DashboardScreen.tsx`, signal/detail components rendering `ai_explanation` and `confidence_basis`; `apps/desktop/src/lib/backend.ts` (types only if needed).
- **Change:** label the current `ai_explanation` as "Rule-based summary" (not "AI"); hide or gray-out `out_of_sample_validated: true` until Phase C lands; show `sample_size` and a "not independently validated" note whenever the OOS slice is below threshold.
- **Complexity:** S · **Dependencies:** none.
- **Acceptance:** no UI string implies LLM analysis or OOS validation that the backend cannot substantiate.
- **Tests:** component snapshot tests asserting the relabeled strings; a contract test asserting the UI never renders "AI" for template explanations.

### A2. Default broker client to paper host + hard-gate live (G6 / R5)
- **Affected:** `apps/backend/app/providers/keyed.py` (`AlpacaStocksOHLCVProvider.submit_order` base URL), `apps/backend/app/core/config.py` (trading defaults), `apps/backend/app/services/trading.py` (`_submit_live_trade`).
- **Change:** point order submission at `https://paper-api.alpaca.markets` by default; require an explicit, separately-stored "live base URL + scoped key" before any live host is used; keep `trading_mode` default `paper`.
- **Complexity:** S · **Dependencies:** none (full keychain gate lands in Phase E).
- **Acceptance:** with default config, no code path can POST an order to a live host; switching to live requires an explicit non-default credential.
- **Tests:** unit test asserting default submit target host is the paper host; test that live submission raises without explicit live credentials.

### A3. Surface data freshness (partial G5 / R4)
- **Affected:** corridor/signal responses in `apps/backend/app/api/*` (market/signals routes), `DashboardScreen.tsx`.
- **Change:** include `last_candle_close_at` / `ingested_at` in signal and corridor payloads; render a "data age" badge.
- **Complexity:** S · **Dependencies:** none (auto-refresh comes in Phase E).
- **Acceptance:** every signal shows how old its underlying candle is.
- **Tests:** API test asserting freshness fields present; component test for stale badge over a threshold.

---

## Phase B — Backtest honesty & expectancy foundation (P1) — Gap G2

Goal: make "backtesting gates trust" literally true. This is the highest-value correctness work.

### B1. Backtest the *displayed* trade
- **Affected:** `apps/backend/app/services/signal_engine.py` (`_run_backtest`, and refactor so the backtest consumes the same entry-zone/stop/TP-ladder builder the live signal uses).
- **Change:** replace the fixed `2.2R / 1.35×ATR` simulation with first-touch simulation across the actual entry zone, ATR stop, and 3-rung TP ladder, applying fees + slippage at each fill.
- **Complexity:** L · **Dependencies:** A1 (so users aren't misled meanwhile).
- **Acceptance:** the win rate / expectancy attached to a signal is computed from the exact levels rendered to the user.
- **Tests:** known-answer fixtures (hand-constructed candle series where the outcome of the ladder is analytically known) asserting trade count, win rate, and expectancy_R.

### B2. Truthful in-sample / out-of-sample reporting
- **Affected:** `signal_engine.py` (remove `train*0.45+test*0.55` and the `*0.6/*0.4` walk-forward blend; add explicit IS/OOS slices and an optional walk-forward sweep), `confidence_basis` shape in `packages/contracts/src/index.ts` and `apps/desktop/src/lib/backend.ts`.
- **Change:** report `in_sample` and `out_of_sample` metric blocks separately; set `out_of_sample_validated` only when the OOS slice independently meets `min_backtest_sample` **and** a minimum expectancy floor.
- **Complexity:** M · **Dependencies:** B1.
- **Acceptance:** no single blended number; the OOS flag reflects a real OOS slice.
- **Tests:** unit test that a strategy strong IS / weak OOS yields `out_of_sample_validated = false`; contract test for the new `confidence_basis` shape.

### B3. Pooled expectancy table feeding confidence
- **Affected:** `apps/backend/app/storage/analytics_store.py` (use `backtest_snapshots` or add an `expectancy(setup_type, timeframe, regime, …)` table), `signal_engine.py` (`_derive_confidence` reads the pooled table instead of the per-symbol tiny sample).
- **Change:** aggregate backtest outcomes across the whole symbol universe by (setup_type, timeframe, regime); live confidence references the pooled expectancy, with per-symbol stats shown as secondary.
- **Complexity:** M · **Dependencies:** B1, B2; benefits from Phase E scheduling to keep the table fresh.
- **Acceptance:** confidence is backed by a pooled sample large enough to clear the validation floor in normal operation.
- **Tests:** store round-trip test; test that confidence degrades when the pooled sample is thin.

---

## Phase C — Signal robustness (P1) — Gaps G3, G7

Goal: turn a single narrow family into a regime-aware, multi-family engine.

### C1. Regime gate
- **Affected:** `signal_engine.py` (`_build_indicators`, new `_classify_regime`), feature set.
- **Change:** compute ADX/Choppiness + realized-vol; classify trend / range / high-vol; only enable the matching family and stand down in high-vol/illiquid.
- **Complexity:** M · **Dependencies:** none (independent of Phase B but combine for best effect).
- **Acceptance:** in a labeled range/chop fixture, trend-pullback signals are suppressed.
- **Tests:** known-answer regime fixtures.

### C2. Add orthogonal families + confluence scoring
- **Affected:** `signal_engine.py` (`_classify_state` → family modules: trend-pullback, breakout-retest, range mean-reversion), confidence/`reasons` builders.
- **Change:** add Donchian/Keltner breakout-retest (trend) and RSI(2)/Bollinger mean-reversion (range); score by confluence across families + higher-timeframe trend filter; produce traceable `reasons`.
- **Complexity:** L · **Dependencies:** C1, and ideally B1 (so each family is backtested honestly).
- **Acceptance:** each family is independently backtested (B1) and only emits in its valid regime.
- **Tests:** per-family known-answer fixtures; integration test that confluence raises confidence vs. single-family.

### C3. Complete the documented indicator palette (G7)
- **Affected:** `signal_engine.py` (`_build_indicators`).
- **Change:** add MACD and Bollinger Bands (pure Python, consistent with the no-pandas-ta choice).
- **Complexity:** S · **Dependencies:** none.
- **Acceptance:** MACD/Bollinger available to families and UI.
- **Tests:** numeric known-answer tests vs. reference values.

---

## Phase D — AI narration layer (P1) — Gap G1

Goal: implement the flagship feature exactly as the vision specifies — narrate engine facts, invent nothing.

### D1. Ollama narration service
- **Affected:** new `apps/backend/app/services/narration.py`; `apps/backend/app/providers/manager.py` (register a real `ollama` client with an inference capability); `signal_engine.py` (call narration with a structured fact object instead of building the f-string); `apps/backend/app/core/config.py` (`AiSettings.model` finally consumed).
- **Change:** build a structured fact JSON (symbol, signal, levels, indicator readings, regime, expectancy, sample size, invalidation), send a narrate-only prompt to the configured Ollama model, return prose.
- **Complexity:** M · **Dependencies:** B1–B3 and C* recommended so the facts are trustworthy (narration must not dress up bad numbers).
- **Acceptance:** with Ollama running, `ai_explanation` is model-generated from the fact object; the `AiSettings.model` value is actually used.
- **Tests:** service test with a mocked Ollama endpoint asserting the prompt contains only engine facts.

### D2. Anti-hallucination guard (vision §10)
- **Affected:** `narration.py` (post-generation validator).
- **Change:** parse numbers/entities out of the generated text; reject/repair any number or symbol not present in the input fact object; on failure, fall back to the deterministic template and flag it.
- **Complexity:** M · **Dependencies:** D1.
- **Acceptance:** a model output that introduces an invented price/percentage is rejected.
- **Tests:** unit tests feeding adversarial model outputs (invented numbers) and asserting rejection + fallback.

### D3. Graceful degradation
- **Affected:** `narration.py`, `signal_engine.py`, UI label.
- **Change:** if Ollama is unavailable, return the deterministic summary clearly labeled "Rule-based summary (AI offline)."
- **Complexity:** S · **Dependencies:** D1, A1.
- **Acceptance:** app remains fully usable with Ollama stopped; labeling is honest.
- **Tests:** test that a connection error yields the labeled fallback, not an error.

---

## Phase E — Secrets, scheduling, freshness (P1) — Gaps G4, G5, G6

### E1. OS keychain for trade-enabled secrets (G4)
- **Affected:** `apps/desktop/src-tauri/` (add a keychain/keyring command bridge), `apps/backend/app/storage/secret_store.py` / `state_store.py` (route trade keys through the keychain bridge; keep the Fernet file only for read-only data-API keys).
- **Change:** store any key that can move money or place orders in the OS keychain; the backend requests them on demand via the Tauri bridge.
- **Complexity:** L · **Dependencies:** A2; coordinate backend↔Tauri IPC.
- **Acceptance:** no trade-enabled secret is persisted in the on-disk Fernet file; removing the keychain entry disables live capability.
- **Tests:** integration test (mocked keychain) asserting trade keys never hit the encrypted file; secret-store test confirming only data keys remain there.

### E2. Real live-trading gate (G6)
- **Affected:** `apps/backend/app/services/trading.py`, `apps/desktop/src/screens/SettingsScreen.tsx` (existing confirm-gate UI), trading provider registration in `manager.py`.
- **Change:** enabling live requires (1) keychain-stored scoped live key, (2) explicit typed confirmation, (3) a working trading client actually registered in the `trading` route. Until a real client is implemented, keep live explicitly disabled and say so.
- **Complexity:** M · **Dependencies:** E1, A2.
- **Acceptance:** live cannot be enabled without keychain creds + typed confirm + a registered trading client.
- **Tests:** test matrix over the three gate conditions; default-config test asserting live is disabled.

### E3. Scheduled market & signal refresh (G5)
- **Affected:** `apps/backend/app/scheduler.py` (add `market-refresh` and `signal-refresh` jobs), `market_corridor.py` / signals service entry points, `apps/backend/app/main.py` (optionally trigger one refresh on startup so a fresh machine isn't empty).
- **Change:** schedule corridor refresh and signal recompute per timeframe cadence; publish events so the UI updates; respect rate limits already present in the corridor service.
- **Complexity:** M · **Dependencies:** none functionally; pairs with A3 freshness UI.
- **Acceptance:** data and signals update on a cadence with no manual click; data-age badge stays current.
- **Tests:** scheduler test asserting jobs registered; integration test that a tick advances `ingested_at`.

---

## Phase F — Data durability & quality of life (P2) — Gaps G8, G9, G10, G11, G12, G13

### F1. Multi-timeframe ingest (G8)
- **Affected:** `market_corridor.py` (`_corridor_targets`), scheduler cadence (E3).
- **Change:** add 15m/4h targets where providers allow; gate UI timeframe selectors to ingested timeframes.
- **Complexity:** M · **Dependencies:** E3.
- **Acceptance:** every selectable timeframe has real data behind it.
- **Tests:** test that selectable timeframes ⊆ ingested timeframes.

### F2. Parquet archive (G9)
- **Affected:** `apps/backend/app/storage/analytics_store.py` (write closed candles to partitioned Parquet on ingest), `docs/backup_and_recovery.md` (document restore).
- **Complexity:** M · **Dependencies:** none.
- **Acceptance:** closed candles are durably written to Parquet partitions; documented restore path.
- **Tests:** ingest test asserting a Parquet partition is written and re-readable.

### F3. Honest news source (G10)
- **Affected:** `apps/backend/app/services/news_service.py`, news UI.
- **Change:** clearly label synthetic "Market Wire" as derived-from-price; show a "no news provider configured" empty state instead of synthetic content by default, with Finnhub/NewsAPI as the real path.
- **Complexity:** S · **Dependencies:** none.
- **Acceptance:** no generated headline can be mistaken for third-party reporting.
- **Tests:** test that without a news key the response is labeled/empty, not synthetic-as-real.

### F4. Confidence calibration (G11)
- **Affected:** `signal_engine.py` (`_derive_confidence`), expectancy store (B3).
- **Change:** fit a reliability curve mapping raw score → realized hit rate; display calibrated confidence.
- **Complexity:** M · **Dependencies:** B1–B3.
- **Acceptance:** a calibration plot shows confidence ≈ realized hit rate within tolerance.
- **Tests:** calibration test on a held-out fixture.

### F5. Engine math test suite (G12)
- **Affected:** `apps/backend/tests/` (new `test_indicators.py`, `test_backtest.py`, `test_integrity.py`).
- **Complexity:** M · **Dependencies:** B*, C* (test the new logic).
- **Acceptance:** indicator, backtest, and integrity logic covered by known-answer tests in CI.
- **Tests:** the suite itself.

### F6. Refresh the masterplan (G13)
- **Affected:** `docs/production_implementation_masterplan.md` (rewrite the "Current Baseline" to match reality; correct §3.1 vectorbt/pandas-ta/Lightweight-Charts notes per the audit §3).
- **Complexity:** S · **Dependencies:** this audit.
- **Acceptance:** baseline and tooling notes match the audited reality and current library status.

---

## Phase G — Optional enhancements (P3) — Gaps G14, G15

### G1. Implement or retire stub providers (G14)
- **Affected:** `manager.py`, settings UI. Implement CoinGecko/CMC/NewsAPI clients **or** remove them from the registry and UI so there are no dead options.
- **Complexity:** M · **Acceptance:** every provider shown in UI is functional.

### G2. Cross-sectional relative strength + robustness backtest (G15, audit §4.3/§5.3)
- **Affected:** new ranking service; optional vectorbt v1.0.0 integration for parameter-robustness heatmaps + walk-forward; optional offline LightGBM setup-quality classifier feeding F4 calibration.
- **Complexity:** L · **Dependencies:** B*, C*, F4.
- **Acceptance:** watchlist surfaces best-ranked candidates; robustness/walk-forward report available; all local, no cloud.

---

## Suggested execution order (dependency-aware)

1. **Phase A** (A1, A2, A3) — immediate, unblocks honesty/safety.
2. **Phase B** (B1 → B2 → B3) — backtest truth + expectancy table.
3. **Phase C** (C1 → C2, C3 in parallel) — robust signals on top of honest backtests.
4. **Phase D** (D1 → D2 → D3) — AI narration over trustworthy facts.
5. **Phase E** (E1 → E2; E3 in parallel) — secrets, live gate, scheduling.
6. **Phase F** — durability, calibration, tests, doc refresh.
7. **Phase G** — optional.

**Definition of "production-ready for a single-user local assistant":** Phases A–E complete (the audit's must-fix set), with Phase F2/F5 (archive + engine tests) strongly recommended before relying on it daily. None of this requires cloud services, additional backend infrastructure, or multi-user work.
