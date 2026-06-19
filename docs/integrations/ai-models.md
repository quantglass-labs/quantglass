<!-- SPDX-FileCopyrightText: 2026 QuantGlass contributors -->
<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# AI models (bring your own)

QuantGlass runs AI **locally by default** and can optionally use a cloud
provider you choose. Whatever the provider, every AI answer passes a **numeric
fact-guard** — the model narrates only values produced by the engine's read-only
tools, so it cannot invent a number.

## Default: local Ollama (no key, fully offline)

Out of the box the AI provider is **Ollama**, pointed at a local endpoint, with
cloud disabled — see [`apps/backend/app/core/config.py`](../../apps/backend/app/core/config.py):

```python
provider: AiProvider = "ollama"
base_url: str = "http://127.0.0.1:11434"
cloud_enabled: bool = False
```

1. Install [Ollama](https://ollama.com) and pull a model (e.g. `ollama pull qwen3:14b`).
2. In **Settings → AI**, confirm the provider is **Ollama** and the base URL
   points at your local Ollama (`http://127.0.0.1:11434`).
3. Pick the model and save. The coach now runs entirely on your machine.

If no model is configured, on-demand AI features fall back to a deterministic
template — the app never blocks on a model.

## Optional: a cloud provider

Enable **cloud AI** in Settings and add a key to use any of the supported
providers (gateways live in
[`apps/backend/app/services/model_gateway/`](../../apps/backend/app/services/model_gateway/)):

`ollama` · `lm_studio` · `vllm` · `llama_cpp` · `openai` · `anthropic` ·
`google_gemini` · `deepseek` · `mistral` · `groq` · `openrouter` · `together` ·
`azure_openai` · `bedrock` · `vertex` · `openai_compatible`

1. **Settings → API keys** — add the provider's key.
2. **Settings → AI** — enable cloud, choose the provider/model, and (for
   OpenAI-compatible servers) set the base URL (e.g. `http://127.0.0.1:1234/v1`).
3. Save. The UI calls `PUT /api/settings/ai` on the loopback backend.

A cloud provider is reached **only** after you enable cloud AI and add a key.
With cloud off, nothing leaves your machine.

## The fact-guard

Across narration, the daily brief, per-screen insights, postmortems, backtest
review, coaching, the lesson tutor, and the Copilot, the model is constrained to
narrate engine facts. It proposes read-only tools, the engine runs them, and the
model describes only those results — source-labeled. It cannot fabricate values.
