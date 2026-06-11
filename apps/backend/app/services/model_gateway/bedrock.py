# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Amazon Bedrock invocation with SigV4 request signing."""

from __future__ import annotations

import hashlib
import hmac
import json
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import UTC, datetime
from typing import Any

from app.core.config import AiSettings
from app.services.model_gateway.models import (
    ModelResponse,
)


class BedrockProviderMixin:
    def _call_bedrock_invoke_model(self, settings: AiSettings, prompt: str) -> ModelResponse | None:
        credentials = self._bedrock_credentials(settings)
        if not credentials:
            self.last_error = (
                "Amazon Bedrock requires saved AWS Access Key ID and AWS Secret Access Key."
            )
            return None
        model_id = settings.model.strip()
        if not model_id:
            self.last_error = "Amazon Bedrock requires a model ID."
            return None
        payload = self._bedrock_payload(settings, prompt)
        url = f"https://{self._bedrock_runtime_host(settings)}/model/{urllib.parse.quote(model_id, safe='')}/invoke"
        body_bytes = json.dumps(payload).encode("utf-8")
        headers = self._aws_sigv4_headers(
            method="POST",
            url=url,
            body=body_bytes,
            region=self._bedrock_region(settings),
            service="bedrock",
            access_key=credentials["access_key"],
            secret_key=credentials["secret_key"],
            session_token=credentials.get("session_token"),
            extra_headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
        )
        body = self._post_json(
            url,
            payload,
            timeout=settings.request_timeout_seconds,
            headers=headers,
        )
        if not body:
            return None
        text = self._extract_bedrock_text(settings.model, body)
        if not text:
            return None
        return ModelResponse(text=text, source=f"bedrock:{settings.model}")

    def _bedrock_runtime_state(self, settings: AiSettings) -> dict[str, str]:
        if not self._bedrock_credentials(settings):
            return {
                "runtimeStatus": "unavailable",
                "runtimeDetail": "Amazon Bedrock requires AWS Access Key ID and AWS Secret Access Key in API Keys.",
            }
        region = self._bedrock_region(settings)
        model = settings.model.strip()
        return {
            "runtimeStatus": "available" if model else "unknown",
            "runtimeDetail": (
                f"Amazon Bedrock is configured for {region}; live test will invoke {model}."
                if model
                else f"Amazon Bedrock credentials are configured for {region}. Select a model before testing."
            ),
        }

    def _bedrock_credentials(self, settings: AiSettings) -> dict[str, str] | None:
        access_key_id = self._api_key_provider(settings.api_key_id or "aws-access-key-id").strip()
        secret_access_key = self._api_key_provider("aws-secret-access-key").strip()
        session_token = self._api_key_provider("aws-session-token").strip()
        if not access_key_id or not secret_access_key:
            return None
        credentials = {"access_key": access_key_id, "secret_key": secret_access_key}
        if session_token:
            credentials["session_token"] = session_token
        return credentials

    @staticmethod
    def _bedrock_region(settings: AiSettings) -> str:
        base = settings.base_url.strip()
        parsed = urllib.parse.urlparse(base if "://" in base else f"https://{base}")
        host = parsed.netloc or parsed.path
        match = re.search(r"bedrock(?:-runtime)?[.-]([a-z0-9-]+)\.amazonaws\.com", host)
        return match.group(1) if match else "us-east-1"

    def _bedrock_runtime_host(self, settings: AiSettings) -> str:
        base = settings.base_url.strip()
        parsed = urllib.parse.urlparse(base if "://" in base else f"https://{base}")
        host = parsed.netloc or parsed.path
        if "bedrock-runtime" in host:
            return host
        return f"bedrock-runtime.{self._bedrock_region(settings)}.amazonaws.com"

    def _bedrock_payload(self, settings: AiSettings, prompt: str) -> dict[str, object]:
        model_id = settings.model.lower()
        system = "You are a disciplined trading assistant. You only restate verified facts and never provide financial advice."
        if model_id.startswith("anthropic."):
            return {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": settings.max_tokens,
                "temperature": settings.temperature,
                "system": system,
                "messages": [{"role": "user", "content": [{"type": "text", "text": prompt}]}],
            }
        if model_id.startswith("amazon.nova"):
            return {
                "system": [{"text": system}],
                "messages": [{"role": "user", "content": [{"text": prompt}]}],
                "inferenceConfig": {
                    "maxTokens": settings.max_tokens,
                    "temperature": settings.temperature,
                },
            }
        return {
            "prompt": prompt,
            "temperature": settings.temperature,
            "max_tokens": settings.max_tokens,
        }

    @staticmethod
    def _extract_bedrock_text(model_id: str, body: dict[str, object]) -> str:
        content = body.get("content")
        if isinstance(content, list):
            text = "\n".join(
                item.get("text", "")
                for item in content
                if isinstance(item, dict) and isinstance(item.get("text"), str)
            ).strip()
            if text:
                return text
        output = body.get("output")
        message = output.get("message") if isinstance(output, dict) else None
        parts = message.get("content") if isinstance(message, dict) else None
        if isinstance(parts, list):
            text = "\n".join(
                item.get("text", "")
                for item in parts
                if isinstance(item, dict) and isinstance(item.get("text"), str)
            ).strip()
            if text:
                return text
        for key in ("generation", "completion", "outputText"):
            value = body.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return ""

    @staticmethod
    def _aws_sigv4_headers(
        *,
        method: str,
        url: str,
        body: bytes,
        region: str,
        service: str,
        access_key: str,
        secret_key: str,
        session_token: str | None = None,
        extra_headers: dict[str, str] | None = None,
    ) -> dict[str, str]:
        parsed = urllib.parse.urlparse(url)
        now = datetime.now(UTC)
        amz_date = now.strftime("%Y%m%dT%H%M%SZ")
        date_stamp = now.strftime("%Y%m%d")
        headers = {
            "Host": parsed.netloc,
            "X-Amz-Date": amz_date,
            "X-Amz-Content-Sha256": hashlib.sha256(body).hexdigest(),
            **(extra_headers or {}),
        }
        if session_token:
            headers["X-Amz-Security-Token"] = session_token
        canonical_headers = {
            key.lower(): " ".join(value.strip().split()) for key, value in headers.items()
        }
        signed_headers = ";".join(sorted(canonical_headers))
        canonical_header_text = "".join(
            f"{key}:{canonical_headers[key]}\n" for key in sorted(canonical_headers)
        )
        query_pairs = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
        canonical_query = "&".join(
            f"{urllib.parse.quote(key, safe='-_.~')}={urllib.parse.quote(value, safe='-_.~')}"
            for key, value in sorted(query_pairs)
        )
        canonical_uri = urllib.parse.quote(parsed.path or "/", safe="/-_.~")
        canonical_request = "\n".join(
            [
                method.upper(),
                canonical_uri,
                canonical_query,
                canonical_header_text,
                signed_headers,
                hashlib.sha256(body).hexdigest(),
            ]
        )
        scope = f"{date_stamp}/{region}/{service}/aws4_request"
        string_to_sign = "\n".join(
            [
                "AWS4-HMAC-SHA256",
                amz_date,
                scope,
                hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
            ]
        )

        def sign(key: bytes, message: str) -> bytes:
            return hmac.new(key, message.encode("utf-8"), hashlib.sha256).digest()

        signing_key = sign(
            sign(sign(sign(f"AWS4{secret_key}".encode(), date_stamp), region), service),
            "aws4_request",
        )
        signature = hmac.new(
            signing_key, string_to_sign.encode("utf-8"), hashlib.sha256
        ).hexdigest()
        headers["Authorization"] = (
            f"AWS4-HMAC-SHA256 Credential={access_key}/{scope}, "
            f"SignedHeaders={signed_headers}, Signature={signature}"
        )
        return headers

    def _list_bedrock_model_items(self, settings: AiSettings) -> list[dict[str, Any]]:
        credentials = self._bedrock_credentials(settings)
        if not credentials:
            return []
        region = self._bedrock_region(settings)
        url = f"https://bedrock.{region}.amazonaws.com/foundation-models"
        headers = self._aws_sigv4_headers(
            method="GET",
            url=url,
            body=b"",
            region=region,
            service="bedrock",
            access_key=credentials["access_key"],
            secret_key=credentials["secret_key"],
            session_token=credentials.get("session_token"),
        )
        body = self._get_json(url, timeout=settings.request_timeout_seconds, headers=headers)
        summaries = body.get("modelSummaries") if body else None
        if not isinstance(summaries, list):
            return []
        items: list[dict[str, Any]] = []
        for item in summaries:
            if not isinstance(item, dict) or not isinstance(item.get("modelId"), str):
                continue
            output_modalities = item.get("outputModalities")
            if (
                isinstance(output_modalities, list)
                and output_modalities
                and "TEXT" not in output_modalities
            ):
                continue
            model_id = item["modelId"]
            provider = (
                item.get("providerName")
                if isinstance(item.get("providerName"), str)
                else "Amazon Bedrock"
            )
            model_name = (
                item.get("modelName") if isinstance(item.get("modelName"), str) else model_id
            )
            items.append(
                {
                    "id": model_id,
                    "label": model_name,
                    "description": provider,
                    "runtimeStatus": "available",
                    "runtimeDetail": f"Amazon Bedrock reports {model_id} as available in {region}.",
                    "inputModalities": item.get("inputModalities")
                    if isinstance(item.get("inputModalities"), list)
                    else [],
                    "outputModalities": output_modalities
                    if isinstance(output_modalities, list)
                    else [],
                    "responseStreamingSupported": item.get("responseStreamingSupported")
                    if isinstance(item.get("responseStreamingSupported"), bool)
                    else None,
                }
            )
        return self._rank_model_items(items, settings.provider)
