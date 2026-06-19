<!-- SPDX-FileCopyrightText: 2026 QuantGlass contributors -->
<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Data providers

QuantGlass reads market data from two tiers of providers: **public** ones that
need no account, and **keyed** ones that need your own API key.

## Public providers (on by default, idle until you track a symbol)

No key required. Registered as the defaults in
[`apps/backend/app/providers/manager.py`](../../apps/backend/app/providers/manager.py)
and implemented in
[`apps/backend/app/providers/public.py`](../../apps/backend/app/providers/public.py):

| Provider      | Used for     |
| ------------- | ------------ |
| Coinbase      | Crypto OHLCV |
| Kraken        | Crypto OHLCV |
| Gemini        | Crypto OHLCV |
| Yahoo Finance | Equity OHLCV |

A fresh install **tracks nothing**, so no request is made until you add a symbol
to your watchlist. There is no seed watchlist.

## Keyed providers (off until you add a key)

These need your own API key and stay dormant until you enter one. Implemented in
[`apps/backend/app/providers/keyed.py`](../../apps/backend/app/providers/keyed.py):

| Provider    | Asset class                                    | Get a key      |
| ----------- | ---------------------------------------------- | -------------- |
| Alpaca      | US equities (market data + paper/live trading) | alpaca.markets |
| Finnhub     | US equities + company news                     | finnhub.io     |
| Polygon     | US equities                                    | polygon.io     |
| Twelve Data | US equities                                    | twelvedata.com |

### Add a key

1. Open **Settings → API keys** in the app.
2. Paste the key for the provider you want and save. Keys are stored in an
   **encrypted local secret store** — never in plain config, never uploaded.
3. The provider activates on the next data fetch for a tracked symbol.

Under the hood the desktop UI calls `PUT /api/settings/api-keys/{key_id}` on the
loopback backend; keys are encrypted at rest by
[`apps/backend/app/storage/secret_store.py`](../../apps/backend/app/storage/secret_store.py).

## Trading endpoints (Alpaca)

The Alpaca provider defines both endpoints explicitly
([`keyed.py`](../../apps/backend/app/providers/keyed.py)):

```python
PAPER_TRADING_BASE_URL = "https://paper-api.alpaca.markets"
LIVE_TRADING_BASE_URL  = "https://api.alpaca.markets"
```

Paper trading is the supported, wired path. **Built-in live order execution is
not enabled in the public preview** — the live endpoint is only selected if you
add deliberate **live** Alpaca credentials. Nothing hits real markets by default.
See [network-transparency.md](../network-transparency.md) for the full picture.
