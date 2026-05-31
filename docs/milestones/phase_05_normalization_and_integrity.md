# Phase 05 - Normalization and Integrity

## Goal

Guarantee that quant logic only sees validated market data.

## Checklist

- [x] Normalize provider timestamps to UTC.
- [x] Exclude partial latest candles from analytics.
- [x] Deduplicate candles by symbol/timeframe/open time.
- [x] Detect and report gaps.
- [x] Validate price and volume ranges.
- [x] Persist integrity diagnostics for failed ingests.

## Acceptance Gates

- No indicator or signal path can consume unvalidated data.
- Gap and invalid-value failures are observable and actionable.
