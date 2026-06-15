# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Request-locale resolution and the AI prompt directive."""

from app.services.locale import (
    DEFAULT_LOCALE,
    get_locale,
    language_directive,
    normalize_locale,
    set_locale,
)


def test_normalize_locale_handles_accept_language_header() -> None:
    assert normalize_locale("ur") == "ur"
    assert normalize_locale("ur,en;q=0.8") == "ur"
    assert normalize_locale("ar-EG") == "ar"
    assert normalize_locale("fr-FR,fr;q=0.9") == "fr"


def test_normalize_locale_falls_back_to_english() -> None:
    assert normalize_locale(None) == DEFAULT_LOCALE
    assert normalize_locale("") == DEFAULT_LOCALE
    assert normalize_locale("xx") == DEFAULT_LOCALE  # unsupported
    assert normalize_locale("klingon") == DEFAULT_LOCALE


def test_language_directive_is_empty_for_english() -> None:
    assert language_directive("en") == ""
    # An unsupported code is normalized away upstream, but be defensive here too.
    assert language_directive("xx") == ""


def test_language_directive_names_the_target_language() -> None:
    directive = language_directive("ur")
    assert "Urdu" in directive
    assert "ticker symbols" in directive or "numbers" in directive

    arabic = language_directive("ar")
    assert "Arabic" in arabic


def test_set_and_get_locale_round_trip() -> None:
    set_locale("fa")
    assert get_locale() == "fa"
    # Directive defaults to the contextvar when no explicit code is passed.
    assert "Persian" in language_directive()
    set_locale(None)
    assert get_locale() == DEFAULT_LOCALE
