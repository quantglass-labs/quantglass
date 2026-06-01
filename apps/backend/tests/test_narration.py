# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Tests for the local-model narration fact guard.

The guard is the anti-hallucination boundary: the model may only restate numbers the
engine produced. Anything else must fall back to the deterministic template.
"""

from app.core.config import AiSettings
from app.services.model_gateway import ModelResponse
from app.services.narration import NarrationService


def _service(cloud_enabled: bool) -> NarrationService:
    settings = AiSettings(model="qwen3:14b-q4_K_M", cloud_enabled=cloud_enabled)
    return NarrationService(ai_settings_provider=lambda: settings)


_FACTS = {
    "symbol": "BTCUSD",
    "signal": "BUY_ZONE",
    "setup_type": "trend_pullback",
    "confidence": 58,
    "entry_zone": [101.5, 102.3],
    "stop_loss": 99.0,
    "backtested_winrate_pct": 54,
    "backtested_expectancy_R": 0.32,
    "backtest_sample_size": 41,
    "out_of_sample_validated": False,
    "reasons": ["Trend aligned above EMA21", "Pullback into demand"],
}


def test_disabled_cloud_returns_template_source() -> None:
    service = _service(cloud_enabled=False)
    text, source = service.narrate(_FACTS)
    assert source == "template"
    assert text


def test_fact_guard_accepts_only_known_numbers() -> None:
    service = _service(cloud_enabled=True)
    good = "BTCUSD prints a BUY_ZONE on a trend_pullback with 58 confidence and 0.32R expectancy."
    assert service._passes_fact_guard(good, _FACTS) is True


def test_fact_guard_rejects_fabricated_number() -> None:
    service = _service(cloud_enabled=True)
    # 12345 never appears in the facts -> hallucinated.
    bad = "BTCUSD is heading to 12345 next week."
    assert service._passes_fact_guard(bad, _FACTS) is False


def test_fact_guard_allows_structural_small_integers() -> None:
    service = _service(cloud_enabled=True)
    text = "There are 3 take-profit rungs and 2 reasons listed."
    assert service._passes_fact_guard(text, _FACTS) is True


class _Gateway:
    def __init__(self, response: ModelResponse | None) -> None:
        self.response = response

    def complete(self, _settings: AiSettings, _prompt: str) -> ModelResponse | None:
        return self.response


def test_narration_uses_gateway_source_when_fact_checked() -> None:
    settings = AiSettings(cloud_enabled=True, provider="openai_compatible", model="local-model")
    service = NarrationService(
        ai_settings_provider=lambda: settings,
        model_gateway=_Gateway(ModelResponse("BTCUSD has 58 confidence.", "openai_compatible:local-model")),
    )

    text, source = service.narrate(_FACTS)

    assert text == "BTCUSD has 58 confidence."
    assert source == "openai_compatible:local-model"


def test_narration_falls_back_when_gateway_fabricates_number() -> None:
    settings = AiSettings(cloud_enabled=True, provider="openai_compatible", model="local-model")
    service = NarrationService(
        ai_settings_provider=lambda: settings,
        model_gateway=_Gateway(ModelResponse("BTCUSD will reach 12345.", "openai_compatible:local-model")),
    )

    text, source = service.narrate(_FACTS)

    assert source == "template-guarded"
    assert "12345" not in text
