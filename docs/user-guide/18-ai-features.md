# 18. AI features

[← Portfolio](17-portfolio.md) · [Contents](README.md)

---

AI is on every screen of QuantGlass, and all of it runs on one promise — the
**narration covenant**:

1. **Facts come from the engine.** The model never computes a number; it only
   describes data the deterministic engine already produced.
2. **Every answer is fact‑guarded.** If the model states a number that isn't in
   the engine's facts, the answer is discarded and a deterministic template
   speaks instead.
3. **The source is always labelled.** Every AI panel shows a chip: the model id
   when the model spoke, `template` / `template-fallback` / `template-guarded`
   when the deterministic path did.
4. **Nothing AI can act.** No AI surface can place orders, change settings, or
   touch secrets.

Everything works without a model configured — answers are deterministic and say
so. Configure a local or hosted model in [Settings → AI](10-settings.md#ai) to
get narrated versions.

<p align="center">
  <img src="../assets/screenshots/copilot.png" alt="QuantGlass Copilot answering from the paper account" width="900">
</p>

## The tour

| Where                                          | What you get                                                                                                                                                                                                                                                         |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Every screen**                               | The **Copilot** — the sparkle button bottom‑right. Ask about your own signals, account, watchlist, backtests, closed trades, or trade review. It picks from six read‑only engine tools, runs them, and answers only from their results, listing which tools it used. |
| **Dashboard**                                  | The **daily brief** at the top: regimes, strongest signals, and risk warnings for the day, narrated.                                                                                                                                                                 |
| **Signals**                                    | Signal feed explanations are instant templates; **Explain with AI** narrates any signal on demand.                                                                                                                                                                   |
| **Alerts**                                     | Type a condition in plain English ("alert me when BTC crosses 100k") — the model proposes, a deterministic parser validates, and you see the exact parsed condition before saving.                                                                                   |
| **Watchlist / Missions / Journal / Portfolio** | An **AI read** panel that reflects that screen's own data — e.g. your most repeated mistake tags in the Journal.                                                                                                                                                     |
| **Learn**                                      | The **lesson tutor**: ask questions answered from the lesson's own content.                                                                                                                                                                                          |
| **Missions → drills**                          | After a decision drill, the **instructor debrief** reviews your choices, scores, and any severe violation.                                                                                                                                                           |
| **Journal**                                    | An **AI postmortem** per resolved trade — it grades the decision, not the outcome.                                                                                                                                                                                   |
| **Review**                                     | The **weekly coach narrative** over your process metrics and repeated‑mistake detections.                                                                                                                                                                            |
| **Backtesting**                                | The **AI review** of a run reads its metrics, stress table, and bias gates.                                                                                                                                                                                          |

## Reading the panels

Every AI panel has exactly three states — it is never silently missing:

- a **loading** spinner ("AI is reading your data… large local models can take
  up to a minute"),
- the **narration** with its source chip,
- or an explicit **unavailable** card telling you the screen works fine without
  it and pointing to Settings → AI.

Large local models (20B+) often exceed the default 8‑second narration timeout;
on‑demand surfaces (Copilot, tutor, postmortems) wait much longer, but the feed
never does — it always ships template explanations instantly.

## For AI agents outside the app

The same six read‑only tools the Copilot uses are exposed as a local **MCP
server**, so Claude Desktop / Claude Code or any MCP client can use your
QuantGlass engine as a grounded market‑facts source. Strictly read‑only — no
orders, no settings, no secrets. See the
[API reference](../technical/06-api-reference.md#mcp-server).

> All of it is educational decision support. None of it is financial advice,
> and none of it predicts.

---

[← Portfolio](17-portfolio.md) · [Contents](README.md)
