# QuantGlass Masterplan — recalibrated around the Academy

**Recalibrated:** 2026-06-11. Curriculum vision blueprint: [academy.md](academy.md). The learning platform is no longer a feature of
the app; it is the spine of the product. QuantGlass teaches a complete
trading education — novice through expert, for *traders*, not just app
users — and the workstation is the interactive lab where every concept is
applied against live data. Strategy and research behind the engineering
items: [modernization_roadmap.md](modernization_roadmap.md).

**Tracking:** every item maps to a GitHub issue and milestone. Check items
off in the change that closes the issue.

## Product thesis

> Learn everything about trading in one place, prove every concept on your
> own live data, and never be shown a number the engine cannot defend.

Two rules bind the engine and the curriculum together:

1. **Teach what we build, build what we teach.** Every engine capability
   (an indicator, a setup family, a statistic) ships with the lesson that
   explains it; every advanced lesson is backed by a real engine surface
   the learner can open.
2. **Apply, don't just read.** Every lesson carries a `live_apply` surface,
   and concept-bearing lessons get live exercises computed from the
   learner's own candles and paper account.

## The QuantGlass Academy — curriculum map (~100 lessons)

Levels stay (novice → intermediate → advanced → expert); each level gains
multiple **tracks**. Current content (20 lessons) seeds the tracks marked with †.

| Level | Tracks | Scope |
|---|---|---|
| **Novice** | Market Foundations · Chart Literacy† · Your First Signal† | instruments, exchanges, sessions, order types, spreads/liquidity; candles, trends, S/R, volume; reading a QuantGlass signal, paper trading basics |
| **Intermediate** | Indicator Mastery† · Risk & Position Sizing† · Trade Planning & Journaling · Market Regimes | every built-in indicator family (MA, RSI, MACD, Bollinger, ATR, ADX, Donchian, Keltner); R-multiples, sizing, portfolio heat; entries/exits/invalidation, journaling; trending/ranging/volatile regimes |
| **Advanced** | Strategy Families · Backtesting & Statistical Honesty† · Execution & Costs · Trading Psychology | trend pullback, breakout retest, mean reversion, momentum — each tied to the engine's setup detectors; IS/OOS, overfitting, walk-forward, expectancy, Sharpe/Sortino/PF; fees, slippage, partial fills; biases, tilt, discipline routines |
| **Expert** | Quantitative Validation† · Building Extensions† · AI-Assisted Research · Going-Live Readiness | conformal prediction, calibration, empirical Bayes, Monte Carlo drawdowns; custom indicators/strategies via the SDK; fact-guarded AI narration and MCP workflows; broker plumbing, keychain custody, safety gates (educational only — never advice) |

## Academy engineering workstream (milestone: QuantGlass Academy)

- [x] ACAD-1 **Curriculum architecture**: multi-track catalog (modules.json
      gains tracks-per-tier; catalog API and Learn sidebar group by level →
      track), level checkpoints, schema migration for the existing 20 lessons
- [x] ACAD-2 **Content Wave 1 — Foundations** (~30 lessons): Market
      Foundations, Chart Literacy, Your First Signal complete
- [x] ACAD-3 **Content Wave 2 — Indicators, Risk, Regimes** (~30 lessons)
- [x] ACAD-4 **Content Wave 3 — Strategy, Statistics, Execution,
      Psychology** (~25 lessons)
- [x] ACAD-5 **Content Wave 4 — Expert** (~15 lessons), paired 1:1 with
      engine surfaces (conformal drawer, calibration table, SDK, MCP)
- [ ] ACAD-6 **Mastery loop (LL3)**: spaced-repetition review queue,
      XP/streaks, per-track badges, level-gate assessments
- [x] ACAD-7 **Live-exercise framework (LL2 scale-up)**: generator registry
      so any lesson can declare a live exercise (today: 2 lessons); target
      every concept-bearing lesson in Waves 1–3
- [ ] ACAD-8 **Lesson moments v2 (LL1 scale-up)**: detector library grows
      with the curriculum — R-multiple violations, regime-mismatched setups,
      overtrading cadence, journal-skipping
- [ ] ACAD-9 **Scenario replay (LL4)**: drive paper trading through
      historical episodes with graded, engine-fact debriefs
- [ ] ACAD-10 **Community lesson packs (LL5)**: `lessons` capability in the
      extension SDK, schema-validated, surfaced through the registry (E7)
- [ ] ACAD-11 **Progress analytics**: per-track mastery dashboard and local
      completion certificates
