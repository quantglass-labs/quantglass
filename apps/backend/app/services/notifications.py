# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from __future__ import annotations

import json
import smtplib
from dataclasses import dataclass
from datetime import datetime, timezone
from email.message import EmailMessage
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.storage.state_store import StateStore


@dataclass(frozen=True)
class AlertDeliveryResult:
    delivered: bool
    detail: str | None = None


class AlertNotificationService:
    def __init__(self, state_store: StateStore) -> None:
        self._state_store = state_store

    def deliver_alert(self, channel: str, message: str) -> AlertDeliveryResult:
        return self._deliver(channel, message, subject_prefix="Alert")

    def send_test_notification(self, channel: str) -> AlertDeliveryResult:
        timestamp = datetime.now(timezone.utc).isoformat()
        return self._deliver(
            channel,
            f"QuantGlass {channel} delivery test at {timestamp}.",
            subject_prefix="Test",
        )

    def _deliver(
        self,
        channel: str,
        message: str,
        subject_prefix: str,
    ) -> AlertDeliveryResult:
        if channel == "desktop":
            return AlertDeliveryResult(delivered=True)
        if channel == "telegram":
            return self._deliver_telegram(message)
        if channel == "email":
            return self._deliver_email(message, subject_prefix)
        return AlertDeliveryResult(
            delivered=False,
            detail=f"Unsupported alert channel '{channel}'.",
        )

    def _deliver_telegram(self, message: str) -> AlertDeliveryResult:
        configured_keys = {
            item.get("id"): item.get("value", "").strip()
            for item in self._state_store.list_api_keys()
            if isinstance(item, dict) and isinstance(item.get("id"), str)
        }
        bot_token = configured_keys.get("telegram-bot-token", "")
        chat_id = configured_keys.get("telegram-chat-id", "")

        missing_fields: list[str] = []
        if not bot_token:
            missing_fields.append("Telegram Bot Token")
        if not chat_id:
            missing_fields.append("Telegram Chat ID")
        if missing_fields:
            return AlertDeliveryResult(
                delivered=False,
                detail=f"Telegram delivery requires {' and '.join(missing_fields)}.",
            )

        request = Request(
            url=f"https://api.telegram.org/bot{bot_token}/sendMessage",
            data=urlencode({"chat_id": chat_id, "text": message}).encode("utf-8"),
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )

        try:
            with urlopen(request, timeout=10) as response:
                response_body = response.read().decode("utf-8")
        except HTTPError as exc:
            response_body = exc.read().decode("utf-8", errors="replace")
            error_detail = self._telegram_error_detail(response_body) or exc.reason
            return AlertDeliveryResult(
                delivered=False,
                detail=f"Telegram API rejected the message: {error_detail}.",
            )
        except URLError as exc:
            return AlertDeliveryResult(
                delivered=False,
                detail=f"Telegram request failed: {exc.reason}.",
            )

        response_json = self._parse_json(response_body)
        if not isinstance(response_json, dict):
            return AlertDeliveryResult(
                delivered=False,
                detail="Telegram returned an unreadable response.",
            )
        if response_json.get("ok") is not True:
            error_detail = response_json.get("description") or "Unknown Telegram API error"
            return AlertDeliveryResult(
                delivered=False,
                detail=f"Telegram API rejected the message: {error_detail}.",
            )
        return AlertDeliveryResult(delivered=True, detail="Telegram message sent.")

    def _deliver_email(
        self,
        message: str,
        subject_prefix: str,
    ) -> AlertDeliveryResult:
        configured_keys = self._configured_keys()
        smtp_host = configured_keys.get("smtp-host", "")
        smtp_port_raw = configured_keys.get("smtp-port", "") or "587"
        smtp_username = configured_keys.get("smtp-username", "")
        smtp_password = configured_keys.get("smtp-password", "")
        smtp_from = configured_keys.get("smtp-from-email", "")
        smtp_to_raw = configured_keys.get("smtp-to-email", "")

        missing_fields: list[str] = []
        if not smtp_host:
            missing_fields.append("SMTP Host")
        if not smtp_from:
            missing_fields.append("SMTP From Address")
        if not smtp_to_raw:
            missing_fields.append("SMTP Recipient Address")
        if smtp_username and not smtp_password:
            missing_fields.append("SMTP Password")
        if smtp_password and not smtp_username:
            missing_fields.append("SMTP Username")
        if missing_fields:
            return AlertDeliveryResult(
                delivered=False,
                detail=f"Email delivery requires {' and '.join(missing_fields)}.",
            )

        try:
            smtp_port = int(smtp_port_raw)
        except ValueError:
            return AlertDeliveryResult(
                delivered=False,
                detail="SMTP Port must be a valid integer.",
            )

        recipients = [item.strip() for item in smtp_to_raw.split(",") if item.strip()]
        if not recipients:
            return AlertDeliveryResult(
                delivered=False,
                detail="Email delivery requires at least one SMTP Recipient Address.",
            )

        email_message = EmailMessage()
        email_message["Subject"] = f"QuantGlass {subject_prefix}"
        email_message["From"] = smtp_from
        email_message["To"] = ", ".join(recipients)
        email_message.set_content(message)

        try:
            if smtp_port == 465:
                with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=10) as client:
                    self._send_email(client, email_message, smtp_username, smtp_password)
            else:
                with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as client:
                    self._send_email(client, email_message, smtp_username, smtp_password)
        except (smtplib.SMTPException, OSError) as exc:
            return AlertDeliveryResult(
                delivered=False,
                detail=f"Email delivery failed: {exc}.",
            )

        return AlertDeliveryResult(
            delivered=True,
            detail=f"Email sent to {', '.join(recipients)}.",
        )

    def _send_email(
        self,
        client: smtplib.SMTP,
        email_message: EmailMessage,
        username: str,
        password: str,
    ) -> None:
        client.ehlo()
        if not isinstance(client, smtplib.SMTP_SSL) and client.has_extn("starttls"):
            client.starttls()
            client.ehlo()
        if username and password:
            client.login(username, password)
        client.send_message(email_message)

    def _configured_keys(self) -> dict[str, str]:
        return {
            item.get("id"): item.get("value", "").strip()
            for item in self._state_store.list_api_keys()
            if isinstance(item, dict) and isinstance(item.get("id"), str)
        }

    def _telegram_error_detail(self, response_body: str) -> str | None:
        response_json = self._parse_json(response_body)
        if isinstance(response_json, dict):
            description = response_json.get("description")
            if isinstance(description, str) and description:
                return description
        return None

    def _parse_json(self, response_body: str) -> object:
        try:
            return json.loads(response_body)
        except json.JSONDecodeError:
            return None