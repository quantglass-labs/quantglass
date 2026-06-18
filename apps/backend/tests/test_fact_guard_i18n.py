# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""The numeric fact guard must stay correct when the model answers in another
language. Models told to write "entirely in <language>" sometimes localize
numbers — non-Latin digits (Arabic-Indic, Devanagari) or separators (German
``1.000,50``) — so the guard canonicalizes numerals before extracting them.

These tests pin two properties:
1. ``canonicalize_numerals`` maps localized numerals to ASCII canonical form.
2. The guard then accepts a *correct* localized number and still rejects a
   *fabricated* one, in a non-Latin-digit, an RTL, and a comma-decimal locale.
"""

from app.core.config import AiSettings
from app.services.locale import canonicalize_numerals, set_locale
from app.services.narration import NarrationService

_FACTS = {
    "symbol": "BTCUSD",
    "confidence": 85,
    "backtested_expectancy_R": 1.5,
    "backtest_sample_size": 1000,
    "reasons": ["Trend aligned above EMA21", "Pullback into demand"],
}


def _service() -> NarrationService:
    return NarrationService(ai_settings_provider=lambda: AiSettings(model="m", cloud_enabled=True))


def test_canonicalize_non_latin_digits() -> None:
    # Latin \d/float already handle these, but normalization makes it explicit
    # and uniform for the separator logic below.
    assert canonicalize_numerals("٨٥", "ar") == "85"  # Arabic-Indic
    assert canonicalize_numerals("۸۵", "fa") == "85"  # Extended Arabic-Indic (Persian/Urdu)
    assert canonicalize_numerals("६५", "hi") == "65"  # Devanagari
    assert canonicalize_numerals("৭৩", "bn") == "73"  # Bengali
    assert canonicalize_numerals("８０", "ja") == "80"  # Fullwidth


def test_canonicalize_separators() -> None:
    assert canonicalize_numerals("1.000,50", "de") == "1000.50"  # dot-thousands, comma-decimal
    assert canonicalize_numerals("1,5", "de") == "1.5"  # German decimal comma
    assert canonicalize_numerals("٥٫٢", "ar") == "5.2"  # Arabic decimal separator U+066B
    assert canonicalize_numerals("1,000", "en") == "1000"  # English thousands comma
    assert canonicalize_numerals("85.3", "en") == "85.3"  # already canonical, untouched
    assert canonicalize_numerals("1.5", "de") == "1.5"  # lone decimal dot preserved (not 3-digit)


def test_guard_accepts_arabic_indic_digits() -> None:
    # The analyst's core worry — non-Latin digits — must NOT trip the guard.
    set_locale("ar")
    try:
        text = "الثقة ٨٥٪ والتوقع ١٫٥R عبر ١٠٠٠ صفقة"  # 85, 1.5, 1000 — all real facts
        assert _service()._passes_fact_guard(text, _FACTS) is True
    finally:
        set_locale(None)


def test_guard_accepts_german_decimal_comma() -> None:
    # expectancy 1.5 written German-style "1,5"; the old guard split it to 1 + 5
    # and rejected the (correct) number.
    set_locale("de")
    try:
        text = "Erwartungswert 1,5R bei 85 Konfidenz über 1.000 Trades."
        assert _service()._passes_fact_guard(text, _FACTS) is True
    finally:
        set_locale(None)


def test_guard_rejects_fabricated_localized_number() -> None:
    # A number that is NOT a fact must still be caught when written in
    # Devanagari digits (४२ = 42).
    set_locale("hi")
    try:
        assert _service()._passes_fact_guard("लक्ष्य ४२", _FACTS) is False
    finally:
        set_locale(None)


def test_english_path_unchanged() -> None:
    # Plain ASCII narration behaves exactly as before (default locale).
    svc = _service()
    assert svc._passes_fact_guard("Confidence 85 with 1.5R expectancy.", _FACTS) is True
    assert svc._passes_fact_guard("Heading to 12345 next week.", _FACTS) is False
