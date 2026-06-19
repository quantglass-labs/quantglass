<!-- SPDX-FileCopyrightText: 2026 QuantGlass contributors -->
<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Alerts

QuantGlass can notify you when an alert condition fires, via **Telegram** or your
own **email (SMTP)** server. Both are **off until you configure them** — delivery
is implemented in
[`apps/backend/app/services/notifications.py`](../../apps/backend/app/services/notifications.py).

## Telegram

Sends to `https://api.telegram.org` using your bot.

1. Create a bot with [@BotFather](https://t.me/BotFather) and copy the **bot
   token**.
2. Get your **chat ID** (e.g. message your bot, then read `getUpdates`).
3. In **Settings → API keys**, set `telegram-bot-token` and `telegram-chat-id`.
4. Use **Settings → Alerts** to send a test notification and confirm delivery.

## Email (SMTP)

Uses your own mail server — QuantGlass never relays through a third party.
Configure these keys in **Settings → API keys**:

| Key             | Example                                    |
| --------------- | ------------------------------------------ |
| `smtp-host`     | `smtp.gmail.com`                           |
| `smtp-port`     | `587` (default)                            |
| `smtp-username` | your SMTP user (optional for some servers) |
| `smtp-from`     | the From address                           |

Then send a test from **Settings → Alerts**.

## How alerts fire

Alerts are evaluated by the engine; when a condition is met, the configured
channel delivers the message and the result is recorded in the alert history.
Nothing is sent until you both **create an alert** and **configure a channel**.
