# QuantGlass Production Audit Report

**Audit date:** 2026-05-31
**Reviewer perspective:** senior financial-markets / quantitative-trading / AI-ML / software-architecture review
**Scope reviewed:** `docs/production_implementation_masterplan.md`, `docs/financial_signal_app_vision_architecture_v2.md`, `docs/milestones/*`, and the `apps/backend`, `apps/desktop`, `packages/contracts` source trees as committed on the audit date.
**Target profile under review:** single-user, single-machine, local-first desktop assistant. No cloud services, no multi-user backend, no shared infrastructure. This profile is the lens used for every judgement below.

> This report audits an educational, decision-support trading tool. Nothing here is financial advice. "Production-ready" in this document means *robust, honest, and safe for one person to run locally* — not regulated, not multi-tenant, not an automated trading product.

---

## 1. Executive Summary

QuantGlass is **substantially more built than the masterplan's "Current Baseline" section claims.** The plan describes market data, normalization, the quant pipeline, the signal engine, backtesting, alert execution, and secrets as "not complete." In reality, the repository already contains working, non-trivial implementations of almost all of these, wired end-to-end from live public market APIs through a DuckDB store, a deterministic indicator/signal engine, an inline cost-aware backtest, a scheduler-driven alert/paper-execution loop, and a typed desktop client. The masterplan is therefore **stale as a status document**, even though it remains a good architectural compass.

The headline problem is the inverse of what the plan implies. The hard plumbing is mostly done; the **two pillars the vision treats as non-negotiable differentiators are the two that are missing or weakest**:

1. **AI narration does not exist.** Every "AI explanation" in the app is a hand-written Python f-string. There is no Ollama client, no LLM call, no prompt template, and no anti-hallucination validation anywhere in the backend. The vision's central claim — "AI-narrated explanations that narrate engine facts only" — is currently a label on deterministic text.
2. **Signal trust is not statistically earned.** The signal engine is competent but narrow (one trend-pullback/rejection family), and its "backtested win rate / OOS-validated" fields are produced by a tiny per-symbol inline backtest whose numbers are blended in a non-standard way and whose exit logic does not match the stop/target ladder shown to the user. The vision's own rule — "backtesting gates trust" — is not actually satisfied, even though the scaffolding to satisfy it exists.

Secondary but important: secrets are stored in a Fernet-encrypted file (key on the same disk), **not** the OS keychain the plan mandates; there is **no scheduled market/signal refresh** (data is only as fresh as the last manual click); Parquet archiving is a reserved empty directory; and live trading is a non-functional stub that nonetheless points at Alpaca's **live** order endpoint.

**Bottom line:** the project is a strong, honest *technical* prototype that is **not yet production-ready as the product the vision describes**, primarily because (a) its flagship AI layer is absent and (b) its signals are not yet validated to the standard the documents themselves demand. Both are closable with focused, local-only work. See §9 for the verdict and the minimum bar.

---

## 2. Production-Readiness Verdict

| Dimension | Status | Notes |
|---|---|---|
| Architecture & boundaries | **Ready** | Clean `api/services/storage/providers` split; contracts package is the real boundary. |
| Market data ingest & integrity | **Mostly ready** | Real providers + sophisticated normalization/gap logic; missing scheduling, multi-timeframe, Parquet. |
| Signal engine (mechanics) | **Mostly ready** | Real causal indicators, closed-candle rule, SL/TP ladder. |
| Signal engine (trustworthiness) | **Not ready** | Narrow family; backtest doesn't validate displayed levels; OOS honesty is cosmetic. |
| Backtesting & validation | **Partial** | Cost-aware runner exists but is per-symbol, tiny-sample, non-standard blending, no expectancy table. |
| AI / narration layer | **Not implemented** | Deterministic templates only; no LLM. |
| Alerts & paper trading | **Ready (paper)** | Real evaluator, Telegram/email/desktop delivery, simulated fills + PnL. |
| Live trading | **Stub / unsafe-by-design** | No working trading client, but live endpoint wired and gate is a DB flag, not keychain. |
| Secrets & security | **Not ready** | Encrypted-file, not OS keychain; trade-key handling does not meet the plan's own rule. |
| Desktop integration | **Ready** | Screens are backend-driven via typed client with loading/empty/error states. |
| Tests / quality gates | **Thin** | A handful of backend tests; no coverage of the signal/backtest math or integrity layer. |

