# Strategy And Signal Contributions

Signal contributions should improve decision support without pretending to
predict the future.

## Requirements

- Use closed candles by default.
- Avoid lookahead bias.
- Include fees and slippage assumptions.
- Backtest the same entry, stop, and exit logic shown to users.
- Report sample size and out-of-sample results separately.
- Keep confidence calibrated to evidence, not optimism.
- Add tests with known outcomes.

## Good First Strategy Areas

- Breakout-retest.
- Range mean reversion.
- Higher-timeframe trend filter.
- ETF or crypto relative-strength rotation.
- Volatility-regime filters.

## Files To Study

- `apps/backend/app/services/signal_engine.py`
- `apps/backend/tests/test_backtest.py`
- `apps/backend/tests/test_calibration_corridor.py`

## Acceptance Checklist

- Deterministic tests pass.
- Backtest result describes the displayed trade.
- Low-sample strategies are labeled as unvalidated.
- UI copy avoids financial advice.
