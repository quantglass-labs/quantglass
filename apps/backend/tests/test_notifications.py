# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from __future__ import annotations

from email.message import EmailMessage
from typing import Any

from app.services.notifications import AlertNotificationService


class _StateStore:
    def __init__(self, keys: dict[str, str] | None = None) -> None:
        self._keys = keys or {}

    def list_api_keys(self) -> list[dict[str, str]]:
        return [{"id": key, "value": value} for key, value in self._keys.items()]


class _UrlResponse:
    def __init__(self, body: bytes) -> None:
        self._body = body

    def __enter__(self) -> "_UrlResponse":
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def read(self) -> bytes:
        return self._body


class _SmtpClient:
    sent_messages: list[EmailMessage] = []
    login_calls: list[tuple[str, str]] = []

    def __init__(self, host: str, port: int, timeout: int) -> None:
        self.host = host
        self.port = port
        self.timeout = timeout

    def __enter__(self) -> "_SmtpClient":
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def ehlo(self) -> None:
        return None

    def has_extn(self, extension: str) -> bool:
        return extension == "starttls"

    def starttls(self) -> None:
        return None

    def login(self, username: str, password: str) -> None:
        self.login_calls.append((username, password))

    def send_message(self, message: EmailMessage) -> None:
        self.sent_messages.append(message)


def test_desktop_delivery_is_supported() -> None:
    service = AlertNotificationService(_StateStore())

    result = service.deliver_alert("desktop", "BTC alert")

    assert result.delivered is True
    assert result.detail is None


def test_telegram_delivery_requires_credentials() -> None:
    service = AlertNotificationService(_StateStore())

    result = service.deliver_alert("telegram", "BTC alert")

    assert result.delivered is False
    assert "Telegram Bot Token" in (result.detail or "")
    assert "Telegram Chat ID" in (result.detail or "")


def test_telegram_delivery_sends_bot_api_request(monkeypatch: Any) -> None:
    requests: list[Any] = []

    def fake_urlopen(request: Any, timeout: int) -> _UrlResponse:
        requests.append((request, timeout))
        return _UrlResponse(b'{"ok": true}')

    monkeypatch.setattr("app.services.notifications.urlopen", fake_urlopen)
    service = AlertNotificationService(
        _StateStore(
            {
                "telegram-bot-token": "bot-token",
                "telegram-chat-id": "chat-id",
            },
        ),
    )

    result = service.deliver_alert("telegram", "BTC alert")

    assert result.delivered is True
    assert result.detail == "Telegram message sent."
    request, timeout = requests[0]
    assert timeout == 10
    assert request.full_url == "https://api.telegram.org/botbot-token/sendMessage"
    assert request.data == b"chat_id=chat-id&text=BTC+alert"


def test_email_delivery_requires_required_fields() -> None:
    service = AlertNotificationService(_StateStore({"smtp-host": "smtp.example.com"}))

    result = service.deliver_alert("email", "BTC alert")

    assert result.delivered is False
    assert "SMTP From Address" in (result.detail or "")
    assert "SMTP Recipient Address" in (result.detail or "")


def test_email_delivery_sends_smtp_message(monkeypatch: Any) -> None:
    _SmtpClient.sent_messages = []
    _SmtpClient.login_calls = []
    monkeypatch.setattr("app.services.notifications.smtplib.SMTP", _SmtpClient)
    service = AlertNotificationService(
        _StateStore(
            {
                "smtp-host": "smtp.example.com",
                "smtp-port": "587",
                "smtp-username": "user",
                "smtp-password": "pass",
                "smtp-from-email": "alerts@example.com",
                "smtp-to-email": "desk@example.com, audit@example.com",
            },
        ),
    )

    result = service.deliver_alert("email", "BTC alert")

    assert result.delivered is True
    assert result.detail == "Email sent to desk@example.com, audit@example.com."
    assert _SmtpClient.login_calls == [("user", "pass")]
    assert len(_SmtpClient.sent_messages) == 1
    message = _SmtpClient.sent_messages[0]
    assert message["Subject"] == "QuantGlass Alert"
    assert message["From"] == "alerts@example.com"
    assert message["To"] == "desk@example.com, audit@example.com"
    assert message.get_content() == "BTC alert\n"