**Overall: NOT production-ready** for the described product. **Conditionally ready** as a personal, paper-only, deterministic-signal research tool *if* the AI claims and the "OOS-validated" claims are removed from the UI until they are real (see §9 minimum bar).

---

## 3. Currentness Review (vs. best-in-class local retail systems, May 2026)

The plan's philosophy is current and correct for a single-user local-first build: local-first desktop (Tauri), provider-adapter pattern, deterministic quant core with AI as a *narration* layer, cost-and-OOS-aware backtesting, closed-candle discipline, paper-before-live, OS-keychain secrets, and a $0-start cost posture. These are the right priorities and match how serious retail/quant-hobbyist systems are built today. A few specific technology claims have drifted and should be refreshed:

- **vectorbt is no longer "largely frozen."** The masterplan (§3.1) says OSS vectorbt is frozen and active work is paid-only. As of the audit date the open-source `polakowo/vectorbt` shipped **v1.0.0 (Apr 2026)** with recent commits, an optional Rust engine, and built-in **walk-forward optimization** — it is actively maintained, Apache-2.0-with-Commons-Clause (free to use, may not be resold). For a single-user local app this is a viable, current backtesting engine and a better choice than the hand-rolled inline backtest for the validation harness. [1]
- **`pandas-ta` (the original `twopirllc/pandas-ta`) is effectively unmaintained / the canonical repo is gone (404).** The plan names it the "primary" indicator library. The current implementation wisely avoids it and computes EMA/SMA/RSI/ATR in pure Python, which is the more robust choice for a no-C-dependency local install. The plan text should be updated to reflect that pandas-ta is no longer a safe default; either keep the pure-Python approach or pin a maintained fork (e.g. `pandas-ta-classic`). [2]
- **TradingView Lightweight Charts is confirmed Apache-2.0, ~35 KB, maintained by TradingView.** The plan's "check the license before redistribution" caveat can be resolved: Apache-2.0 is fine for this single-user use. [3]
- **Alpaca paper/live split is current and matters.** Paper trading is `https://paper-api.alpaca.markets`; live is `https://api.alpaca.markets`. The codebase's only order-submitting client targets the **live** host (see §6, finding L1). For a paper-first product this should default to the paper host. [4]
- **Local LLM narration is mainstream and appropriate.** Running a small quantized model (Qwen2.5 / Llama-3.x 7–8B class) via Ollama for *constrained narration of pre-computed facts* is a well-trodden, low-risk local pattern in 2026 and fits the single-machine constraint. The plan's design (structured-fact input, narrate-only, validate no invented numbers) is current and should simply be implemented as written.

**Currentness verdict:** the *strategy* is current; three concrete tooling notes (vectorbt status, pandas-ta status, Lightweight Charts license) should be corrected in the masterplan, and the Alpaca host default fixed in code.

---

## 4. Trading-Signal Review (quant lens — not win-rate-only)

### 4.1 What the engine actually does
`apps/backend/app/services/signal_engine.py` builds causal EMA(21), SMA(50), RSI(14), ATR(14) from closed candles, classifies a market state (bullish/bearish trend × near-EMA pullback/rejection × RSI band × breakout pressure), assigns one of BUY_ZONE / SELL / HOLD / WATCH / WAIT, derives an ATR-scaled stop and a 3-rung take-profit ladder, computes R:R, and attaches a `confidence_basis` object. Strengths worth crediting:

- **Closed-candle-only and UTC discipline are respected** (the data layer excludes the forming candle; the engine reads finalized candles). This is the single most common retail failure mode and it is handled.
- Indicators are **causal** (no lookahead): EMA/RSI/ATR are computed forward; support/resistance use trailing windows only.
- Risk is **volatility-scaled** (ATR stop multiples vary by regime), and costs are modeled per asset class.

