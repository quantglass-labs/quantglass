# AI Model Gateways

QuantGlass narration is vendor-neutral. Contributors can use local models,
hosted APIs, or OpenAI-compatible gateways as long as model output remains behind
the fact guard.

## Supported gateway modes

| Mode | Default base URL | Notes |
|------|------------------|-------|
| `template` | none | Deterministic narration only. |
| `ollama` | `http://127.0.0.1:11434` | Uses Ollama's native `/api/generate` endpoint. |
| `lm_studio` | `http://127.0.0.1:1234/v1` | Uses OpenAI-compatible `chat/completions`. |
| `openai` | `https://api.openai.com/v1` | Uses the saved OpenAI API key. |
| `openai_compatible` | custom | Works with compatible local or hosted gateways. |

Ollama also exposes an OpenAI-compatible API at `/v1`, and LM Studio exposes
OpenAI-compatible endpoints from its local server. Continue documents the same
general pattern for self-hosted models: use an OpenAI provider and point the base
URL at the compatible server. Roo-style coding agents follow the same principle:
they are model-provider agnostic, so QuantGlass should keep model configuration
portable rather than hard-code one vendor.

Reference docs:

- Ollama OpenAI compatibility: <https://docs.ollama.com/openai>
- LM Studio local server: <https://lmstudio.ai/docs/developer/core/server>
- LM Studio API overview: <https://lmstudio.ai/docs/developer/rest>
- Continue OpenAI-compatible providers: <https://docs.continue.dev/customize/model-providers/top-level/openai>

## Safety boundary

Model narration is never the trading engine. It only rewrites facts produced by
the deterministic signal pipeline. If a model call times out, fails, or states a
number that is not present in the signal facts, QuantGlass returns the template
narration instead.

## Adding a new model gateway

Most providers do not need custom code. Configure `provider=openai_compatible`,
set `baseUrl` to the gateway's `/v1` URL, set `model`, and choose an optional
stored API key.

Add custom code only when a provider is not OpenAI-compatible or needs special
request/response handling. Keep the custom code behind `ModelGateway` and cover:

- timeout behavior
- empty responses
- malformed responses
- auth/no-auth paths
- fact-guard fallback
