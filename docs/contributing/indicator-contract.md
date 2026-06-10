# Indicator Contract

Indicators are deterministic feature calculations used by signals, backtests,
rankings, and explanations.

QuantGlass separates the indicator surface into two maturity levels:

- `computed`: implemented in the engine today and eligible for signal/backtest
  use.
- `catalog`: listed as a documented contribution target, but not yet computed by
  the core engine.

Community extensions can register additional indicators through
`IndicatorDefinition`. Use `catalog` for metadata-only packs and `computed` only
when the extension also wires a deterministic calculation into an executable
service path.

## Rules

- No network calls.
- No hidden state.
- No future candle access.
- Return one output value per input candle.
- Use `None` where warmup periods make a value unavailable.
- Add known-answer tests.

## Preferred Shape

```python
def _indicator(values: list[float], period: int) -> list[float | None]:
    ...
```

For multi-column indicators, return a tuple of aligned lists.

## Test Expectations

Add tests under `apps/backend/tests/` that cover:

- Warmup behavior.
- Constant series behavior.
- Trending series behavior.
- Edge cases such as empty input or zero division.

## Documentation

If an indicator appears in the UI or confidence basis, update:

- `docs/technical/04-signal-engine.md`
- `docs/user-guide/06-signals.md`

If an indicator is added only as a catalog entry, update the category/family
description and avoid implying that it affects live signals.