### 4.2 Where it is weak (this is the part that decides if it is "real")
- **Single setup family.** Everything is a moving-average reclaim/rejection plus an RSI band and a volume ratio. There is no breakout-retest, no range/mean-reversion family for non-trending regimes, no higher-timeframe confirmation, and no cross-sectional relative-strength ranking. In a chop or mean-reverting regime this family produces low-expectancy, whipsaw-prone signals, and the only regime control is an ATR-band label, not a tradeability gate.
- **The backtest does not validate what the UI shows.** The live signal displays an ATR-derived stop and a *three-rung* TP ladder with a computed R:R. The inline backtest (`_run_backtest`) instead simulates a **single fixed 2.2R target and a 1.35×ATR stop**, ignoring the displayed ladder and entry zone. So the "backtested win rate / expectancy" shown next to a signal is the statistic of a *different* strategy than the one the user would trade. This is a correctness gap, not a tuning gap.
- **"Out-of-sample validated" is cosmetic.** The engine blends train and test win rates into one number (`train*0.45 + test*0.55`), then blends *that* with a walk-forward number (`*0.6/*0.4`). A blended figure cannot certify out-of-sample performance; it hides OOS degradation rather than exposing it. The boolean `out_of_sample_validated` is just `trade_count >= 50`, which is a **sample-size** check mislabeled as an **OOS** check.
- **Samples are tiny and per-symbol.** Each signal runs its own backtest over ~320 candles of a single symbol. After filtering to one setup type, trade counts are routinely well below the 50-sample floor, so confidence is perpetually penalized and expectancy estimates are noise. The vision's own `confidence_basis` (a shared, validated *expectancy table by setup type and timeframe*, per §8 of the vision) is **not** what's implemented — there is no cross-symbol expectancy table feeding confidence; the `backtest_snapshots` DuckDB table is defined but unused for this purpose.
- **Confidence is mostly a heuristic.** The score is a hand-weighted sum (base + trend*18 + volume*10 + clipped-expectancy*10 + winrate*12). It is not calibrated against realized hit rates, so "72% confidence" does not mean "this fires profitably ~72% of the time."
- **Liquidity/slippage realism is thin.** Flat 0.05% crypto slippage is optimistic for SOL/LINK in fast moves; there is no spread, no volume-participation cap, no partial-fill modeling.
- **Indicator palette is narrower than documented.** MACD and Bollinger Bands are listed in the vision/UI but are **not** computed in the engine (only EMA/SMA/RSI/ATR).

### 4.3 Recommended stronger signal design (local-friendly)
Prioritized for one machine, robustness over cleverness:

1. **Regime gate first, family second.** Compute a regime classifier (trend vs. range vs. high-vol) from ADX/Choppiness + realized-vol, and only enable the matching family: trend-pullback **and** breakout-retest in trend; RSI(2)/Bollinger mean-reversion only in confirmed range; stand down in high-vol/illiquid.
2. **Add orthogonal families and score by confluence**, not by a single template: Donchian/Keltner breakout with ATR trailing (robust, low-overfit), higher-timeframe trend filter (1d gates 4h/1h entries), and volume-delta/relative-volume confirmation.
3. **Backtest the *actual* signal**, including the displayed entry zone, ATR stop, and TP ladder (first-touch logic across the ladder), with fees + slippage, so the shown statistics describe the shown trade.
4. **Replace blending with a real train→OOS split and walk-forward**, and report in-sample and out-of-sample **separately**; set `out_of_sample_validated` only when the OOS slice independently clears sample-size *and* a minimum expectancy.
5. **Pool a shared expectancy table by (setup_type, timeframe, regime)** across the symbol universe (persist to the existing DuckDB `backtest_snapshots`/a new `expectancy` table) and have live confidence reference *that*, per the vision's own §8 design.
6. **Calibrate confidence** with a reliability curve (map raw score → realized hit rate) so the number is honest.
7. **Cross-sectional relative strength** for the watchlist so the system surfaces the *best* candidates, not every symbol's absolute reading.

These are all achievable locally; (1)–(4) are the must-fix correctness/honesty items.

---

## 5. AI / ML Architecture Review

