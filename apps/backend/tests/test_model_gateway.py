# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from app.core.config import AiSettings
from app.services.model_gateway import ModelGateway


def test_anthropic_model_discovery_uses_models_endpoint() -> None:
    gateway = ModelGateway(api_key_provider=lambda _key_id: "anthropic-secret")
    calls: list[tuple[str, dict[str, str] | None]] = []

    def fake_get_json(url: str, timeout: float, headers: dict[str, str] | None = None):
        calls.append((url, headers))
        return {
            "data": [
                {"id": "claude-sonnet-4-20250514"},
                {"id": "claude-3-5-haiku-latest"},
            ]
        }

    gateway._get_json = fake_get_json  # type: ignore[method-assign]
    models, fetched, detail = gateway.list_models(
        AiSettings(
            provider="anthropic",
            base_url="https://api.anthropic.com/v1",
            api_key_id="anthropic-api-key",
        )
    )

    assert fetched is True
    assert detail == "Models fetched live from the configured provider endpoint."
    assert models == ["claude-sonnet-4-20250514", "claude-3-5-haiku-latest"]
    assert calls[0][0] == "https://api.anthropic.com/v1/models?limit=1000"
    assert calls[0][1] == {
        "x-api-key": "anthropic-secret",
        "anthropic-version": "2023-06-01",
    }


def test_gemini_model_discovery_filters_generate_content_models() -> None:
    gateway = ModelGateway(api_key_provider=lambda _key_id: "gemini-secret")
    calls: list[str] = []

    def fake_get_json(url: str, timeout: float, headers: dict[str, str] | None = None):
        calls.append(url)
        return {
            "models": [
                {
                    "name": "models/gemini-3.5-flash",
                    "supportedGenerationMethods": ["generateContent"],
                },
                {
                    "name": "models/text-embedding-model",
                    "supportedGenerationMethods": ["embedContent"],
                },
            ]
        }

    gateway._get_json = fake_get_json  # type: ignore[method-assign]
    models, fetched, _detail = gateway.list_models(
        AiSettings(
            provider="google_gemini",
            base_url="https://generativelanguage.googleapis.com/v1beta",
            api_key_id="google-gemini-api-key",
        )
    )

    assert fetched is True
    assert models == ["gemini-3.5-flash"]
    assert calls[0] == "https://generativelanguage.googleapis.com/v1beta/models?key=gemini-secret&pageSize=1000"


def test_anthropic_missing_key_returns_clear_detail() -> None:
    gateway = ModelGateway(api_key_provider=lambda _key_id: "")

    models, fetched, detail = gateway.list_models(
        AiSettings(
            provider="anthropic",
            base_url="https://api.anthropic.com/v1",
            api_key_id="anthropic-api-key",
        )
    )

    assert fetched is False
    assert models
    assert detail == "Anthropic model discovery requires a saved Anthropic API key."


def test_openai_discovery_filters_non_text_models_and_orders_newer_families() -> None:
    gateway = ModelGateway(api_key_provider=lambda _key_id: "openai-secret")

    def fake_get_json(url: str, timeout: float, headers: dict[str, str] | None = None):
        return {
            "data": [
                {"id": "text-embedding-3-large", "created": 1, "owned_by": "openai"},
                {"id": "gpt-4.1-mini", "created": 2, "owned_by": "openai"},
                {"id": "gpt-5.2", "created": 3, "owned_by": "openai"},
                {"id": "gpt-realtime", "created": 4, "owned_by": "openai"},
                {"id": "gpt-5.5", "created": 5, "owned_by": "openai"},
            ]
        }

    gateway._get_json = fake_get_json  # type: ignore[method-assign]
    catalog = gateway.list_model_catalog(
        AiSettings(
            provider="openai",
            base_url="https://api.openai.com/v1",
            api_key_id="openai-api-key",
        )
    )

    assert catalog.fetched is True
    assert catalog.source == "openai:/models"
    assert catalog.models == ["gpt-5.5", "gpt-5.2", "gpt-4.1-mini"]
    assert catalog.items[0]["ownedBy"] == "openai"


