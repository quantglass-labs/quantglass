# Extension Types

QuantGlass should grow as a community platform around small, testable extension
surfaces. These are the supported or planned contribution lanes.

QuantGlass exposes these lanes through metadata endpoints so contributors can
discover the current built-in surface before proposing an extension:

- `GET /api/extensions/surfaces`
- `GET /api/extensions/backtest-models`
- `GET /api/extensions/execution-adapters`
- `GET /api/extensions/notification-channels`
- `GET /api/extensions/import-export`
- `GET /api/extensions/data-quality`
- `GET /api/extensions/ui-panels`

Runtime protocols for executable extension work live in
`apps/backend/app/extensions/contracts.py`. Metadata-only contributions should
register through `ExtensionSurfaceRegistry`; executable strategy, indicator,
backtest, and data-quality work should implement those protocols once wired into
the relevant service.

Executable strategy definitions can register a candidate factory through
`StrategyDefinition`. Those candidates are merged into the signal engine and
Backtesting preset flow when their market and timeframe match the current
analysis context.

## Market Data

Adds candles, quotes, order books, fundamentals, macro, options, futures, forex,
or sentiment feeds.

Required discipline:

- normalize timestamps to UTC
- respect provider rate limits
- document pricing and redistribution constraints
- return deterministic fixtures in tests
- validate candle fixtures with `apps/backend/scripts/validate_extension_fixture.py`

## Strategy

Adds setup families, confidence inputs, or portfolio selection logic.

Examples:

- breakout-retest
- range mean reversion
- relative-strength rotation
- volatility contraction
- session/opening-range logic

## Indicator

Adds deterministic feature transforms.

Examples:

- VWAP bands
- volume profile
- market structure pivots
- liquidity sweeps
- breadth and macro regime indicators

## Backtest

Adds execution assumptions and validation methods.

Examples:

- fill models
- slippage/fee models
- position sizing
- walk-forward validation
- portfolio-level constraints

Backtest plugins must never make future data visible to earlier decisions.

## Broker And Execution

Adds broker adapters or execution simulators.

Examples:

- Alpaca variants
- Interactive Brokers
- Tradier
- Coinbase Advanced
- custom paper simulators

Anything with `submit_orders` must remain behind explicit live-trading gates.

## AI Tooling

Adds model gateways or read-only analysis tools.

Examples:

- local model server profiles
- OpenAI-compatible private routers
- watchlist summarizers
- signal explanation tools
- strategy stability reviews

AI tooling must preserve the fact guard and avoid financial advice.

## Notification

Adds delivery targets.

Examples:

- Slack
- Discord
- generic webhooks
- Matrix
- OS-level desktop notifications

## Import And Export

Adds file or service interchange.

Examples:

- CSV watchlists
- TradingView lists
- broker statements
- backtest reports
- strategy bundles

## Data Quality

Adds validation and repair diagnostics.

Examples:

- stale feed checks
- duplicate candle detection
- gap detection
- bad tick filters
- split/dividend adjustment checks

Data-quality plugins should report diagnostics first. Automatic repair should be
explicit and auditable.

Core candle validation is available through
`app.extensions.validation.validate_candles`. Reuse it in tests before adding
provider-specific checks.

## UI Panels

Future extension surface for custom widgets, dashboard panels, and chart
overlays. Treat this as planned until a stable frontend extension ABI exists.

## Lesson Packs

Capability: `lessons`. Ship Academy content as declarative JSON — one track
of lessons (markdown concept, key terms, a multiple-choice exercise) per
`LessonPackDefinition`. Packs are validated at registration and rejected
whole with diagnostics if any lesson is malformed; lesson ids are namespaced
by pack id and tracks render after first-party content with a community
badge. Engine-coupled fields (`visuals`, `live_exercise`, `live_apply`,
`bridge`) are first-party only, so a pack can never inject markup or code.
See [`packs/community_lesson_pack_example.py`](https://github.com/quantglass-labs/quantglass-extensions/blob/main/packs/community_lesson_pack_example.py) for a complete example.

## Mission Packs

Capability: `missions`. Contribute behavioral missions as declarative JSON —
title, level, category, and typed criteria from the engine's fixed
vocabulary (`app.services.missions.CRITERIA_TYPES`, 23 types covering trade
reviews, journaling, scenarios, Academy progress, streaks, and the
constitution). Unknown criterion types and out-of-bounds values are rejected
at registration, ids are namespaced by pack id, and evaluation runs through
the same engine as built-in missions, so a pack can never execute code.
See [`packs/community_mission_pack_example.py`](https://github.com/quantglass-labs/quantglass-extensions/blob/main/packs/community_mission_pack_example.py) for a complete example.
