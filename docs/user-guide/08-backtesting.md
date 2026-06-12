# 8. Backtesting

[← Symbol detail](07-symbol-detail.md) · [Contents](README.md) · [Next: Alerts →](09-alerts.md)

---

The Backtesting screen exists to keep you honest. It re‑runs a setup over historical closed candles, applies realistic **fees and slippage**, and separates **in‑sample** (training) from **out‑of‑sample** (held‑out) performance — then warns you when the sample is too small to trust.

<p align="center">
  <img src="../assets/screenshots/backtest.png" alt="Backtesting" width="900">
</p>

---

## The workflow

The screen walks you through a run instead of assuming you know it:

1. **How this works** — a collapsible explainer at the top (it remembers being
   dismissed).
2. **Pick what to test** — the selector groups **signal presets** (built from
   the live signal feed), a **demo preset**, your **saved strategies**, and a
   **manual composer** with all 15 setup families. Timeframes you don't have
   stored candles for are unselectable, and a failed run names the exact data
   gap.
3. **Readiness checklist** — confirms a preset, stored candles, and your
   assumptions are in place before you run.
4. **Run backtest** — the primary action. Until the first run, ghost
   placeholders show what each result panel will contain.

## Inputs

| Control                       | What it does                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| **Strategy / setup selector** | Choose a symbol + setup (e.g. _AAPL Trend Hold Continuation_, _BTC/USD Ema Reclaim Pullback_). |
| **Fees %**                    | Per‑trade commission assumption (e.g. 0.02%).                                                  |
| **Slippage %**                | Expected execution slippage (e.g. 0.01%).                                                      |
| **Train / test split**        | The in‑sample vs out‑of‑sample boundary (default **70% train / 30% test**).                    |
| **Walk‑forward analysis**     | When enabled, validates across rolling windows rather than a single split.                     |

Changing any input **re‑runs the backend quant engine** against the stored corridor candles, so the metrics below always reflect your assumptions.

> The **Prefill source** box tells you exactly what's being tested (symbol, setup, timeframe) and whether live market‑corridor data backs it.

---

## Metrics

The results panel reports a full statistics suite.

| Metric            | What it measures                                       | How to read it                                       |
| ----------------- | ------------------------------------------------------ | ---------------------------------------------------- |
| **Net win rate**  | % of trades that were profitable after costs.          | Higher is better, but always check the sample size.  |
| **Average R**     | Average reward per trade in **R** (multiples of risk). | > 0 means the setup made money per trade on average. |
| **Expectancy**    | Expected R per trade.                                  | The single best summary of edge.                     |
| **Max drawdown**  | Worst peak‑to‑trough equity decline.                   | Lower is better; gauges pain.                        |
| **Sharpe**        | Risk‑adjusted return.                                  | Higher is better.                                    |
| **Sortino**       | Downside‑risk‑adjusted return.                         | Higher is better; penalises losses only.             |
| **Profit factor** | Gross wins ÷ gross losses.                             | > 1 is profitable; > 1.5 is strong.                  |
| **Trade count**   | Number of trades in the test.                          | The credibility multiplier — see below.              |

An **equity curve** and **drawdown curve** visualise the same data over time.

---

## The robustness workbench

Beyond the headline metrics, every run includes the institutional checks:

| Layer                      | Question it answers                                                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Stress table**           | Does the edge survive harsher fees, worse slippage, and delayed entries? Each stressed variant re-runs the full test.                                                             |
| **Monte Carlo**            | Resamples the trade sequence thousands of times: how bad can the drawdown get if the same trades arrive in a different order? Read the 95th-percentile drawdown, not the average. |
| **Bias & quality gates**   | Automatic checks for look-ahead bias, survivorship assumptions, sample size, and split hygiene. A failed gate is printed, not hidden.                                             |
| **Experiment fingerprint** | A hash of data + parameters + code version, so a result can be reproduced exactly and compared honestly across runs.                                                              |
| **AI review**              | A narrated read of this run's own numbers — where it's strong, where the gates complain. Source-labelled like every AI surface ([ch. 18](18-ai-features.md)).                     |

---

## In‑sample vs out‑of‑sample

This is the most important section for avoiding self‑deception.

```mermaid
flowchart LR
    H[Historical candles] --> SPLIT{70 / 30 split}
    SPLIT -->|train| IS[In-sample<br/>fit & measure]
    SPLIT -->|held out| OOS[Out-of-sample<br/>validate]
    IS --> CMP{Close enough?}
    OOS --> CMP
    CMP -->|yes| OK[Trustworthy edge]
    CMP -->|no| OVER[Overfitting warning]
    style OK fill:#0f766e,color:#fff
    style OVER fill:#b91c1c,color:#fff
```

- **In‑sample win rate** — performance on the training segment.
- **Out‑of‑sample win rate** — performance on data the setup never "saw".

If the two are **close**, the edge is more likely real. If in‑sample looks great but out‑of‑sample collapses, the app flags **overfitting** — the setup was tuned to noise.

---

## The low‑sample warning

> ⚠️ _"This setup has fewer than 50 trades, so the validation statistics should be treated as unstable."_

QuantGlass applies a **minimum sample threshold (50 trades by default)**. Below it, even a 100% win rate is treated as **unreliable**, not impressive. This is deliberate: small samples produce flattering but meaningless numbers. Confidence scores elsewhere in the app also down‑weight under‑sampled setups.

---

## Saving a strategy

Click **Save strategy** to store the configured setup (with its fees, slippage and split). Saved strategies appear under [Settings → Strategies](10-settings.md#strategies) and can be reused.

---

## A trustworthy backtest checklist

1. **Trade count ≥ 50** — otherwise treat results as exploratory only.
2. **Out‑of‑sample ≈ in‑sample** — no overfitting flag.
3. **Expectancy > 0** and **profit factor > 1** after fees and slippage.
4. **Drawdown** you could actually tolerate.
5. Re‑run with **walk‑forward** for an extra robustness check.

---

[← Symbol detail](07-symbol-detail.md) · [Contents](README.md) · [Next: Alerts →](09-alerts.md)