def test_ollama_generation_uses_max_tokens_as_num_predict() -> None:
    gateway = ModelGateway()
    calls: list[dict[str, object]] = []

    def fake_post_json(
        url: str,
        payload: dict[str, object],
        timeout: float,
        headers: dict[str, str] | None = None,
    ):
        calls.append(payload)
        return {"response": "QuantGlass AI provider test succeeded."}

    gateway._post_json = fake_post_json  # type: ignore[method-assign]
    response = gateway.complete(
        AiSettings(
            provider="ollama",
            base_url="http://127.0.0.1:11434",
            model="qwen3.6:35b",
            max_tokens=24,
        ),
        "test",
    )

    assert response is not None
    assert calls[0]["options"] == {"temperature": 0.2, "num_predict": 24}


def test_ollama_catalog_includes_model_size_metadata() -> None:
    gateway = ModelGateway()

    def fake_get_json(url: str, timeout: float, headers: dict[str, str] | None = None):
        return {
            "models": [
                {
                    "name": "qwen3.6:35b",
                    "modified_at": "2026-04-30T06:02:21Z",
                    "details": {
                        "parameter_size": "36.0B",
                        "quantization_level": "Q4_K_M",
                    },
                }
            ]
        }

    gateway._get_json = fake_get_json  # type: ignore[method-assign]
    catalog = gateway.list_model_catalog(
        AiSettings(provider="ollama", base_url="http://127.0.0.1:11434")
    )

    assert catalog.fetched is True
    assert catalog.items[0]["description"] == "Local Ollama model · 36.0B · Q4_K_M"


def test_ollama_diagnostic_reports_loaded_busy_model_context() -> None:
    gateway = ModelGateway()

    def fake_get_json(url: str, timeout: float, headers: dict[str, str] | None = None):
        return {
            "models": [
                {
                    "name": "qwen3.6:35b",
                    "size_vram": 26_123_783_616,
                    "context_length": 4096,
                    "details": {
                        "parameter_size": "36.0B",
                        "quantization_level": "Q4_K_M",
                    },
                }
            ]
        }

    gateway._get_json = fake_get_json  # type: ignore[method-assign]
    detail = gateway.provider_diagnostic_detail(
        AiSettings(provider="ollama", base_url="http://127.0.0.1:11434", model="qwen3.6:35b")
    )

    assert detail is not None
    assert "qwen3.6:35b loaded" in detail
    assert "36.0B" in detail
    assert "context 4096" in detail


def test_ollama_runtime_state_reports_installed_not_loaded() -> None:
    gateway = ModelGateway()

    def fake_get_json(url: str, timeout: float, headers: dict[str, str] | None = None):
        if url.endswith("/api/ps"):
            return {"models": []}
        return {"models": [{"name": "qwen3.6:35b"}]}

    gateway._get_json = fake_get_json  # type: ignore[method-assign]
    state = gateway.provider_runtime_state(
        AiSettings(provider="ollama", base_url="http://127.0.0.1:11434", model="qwen3.6:35b")
    )

    assert state["runtimeStatus"] == "not_loaded"
    assert "installed but not loaded" in state["runtimeDetail"]


def test_ollama_runtime_state_reports_not_installed() -> None:
    gateway = ModelGateway()

    def fake_get_json(url: str, timeout: float, headers: dict[str, str] | None = None):
        if url.endswith("/api/ps"):
            return {"models": []}
        return {"models": [{"name": "qwen3.5:0.8b"}]}

    gateway._get_json = fake_get_json  # type: ignore[method-assign]
    state = gateway.provider_runtime_state(
        AiSettings(provider="ollama", base_url="http://127.0.0.1:11434", model="qwen3.6:35b")
    )

    assert state["runtimeStatus"] == "not_installed"
    assert "not installed" in state["runtimeDetail"]


