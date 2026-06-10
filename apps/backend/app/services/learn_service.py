# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Interactive Learning Platform service.

Provides a structured 20-lesson curriculum across four tiers (novice →
intermediate → advanced → expert).  Each lesson links directly to live
QuantGlass data so users learn *by doing* rather than through static theory.
"""

from __future__ import annotations

from typing import Any

from app.storage.state_store import StateStore

# ---------------------------------------------------------------------------
# Static lesson catalog
# ---------------------------------------------------------------------------

_LESSONS: list[dict[str, Any]] = [
    # ═══════════════════════════════════════════════════════════════════════
    # NOVICE – Candle to Signal
    # ═══════════════════════════════════════════════════════════════════════
    {
        "id": "novice-01-candlestick",
        "module_id": "novice",
        "tier": "novice",
        "order": 1,
        "title": "Reading a Candlestick",
        "summary": "Understand the four price values that every candle encodes.",
        "concept": (
            "A **candlestick** encodes four prices into a single bar: the **Open** (where the period "
            "started), the **High** and **Low** (the extreme prices reached), and the **Close** (where "
            "the period ended).  The rectangular *body* spans Open→Close.  A *green/bullish* candle "
            "means Close > Open; a *red/bearish* candle means Close < Open.  The thin lines above and "
            "below the body are called **wicks** (or shadows) and show the High and Low.\n\n"
            "**Volume** — the number of units traded during the period — appears below the chart.  High "
            "volume on a strong close signals conviction; high volume on a reversal signals exhaustion."
        ),
        "key_terms": [
            {"term": "Open", "definition": "Price at the very first trade of the period."},
            {"term": "High", "definition": "Highest traded price during the period."},
            {"term": "Low", "definition": "Lowest traded price during the period."},
            {"term": "Close", "definition": "Price at the very last trade of the period."},
            {"term": "Body", "definition": "The rectangle between Open and Close."},
            {"term": "Wick / Shadow", "definition": "The thin line extending beyond the body to the High or Low."},
            {"term": "Volume", "definition": "Number of units traded during the period."},
        ],
        "exercise": {
            "type": "multiple_choice",
            "question": "A candle opens at 100, reaches a high of 110, falls to 95, and closes at 107.  What does the upper wick represent?",
            "options": [
                "The price traveled from 107 to 110 and was rejected back down.",
                "The average price for the period.",
                "The opening price of the next candle.",
                "The total volume transacted.",
            ],
            "correct_index": 0,
            "explanation": (
                "The **upper wick** represents the distance between the Close (107) and the High (110).  "
                "Price reached 110 but buyers couldn't sustain it — sellers pushed it back to 107 by the close.  "
                "A long upper wick on a bullish candle is often a warning of overhead supply."
            ),
        },
        "live_apply": {
            "screen": "dashboard",
            "cta": "Open the Dashboard, hover any candle on the chart, and verify the O/H/L/C values in the tooltip.",
        },
    },
    {
        "id": "novice-02-trend",
        "module_id": "novice",
        "tier": "novice",
        "order": 2,
        "title": "What Makes a Trend",
        "summary": "Learn how higher highs and lower lows define direction.",
        "concept": (
            "A **trend** is a series of price swings moving predominantly in one direction.\n\n"
            "- **Uptrend**: price makes successively **Higher Highs (HH)** and **Higher Lows (HL)**.  "
            "Each pullback sets a higher floor than the last.\n"
            "- **Downtrend**: price makes successively **Lower Highs (LH)** and **Lower Lows (LL)**.\n"
            "- **Range / Sideways**: highs and lows oscillate within a band with no sustained direction.\n\n"
            "QuantGlass identifies trend using the relationship between the **EMA-21** (short-term average) "
            "and the **SMA-50** (medium-term average).  When `Close > EMA21 > SMA50`, the engine classifies "
            "the market as bullish trend.  When `Close < EMA21 < SMA50`, it is bearish."
        ),
        "key_terms": [
            {"term": "Higher High (HH)", "definition": "Each successive swing peak is above the prior peak."},
            {"term": "Higher Low (HL)", "definition": "Each successive pullback bottom is above the prior bottom."},
            {"term": "EMA-21", "definition": "21-period Exponential Moving Average — weights recent closes more."},
            {"term": "SMA-50", "definition": "50-period Simple Moving Average — equal weight across all 50 closes."},
        ],
        "exercise": {
            "type": "multiple_choice",
            "question": "Price closes at 250, EMA-21 is at 245, SMA-50 is at 240.  What trend state does QuantGlass assign?",
            "options": [
                "Bearish — price is below both averages.",
                "Bullish — Close > EMA21 > SMA50.",
                "Ranging — the averages are too close together.",
                "Volatile — cannot determine direction.",
            ],
            "correct_index": 1,
            "explanation": (
                "When `Close (250) > EMA21 (245) > SMA50 (240)` the stack is perfectly bullish.  "
                "The signal engine uses this alignment to gate BUY_ZONE setups in the trend-pullback family."
            ),
        },
        "live_apply": {
            "screen": "signals",
            "cta": "Open Signals, click any BUY_ZONE signal, and look at the Reasons section — find the trend alignment reason.",
        },
    },
    {
        "id": "novice-03-support-resistance",
        "module_id": "novice",
        "tier": "novice",
        "order": 3,
        "title": "Support & Resistance Basics",
        "summary": "Discover the price levels where supply and demand repeatedly clash.",
        "concept": (
            "**Support** is a price level where falling price repeatedly bounces — buyers outweigh sellers "
            "there.  **Resistance** is a level where rising price repeatedly stalls — sellers outweigh buyers.\n\n"
            "These levels form because traders remember past turning points.  A broken resistance level often "
            "becomes the new support (*polarity flip*).  QuantGlass uses the **Donchian Channel** (20-period "
            "highest high / lowest low) to identify recent swing extremes that act as natural S/R."
        ),
        "key_terms": [
            {"term": "Support", "definition": "Price floor — buyers step in to arrest falling price."},
            {"term": "Resistance", "definition": "Price ceiling — sellers step in to arrest rising price."},
            {"term": "Polarity Flip", "definition": "Broken resistance becomes support after a confirmed breakout."},
            {"term": "Donchian Channel", "definition": "The highest high and lowest low over N periods."},
        ],
        "exercise": {
            "type": "multiple_choice",
            "question": "Price breaks above a resistance level at $500 on heavy volume, then pulls back to $500.  What is $500 now?",
            "options": [
                "Still resistance — it hasn't proved itself yet.",
                "Support — the polarity has flipped after a confirmed breakout.",
                "The fair-value price — mean reversion target.",
                "A stop-loss level.",
            ],
            "correct_index": 1,
            "explanation": (
                "After a confirmed breakout on volume, the prior resistance at $500 becomes support.  "
                "This is the *polarity flip*.  The breakout-retest-continuation setup in QuantGlass "
                "specifically looks for price returning to the Donchian breakout level before re-entering."
            ),
        },
        "live_apply": {
            "screen": "signals",
            "cta": "Find a WATCH signal with setup type 'breakout_retest_continuation' — the entry zone is near the flipped level.",
        },
    },
    {
        "id": "novice-04-volume",
        "module_id": "novice",
        "tier": "novice",
        "order": 4,
        "title": "Volume as Confirmation",
        "summary": "Learn why volume gives price moves credibility.",
        "concept": (
            "**Volume** is the number of units traded.  A price move *with* strong volume is more likely to "
            "sustain than a move on thin volume.  Volume confirms that enough participants agree with the "
            "direction.\n\n"
            "QuantGlass computes a **volume ratio** — current bar volume divided by the 20-period average.  "
            "A ratio ≥ 1.75 earns full `volume_confirmation` credit in the confidence formula.  "
            "Breakout entries (Donchian break) require volume_ratio ≥ 1.0 as a minimum gate.\n\n"
            "**Divergence**: price rises but volume falls → weak move, possible exhaustion.  "
            "Price falls on high volume → institutional distribution, bearish signal."
        ),
        "key_terms": [
            {"term": "Volume Ratio", "definition": "Current bar volume ÷ 20-period average volume."},
            {"term": "Volume Confirmation", "definition": "A 0–1 score: how much volume supports the current move."},
            {"term": "Divergence", "definition": "Price and volume moving in opposite directions — weakens the move."},
        ],
        "exercise": {
            "type": "multiple_choice",
            "question": "A bullish breakout candle has volume 3× the 20-period average.  What does this tell you?",
            "options": [
                "It's a false breakout — high volume means exhaustion.",
                "The move has strong institutional participation and is more likely to sustain.",
                "Volume is irrelevant for breakouts.",
                "You should wait for volume to decrease before entering.",
            ],
            "correct_index": 1,
            "explanation": (
                "High volume on a breakout confirms that many participants are in agreement.  "
                "Institutions cannot hide their activity — they leave a volume footprint.  "
                "QuantGlass's volume_confirmation score reaches 1.0 when volume_ratio ≥ 1.75."
            ),
        },
        "live_apply": {
            "screen": "signals",
            "cta": "Open a signal detail drawer and inspect the confidence_basis.volume_confirmation value.",
        },
    },
    {
        "id": "novice-05-reading-signal",
        "module_id": "novice",
        "tier": "novice",
        "order": 5,
        "title": "Reading Your First Signal",
        "summary": "Decode every field in a QuantGlass signal output.",
        "concept": (
            "A QuantGlass signal contains:\n\n"
            "- **Signal type**: BUY_ZONE / SELL / HOLD / WAIT / WATCH\n"
            "- **Entry zone**: a price range [low, high] to enter within\n"
            "- **Stop-loss**: price where the trade idea is proven wrong\n"
            "- **Take-profit [TP1, TP2, TP3]**: three exit rungs (50 / 30 / 20% of position)\n"
            "- **Risk:Reward (R:R)**: how many R you earn if TP2 is reached\n"
            "- **Confidence (0–100)**: calibrated score — not a win probability\n"
            "- **Confidence basis**: the sub-scores that drove the overall confidence\n"
            "- **Reasons**: plain-English explanation of why this setup was identified\n"
            "- **Invalidation**: the condition that cancels this setup\n\n"
            "**Important**: Confidence ≠ win rate.  A 70-confidence signal is NOT '70% likely to win'.  "
            "It means the engine has relatively strong evidence *at the time of the scan*.  "
            "Always check `out_of_sample_validated` — if False, the backtest hasn't cleared statistical scrutiny."
        ),
        "key_terms": [
            {"term": "Entry Zone", "definition": "The price range [low, high] considered acceptable to enter."},
            {"term": "Stop-Loss", "definition": "Price level where the setup is invalidated; maximum acceptable loss."},
            {"term": "Take-Profit Ladder", "definition": "Three scaled exit prices (TP1=50%, TP2=30%, TP3=20% of position)."},
            {"term": "R:R (Risk:Reward)", "definition": "Reward ÷ Risk — a 2.0 R:R means the potential gain is 2× the risk."},
            {"term": "Out-of-Sample Validated", "definition": "True when the OOS backtest slice has ≥ min_sample trades with positive expectancy."},
        ],
        "exercise": {
            "type": "multiple_choice",
            "question": "A BUY_ZONE signal shows entry 100–102, stop 96, TP2 = 108.  What is the approximate R:R to TP2?",
            "options": [
                "R:R ≈ 1.0 — reward equals risk.",
                "R:R ≈ 1.5 — reward is 50% more than risk.",
                "R:R ≈ 2.0 — reward is double the risk.",
                "R:R ≈ 0.5 — risk is double the reward.",
            ],
            "correct_index": 1,
            "explanation": (
                "Entry midpoint ≈ 101, Stop = 96 → Risk = 5.  TP2 = 108 → Reward = 7.  "
                "R:R = 7/5 = 1.4 ≈ 1.5.  QuantGlass targets a minimum 1.5–2.4× R:R depending on setup type."
            ),
        },
        "live_apply": {
            "screen": "signals",
            "cta": "Click any BUY_ZONE signal and locate entry_zone, stop_loss, take_profit, and risk_reward in the detail drawer.",
        },
    },

    # ═══════════════════════════════════════════════════════════════════════
    # INTERMEDIATE – Indicators & Risk
    # ═══════════════════════════════════════════════════════════════════════
    {
        "id": "intermediate-01-moving-averages",
        "module_id": "intermediate",
        "tier": "intermediate",
        "order": 1,
        "title": "Moving Averages — EMA vs SMA",
        "summary": "Understand why the EMA reacts faster and when that matters.",
        "concept": (
            "Both the **EMA** (Exponential Moving Average) and **SMA** (Simple Moving Average) smooth price "
            "noise into a single line.  The difference is *weighting*:\n\n"
            "- **SMA**: every close in the window gets equal weight.  SMA-50 = average of the last 50 closes.\n"
            "- **EMA**: recent closes receive exponentially greater weight.  EMA-21 reacts to new price "
            "faster than SMA-50, turning before the SMA when trend changes.\n\n"
            "**Practical use in QuantGlass:**\n"
            "- EMA-21 acts as dynamic *support in uptrends* and *resistance in downtrends*.\n"
            "- A pullback to the EMA-21 within a bullish stack (Close > EMA > SMA) is the entry trigger "
            "for the `ema_reclaim_pullback` and `daily_trend_pullback` setups.\n"
            "- The *slope* of SMA-50 over the last 10 bars (`htf_slope`) is used as a higher-timeframe "
            "directional filter — entries only allowed when SMA-50 slopes in trade direction."
        ),
        "key_terms": [
            {"term": "SMA-50", "definition": "Simple average of the last 50 closing prices — lagging but stable."},
            {"term": "EMA-21", "definition": "Exponentially weighted 21-period average — faster to react to recent moves."},
            {"term": "Dynamic Support/Resistance", "definition": "A moving average acting as S/R that adjusts with price."},
            {"term": "HTF Slope", "definition": "Higher-timeframe slope: (SMA50[now] - SMA50[10 bars ago]) / SMA50[10 bars ago]."},
        ],
        "exercise": {
            "type": "multiple_choice",
            "question": "Price has been in an uptrend.  It pulls back to touch the EMA-21 while the SMA-50 is below both.  What setup does QuantGlass look for?",
            "options": [
                "A range mean-reversion short.",
                "A trend-pullback long entry (ema_reclaim_pullback or daily_trend_pullback).",
                "A breakdown watch.",
                "No setup — QuantGlass ignores moving average touches.",
            ],
            "correct_index": 1,
            "explanation": (
                "When Close > EMA21 > SMA50 and price pulls back near EMA-21 with RSI in the 46–72 zone, "
                "the engine generates `ema_reclaim_pullback` (intraday) or `daily_trend_pullback` (daily) — "
                "a BUY_ZONE signal targeting continuation of the uptrend."
            ),
        },
        "live_apply": {
            "screen": "signals",
            "cta": "Filter Signals to BUY_ZONE.  Find a signal with setup_type = 'ema_reclaim_pullback' and inspect the reasons list.",
        },
    },
    {
        "id": "intermediate-02-rsi",
        "module_id": "intermediate",
        "tier": "intermediate",
        "order": 2,
        "title": "RSI — Measuring Momentum",
        "summary": "Use RSI to identify exhaustion and momentum confirmation.",
        "concept": (
            "The **Relative Strength Index (RSI-14)** measures momentum: how fast and how far price has "
            "moved relative to its recent history.  It oscillates between 0 and 100:\n\n"
            "- **RSI > 70**: overbought (momentum extended, watch for exhaustion)\n"
            "- **RSI < 30**: oversold (momentum extended to the downside)\n"
            "- **RSI 46–72**: healthy uptrend zone — pullback entries preferred here\n\n"
            "QuantGlass also uses **RSI-2** (ultra-fast 2-period RSI) for mean-reversion setups:\n"
            "- RSI-2 ≤ 8 near the lower Bollinger Band → extreme short-term oversold → BUY_ZONE\n"
            "- RSI-2 ≥ 92 near the upper Bollinger Band → extreme short-term overbought → SELL\n\n"
            "**Divergence**: price makes a higher high but RSI makes a lower high → bearish divergence, "
            "momentum weakening even as price rises."
        ),
        "key_terms": [
            {"term": "RSI-14", "definition": "14-period Relative Strength Index — primary momentum oscillator."},
            {"term": "RSI-2", "definition": "2-period RSI — extreme short-term mean-reversion indicator."},
            {"term": "Overbought", "definition": "RSI > 70 — momentum extended upward, risk of reversal rises."},
            {"term": "Oversold", "definition": "RSI < 30 — momentum extended downward, potential bounce zone."},
            {"term": "RSI Divergence", "definition": "Price and RSI moving in opposite directions — signals weakening momentum."},
        ],
        "exercise": {
            "type": "multiple_choice",
            "question": "In a ranging market, RSI-2 drops to 5 and price touches the lower Bollinger Band.  What signal does QuantGlass generate?",
            "options": [
                "SELL — price is at the bottom, confirming a breakdown.",
                "BUY_ZONE with setup type 'range_meanreversion_long'.",
                "WAIT — insufficient evidence in a ranging market.",
                "HOLD — no new entry in ranging markets.",
            ],
            "correct_index": 1,
            "explanation": (
                "In a `ranging` regime, RSI-2 ≤ 8 *and* price at the lower Bollinger Band triggers the "
                "`range_meanreversion_long` setup.  The mean-reversion target is the Bollinger Band midline.  "
                "The TP ladder is anchored to that midline, not an open-ended ATR multiple."
            ),
        },
        "live_apply": {
            "screen": "signals",
            "cta": "Look for a BUY_ZONE signal with setup_type = 'range_meanreversion_long' in the Signals screen.",
        },
    },
    {
        "id": "intermediate-03-atr",
        "module_id": "intermediate",
        "tier": "intermediate",
        "order": 3,
        "title": "ATR — Measuring Volatility & Sizing Stops",
        "summary": "Learn to size stops and positions using actual market volatility.",
        "concept": (
            "The **Average True Range (ATR-14)** measures volatility: the average of the 'true range' over "
            "14 bars.  True Range = max(High − Low, |High − PrevClose|, |Low − PrevClose|).\n\n"
            "**Why ATR-based stops beat fixed-dollar stops:**\n"
            "A flat $500 stop on a volatile stock will be hit by normal noise.  An ATR-based stop adjusts "
            "to the current volatility — in quiet markets it tightens, in volatile markets it widens.\n\n"
            "**QuantGlass stop formula (long entry):**\n"
            "`stop_loss = reference_price − (ATR × stop_multiple)`\n"
            "where stop_multiple = 1.3 (compressed), 1.45 (normal), 1.6 (expanded).\n\n"
            "**ATR % of price** = ATR ÷ Close × 100.  If ATR% < 1% → low risk.  ATR% > 2.6% → high risk."
        ),
        "key_terms": [
            {"term": "ATR-14", "definition": "14-period Average True Range — measures recent price volatility."},
            {"term": "True Range", "definition": "The largest of: High-Low, |High-PrevClose|, |Low-PrevClose|."},
            {"term": "Stop Multiple", "definition": "ATR multiplier for stop placement: 1.3 (compressed) to 1.6 (expanded)."},
            {"term": "ATR % of Price", "definition": "ATR ÷ Close × 100 — the normalized volatility as a percentage."},
        ],
        "exercise": {
            "type": "numeric_input",
            "question": "BTCUSD is at $65,000.  ATR-14 = $1,300.  Volatility regime is 'normal' (stop_multiple = 1.45).  What is the stop-loss for a long entry?",
            "hint": "stop_loss = entry − (ATR × stop_multiple)",
            "correct_answer": "63115",
            "tolerance_percent": 0.5,
            "explanation": (
                "stop_loss = 65,000 − (1,300 × 1.45) = 65,000 − 1,885 = **63,115**.  "
                "The stop is placed 1.45 ATR below entry — far enough to survive normal price noise "
                "but close enough that the risk per trade is quantifiable."
            ),
        },
        "live_apply": {
            "screen": "signals",
            "cta": "Open a BTCUSD BUY_ZONE signal and verify the stop_loss distance from entry equals roughly 1.3–1.6× ATR.",
        },
    },
    {
        "id": "intermediate-04-risk-reward",
        "module_id": "intermediate",
        "tier": "intermediate",
        "order": 4,
        "title": "Risk:Reward Ratio",
        "summary": "Understand why R:R determines long-term edge independent of win rate.",
        "concept": (
            "**Risk:Reward (R:R)** = (TP_exit − Entry) ÷ (Entry − Stop_loss) for longs.\n\n"
            "A 2.0 R:R means you risk 1 to potentially gain 2.  Even if you only win 40% of trades, "
            "a 2.0 R:R produces positive expectancy:\n"
            "`Expectancy = (Win% × Avg_win) − (Loss% × Avg_loss) = (0.4 × 2R) − (0.6 × 1R) = +0.2R`\n\n"
            "**QuantGlass R:R targets:**\n"
            "- BUY_ZONE / SELL setups: reward_multiple = 2.4× risk_distance (to TP2)\n"
            "- HOLD / WATCH / WAIT setups: reward_multiple = 1.8×\n\n"
            "The engine uses a **3-rung ladder** to scale out: TP1 (50% of position), TP2 (30%), TP3 (20%).  "
            "This ensures partial profit is secured while letting part of the position run."
        ),
        "key_terms": [
            {"term": "R:R", "definition": "Risk:Reward ratio — potential profit ÷ risk per trade."},
            {"term": "Expectancy", "definition": "Average profit per trade: (Win% × Avg_win) − (Loss% × Avg_loss)."},
            {"term": "TP Ladder", "definition": "Scaled exit at TP1 (50%), TP2 (30%), TP3 (20%) of position size."},
            {"term": "Positive Expectancy", "definition": "Expectancy > 0 — the edge survives over many trades."},
        ],
        "exercise": {
            "type": "multiple_choice",
            "question": "You win 35% of trades with an average win of 3R and lose 65% with an average loss of 1R.  Is your edge positive?",
            "options": [
                "No — 35% win rate is too low to be profitable.",
                "Yes — Expectancy = (0.35 × 3) − (0.65 × 1) = +0.4R per trade.",
                "No — a 65% loss rate always means negative expectancy.",
                "Unknown — you need more data.",
            ],
            "correct_index": 1,
            "explanation": (
                "Expectancy = (0.35 × 3R) − (0.65 × 1R) = 1.05 − 0.65 = **+0.4R per trade**.  "
                "This means over 100 trades you'd expect +40R of profit.  High R:R allows you to be "
                "profitable even with a sub-50% win rate — which is realistic for trend-following."
            ),
        },
        "live_apply": {
            "screen": "backtest",
            "cta": "Open Backtesting, pick any preset, and examine the Expectancy (avg_R), Win Rate, and Profit Factor metrics together.",
        },
    },
    {
        "id": "intermediate-05-position-sizing",
        "module_id": "intermediate",
        "tier": "intermediate",
        "order": 5,
        "title": "Position Sizing — How Much to Risk",
        "summary": "Calculate the correct trade size so no single loss is ruinous.",
        "concept": (
            "**Position sizing** determines how many units to buy/sell so that if the stop is hit, "
            "you lose no more than your pre-defined *risk per trade* (e.g., 1% of account).\n\n"
            "**Fixed-fractional formula:**\n"
            "`Position size = (Account × Risk%) ÷ (Entry − Stop_loss)`\n\n"
            "Example: $10,000 account, 1% risk per trade, entry at $100, stop at $96:\n"
            "`Size = ($10,000 × 0.01) ÷ ($100 − $96) = $100 ÷ $4 = 25 shares`\n\n"
            "If those 25 shares all hit the stop at $96, you lose 25 × $4 = **$100 exactly** — 1% of account.\n\n"
            "**Why this matters**: risking a fixed percentage keeps losses small during drawdowns while "
            "allowing position size to grow as the account grows (compounding)."
        ),
        "key_terms": [
            {"term": "Risk Per Trade", "definition": "The maximum dollar loss acceptable if the stop is hit (e.g., 1% of account)."},
            {"term": "Fixed-Fractional Sizing", "definition": "Size = (Account × Risk%) ÷ (Entry − Stop) — scales with account."},
            {"term": "Drawdown", "definition": "Peak-to-trough decline in account equity during a losing streak."},
        ],
        "exercise": {
            "type": "numeric_input",
            "question": "Account = $25,000.  Risk per trade = 1%.  Entry = $200, Stop = $192.  How many shares?",
            "hint": "Position size = (Account × Risk%) ÷ (Entry − Stop)",
            "correct_answer": "31",
            "tolerance_percent": 2.0,
            "explanation": (
                "Risk amount = $25,000 × 1% = $250.  Risk per share = $200 − $192 = $8.  "
                "Position size = $250 ÷ $8 = **31.25 → 31 shares**.  "
                "If the stop fires: 31 × $8 = $248 lost — just under 1% of account."
            ),
        },
        "live_apply": {
            "screen": "signals",
            "cta": "Open a signal, note its entry and stop_loss, then calculate how many shares to buy with 1% risk on a $10,000 paper account.",
        },
    },

    # ═══════════════════════════════════════════════════════════════════════
    # ADVANCED – Engine Deep-Dive
    # ═══════════════════════════════════════════════════════════════════════
    {
        "id": "advanced-01-market-regimes",
        "module_id": "advanced",
        "tier": "advanced",
        "order": 1,
        "title": "Market Regimes",
        "summary": "Understand why the same indicator works differently in each regime.",
        "concept": (
            "QuantGlass classifies the current market into one of four **regimes** before generating a signal.  "
            "The regime gates which strategy families are eligible:\n\n"
            "| Regime | Condition | Active strategies |\n"
            "|---|---|---|\n"
            "| **Trending** | ADX ≥ 22 | Pullback, Breakout-retest |\n"
            "| **Ranging** | ADX < 16 | Mean-reversion (RSI-2 + BB) |\n"
            "| **Volatile** | ATR% ≥ 1.7× median ATR% | All entries suppressed / reduced confidence |\n"
            "| **Transitional** | ADX 16–22 | Pullback only, reduced confluence |\n\n"
            "**ADX (Average Directional Index)** measures trend *strength*, not direction.  "
            "High ADX = strong trend (either up or down); low ADX = weak/ranging market."
        ),
        "key_terms": [
            {"term": "ADX-14", "definition": "14-period Average Directional Index — measures trend strength (0–100)."},
            {"term": "Trending", "definition": "ADX ≥ 22 — a directional trend is in place."},
            {"term": "Ranging", "definition": "ADX < 16 — no meaningful trend; mean-reversion strategies preferred."},
            {"term": "Volatile", "definition": "ATR% ≥ 1.7× its 50-bar median — abnormal volatility, confidence capped."},
            {"term": "Transitional", "definition": "ADX 16–22 — market shifting between trending and ranging."},
        ],
        "exercise": {
            "type": "multiple_choice",
            "question": "ADX = 12, ATR% is near its historical median.  Which setup family does QuantGlass evaluate?",
            "options": [
                "Breakout-retest only.",
                "Mean-reversion (range_meanreversion_long/short) using RSI-2 and Bollinger Bands.",
                "Trend-pullback only.",
                "All families simultaneously.",
            ],
            "correct_index": 1,
            "explanation": (
                "ADX = 12 < 16 → **ranging** regime.  The engine skips the trend-pullback and breakout "
                "families and evaluates only the mean-reversion family: RSI-2 at extremes near Bollinger Bands.  "
                "The wrong strategy in the wrong regime is a primary source of signal failure."
            ),
        },
        "live_apply": {
            "screen": "signals",
            "cta": "Open any signal and look at market_regime in the confidence_basis.  Find one 'ranging' and one 'trending' signal.",
        },
    },
    {
        "id": "advanced-02-macd",
        "module_id": "advanced",
        "tier": "advanced",
        "order": 2,
        "title": "MACD Histogram — Momentum Confirmation",
        "summary": "Use the MACD histogram as a secondary momentum confirmation filter.",
        "concept": (
            "**MACD** (Moving Average Convergence/Divergence) measures the gap between two EMAs:\n"
            "`MACD Line = EMA(12) − EMA(26)`\n"
            "`Signal Line = EMA(9) of MACD Line`\n"
            "`Histogram = MACD Line − Signal Line`\n\n"
            "**Histogram interpretation:**\n"
            "- Histogram > 0 and growing → accelerating bullish momentum\n"
            "- Histogram < 0 and shrinking → bearish momentum fading (possible reversal)\n"
            "- **Divergence**: price makes new high, histogram does not → hidden weakness\n\n"
            "**Role in QuantGlass:** MACD histogram sign is a `macd_agree` boolean in the confluence formula.  "
            "If histogram agrees with trade direction, confluence score gains 0.10.  It is a confirmation "
            "filter, not a primary trigger."
        ),
        "key_terms": [
            {"term": "MACD Line", "definition": "EMA(12) − EMA(26) — the core momentum line."},
            {"term": "Signal Line", "definition": "EMA(9) of the MACD line — smoothed version."},
            {"term": "Histogram", "definition": "MACD Line − Signal Line — shows the rate of momentum change."},
            {"term": "MACD Divergence", "definition": "Price and MACD moving in opposite directions — weakening move."},
        ],
        "exercise": {
            "type": "multiple_choice",
            "question": "Price is above EMA-21 > SMA-50.  MACD histogram is at −0.02.  Does the engine add the 'macd_agree' bonus?",
            "options": [
                "Yes — the histogram is near zero, which counts as neutral agreement.",
                "No — macd_agree requires histogram > 0 for a BUY_ZONE setup.",
                "Yes — being in a bullish stack always earns the bonus.",
                "The MACD is not used in QuantGlass at all.",
            ],
            "correct_index": 1,
            "explanation": (
                "For a long/bullish setup, `macd_agree = macd_histogram > 0`.  "
                "A negative histogram (−0.02) means bearish momentum despite the bullish price stack — "
                "the +0.10 confluence bonus is withheld.  Signals can still fire, but with lower confidence."
            ),
        },
        "live_apply": {
            "screen": "signals",
            "cta": "Find a HOLD or WATCH signal — these often have MACD not agreeing with direction, lowering confidence.",
        },
    },
    {
        "id": "advanced-03-bollinger-bands",
        "module_id": "advanced",
        "tier": "advanced",
        "order": 3,
        "title": "Bollinger Bands — Volatility Envelope",
        "summary": "Use BB squeeze and expansion to time entries with volatility.",
        "concept": (
            "**Bollinger Bands** consist of:\n"
            "- `BB Mid` = SMA(20)\n"
            "- `BB Upper` = SMA(20) + 2 × StdDev(20)\n"
            "- `BB Lower` = SMA(20) − 2 × StdDev(20)\n"
            "- `BB Bandwidth` = (Upper − Lower) / Mid × 100\n\n"
            "**Squeeze**: bands narrow → low volatility → energy compresses → breakout imminent.\n"
            "**Expansion**: bands widen → volatility spike → trend underway.\n\n"
            "**In QuantGlass (ranging regime):**\n"
            "- Price at BB Lower + RSI-2 ≤ 8 → `range_meanreversion_long` (BUY_ZONE)\n"
            "- Price at BB Upper + RSI-2 ≥ 92 → `range_meanreversion_short` (SELL)\n"
            "- Target for mean-reversion: BB Mid (the 20-period SMA)\n\n"
            "Bandwidth is also used to set the `volatility_regime` stop multiplier."
        ),
        "key_terms": [
            {"term": "BB Upper", "definition": "SMA(20) + 2 standard deviations — upper envelope."},
            {"term": "BB Lower", "definition": "SMA(20) − 2 standard deviations — lower envelope."},
            {"term": "BB Bandwidth", "definition": "(Upper − Lower) / Mid × 100 — width of the bands, a volatility proxy."},
            {"term": "BB Squeeze", "definition": "Bands narrowing — volatility is compressing before a directional move."},
        ],
        "exercise": {
            "type": "multiple_choice",
            "question": "BB Bandwidth has been contracting for 10 bars and just reached its 6-month minimum.  What should you prepare for?",
            "options": [
                "A sustained period of low volatility — nothing will happen.",
                "A volatility expansion / breakout — the squeeze releases energy.",
                "An immediate reversal to the BB midline.",
                "The signal engine will suppress all signals.",
            ],
            "correct_index": 1,
            "explanation": (
                "A BB squeeze to multi-month lows is a classic setup for an imminent volatility expansion.  "
                "The direction is not predicted by the bands alone — you need the trend stack and a volume "
                "trigger to choose long vs short.  This is why QuantGlass combines BB with ADX and RSI-2."
            ),
        },
        "live_apply": {
            "screen": "signals",
            "cta": "Find a range_meanreversion signal.  The entry zone will be near the BB Lower (long) or BB Upper (short).",
        },
    },
    {
        "id": "advanced-04-backtest-reading",
        "module_id": "advanced",
        "tier": "advanced",
        "order": 4,
        "title": "Reading a Backtest — IS vs OOS",
        "summary": "Interpret in-sample and out-of-sample metrics to judge setup quality.",
        "concept": (
            "QuantGlass splits historical candles 70/30 by time:\n\n"
            "- **In-Sample (IS, 70%)**: the training window.  The engine can 'see' this period when "
            "producing the current signal.  IS metrics tell you how the setup performed in history.\n"
            "- **Out-of-Sample (OOS, 30%)**: a held-out window the engine didn't train on.  "
            "OOS metrics approximate future performance more honestly than IS.\n\n"
            "**Key metrics to read:**\n"
            "| Metric | What it means |\n"
            "|---|---|\n"
            "| Win Rate | % of trades that returned > 0R |\n"
            "| Expectancy | Average R per trade |\n"
            "| Profit Factor | Gross profit ÷ Gross loss |\n"
            "| Max Drawdown | Worst peak-to-trough loss |\n"
            "| Sharpe / Sortino | Risk-adjusted return |\n"
            "| OOS Validated | True when OOS has ≥ min_sample trades AND positive OOS expectancy |\n\n"
            "A signal with high IS metrics but OOS_Validated = False should be treated with caution."
        ),
        "key_terms": [
            {"term": "In-Sample (IS)", "definition": "Historical window the model trained on — 70% by time."},
            {"term": "Out-of-Sample (OOS)", "definition": "Held-out window — 30% of history, simulates forward performance."},
            {"term": "Profit Factor", "definition": "Gross wins ÷ Gross losses.  > 1.3 is generally positive."},
            {"term": "Max Drawdown", "definition": "The worst decline from peak equity in the backtest — shows worst-case pain."},
            {"term": "OOS Validated", "definition": "True when OOS has enough trades (≥ min_sample) with positive expectancy."},
        ],
        "exercise": {
            "type": "multiple_choice",
            "question": "A backtest shows IS win rate 65%, OOS win rate 41%, OOS expectancy −0.12R.  Is this setup reliable?",
            "options": [
                "Yes — 65% IS win rate is strong.",
                "No — the IS/OOS gap suggests overfitting; OOS expectancy is negative.",
                "Maybe — wait for more trades in the OOS period.",
                "Yes — negative OOS expectancy is normal for mean-reversion.",
            ],
            "correct_index": 1,
            "explanation": (
                "A large IS/OOS gap (65% vs 41%) and negative OOS expectancy (−0.12R) strongly suggests "
                "the setup is **overfitted** to the IS period — it captured noise, not signal.  "
                "QuantGlass sets `out_of_sample_validated = False` and caps confidence at 62 in this case."
            ),
        },
        "live_apply": {
            "screen": "backtest",
            "cta": "Open Backtesting, select any preset, and compare IS Win Rate vs OOS Win Rate.  Find one where OOS is close to IS.",
        },
    },
    {
        "id": "advanced-05-confidence-basis",
        "module_id": "advanced",
        "tier": "advanced",
        "order": 5,
        "title": "The Confidence Basis — What Drives the Score",
        "summary": "Reverse-engineer confidence scores by reading each sub-component.",
        "concept": (
            "The `confidence` number (0–100) is derived from these weighted sub-scores:\n\n"
            "| Component | Weight | Source |\n"
            "|---|---|---|\n"
            "| base | Fixed (42–58) | Signal type (WAIT=42, HOLD/WATCH=52, BUY/SELL=58) |\n"
            "| trend_alignment | × 14 | |EMA-SMA gap| / close |\n"
            "| volume_confirmation | × 8 | volume_ratio / 1.75 |\n"
            "| confluence_score − 0.5 | × 18 | Multi-factor score from signal family |\n"
            "| calibrated_win_rate − 0.5 | × 32 | Bayesian-shrunk win rate from pooled expectancy |\n"
            "| expectancy | × 10 | Pooled expectancy R (capped ±1) |\n"
            "| thin-sample penalty | −8 | Applied when pooled_sample < min_sample |\n"
            "| OOS cap | max 62 | Applied when out_of_sample_validated = False |\n\n"
            "Final confidence is clamped to [20, 89] — the engine never claims certainty."
        ),
        "key_terms": [
            {"term": "Calibrated Win Rate", "definition": "Bayesian shrinkage: raw win rate → 0.5 proportional to sample thinness."},
            {"term": "Pooled Expectancy", "definition": "Cross-symbol aggregated expectancy for this setup type across the corridor."},
            {"term": "Confluence Score", "definition": "Multi-factor combined score: trend, volume, MACD, HTF slope, regime bonus."},
            {"term": "OOS Cap", "definition": "Confidence hard-capped at 62 when out_of_sample_validated is False."},
        ],
        "exercise": {
            "type": "multiple_choice",
            "question": "A BUY_ZONE signal has perfect trend alignment (1.0) but OOS_validated = False and pooled_sample = 12 (< min_sample=50).  What is the approximate max confidence?",
            "options": [
                "89 — perfect trend alignment earns maximum confidence.",
                "≈ 62 — OOS cap applies; thin-sample penalty reduces further.",
                "20 — the minimum floor kicks in.",
                "50 — neutral default.",
            ],
            "correct_index": 1,
            "explanation": (
                "OOS cap sets hard ceiling at 62.  The thin-sample penalty (−8) is also applied since "
                "pooled_sample (12) < min_sample (50).  Starting from BUY base 58 + perfect alignment (14) = 72, "
                "minus 8 (thin sample) = 64, then capped at 62.  The engine won't claim high confidence without evidence."
            ),
        },
        "live_apply": {
            "screen": "signals",
            "cta": "Open any signal drawer and expand the Confidence Basis section.  Find a signal where OOS_validated = True and one where it is False.",
        },
    },

    # ═══════════════════════════════════════════════════════════════════════
    # EXPERT – Build & Calibrate
    # ═══════════════════════════════════════════════════════════════════════
    {
        "id": "expert-01-oos-validation",
        "module_id": "expert",
        "tier": "expert",
        "order": 1,
        "title": "Walk-Forward OOS Validation",
        "summary": "Understand the statistical basis for honest backtesting.",
        "concept": (
            "**Walk-forward analysis** repeatedly tests a strategy on rolling out-of-sample windows "
            "instead of a single fixed split.  The intuition: if a strategy is robust, it should "
            "show positive expectancy across *multiple* independent OOS windows, not just one.\n\n"
            "**QuantGlass OOS validation criteria:**\n"
            "1. OOS trade count ≥ `min_backtest_sample` (default: 50 trades)\n"
            "2. OOS expectancy > 0.0R (the setup earned money in the held-out period)\n\n"
            "Both must be true for `out_of_sample_validated = True`.\n\n"
            "**Why sample size matters**: a 5-trade OOS win rate of 80% is statistically meaningless.  "
            "The **Empirical Bayes shrinkage** in `_calibrate_win_rate` handles this by pulling "
            "thin-sample win rates toward 50% in proportion to sample thinness."
        ),
        "key_terms": [
            {"term": "Walk-Forward", "definition": "Rolling window backtesting across multiple OOS periods."},
            {"term": "min_backtest_sample", "definition": "Minimum OOS trade count required before OOS validation is claimed."},
            {"term": "OOS Expectancy", "definition": "Average R per trade in the held-out 30% of data."},
            {"term": "Empirical Bayes Shrinkage", "definition": "Pulling raw win rates toward 50% when sample is thin — prevents overfitting."},
        ],
        "exercise": {
            "type": "multiple_choice",
            "question": "A setup has 8 OOS trades with 75% win rate and +0.9R expectancy.  min_backtest_sample = 50.  Is OOS validated?",
            "options": [
                "Yes — 75% win rate is strong evidence.",
                "No — OOS trade count (8) < min_backtest_sample (50).  Both conditions must be met.",
                "Yes — positive expectancy alone is sufficient.",
                "No — 75% win rate is too high; it suggests lookahead bias.",
            ],
            "correct_index": 1,
            "explanation": (
                "Even though expectancy is positive (+0.9R), OOS trade count (8) is below the minimum (50).  "
                "**Both** conditions must pass: `oos_count ≥ min_sample AND oos_expectancy > 0`.  "
                "8 trades is far too small a sample — even a 75% win rate from 8 trades is statistically insignificant.  "
                "Confidence will be capped at 62 and flagged as not validated."
            ),
        },
        "live_apply": {
            "screen": "backtest",
            "cta": "In Settings → Safety, try reducing min_backtest_sample to 10 and see how more signals show OOS_validated=True — then think about whether that's trustworthy.",
        },
    },
    {
        "id": "expert-02-empirical-bayes",
        "module_id": "expert",
        "tier": "expert",
        "order": 2,
        "title": "Empirical Bayes Confidence Calibration",
        "summary": "Learn how the engine prevents small-sample backtest results from inflating confidence.",
        "concept": (
            "**The problem**: a strategy with 3 winning trades out of 3 has a 100% observed win rate.  "
            "Treating this as 100% confidence would be dangerously misleading.\n\n"
            "**Empirical Bayes shrinkage** solves this by incorporating a *prior* (a skeptical belief "
            "that the true win rate is 50%) and updating it with evidence:\n\n"
            "`calibrated_win_rate = (raw_win_rate × sample_size + 0.5 × prior_strength) / (sample_size + prior_strength)`\n\n"
            "where `prior_strength = min_backtest_sample` (default: 50).\n\n"
            "**Effect:**\n"
            "- 3-of-3 (100% raw): calibrated = (3 + 25) / (3 + 50) = 52.8% → nearly neutral\n"
            "- 40-of-50 (80% raw): calibrated = (40 + 25) / (50 + 50) = 65% → moderate confidence\n"
            "- 100-of-120 (83% raw): calibrated = (100 + 25) / (120 + 50) = 73.5% → high confidence\n\n"
            "More data = less shrinkage = calibrated score approaches raw reality."
        ),
        "key_terms": [
            {"term": "Prior", "definition": "Starting belief (50% win rate) before seeing any data."},
            {"term": "Prior Strength", "definition": "How much the prior dominates — equals min_backtest_sample (50 pseudo-trades)."},
            {"term": "Shrinkage", "definition": "Pulling the estimate toward the prior when sample is small."},
            {"term": "Calibrated Win Rate", "definition": "Bayesian-adjusted win rate — more reliable than raw win rate from small samples."},
        ],
        "exercise": {
            "type": "numeric_input",
            "question": "raw_win_rate = 0.70, sample_size = 20, prior_strength = 50.  What is the calibrated_win_rate? (round to 2 decimal places, e.g. 0.63)",
            "hint": "calibrated = (raw × n + 0.5 × prior) / (n + prior)",
            "correct_answer": "0.61",
            "tolerance_percent": 2.0,
            "explanation": (
                "calibrated = (0.70 × 20 + 0.5 × 50) / (20 + 50) = (14 + 25) / 70 = 39 / 70 = **0.557 ≈ 0.56**.  "
                "A 70% raw win rate from 20 trades shrinks to ~56% — close to neutral.  "
                "This prevents overconfidence in thin backtests."
            ),
        },
        "live_apply": {
            "screen": "backtest",
            "cta": "Compare a setup with 10 OOS trades vs one with 80 OOS trades.  Notice how confidence differs even for similar raw win rates.",
        },
    },
    {
        "id": "expert-03-custom-indicator",
        "module_id": "expert",
        "tier": "expert",
        "order": 3,
        "title": "Writing a Custom Indicator Extension",
        "summary": "Contribute a deterministic indicator to QuantGlass using the extension API.",
        "concept": (
            "Indicators in QuantGlass must satisfy these constraints:\n"
            "1. **Deterministic** — same inputs always produce same outputs\n"
            "2. **No network calls** — pure computation on provided candle data\n"
            "3. **No lookahead** — index N may only use candles 0…N\n"
            "4. **No hidden state** — stateless functions or classes that reset per call\n\n"
            "**Minimal indicator extension:**\n"
            "```python\n"
            "from app.extensions.base import ExtensionBase, ExtensionManifest\n\n"
            "class VWAPIndicatorExtension(ExtensionBase):\n"
            "    def manifest(self):\n"
            "        return ExtensionManifest(\n"
            "            id='vwap-indicator',\n"
            "            name='VWAP',\n"
            "            version='1.0.0',\n"
            "            capabilities=['indicator'],\n"
            "            permissions=[],\n"
            "        )\n\n"
            "    def register(self, context):\n"
            "        context.indicator_registry.register({\n"
            "            'id': 'vwap',\n"
            "            'name': 'Volume-Weighted Average Price',\n"
            "            'compute': self._compute_vwap,\n"
            "        })\n\n"
            "    def _compute_vwap(self, candles):\n"
            "        cumvol, cumvp = 0.0, 0.0\n"
            "        result = []\n"
            "        for c in candles:\n"
            "            cumvol += c['volume']\n"
            "            cumvp += c['volume'] * (c['high'] + c['low'] + c['close']) / 3\n"
            "            result.append(cumvp / cumvol if cumvol else None)\n"
            "        return result\n"
            "```\n"
            "Drop this file in `workspace/extensions/` and restart the backend."
        ),
        "key_terms": [
            {"term": "Extension Manifest", "definition": "Declares id, name, version, capabilities, and required permissions."},
            {"term": "Indicator Contract", "definition": "compute(candles) → list of values, one per candle, no lookahead."},
            {"term": "Deterministic", "definition": "Same input → same output, always, with no side effects."},
        ],
        "exercise": {
            "type": "multiple_choice",
            "question": "Which of these violates the QuantGlass indicator contract?",
            "options": [
                "Using candle[i] to compute a rolling sum of candle[0..i].",
                "Making an HTTP request to fetch additional price data inside compute().",
                "Returning None for the first N candles while the window warms up.",
                "Accepting a 'period' parameter in the compute function signature.",
            ],
            "correct_index": 1,
            "explanation": (
                "HTTP calls inside `compute()` violate the **no-network** rule.  Network calls introduce "
                "latency, non-determinism, and potential lookahead bias.  All data must be provided "
                "through the candles argument.  Returning None during warmup and accepting parameters "
                "are both valid and expected patterns."
            ),
        },
        "live_apply": {
            "screen": "settings",
            "cta": "Open Settings → Extensions.  Review the community_momentum_pack extension as a reference implementation.",
        },
    },
    {
        "id": "expert-04-custom-strategy",
        "module_id": "expert",
        "tier": "expert",
        "order": 4,
        "title": "Writing a Custom Strategy Extension",
        "summary": "Author a complete strategy that integrates with the QuantGlass signal engine.",
        "concept": (
            "A strategy extension registers a `candidate_factory` — a function called by the signal engine "
            "that returns candidate setups in the same format as built-in families.\n\n"
            "**Required candidate fields:**\n"
            "`signal`, `setup_type`, `direction`, `reference_price`, `entry_zone[2]`, "
            "`stop_loss`, `take_profit[3]`, `confluence_score`\n\n"
            "**Strategy contract rules:**\n"
            "1. Use only **closed candles** — no partial-bar peeking\n"
            "2. Include realistic **fees and slippage** in backtests\n"
            "3. Report **IS and OOS separately** — do not blend windows\n"
            "4. The **take_profit ladder shown to users must match what the backtest simulates**\n\n"
            "This last rule is the one the production audit flagged as a common failure mode — "
            "QuantGlass enforces it by using `_TP_LADDER_WEIGHTS = (0.5, 0.3, 0.2)` in the "
            "backtest simulator and displaying the same three levels in the signal output."
        ),
        "key_terms": [
            {"term": "candidate_factory", "definition": "Function returning setup candidates from the signal engine context."},
            {"term": "TP Ladder Consistency", "definition": "The exits shown to users must exactly match the exits the backtest simulates."},
            {"term": "Closed Candle Rule", "definition": "Strategies may only use candles with status='closed' — no partial-bar data."},
        ],
        "exercise": {
            "type": "multiple_choice",
            "question": "Your strategy shows TP at 3R to users, but the backtest exits at 2R.  What is the problem?",
            "options": [
                "No problem — showing a more optimistic TP encourages users.",
                "The backtest expectancy is wrong — it understates real performance.",
                "The backtest simulates lower exits than displayed — it overstates survivability but understates reward.  The strategy contract is violated.",
                "No problem — TP is just a suggestion, not a hard rule.",
            ],
            "correct_index": 2,
            "explanation": (
                "When the backtest exits at 2R but the display promises 3R, the backtest is simulating "
                "a different trade than what the user executes.  This makes the backtest results unreliable "
                "as a predictor of user experience.  QuantGlass enforces consistency via `_TP_LADDER_WEIGHTS`."
            ),
        },
        "live_apply": {
            "screen": "settings",
            "cta": "Review extensions/community_momentum_pack.py for a complete working strategy extension example.",
        },
    },
    {
        "id": "expert-05-trading-plan",
        "module_id": "expert",
        "tier": "expert",
        "order": 5,
        "title": "Building a Complete Trading Plan",
        "summary": "Synthesize all concepts into a disciplined, rule-based trading plan.",
        "concept": (
            "A **trading plan** is a written set of rules that removes emotion from trade decisions.  "
            "It answers: *when to enter, how much to risk, when to exit, and how to review performance*.\n\n"
            "**QuantGlass-native trading plan template:**\n\n"
            "1. **Universe**: which corridor symbols and timeframes to trade\n"
            "2. **Signal gate**: minimum confidence, OOS_validated = True required?\n"
            "3. **Risk per trade**: e.g., 1% of paper account per signal\n"
            "4. **Entry rule**: enter only within the entry_zone, not outside it\n"
            "5. **Stop rule**: stop = signal's stop_loss, no manual override\n"
            "6. **Exit rule**: scale out at TP1 (50%), TP2 (30%), hold remainder to TP3\n"
            "7. **Daily review**: compare paper account equity vs benchmark (e.g., BTC or SPY)\n"
            "8. **Monthly calibration**: update min_confidence threshold based on realized hit rates\n\n"
            "The plan is only as good as your adherence.  QuantGlass provides the signals; "
            "discipline provides the edge."
        ),
        "key_terms": [
            {"term": "Trading Plan", "definition": "A written ruleset for entries, sizing, exits, and review — removes discretionary emotion."},
            {"term": "Signal Gate", "definition": "Minimum criteria a signal must meet before you act (e.g., confidence ≥ 65, OOS_validated)."},
            {"term": "Monthly Calibration", "definition": "Reviewing whether your min_confidence threshold matches your actual hit rate."},
        ],
        "exercise": {
            "type": "multiple_choice",
            "question": "Over 3 months you took 40 paper trades with confidence ≥ 65.  Your actual win rate was 48%.  The engine's backtested win rate for these setups was 56%.  What should you do?",
            "options": [
                "Nothing — 8% gap is normal variance over 40 trades.",
                "Raise min_confidence to ≥ 72 to filter for higher-quality setups, or investigate whether execution timing was off (entered outside entry_zone).",
                "Lower min_confidence to ≥ 55 — the lower threshold will improve win rate.",
                "Stop using QuantGlass — the model is broken.",
            ],
            "correct_index": 1,
            "explanation": (
                "A persistent gap between backtested win rate (56%) and realized win rate (48%) over 40 trades "
                "suggests either execution slippage (entering too late, outside the entry_zone) or that the "
                "current confidence threshold selects setups where the gap is widest.  "
                "Raising the threshold to ≥ 72 filters for higher-quality setups with stronger OOS evidence.  "
                "Also audit your fills — did you enter within the entry_zone every time?"
            ),
        },
        "live_apply": {
            "screen": "signals",
            "cta": "Draft your trading plan on paper.  For your next 10 paper trades, record: entry price, why you entered, result, and whether you followed your rules.",
        },
    },
]

# ---------------------------------------------------------------------------
# Module metadata (static)
# ---------------------------------------------------------------------------

_MODULE_META: dict[str, dict[str, str]] = {
    "novice": {
        "id": "novice",
        "tier": "novice",
        "title": "Candle to Signal",
        "description": (
            "Build the foundational vocabulary.  By the end you will read any candlestick, "
            "identify a trend, find support/resistance, and interpret your first QuantGlass signal."
        ),
    },
    "intermediate": {
        "id": "intermediate",
        "tier": "intermediate",
        "title": "Indicators & Risk",
        "description": (
            "Go deeper: moving averages, RSI momentum, ATR-based stop sizing, "
            "risk:reward arithmetic, and position sizing.  After this module you can "
            "calculate every number in a QuantGlass signal yourself."
        ),
    },
    "advanced": {
        "id": "advanced",
        "tier": "advanced",
        "title": "Engine Deep-Dive",
        "description": (
            "Understand how the signal engine thinks: market regimes, MACD, Bollinger Bands, "
            "honest backtesting, and the full confidence_basis derivation.  "
            "You will be able to explain *why* any signal was generated."
        ),
    },
    "expert": {
        "id": "expert",
        "tier": "expert",
        "title": "Build & Calibrate",
        "description": (
            "Walk-forward OOS validation, empirical Bayes calibration, writing custom "
            "indicator and strategy extensions, and synthesizing everything into a "
            "disciplined personal trading plan."
        ),
    },
}

_TIER_ORDER = ["novice", "intermediate", "advanced", "expert"]

# ---------------------------------------------------------------------------
# LearnService
# ---------------------------------------------------------------------------


class LearnService:
    def __init__(self, state_store: StateStore) -> None:
        self._store = state_store

    def get_catalog(self) -> dict[str, Any]:
        progress = self._store.get_learn_progress()
        completed_ids = {lid for lid, data in progress.items() if data.get("completed_at")}
        modules = []
        for tier in _TIER_ORDER:
            meta = _MODULE_META[tier]
            tier_lessons = sorted(
                [les for les in _LESSONS if les["module_id"] == tier],
                key=lambda les: les["order"],
            )
            module_completed = sum(1 for les in tier_lessons if les["id"] in completed_ids)
            modules.append(
                {
                    **meta,
                    "lessons": [self._lesson_stub(les, completed_ids) for les in tier_lessons],
                    "completed": module_completed,
                    "total": len(tier_lessons),
                }
            )
        total = len(_LESSONS)
        done = len(completed_ids & {les["id"] for les in _LESSONS})
        return {
            "modules": modules,
            "progress": {
                "total": total,
                "completed": done,
                "by_tier": {
                    tier: {
                        "total": sum(1 for les in _LESSONS if les["module_id"] == tier),
                        "completed": sum(
                            1 for les in _LESSONS
                            if les["module_id"] == tier and les["id"] in completed_ids
                        ),
                    }
                    for tier in _TIER_ORDER
                },
            },
        }

    def get_lesson(self, lesson_id: str) -> dict[str, Any] | None:
        lesson = next((les for les in _LESSONS if les["id"] == lesson_id), None)
        if lesson is None:
            return None
        progress = self._store.get_learn_progress()
        completed_ids = {lid for lid, data in progress.items() if data.get("completed_at")}
        return {**lesson, "completed": lesson_id in completed_ids}

    def check_answer(self, lesson_id: str, answer: str) -> dict[str, Any]:
        lesson = next((les for les in _LESSONS if les["id"] == lesson_id), None)
        if lesson is None:
            return {"correct": False, "explanation": "Lesson not found.", "score": 0}

        self._store.record_lesson_attempt(lesson_id)
        ex = lesson["exercise"]

        if ex["type"] == "multiple_choice":
            try:
                chosen_index = int(answer)
            except (ValueError, TypeError):
                chosen_index = -1
            correct = chosen_index == ex["correct_index"]

        elif ex["type"] == "numeric_input":
            try:
                given = float(answer.replace(",", "").strip())
                expected = float(ex["correct_answer"].replace(",", "").strip())
                tolerance = abs(expected) * (ex.get("tolerance_percent", 1.0) / 100)
                correct = abs(given - expected) <= tolerance
            except (ValueError, TypeError):
                correct = False

        else:
            correct = False

        if correct:
            self._store.mark_lesson_complete(lesson_id)

        return {
            "correct": correct,
            "explanation": ex["explanation"],
            "score": 10 if correct else 0,
        }

    def get_progress(self) -> dict[str, Any]:
        progress = self._store.get_learn_progress()
        completed_ids = {lid for lid, data in progress.items() if data.get("completed_at")}
        total = len(_LESSONS)
        done = len(completed_ids & {les["id"] for les in _LESSONS})
        return {
            "total": total,
            "completed": done,
            "by_tier": {
                tier: {
                    "total": sum(1 for les in _LESSONS if les["module_id"] == tier),
                    "completed": sum(
                        1 for les in _LESSONS
                        if les["module_id"] == tier and les["id"] in completed_ids
                    ),
                }
                for tier in _TIER_ORDER
            },
        }

    # ------------------------------------------------------------------

    @staticmethod
    def _lesson_stub(lesson: dict[str, Any], completed_ids: set[str]) -> dict[str, Any]:
        return {
            "id": lesson["id"],
            "order": lesson["order"],
            "title": lesson["title"],
            "summary": lesson["summary"],
            "tier": lesson["tier"],
            "completed": lesson["id"] in completed_ids,
        }
