# Phase 08 - Backtesting and Validation

## Goal

Build the statistically honest validation layer that gates trust in generated signals.

## Checklist

- [ ] Implement backtest runner with fees and slippage.
- [ ] Add train/test split and walk-forward controls.
- [ ] Persist run snapshots to DuckDB.
- [ ] Compute expectancy and sample-size tables.
- [ ] Surface OOS vs in-sample comparisons in APIs and UI.

## Acceptance Gates

- Backtest results are reproducible and persisted.
- Signal confidence references validated expectancy metrics.
- Low-sample and overfitting warnings are visible in the desktop app.
