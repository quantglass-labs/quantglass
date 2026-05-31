# 10. Settings

[← Alerts](09-alerts.md) · [Contents](README.md) · [Next: Core concepts →](11-core-concepts.md)

---

Settings is where you control **data providers, API keys, risk/safety, AI narration, and saved strategies**. It is organised into five tabs.

<p align="center">
  <img src="../assets/screenshots/settings-providers.png" alt="Settings — Providers" width="900">
</p>

| Tab | Purpose |
|-----|---------|
| [Providers](#providers) | Which data sources are used and in what priority. |
| [API Keys](#api-keys) | Encrypted keys for paid providers and notification channels. |
| [Risk & Safety](#risk--safety) | Paper/live mode, partial candles, minimum backtest sample. |
| [AI](#ai) | Local/cloud narration model selection. |
| [Strategies](#strategies) | Strategies you saved from Backtesting. |

---

## Providers

AlphaTerminal routes each data domain (crypto, stocks, news, AI, trading) through a **priority chain**: a primary source, then a secondary, then a fallback.

- **Simple mode** picks sensible US‑compliant defaults for you:
  - **Crypto:** Coinbase → Kraken → Gemini.
  - **Stocks:** Yahoo Finance.
  - **AI:** Local Ollama (cloud off).
  - **Trading:** Paper only.
- **Advanced mode** exposes explicit primary/secondary/fallback routing and per‑market rate limits.

The **Provider registry status** list shows each provider, its capabilities (`ohlcv`, `order_book`, `news`, `trading`), its transport (`public`, `keyed`, `internal`) and whether it is `configured` or `needs setup`.

> **US‑compliance note:** the default build intentionally **excludes** Binance.com global, OKX and Bybit. It uses Coinbase, Kraken, Gemini, Alpaca, Finnhub and cached metadata providers.

---

## API Keys

<p align="center">
  <img src="../assets/screenshots/settings-apikeys.png" alt="Settings — API Keys" width="900">
</p>

Add optional keys to unlock paid data and notification channels. Keys are **masked** in the UI and **encrypted at rest**.

| Key | Unlocks |
|-----|---------|
| **Finnhub** | News and additional equity data. |
| **Polygon / Twelve Data** | Additional equity OHLCV. |
| **Alpaca** | Equity data and (with live unlock) paper/live trading. |
| **Telegram bot token + chat ID** | Telegram alert delivery. |
| **SMTP host/port/credentials** | Email alert delivery. |

> **Security:** ordinary keys are encrypted on disk. **Trade‑enabled** credentials are additionally stored in your operating system's keychain. See [Technical → Security model](../technical/09-security.md) for details. Use the per‑channel **test** buttons to verify notifications.

---

## Risk & Safety

<p align="center">
  <img src="../assets/screenshots/settings-risk.png" alt="Settings — Risk & Safety" width="900">
</p>

| Control | Default | Meaning |
|---------|---------|---------|
| **Trading mode** | `paper` | Switch between paper and live. Live requires explicit confirmation; only paper execution is active by default. |
| **Partial candles** | `false` (enforced) | Signals use **closed candles only**; partial bars are never acted on. |
| **Minimum backtest sample** | `50` trades | Strategies below this threshold show an instability warning in Backtesting. |

> The live‑trading switch is a **deliberate safety gate**. Flipping to live requires confirmation and trade‑enabled keys. Read [Paper vs live trading](12-paper-trading.md) before changing it.

---

## AI

<p align="center">
  <img src="../assets/screenshots/settings-ai.png" alt="Settings — AI" width="900">
</p>

Controls how signal explanations ("narration") are generated.

| Setting | Default | Notes |
|---------|---------|-------|
| **Model** | `qwen3:14b-q4_K_M` | The local Ollama model used for narration. |
| **Ollama base URL** | `http://127.0.0.1:11434` | Where your local Ollama server runs. |
| **Cloud narration** | Off | Kept off by default to preserve the local‑first hot path. |
| **Request timeout** | 8 s | Narration falls back to a template if the model is slow. |

If Ollama isn't running, AlphaTerminal automatically uses **template‑based** explanations — every signal still gets a clear, fact‑checked write‑up. See [Core concepts → AI narration](11-core-concepts.md#ai-narration-and-the-fact-guard).

---

## Strategies

The Strategies tab lists every strategy you saved from the [Backtesting](08-backtesting.md) screen, with its setup type, timeframe, cost assumptions and headline metrics. Reuse them as starting points for further analysis.

---

[← Alerts](09-alerts.md) · [Contents](README.md) · [Next: Core concepts →](11-core-concepts.md)