def test_vllm_model_discovery_uses_explicit_provider_id() -> None:
    gateway = ModelGateway()
    calls: list[str] = []

    def fake_get_json(url: str, timeout: float, headers: dict[str, str] | None = None):
        calls.append(url)
        return {"data": [{"id": "meta-llama/Llama-3.1-8B-Instruct"}]}

    gateway._get_json = fake_get_json  # type: ignore[method-assign]
    catalog = gateway.list_model_catalog(
        AiSettings(provider="vllm", base_url="http://127.0.0.1:8000/v1")
    )

    assert catalog.fetched is True
    assert catalog.source == "vllm:/models"
    assert catalog.models == ["meta-llama/Llama-3.1-8B-Instruct"]
    assert catalog.items[0]["runtimeStatus"] == "loaded"
    assert calls[0] == "http://127.0.0.1:8000/v1/models"


def test_deepseek_requires_own_api_key_and_uses_bearer_models() -> None:
    gateway = ModelGateway(api_key_provider=lambda key_id: "deepseek-secret" if key_id == "deepseek-api-key" else "")
    calls: list[tuple[str, dict[str, str] | None]] = []

    def fake_get_json(url: str, timeout: float, headers: dict[str, str] | None = None):
        calls.append((url, headers))
        return {"data": [{"id": "deepseek-chat"}]}

    gateway._get_json = fake_get_json  # type: ignore[method-assign]
    catalog = gateway.list_model_catalog(
        AiSettings(provider="deepseek", base_url="https://api.deepseek.com/v1", api_key_id="deepseek-api-key")
    )

    assert catalog.fetched is True
    assert catalog.source == "deepseek:/models"
    assert catalog.models == ["deepseek-chat"]
    assert calls[0] == ("https://api.deepseek.com/v1/models", {"Authorization": "Bearer deepseek-secret"})


def test_bedrock_model_discovery_uses_signed_foundation_models_endpoint() -> None:
    keys = {
        "aws-access-key-id": "aws-access",
        "aws-secret-access-key": "aws-secret",
        "aws-session-token": "aws-session",
    }
    gateway = ModelGateway(api_key_provider=lambda key_id: keys.get(key_id, ""))
    calls: list[tuple[str, dict[str, str] | None]] = []

    def fake_sigv4_headers(**kwargs):
        assert kwargs["region"] == "us-west-2"
        assert kwargs["service"] == "bedrock"
        assert kwargs["access_key"] == "aws-access"
        assert kwargs["secret_key"] == "aws-secret"
        assert kwargs["session_token"] == "aws-session"
        return {"Authorization": "signed"}

    def fake_get_json(url: str, timeout: float, headers: dict[str, str] | None = None):
        calls.append((url, headers))
        return {
            "modelSummaries": [
                {
                    "modelId": "anthropic.claude-3-5-sonnet-20240620-v1:0",
                    "modelName": "Claude 3.5 Sonnet",
                    "providerName": "Anthropic",
                    "inputModalities": ["TEXT"],
                    "outputModalities": ["TEXT"],
                    "responseStreamingSupported": True,
                }
            ]
        }

    gateway._aws_sigv4_headers = fake_sigv4_headers  # type: ignore[method-assign]
    gateway._get_json = fake_get_json  # type: ignore[method-assign]
    catalog = gateway.list_model_catalog(
        AiSettings(provider="bedrock", base_url="bedrock-runtime.us-west-2.amazonaws.com", api_key_id="aws-access-key-id")
    )

    assert catalog.fetched is True
    assert catalog.source == "bedrock:foundation-models"
    assert catalog.models == ["anthropic.claude-3-5-sonnet-20240620-v1:0"]
    assert catalog.items[0]["runtimeStatus"] == "available"
    assert calls[0] == ("https://bedrock.us-west-2.amazonaws.com/foundation-models", {"Authorization": "signed"})


