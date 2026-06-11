# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Default credential metadata and shared constants for the state stores."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


def default_paper_account() -> dict[str, Any]:
    return {
        "balance": 100000.0,
        "buyingPower": 100000.0,
        "realizedPnl": 0.0,
        "openPositions": [],
    }


DEFAULT_API_KEYS: list[dict[str, Any]] = [
    {
        "id": "alpaca-market-data-key-id",
        "label": "Alpaca Key ID",
        "value": "",
        "note": "Used for keyed Alpaca market data access and live trading order submission.",
        "tradeEnabled": True,
        "secret": True,
    },
    {
        "id": "alpaca-market-data-secret-key",
        "label": "Alpaca Secret Key",
        "value": "",
        "note": "Pairs with the Alpaca key ID to enable keyed market data and live trading.",
        "tradeEnabled": True,
        "secret": True,
    },
    {
        "id": "finnhub-api-key",
        "label": "Finnhub API Key",
        "value": "",
        "note": "Enables keyed Finnhub quotes, candles, and news in the provider manager.",
        "tradeEnabled": False,
        "secret": True,
    },
    {
        "id": "polygon-api-key",
        "label": "Polygon API Key",
        "value": "",
        "note": "Enables keyed Polygon stock data in the provider manager.",
        "tradeEnabled": False,
        "secret": True,
    },
    {
        "id": "twelvedata-api-key",
        "label": "Twelve Data API Key",
        "value": "",
        "note": "Enables keyed Twelve Data stock candles in the provider manager.",
        "tradeEnabled": False,
        "secret": True,
    },
    {
        "id": "openai-api-key",
        "label": "OpenAI API Key",
        "value": "",
        "note": "Optional key for OpenAI-hosted narration models.",
        "tradeEnabled": False,
        "secret": True,
    },
    {
        "id": "openai-compatible-api-key",
        "label": "OpenAI-Compatible API Key",
        "value": "",
        "note": "Optional bearer token for OpenAI-compatible gateways such as LiteLLM, OpenRouter, vLLM, or private model routers.",
        "tradeEnabled": False,
        "secret": True,
    },
    {
        "id": "deepseek-api-key",
        "label": "DeepSeek API Key",
        "value": "",
        "note": "Optional bearer token for DeepSeek chat and reasoning models through its OpenAI-compatible API.",
        "tradeEnabled": False,
        "secret": True,
    },
    {
        "id": "mistral-api-key",
        "label": "Mistral API Key",
        "value": "",
        "note": "Optional bearer token for Mistral AI and Codestral model discovery through its API.",
        "tradeEnabled": False,
        "secret": True,
    },
    {
        "id": "groq-api-key",
        "label": "Groq API Key",
        "value": "",
        "note": "Optional bearer token for Groq's low-latency OpenAI-compatible model endpoint.",
        "tradeEnabled": False,
        "secret": True,
    },
    {
        "id": "openrouter-api-key",
        "label": "OpenRouter API Key",
        "value": "",
        "note": "Optional bearer token for OpenRouter model routing across multiple providers.",
        "tradeEnabled": False,
        "secret": True,
    },
    {
        "id": "together-api-key",
        "label": "Together AI API Key",
        "value": "",
        "note": "Optional bearer token for Together AI's OpenAI-compatible model endpoint.",
        "tradeEnabled": False,
        "secret": True,
    },
    {
        "id": "azure-openai-api-key",
        "label": "Azure OpenAI API Key",
        "value": "",
        "note": "Optional key for Azure OpenAI compatible deployment endpoints.",
        "tradeEnabled": False,
        "secret": True,
    },
    {
        "id": "aws-access-key-id",
        "label": "AWS Access Key ID",
        "value": "",
        "note": "Required with AWS Secret Access Key for Amazon Bedrock model discovery and invocation.",
        "tradeEnabled": False,
        "secret": True,
    },
    {
        "id": "aws-secret-access-key",
        "label": "AWS Secret Access Key",
        "value": "",
        "note": "Required secret credential for signed Amazon Bedrock requests.",
        "tradeEnabled": False,
        "secret": True,
    },
    {
        "id": "aws-session-token",
        "label": "AWS Session Token",
        "value": "",
        "note": "Optional temporary AWS session token for STS or SSO-backed Bedrock credentials.",
        "tradeEnabled": False,
        "secret": True,
    },
    {
        "id": "vertex-ai-access-token",
        "label": "Vertex AI OAuth Access Token",
        "value": "",
        "note": "Bearer token for Google Vertex AI REST model discovery and generateContent calls.",
        "tradeEnabled": False,
        "secret": True,
    },
    {
        "id": "anthropic-api-key",
        "label": "Anthropic API Key",
        "value": "",
        "note": "Optional key for native Claude model discovery and narration through the Anthropic Messages API.",
        "tradeEnabled": False,
        "secret": True,
    },
    {
        "id": "google-gemini-api-key",
        "label": "Google Gemini API Key",
        "value": "",
        "note": "Optional key for native Gemini model discovery and narration through the Gemini API.",
        "tradeEnabled": False,
        "secret": True,
    },
    {
        "id": "telegram-bot-token",
        "label": "Telegram Bot Token",
        "value": "",
        "note": "Required for Telegram alert delivery. Pair it with the Telegram Chat ID.",
        "tradeEnabled": False,
        "secret": True,
    },
    {
        "id": "telegram-chat-id",
        "label": "Telegram Chat ID",
        "value": "",
        "note": "Target Telegram chat for alert delivery. Works with the stored bot token.",
        "tradeEnabled": False,
        "secret": False,
    },
    {
        "id": "smtp-host",
        "label": "SMTP Host",
        "value": "",
        "note": "Mail server hostname for email alert delivery.",
        "tradeEnabled": False,
        "secret": False,
    },
    {
        "id": "smtp-port",
        "label": "SMTP Port",
        "value": "587",
        "note": "Mail server port. Port 465 uses implicit TLS; other ports attempt STARTTLS when available.",
        "tradeEnabled": False,
        "secret": False,
    },
    {
        "id": "smtp-username",
        "label": "SMTP Username",
        "value": "",
        "note": "Optional username for authenticated email delivery.",
        "tradeEnabled": False,
        "secret": False,
    },
    {
        "id": "smtp-password",
        "label": "SMTP Password",
        "value": "",
        "note": "Password for the SMTP username when authentication is required.",
        "tradeEnabled": False,
        "secret": True,
    },
    {
        "id": "smtp-from-email",
        "label": "SMTP From Address",
        "value": "",
        "note": "From address used for email alert delivery.",
        "tradeEnabled": False,
        "secret": False,
    },
    {
        "id": "smtp-to-email",
        "label": "SMTP Recipient Address",
        "value": "",
        "note": "Recipient address or comma-separated recipients for email alerts and test sends.",
        "tradeEnabled": False,
        "secret": False,
    },
]

CUSTOM_PROVIDER_AUTH_TYPES = {"none", "bearer", "api_key_header", "api_key_query"}
CUSTOM_PROVIDER_CAPABILITIES = {"ohlcv", "order_book", "news", "trading", "ai"}
