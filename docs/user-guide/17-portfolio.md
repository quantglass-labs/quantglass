# 17. Portfolio & order management

[← Academy & missions](16-academy-and-missions.md) · [Contents](README.md) · [Next: AI features →](18-ai-features.md)

---

The **Portfolio** screen (briefcase icon) is the trading desk's home: your
account, open positions, working orders, and the full history of every exit.

## Account tiles

Balance, buying power, realized P&L, and open‑position count, straight from the
paper account. The same guards that protect the ticket apply here: orders above
buying power are rejected with the maximum affordable size, and opposing
positions must be closed first — the venue does not net them.

## Positions

Each open position shows side, quantity, average entry, and unrealized P&L.

- **Close** exits the whole position at the latest closed price.
- **Close ½** (shown when you hold more than one unit) scales out half and
  leaves the rest running — the standard way to bank profit while a trade
  works. Partial closes realize P&L on the closed portion only.

## Working orders

Pending limit/stop entries wait here until their trigger prints on a closed
candle, their time‑in‑force expires (Day / GTC / GTD), or you **Cancel** them.

## History — the closure ledger

Every exit is recorded permanently with:

| Column     | Meaning                                                                |
| ---------- | ---------------------------------------------------------------------- |
| Exit kind  | `manual`, `stop`, `target`, or `trail` — what actually ended the trade |
| PnL        | Realized profit/loss for that exit                                     |
| R‑multiple | PnL measured in units of your planned risk (entry → plan stop)         |

The summary row totals winners and net P&L. R‑multiples are the honest
yardstick: a +0.4R win after a planned 1R risk is a worse decision than a
−1.0R stop‑out that followed the plan. The [Review screen](16-academy-and-missions.md)
and the trade postmortem build on exactly these numbers.

## Order types on the ticket

The trade ticket (opened from any signal) supports:

| Ticket field      | Behaviour on the paper venue                                                           |
| ----------------- | -------------------------------------------------------------------------------------- |
| **Market**        | Fills on the next backend tick at the latest closed price.                             |
| **Limit**         | Rests until price reaches your limit (long: at or below; short: at or above).          |
| **Stop**          | Rests until a breakout through the trigger (long: at or above; short: at or below).    |
| **TIF**           | Day, GTC, or GTD (with an expiry date). Expired orders cancel themselves.              |
| **Trailing %**    | Ratchets your stop from the best closed price — it only ever tightens.                 |
| **Stop & target** | Act as a live OCO bracket: the position closes automatically when either level trades. |

Limit/stop entries unlock with the **Order Types lesson** in the Academy.
Stop‑limit is deliberately **not** simulated — its unfilled‑leg failure mode
can't be modeled honestly on closed candles; the Academy teaches it in a drill
instead. For how these map to a real broker in live mode, see
[Paper vs live trading](12-paper-trading.md#how-the-order-ticket-maps-to-a-real-broker).

## Sizing from risk

With a stop on the plan, the **Size from risk** chips (0.5% / 1% / 2%) compute
quantity from the Academy's sizing formula: `qty = (balance × risk%) / stop distance`.

---

> Every fill on the paper venue happens at a price that verifiably printed on a
> closed candle. No intrabar fills, nothing interpolated — see
> [Core concepts](11-core-concepts.md).

[← Academy & missions](16-academy-and-missions.md) · [Contents](README.md) · [Next: AI features →](18-ai-features.md)