### 5.1 Current state
There is **no AI**. `ai/` providers (`ollama`, `openai`) are registered with empty capability sets and no client (`apps/backend/app/providers/manager.py`). The `ai_explanation` field is generated by `_build_ai_explanation()` — a deterministic f-string. `AiSettings.model` defaults to `qwen3:14b-q4_K_M` and the Settings screen exposes an Ollama model picker, but the value is **never read by any inference code**. This is a "present in UI, documented, not wired" gap on the product's headline feature.

### 5.2 Is the *planned* AI realistic and local-appropriate? Yes.
The vision's design is the correct one and does **not** require cloud or backend infrastructure:
- A small quantized Ollama model is more than enough to narrate a structured fact object. Even a 7–8B Q4 model runs on a typical single machine; `qwen3:14b-q4` is fine on 16 GB+ but should fall back to a smaller default if the host is modest.
- The anti-hallucination constraints (§10 of the vision) — pass only engine-computed facts, instruct narrate-only, then **validate that the output introduces no numbers absent from the input** — are exactly right and must be implemented as a post-generation guard, not just a prompt instruction.
- Graceful degradation (if Ollama is down, fall back to the current deterministic text and label it as such) keeps the local-first "usable degraded mode" rule intact.

### 5.3 Recommended lightweight local ML (optional, not hot-path)
The vision already scopes scikit-learn ML out of the v1 critical path; keep it there but make it useful:
- Train an **offline gradient-boosted classifier** (LightGBM/scikit-learn) on the labeled outcomes the backtest already generates, to output a calibrated *setup-quality probability* per (setup_type, regime). Feed that into confidence calibration (§4.3 item 6). This is small, fast, retrains in seconds locally, and needs no GPU.
- **Avoid** deep learning, vector DBs, RAG stacks, and cloud inference — none are justified for one user and all violate the single-machine constraint.

**AI/ML verdict:** the plan's AI/ML approach is realistic and correctly local-first; it is simply **unbuilt**. Build it as designed; do not expand its scope.

---

## 6. Implementation Completeness Audit (evidence-based)

Legend: ✅ real & wired · 🟡 partial · 🟥 missing/placeholder/stub · ⬛ documented-but-not-wired.

### Implemented and genuinely working
- ✅ **Backend layering** — `apps/backend/app/main.py` wires `state_store` (SQLite), `analytics_store` (DuckDB), provider manager, event bus, scheduler. Clean separation.
- ✅ **Contracts boundary** — `packages/contracts/src/index.ts` is consumed by the desktop client `apps/desktop/src/lib/backend.ts`.
- ✅ **Live public providers (no keys)** — Coinbase/Kraken/Gemini crypto + Yahoo equities in `apps/backend/app/providers/public.py`, hitting real exchange/finance endpoints.
- ✅ **Keyed providers** — Alpaca/Finnhub/Polygon/TwelveData in `apps/backend/app/providers/keyed.py`, correctly gated behind configured API keys.
- ✅ **DuckDB analytics store** — `apps/backend/app/storage/analytics_store.py` with `market_candles`, `market_integrity_diagnostics`, `market_ingest_runs`, `backtest_snapshots`.
- ✅ **Normalization & integrity** — `apps/backend/app/services/market_corridor.py` does UTC normalization, dedupe, gap detection, partial-candle exclusion, and even US-equity session-gap / holiday-aware gap classification. This is more sophisticated than the plan credits.
- ✅ **Signal engine mechanics** — causal indicators, regime label, setup classification, ATR stop, TP ladder, R:R, reasons (`signal_engine.py`).
- ✅ **Alert evaluator & delivery** — `execution_engine.py` parses conditions and fires; `notifications.py` delivers via **desktop, real Telegram Bot API, and real SMTP email**.
- ✅ **Paper trading** — scheduled paper cycle simulates fills, marks positions, updates PnL via `state_store`.
- ✅ **Encrypted secret store** — Fernet at-rest encryption with 0600 perms (`storage/secret_store.py`).
- ✅ **Event bus / WebSocket events** + ✅ **APScheduler** (`scheduler.py`) + ✅ **desktop screens backend-wired** with loading/empty/error states + ✅ **Tauri release bundle** exists.

