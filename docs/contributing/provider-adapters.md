# Provider Adapters

Provider adapters connect QuantGlass to market data, news, broker, or alert
services.

## Rules

- Keep capabilities explicit: `ohlcv`, `order_book`, `news`, or `trading`.
- Do not require API keys for public providers.
- Never log API keys, account IDs, or order payload secrets.
- Normalize timestamps to UTC.
- Exclude partial candles unless the user explicitly opts into them.
- Add tests with small deterministic fixtures.
- Document provider rate limits, pricing, and redistribution constraints.

## Backend Files

- Provider registry: `apps/backend/app/providers/manager.py`
- Public providers: `apps/backend/app/providers/public.py`
- Keyed providers: `apps/backend/app/providers/keyed.py`
- Corridor ingest: `apps/backend/app/services/market_corridor.py`

## Minimal Adapter Shape

An OHLCV adapter should expose:

```python
def get_symbols(self, market_type: str) -> list[str]:
    ...

def get_ohlcv(
    self,
    symbol: str,
    timeframe: str,
    start: str | None = None,
    end: str | None = None,
) -> list[dict[str, object]]:
    ...
```

Returned candles should include:

- `open_time_utc`
- `open`
- `high`
- `low`
- `close`
- `volume`

## Acceptance Checklist

- Adapter is registered with the correct capability.
- Unconfigured keyed providers report `configured=false`.
- Invalid provider responses raise clear errors.
- Rate limits are respected.
- Tests cover timestamp normalization and malformed payloads.
