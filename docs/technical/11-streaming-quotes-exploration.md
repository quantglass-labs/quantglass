# 11. Streaming quotes — exploration (PAR-6)

Status: **assessed, deliberately deferred**. This note is the PAR-6 deliverable:
what websocket tick streams would buy us, what they would cost, and the
covenant line any future implementation must not cross.

---

## What exists today

All market data arrives through the corridor as **closed candles**, refreshed
by the scheduler every 5 minutes. Every downstream consumer — signals, the
paper venue's fills and bracket enforcement, charts, account marks — reads the
same stored series. That gives QuantGlass its core honesty property:

> A paper fill can only happen at a price that verifiably printed, on a candle
> that has closed. Nothing is interpolated, nothing is fabricated.

The cost is freshness: marks and unrealized PnL can lag reality by up to the
refresh interval plus one candle.

## What streaming would buy

| Surface                | Benefit                                     | Size of win              |
| ---------------------- | ------------------------------------------- | ------------------------ |
| Marks / unrealized PnL | Seconds-fresh instead of minutes-stale      | Real but cosmetic        |
| Alert triggering       | Fire on touch instead of next closed candle | Material for tight stops |
| Data freshness chips   | "Live" instead of "as of 14:55"             | Cosmetic                 |
| Paper fills            | Intrabar fills like a real venue            | **Crosses the covenant** |

## The covenant line

Ticks are ephemeral: a websocket message is not auditable after the fact, and
consumer-grade feeds (Alpaca IEX, public exchange websockets) drop, dedupe,
and conflate ticks freely. Filling paper orders from a stream would mean fills
that cannot be reproduced from stored data — the exact dishonesty the venue
was built to avoid, and it would silently diverge from what backtests assume.

**Rule for any future implementation: streams may update _display_ state
(marks, freshness, alert previews) but fills and bracket enforcement stay on
closed candles.** A streamed price may _suggest_ ("price touched your stop —
the venue will act on candle close"), never _execute_.

## Engineering cost

- A persistent websocket client per provider (Alpaca stream API, per-exchange
  public sockets for crypto) with reconnect/backoff/heartbeat logic — a new
  always-on failure mode in a local-first app designed around request/response.
- The sidecar is packaged with PyInstaller; long-lived background socket tasks
  complicate the lifecycle (clean shutdown, the DuckDB-lock relaunch ritual).
- Symbol fan-out limits on free tiers (Alpaca IEX stream: 30 symbols) mean a
  partial illusion of liveness — some symbols "live", most not.

## Cheap alternative that captures most of the win

The keyed providers already expose `get_quote()` (REST, last trade). A
**quote-polling lane** — polling visible symbols every 15–30 s and publishing
`market.mark.updated` over the existing event bus — would freshen marks and
alert previews with zero new connection infrastructure, honest sourcing (each
quote is a real REST response), and no covenant risk. If freshness pressure
returns after public preview, build that lane first; revisit websockets only
if 15-second marks prove insufficient.

## Decision

Defer streaming websockets. The paper venue's honesty is worth more than
seconds-fresh marks in an education-first platform, and the quote-polling lane
is the right first step if demand appears. Tracked as
[#76](https://github.com/quantglass-labs/quantglass/issues/76).

---

[← Development](10-development.md) · [Technical docs](README.md)