### Partial
- 🟡 **Backtesting (Phase 8)** — runner with fees/slippage/split/walk-forward exists but is per-symbol, tiny-sample, blends in/out-of-sample, and validates a different exit than the UI shows (see §4.2). `backtest_snapshots` table is defined but not used to feed confidence.
- 🟡 **Indicator palette (Phase 6)** — EMA/SMA/RSI/ATR present; **MACD and Bollinger absent** despite being in the vision/UI.
- 🟡 **Multi-timeframe** — corridor ingests **only crypto@1h and stocks@1d** (`_corridor_targets`); the UI's 15m/4h selectors have no ingested data behind them.
- 🟡 **News** — `news_service.py` returns **synthetic "QuantGlass Market Wire"** items derived from price moves unless a Finnhub key is configured; default experience is generated, not real news.
- 🟡 **Symbol universe** — hardcoded 12-symbol corridor list; watchlist additions do not extend ingest.

### Missing / placeholder / stub / documented-but-not-wired
- 🟥 **AI narration layer (Phase 9)** — no Ollama/LLM client, no prompt templates, no narration service, no anti-hallucination validation. `ai_explanation` is a template. ⬛ `AiSettings.model` is selectable in UI but never used by any code.
- 🟥 **OS keychain (Phase 12)** — secrets live in a Fernet-encrypted file whose key sits on the same disk; trade-enabled keys are **not** in Windows Credential Manager / macOS Keychain as the plan mandates.
- 🟥 **Scheduled market/signal refresh** — the scheduler runs only heartbeat, alert, and paper jobs. **No market-refresh or signal-refresh job exists**; data freshness depends on a manual `POST /api/market/corridor/refresh`.
- 🟥 **Parquet archive** — `parquet_dir` is created and never written to; "long-term candle archive" is a reserved empty folder.
- 🟥 **Live trading (finding L1)** — `submit_trade()` routes live orders to the `trading` provider chain (`alpaca_paper`, `ccxt_trade`), **neither of which has a client**, so live execution raises "no provider." Meanwhile the only client that *can* submit orders (`AlpacaStocksOHLCVProvider.submit_order`) posts to the **live** host `api.alpaca.markets` and is not in the trading route. Net: live trading is a non-functional stub, but the wiring points at a live endpoint and the paper/live switch is a plain SQLite flag with no keychain/credential gate behind it.
- 🟥 **CoinGecko / CoinMarketCap / NewsAPI** — registered as `internal` with no client; unimplemented.
- 🟥 **Test coverage of the math** — backend tests exist (`tests/test_smoke.py`, `test_settings_routes.py`, `test_events.py`, `test_trading.py`, `test_secret_store.py`) but none cover indicator correctness, backtest logic, or the integrity layer.

---

## 7. Gap Analysis Table

