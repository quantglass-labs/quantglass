# 15. Glossary

[← Troubleshooting & FAQ](14-troubleshooting-faq.md) · [Contents](README.md)

---

A quick reference for the terms, indicators and acronyms used throughout AlphaTerminal.

## General

| Term | Meaning |
|------|---------|
| **Local‑first** | All data and computation live on your machine; nothing is required from the cloud. |
| **Closed candle** | A completed price bar. Signals use only closed candles. |
| **Repainting** | When a signal changes/disappears as the current bar moves. AlphaTerminal avoids this by using closed candles. |
| **Paper trading** | Simulated trading with no real money. |
| **Live trading** | Real orders at a connected broker (gated, off by default). |
| **Corridor** | The internal market‑data pipeline (candles for the supported symbols). |
| **Narration** | The plain‑language explanation attached to a signal. |
| **Fact‑guard** | The check that rejects AI claims contradicting the engine's real numbers. |

## Signal & trade terms

| Term | Meaning |
|------|---------|
| **BUY_ZONE / SELL / HOLD / WAIT / WATCH** | Signal states (see [Core concepts](11-core-concepts.md#the-signal-types)). |
| **Entry zone** | The price band where a setup is valid to enter. |
| **Stop loss (SL)** | The price at which the trade thesis is wrong; risk is capped here. |
| **Take‑profit ladder (TP1/TP2/TP3)** | Three staged exit targets to scale out of a position. |
| **R** | Unit of risk. +1R = a gain equal to the amount risked. |
| **R:R (risk‑reward)** | Potential reward divided by risk for a setup. |
| **Expectancy** | Average R per trade across a sample — the core measure of edge. |
| **Confidence** | 0–100 composite trust score built from evidence. |
| **Confluence** | How many independent factors align on a setup. |

## Market & statistics

| Term | Meaning |
|------|---------|
| **Regime** | The market's character: trending, ranging, volatile, or transitional. |
| **Relative strength (RS)** | A symbol's performance ranked against its peers (0–100 + percentile). |
| **In‑sample (IS)** | The training portion of historical data used to build/fit a setup. |
| **Out‑of‑sample (OOS)** | Held‑out data used to validate an edge. |
| **Walk‑forward** | Repeatedly testing on rolling out‑of‑sample windows. |
| **Win rate** | Share of trades that were profitable. |
| **Max drawdown** | The largest peak‑to‑trough equity decline. |
| **Sharpe / Sortino** | Risk‑adjusted return ratios (Sortino penalises only downside). |
| **Profit factor** | Gross profit divided by gross loss. |
| **Slippage** | The difference between expected and executed price, modelled in backtests. |

## Indicators

| Indicator | Meaning |
|-----------|---------|
| **EMA / SMA** | Exponential / simple moving averages (trend). |
| **RSI** | Relative Strength Index — momentum / overbought‑oversold. |
| **MACD** | Moving Average Convergence Divergence — trend‑momentum. |
| **ATR** | Average True Range — volatility per bar. |
| **ADX** | Average Directional Index — trend strength. |
| **Bollinger Bands** | Volatility envelope around a moving average. |
| **Keltner Channels** | ATR‑based volatility envelope. |
| **Donchian Channels** | Rolling highs/lows used for breakouts. |

## Technology

| Term | Meaning |
|------|---------|
| **Tauri** | The lightweight desktop shell that packages the app. |
| **Sidecar** | The bundled backend engine the desktop app launches. |
| **Ollama** | The local AI model server used for narration. |
| **DuckDB / Parquet** | The analytics database and its portable archive format. |
| **SQLite** | The operational state database (watchlist, alerts, paper account). |

---

[← Troubleshooting & FAQ](14-troubleshooting-faq.md) · [Contents](README.md)
