# QuantGlass Masterplan

**Tracking:** every item maps to a GitHub issue and a milestone
(Phase A–D). This file is the single monitorable view; check items off in
the same PR that closes the issue. Strategy and research behind each item:
[modernization_roadmap.md](modernization_roadmap.md).

## Core pillars

1. **Honest statistics with guarantees** — conformal confidence, calibration
   tracking, purged walk-forward.
2. **Live Learning (integral, not a tab)** — the curriculum watches real app
   data and the user's own trading; every screen can teach. This is a
   first-class product pillar with its own workstream below.
3. **Grounded local AI** — structured outputs, fact guards, MCP server mode.
4. **Trusted extensibility** — versioned SDK, reviewed registry, permission
   consent.

## Phase A — Pre-public polish (milestone 1)

- [x] A1 Structured-output narration + numeric fact guard — [#19](https://github.com/quantglass-labs/quantglass/issues/19)
- [x] A2 lightweight-charts v5 (upgrade done; multi-pane follow-up in #20) + multi-pane indicators — [#20](https://github.com/quantglass-labs/quantglass/issues/20)
- [x] A3 SQLite WAL + numbered migration framework — [#21](https://github.com/quantglass-labs/quantglass/issues/21)
- [x] A4 Settings tab extraction complete (7/7 tabs; SettingsScreen 3,642 → 642 lines); restoring set-state-in-effect to error tracks in [#17](https://github.com/quantglass-labs/quantglass/issues/17)
- [x] A5 Lesson JSON Schema validated in CI — [#22](https://github.com/quantglass-labs/quantglass/issues/22)

## Live Learning workstream (spans phases, flagship)

- [x] LL1 Lesson moments v1: teachable-event detection from the user's own
      paper trades (position size vs account risk, stop distance vs ATR
      regime), surfaced via `/api/learn/moments` — [#25](https://github.com/quantglass-labs/quantglass/issues/25)
- [x] LL2 Live-data exercises: ATR-stop and position-sizing lessons generate
      exercises from the user's real candles and paper balance, checked
      statelessly server-side
- [ ] LL3 Mastery loop: spaced-repetition review queue, XP/streaks, module
      badges
- [ ] LL4 Scenario replay: drive paper trading through historical episodes
      with graded debriefs from engine facts — [#29](https://github.com/quantglass-labs/quantglass/issues/29)
- [ ] LL5 Community lesson packs via the extension SDK (`lessons`
      capability), schema-validated — depends on A5, [#26](https://github.com/quantglass-labs/quantglass/issues/26)

## Phase B — Launch differentiators (milestone 2)

- [x] B1 Coverage-guaranteed confidence (conformal); calibration table tracks in #16 — [#23](https://github.com/quantglass-labs/quantglass/issues/23), [#16](https://github.com/quantglass-labs/quantglass/issues/16)
- [x] B2 MCP server mode (read-only engine facts on loopback) — [#24](https://github.com/quantglass-labs/quantglass/issues/24)
- [x] B3 = LL1 Lesson moments v1 — [#25](https://github.com/quantglass-labs/quantglass/issues/25)

## Phase C — Community wave (milestone 3)

- [ ] C1 Extension registry with automated review + trust labels — [#26](https://github.com/quantglass-labs/quantglass/issues/26)
- [ ] C2 Incremental indicators — [#27](https://github.com/quantglass-labs/quantglass/issues/27)
- [ ] C3 Parquet archive + dataset export — [#28](https://github.com/quantglass-labs/quantglass/issues/28)
- [ ] C4 Orthogonal signal families — [#15](https://github.com/quantglass-labs/quantglass/issues/15)
- [ ] C5 Multi-timeframe ingest — [#14](https://github.com/quantglass-labs/quantglass/issues/14)
- [ ] C6 OS keychain enforcement for trade-capable keys — [#13](https://github.com/quantglass-labs/quantglass/issues/13)

## Phase D — Depth (milestone 4)

- [ ] D1 vectorbt adapter, mobile exploration, Vortex watch — [#29](https://github.com/quantglass-labs/quantglass/issues/29)

## Operating rules

- Every item lands behind green CI (`npm run validate:backend`, desktop
  lint/test/build) with tests in the same change.
- Behavior-affecting work updates docs and CHANGELOG in the same PR.
- Public launch gate: Phase A complete, LL1 + B1 + B2 demoable, Actions
  enabled ([#18](https://github.com/quantglass-labs/quantglass/issues/18)), release workflow green on all three OS targets.