| # | Masterplan / vision requirement | Current status | Evidence | Risk / impact | Recommended fix | Priority |
|---|---|---|---|---|---|---|
| G1 | AI narration that narrates engine facts (Ollama, anti-hallucination) — Phase 9, vision §10 | 🟥 Missing | `_build_ai_explanation` is an f-string; `ollama`/`openai` have no client (`manager.py`); `AiSettings.model` unused | Flagship feature absent; UI implies AI that isn't there | Implement Ollama narration service + fact-only prompt + numeric-validation guard + degraded fallback | Must-fix |
| G2 | Backtesting gates signal trust; OOS/walk-forward; expectancy table by setup type — Phase 8, vision §8–9 | 🟡 Partial / dishonest | `_run_backtest` blends in/out-of-sample; `out_of_sample_validated = count>=50`; backtests a 2.2R target ≠ displayed ladder | Users shown "validated" stats that don't validate the actual trade | Backtest the displayed levels; report IS/OOS separately; pooled expectancy table feeds confidence | Must-fix |
| G3 | Single trend family; no regime gating / orthogonal setups | 🟡 Narrow | `_classify_state` is one MA-reclaim/rejection family | Low expectancy & whipsaw in non-trend regimes | Add regime gate + breakout-retest + range mean-reversion; confluence scoring | Must-fix |
| G4 | OS keychain for trade-enabled secrets — Phase 12, vision §5.2 | 🟥 Not met | `secret_store.py` Fernet file, key on same disk; `state_store` reads plaintext values | Secret-management rule violated; weak protection for trade keys | Tauri keychain bridge for trade keys; keep encrypted file only for read-only data keys | Must-fix (before any live path) |
| G5 | Scheduled market & signal refresh jobs — workstream B/E | 🟥 Missing | `scheduler.py` has only heartbeat/alert/paper jobs | Stale data; signals computed on old candles unless user clicks refresh | Add APScheduler market-refresh + signal-refresh jobs with cadence per timeframe | Must-fix |
| G6 | Paper-first; live behind keychain + explicit confirm — rule 5, vision §5.2 | 🟥 Unsafe-by-design | live order client targets `api.alpaca.markets`; trading route clients absent; gate is a DB flag | Future live wiring would hit live orders with weak gating | Default to `paper-api.alpaca.markets`; require keychain creds + typed confirm + scoped keys before enabling live | Must-fix (before live) |
| G7 | MACD/Bollinger indicators — Phase 6, vision §14 | 🟡 Partial | Only EMA/SMA/RSI/ATR in `_build_indicators` | UI/feature parity gap; fewer confluence inputs | Add MACD + Bollinger to feature set | Should-fix |
| G8 | Multi-timeframe (15m/1h/4h/1d) — vision §7/§19.2 | 🟡 Partial | corridor only `crypto@1h`, `stocks@1d` | Timeframe selectors are empty for 15m/4h | Expand corridor targets + ingest cadence per timeframe | Should-fix |
| G9 | Parquet long-term candle archive — workstream C | 🟥 Reserved only | `parquet_dir.mkdir` then never written | No durable archive; DuckDB is the only copy | Write closed candles to partitioned Parquet on ingest | Should-fix |
| G10 | Real news/sentiment — vision §12 | 🟡 Synthetic default | `news_service` derives "Market Wire" items without a key | "News" looks real but is generated from price | Make synthetic source clearly labeled; document Finnhub/NewsAPI as the real path | Should-fix |
| G11 | Confidence is evidence-based & traceable — vision principle 6 | 🟡 Heuristic | `_derive_confidence` hand-weighted, uncalibrated | Confidence number is not probabilistically meaningful | Calibrate against realized hit rates (reliability curve) | Should-fix |
| G12 | Test coverage of signal/backtest/integrity math | 🟥 Thin | No tests over engine math | Silent regressions in the most safety-critical code | Add unit tests with known-answer fixtures | Should-fix |
| G13 | Masterplan reflects real status; tooling claims current | 🟥 Stale | "Current Baseline" understates build; vectorbt/pandas-ta notes outdated | Misleads future autonomous work | Rewrite baseline + refresh §3.1 tooling notes (see §3) | Should-fix |
| G14 | CoinGecko / CMC / NewsAPI adapters — vision §6 | 🟥 Stubs | registered `internal`, no client | Advertised providers don't work | Implement or remove from registry/UI to avoid dead options | Optional |
| G15 | Cross-sectional relative strength / portfolio backtest | 🟥 Absent | per-symbol only | Misses best-candidate ranking; weaker research value | Add RS ranking + vectorbt portfolio backtest for robustness | Optional |

---

## 8. Risk Register

| ID | Risk | Likelihood | Impact | Exposure | Mitigation |
|---|---|---|---|---|---|
| R1 | User trades on a "validated" signal whose stats describe a different exit logic (G2) | High | High | **Critical** | Backtest the displayed levels; relabel/withhold "OOS-validated" until real |
| R2 | UI/marketing implies AI analysis that does not exist (G1) | Certain (today) | High | **Critical** | Build narration, or remove "AI explanation" labeling until built |
| R3 | Trade-enabled secret leaks from on-disk encrypted file / co-located key (G4) | Medium | High | High | Move trade keys to OS keychain |
| R4 | Stale data produces a stale or wrong signal during a fast move (G5) | High | Medium | High | Scheduled refresh + "data age" indicator in UI |
| R5 | Future enabling of live mode submits real-money orders with weak gating (G6) | Low now / High if wired | Severe | High | Paper host default + keychain + typed confirm + scoped keys |
| R6 | Over-trust of confidence number that isn't calibrated (G11) | High | Medium | Medium | Calibration + visible sample-size/OOS warnings |
| R7 | Provider outage/rate-limit degrades silently | Medium | Medium | Medium | Already has diagnostics; surface them prominently + fallback chains |
| R8 | Regressions in engine math go undetected (G12) | Medium | High | Medium | Unit tests with known-answer fixtures |
| R9 | Single DuckDB copy, no archive (G9) | Low | Medium | Low | Parquet archive + backup/export (see `docs/backup_and_recovery.md`) |

