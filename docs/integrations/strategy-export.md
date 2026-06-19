<!-- SPDX-FileCopyrightText: 2026 QuantGlass contributors -->
<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Strategy export

QuantGlass is where you **learn, backtest, paper-trade, and validate** a
strategy honestly. When you want to take a researched strategy elsewhere — into
your own scripts or an external execution layer — you can export it as a stable,
versioned, portable JSON artifact.

This is a **definition with provenance, not an order spec, and not a
recommendation.** It records what the strategy _is_; mapping it to live execution
is your responsibility.

## Endpoint

```
GET /api/strategies/{id}/export
```

Returns `404` if the strategy id is unknown. Implemented in
[`apps/backend/app/api/routes/strategies.py`](../../apps/backend/app/api/routes/strategies.py).

## Format — `quantglass.strategy/v1`

```json
{
  "schema": "quantglass.strategy/v1",
  "source": "QuantGlass",
  "exportedAt": "2026-06-19T10:00:00+00:00",
  "strategy": {
    "id": "strategy-7",
    "name": "Breakout",
    "symbolId": "SPY",
    "setupType": "Momentum",
    "timeframe": "1h",
    "savedAt": "2026-06-01T12:00:00Z"
  },
  "notes": [
    "Portable record of a strategy researched in QuantGlass — its symbol, signal-engine setup type, and timeframe — for use as the basis of execution in an external tool.",
    "'setupType' is the QuantGlass signal-engine setup identifier; map it to your own execution logic.",
    "Not financial advice and not a recommendation. Validate independently before any live use."
  ]
}
```

| Field                | Meaning                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------- |
| `schema`             | Versioned format id. Bumped if the shape changes, so consumers can detect it.             |
| `source`             | Always `"QuantGlass"`.                                                                    |
| `exportedAt`         | UTC ISO-8601 timestamp of the export.                                                     |
| `strategy.symbolId`  | The instrument.                                                                           |
| `strategy.setupType` | The QuantGlass **signal-engine setup identifier** — map this to your own execution logic. |
| `strategy.timeframe` | The candle timeframe the strategy was researched on.                                      |
| `notes`              | Human-readable provenance + the honesty caveats.                                          |

## Example

```bash
curl -s http://127.0.0.1:8000/api/strategies/strategy-7/export | jq .
```

## Why an export instead of built-in live trading?

QuantGlass deliberately stays the honest **"before"** — learn, validate, build
discipline — rather than a live-execution venue (built-in execution is
paper-only in the public preview). Exporting a validated strategy lets you carry
your work into whatever execution layer you trust, without QuantGlass becoming a
brokerage. The format is intentionally small and stable so it is easy to consume.