- [x] ACAD-12 **Wave 5 — blueprint expansion**: scams & fake gurus,
      margin/leverage, options, fundamentals, macro, microstructure, risk
      officer mode (from [academy.md](academy.md)) — [#42](https://github.com/quantglass-labs/quantglass/issues/42)
- [x] ACAD-13 (v1 soft gating) **Gated progression**: five-dimension readiness scores,
      level-unlock logic, guided simulations, staged real-trading unlock
      (off by default) per [academy.md](academy.md) §3/8/11/12 — [#43](https://github.com/quantglass-labs/quantglass/issues/43)

Shipped foundations: lesson JSON content + schema CI ✅ · lesson moments v1
([#25](https://github.com/quantglass-labs/quantglass/issues/25)) ✅ · live
exercises v1 ✅ · coaching panel on Learn ✅

## Missions & Feedback Loop workstream (milestone: Missions & Feedback Loop)

Behavioral training layer per [tradingmission.md](tradingmission.md): the app's
areas become Learn · Missions · Paper · Journal · Review (Safety renders as a
status panel inside Review, not a sixth tab). The spine is the feedback loop:
**capture → score → detect → prescribe → gate**.

- [ ] MSN-1 Plan-aware trade ticket (stop, target, risk%, reason, emotion) — [#44](https://github.com/quantglass-labs/quantglass/issues/44)
- [ ] MSN-2 Process score + decision-vs-outcome 2×2 ("dangerous success") — [#45](https://github.com/quantglass-labs/quantglass/issues/45)
- [ ] MSN-3 Mission engine + starter missions feeding the unlock ladder — [#46](https://github.com/quantglass-labs/quantglass/issues/46)
- [ ] MSN-4 Journal + Review surfaces with adaptive recommendations — [#47](https://github.com/quantglass-labs/quantglass/issues/47)
- [ ] MSN-5 Personal Trading Constitution (enforced user policy) — [#48](https://github.com/quantglass-labs/quantglass/issues/48)
- [ ] MSN-6 Replay missions; subsumes ACAD-9 — [#49](https://github.com/quantglass-labs/quantglass/issues/49)
- [ ] MSN-7 Academy bridges, common mistakes, glossary, reference library,
      test-out placement — [#50](https://github.com/quantglass-labs/quantglass/issues/50)

## Engine work, re-sequenced to serve the Academy

Each item lists the curriculum it unblocks — "teach what we build."

- [ ] E1 Orthogonal setup families — [#15](https://github.com/quantglass-labs/quantglass/issues/15) → Strategy Families track teaches
      exactly these detectors
- [ ] E2 Multi-timeframe ingest — [#14](https://github.com/quantglass-labs/quantglass/issues/14) → multi-timeframe lessons in Chart
      Literacy and Strategy tracks
- [ ] E3 Calibration tracking table — [#16](https://github.com/quantglass-labs/quantglass/issues/16) → Quantitative Validation track's
      capstone (predicted vs realized, in the learner's own app)
- [ ] E4 Incremental indicators — [#27](https://github.com/quantglass-labs/quantglass/issues/27) → keeps live exercises instant as the
      watchlist grows
- [ ] E5 Parquet archive + dataset export — [#28](https://github.com/quantglass-labs/quantglass/issues/28) → "your trading history is a
      dataset" lessons in the Expert track
- [ ] E6 OS keychain enforcement — [#13](https://github.com/quantglass-labs/quantglass/issues/13) → Going-Live Readiness track
- [ ] E7 Extension registry with automated review — [#26](https://github.com/quantglass-labs/quantglass/issues/26) → Building
      Extensions track publishes to it; lesson packs (ACAD-10) flow through it
- [ ] E8 Multi-pane indicator charts — [#20](https://github.com/quantglass-labs/quantglass/issues/20) → Indicator Mastery lessons point
      at real panes
- [ ] E9 Settings state-flow cleanup, restore lint rule to error — [#17](https://github.com/quantglass-labs/quantglass/issues/17)

## Depth / optional

- [ ] D1 vectorbt adapter, Tauri mobile exploration, Vortex watch — [#29](https://github.com/quantglass-labs/quantglass/issues/29)
- [ ] D2 Walk-forward sweeps + Monte Carlo drawdown distributions (feeds
      Advanced statistics lessons)

## Release train to 1.0

| Release | Contents | Gate |
|---|---|---|
| **v0.2.0** (now) | everything since 0.1.0: conformal confidence, MCP server, lesson moments, live exercises, refactors, charts v5 | Actions enabled ([#18](https://github.com/quantglass-labs/quantglass/issues/18)), CI green, Dependabot triage, repo public |
| **v0.3.0** | ACAD-1 architecture + Wave 1 content + E8 panes | Academy navigable end-to-end at novice level |
| **v0.4.0** | Waves 2–3 + ACAD-6 mastery loop + ACAD-7 live-exercise framework + E1/E2 | a novice can verifiably progress to advanced |
| **v0.5.0** | Wave 4 + ACAD-8/9 + E3/E5 + E7 registry + ACAD-10 packs | community can contribute lessons and extensions safely |
| **v1.0** | ACAD-11, E4/E6, D2, full polish | complete novice→expert path, every lesson live-applied, every number defended |

## Completed (for the record)

Phase A (structured narration, charts v5, WAL+migrations, settings
decomposition, lesson schema) ✅ · Phase B (conformal confidence #23, MCP
server #24, lesson moments #25) ✅ · module refactor of all six subsystems ✅

## Operating rules

- Every item lands behind green checks (backend pytest + ruff, desktop
  lint/test/build) with tests in the same change.
- Lesson content is JSON-only, schema-validated, and never financial
  advice; numeric exercises must be internally consistent.
- Behavior-affecting work updates docs and CHANGELOG in the same PR.