---

## 9. Prioritized Recommendations & Final Verdict

### Must-fix before this can be called production-ready (for its own stated product)
1. **Build the AI narration layer** (G1/R2) — Ollama client, fact-only prompt, numeric-validation guard, degraded fallback. Until then, **remove or relabel** every "AI explanation" surface so the app does not claim analysis it doesn't perform.
2. **Make backtesting honest** (G2/R1) — backtest the *displayed* entry/stop/TP ladder; report in-sample and out-of-sample **separately**; set `out_of_sample_validated` only on a genuine OOS slice; feed a pooled expectancy table into confidence. Until then, do not show "out_of_sample_validated: true."
3. **Strengthen signals** (G3) — regime gate + at least one additional orthogonal family + confluence scoring.
4. **Move trade secrets to the OS keychain** (G4) and **fix the live-trading default to the paper host with a real gate** (G6) — even though live is currently a stub, the wiring and defaults must be safe before anything is connected.
5. **Add scheduled market/signal refresh** and a visible **data-age** indicator (G5/R4).

### Should-improve soon
- MACD/Bollinger (G7); multi-timeframe ingest (G8); Parquet archive + backup/export (G9); clearly-labeled synthetic news vs. real provider news (G10); confidence calibration (G11); unit tests over engine math (G12); rewrite the masterplan baseline and refresh tooling notes (G13).

### Optional enhancements
- Implement or retire CoinGecko/CMC/NewsAPI stubs (G14); cross-sectional relative-strength ranking and a vectorbt portfolio/robustness backtest (G15); offline LightGBM setup-quality classifier feeding calibration (§5.3).

### Final Verdict
**Not production-ready as the product the vision describes.** It *is* a genuinely strong, honest local-first engineering base — far past "mock-first prototype" — and it is **conditionally usable today as a paper-only, deterministic-signal research tool** provided the two honesty problems are addressed immediately by **removing unearned claims from the UI** (the non-existent "AI explanation" and the cosmetic "OOS-validated" flag).

**Minimum work to reach production-ready for a single-user local trading assistant:** items 1–5 in "Must-fix" above. Concretely: (a) implement constrained local Ollama narration with a hallucination guard; (b) make the backtest validate the trade the user actually sees and split IS/OOS truthfully with a shared expectancy table; (c) add a regime gate plus one more signal family; (d) put trade keys in the OS keychain and default the broker client to the paper host behind a real confirm gate; (e) schedule data/signal refresh and show data age. None of these require cloud services, additional backend infrastructure, or multi-user concerns — they are all local-machine work, consistent with the project's constraints.

---

## Sources

[1] vectorbt (open-source community edition), `polakowo/vectorbt`, README and releases — v1.0.0 (Apr 2026), active commits, optional Rust engine, built-in walk-forward optimization, Apache-2.0-with-Commons-Clause "fair-code" license. https://github.com/polakowo/vectorbt
[2] `twopirllc/pandas-ta` — canonical repository returns HTTP 404 as of the audit date, indicating the original project is no longer available/maintained at that location; treat pandas-ta as no longer a safe default and prefer pure-Python indicators or a maintained fork. https://github.com/twopirllc/pandas-ta
[3] TradingView Lightweight Charts — open-source, Apache-2.0 licensed, ~35 KB, maintained by TradingView. https://www.tradingview.com/lightweight-charts/ and https://github.com/tradingview/lightweight-charts
[4] Alpaca Trading API — paper host `https://paper-api.alpaca.markets` vs. live host `https://api.alpaca.markets`; paper trading is the recommended pre-live path. https://docs.alpaca.markets/docs/api-references/trading-api/

*All third-party tooling/status claims were checked on 2026-05-31; library maintenance status and pricing can change — re-verify before committing dependencies. Code evidence references are to the repository state on the audit date.*