def test_bedrock_invoke_model_uses_signed_runtime_request() -> None:
    keys = {
        "aws-access-key-id": "aws-access",
        "aws-secret-access-key": "aws-secret",
    }
    gateway = ModelGateway(api_key_provider=lambda key_id: keys.get(key_id, ""))
    calls: list[tuple[str, dict[str, object], dict[str, str] | None]] = []

    def fake_sigv4_headers(**kwargs):
        assert kwargs["method"] == "POST"
        assert kwargs["url"] == "https://bedrock-runtime.us-east-1.amazonaws.com/model/anthropic.claude-3-5-sonnet-20240620-v1%3A0/invoke"
        return {"Authorization": "signed", "X-Amz-Date": "20260602T000000Z"}

    def fake_post_json(
        url: str,
        payload: dict[str, object],
        timeout: float,
        headers: dict[str, str] | None = None,
    ):
        calls.append((url, payload, headers))
        return {"content": [{"type": "text", "text": "QuantGlass AI provider test succeeded."}]}

    gateway._aws_sigv4_headers = fake_sigv4_headers  # type: ignore[method-assign]
    gateway._post_json = fake_post_json  # type: ignore[method-assign]
    response = gateway.complete(
        AiSettings(
            provider="bedrock",
            base_url="bedrock-runtime.us-east-1.amazonaws.com",
            api_key_id="aws-access-key-id",
            model="anthropic.claude-3-5-sonnet-20240620-v1:0",
        ),
        "test",
    )

    assert response is not None
    assert response.source == "bedrock:anthropic.claude-3-5-sonnet-20240620-v1:0"
    assert calls[0][1]["anthropic_version"] == "bedrock-2023-05-31"
    assert calls[0][2] == {"Authorization": "signed", "X-Amz-Date": "20260602T000000Z"}


def test_vertex_model_discovery_uses_project_location_endpoint() -> None:
    gateway = ModelGateway(api_key_provider=lambda key_id: "vertex-token" if key_id == "vertex-ai-access-token" else "")
    calls: list[tuple[str, dict[str, str] | None]] = []

    def fake_get_json(url: str, timeout: float, headers: dict[str, str] | None = None):
        calls.append((url, headers))
        return {
            "publisherModels": [
                {
                    "name": "publishers/google/models/gemini-2.5-flash",
                    "displayName": "Gemini 2.5 Flash",
                    "supportedActions": ["generateContent"],
                }
            ]
        }

    gateway._get_json = fake_get_json  # type: ignore[method-assign]
    catalog = gateway.list_model_catalog(
        AiSettings(
            provider="vertex",
            base_url="https://us-central1-aiplatform.googleapis.com/v1/projects/qg/locations/us-central1",
            api_key_id="vertex-ai-access-token",
        )
    )

    assert catalog.fetched is True
    assert catalog.source == "vertex:publisher-models"
    assert catalog.models == ["gemini-2.5-flash"]
    assert calls[0] == (
        "https://us-central1-aiplatform.googleapis.com/v1/projects/qg/locations/us-central1/publishers/google/models",
        {"Authorization": "Bearer vertex-token"},
    )


def test_azure_openai_uses_deployment_chat_completions_url() -> None:
    gateway = ModelGateway(api_key_provider=lambda _key_id: "azure-secret")
    calls: list[tuple[str, dict[str, object], dict[str, str] | None]] = []

    def fake_post_json(
        url: str,
        payload: dict[str, object],
        timeout: float,
        headers: dict[str, str] | None = None,
    ):
        calls.append((url, payload, headers))
        return {"choices": [{"message": {"content": "QuantGlass AI provider test succeeded."}}]}

    gateway._post_json = fake_post_json  # type: ignore[method-assign]
    response = gateway.complete(
        AiSettings(
            provider="azure_openai",
            base_url="https://example.openai.azure.com/openai/deployments/qg-gpt?api-version=2024-10-21",
            api_key_id="azure-openai-api-key",
            model="qg-gpt",
        ),
        "test",
    )

    assert response is not None
    assert response.source == "azure_openai:qg-gpt"
    assert calls[0][0] == "https://example.openai.azure.com/openai/deployments/qg-gpt/chat/completions?api-version=2024-10-21"
    assert calls[0][2] == {"api-key": "azure-secret"}
