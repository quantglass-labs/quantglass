# Phase 04 - Provider Adapters and Ingest

## Goal

Build the first real provider-backed market data ingest path.

## Checklist

- [x] Implement Coinbase/Kraken adapter for crypto OHLCV and quotes.
- [ ] Implement CoinGecko metadata adapter.
- [x] Implement Alpaca or Finnhub stocks adapter.
- [x] Add provider routing, fallback, and rate-limit enforcement.
- [x] Add BTC/USD validation corridor.
- [x] Add SPY validation corridor.
- [x] Persist ingested candles into local storage.

## Acceptance Gates

- Backend can ingest and cache BTC/USD and SPY without fixture data.
- Provider fallback works for supported capabilities.
- Rate-limit behavior is explicit and testable.
