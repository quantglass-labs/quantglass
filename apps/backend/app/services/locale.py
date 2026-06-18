# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Request-scoped interface locale.

The desktop client sends the active language on every request via the
``Accept-Language`` header. A pure-ASGI middleware (see ``app.main``) records it
in a :class:`~contextvars.ContextVar` for the duration of the request, and the
AI services append a "respond in this language" directive to their prompts so
narration, coaching, postmortems, and research reviews come back localized.

A ContextVar is used so the locale rides along into Starlette's threadpool
(``run_in_threadpool`` copies the context) without threading a parameter through
every service signature.
"""

import re
from contextvars import ContextVar

DEFAULT_LOCALE = "en"

# code -> English language name, used inside the prompt directive.
LOCALE_NAMES: dict[str, str] = {
    "en": "English",
    "zh": "Chinese (Mandarin)",
    "hi": "Hindi",
    "es": "Spanish",
    "ar": "Arabic",
    "fr": "French",
    "bn": "Bengali",
    "pt": "Portuguese",
    "ru": "Russian",
    "ur": "Urdu",
    "id": "Indonesian",
    "de": "German",
    "ja": "Japanese",
    "fa": "Persian",
    "tr": "Turkish",
    "ko": "Korean",
    "vi": "Vietnamese",
    "it": "Italian",
    "sd": "Sindhi",
    "sw": "Swahili",
}

_current_locale: ContextVar[str] = ContextVar("qg_locale", default=DEFAULT_LOCALE)


def normalize_locale(value: str | None) -> str:
    """Reduce an ``Accept-Language`` header (e.g. ``"ur,en;q=0.8"``) to a single
    supported base code, falling back to English."""
    if not value:
        return DEFAULT_LOCALE
    first = value.split(",")[0].strip().split(";")[0].strip()
    base = first.split("-")[0].lower()
    return base if base in LOCALE_NAMES else DEFAULT_LOCALE


def set_locale(value: str | None) -> None:
    _current_locale.set(normalize_locale(value))


def get_locale() -> str:
    return _current_locale.get()


def language_directive(locale: str | None = None) -> str:
    """Prompt suffix instructing the model to answer in the active language.
    Empty for English so existing English behavior is unchanged."""
    code = locale or get_locale()
    if code == DEFAULT_LOCALE or code not in LOCALE_NAMES:
        return ""
    name = LOCALE_NAMES[code]
    return (
        f"\n\nIMPORTANT: Write your entire response in {name}. Translate the prose "
        "and any field labels into that language, but keep ticker symbols, numbers, "
        "dates, and units exactly as given."
    )


# --- Numeral canonicalization for the numeric fact guard -------------------
#
# The fact guard extracts numbers from model output with a plain
# ``-?\d+(?:\.\d+)?`` pattern and matches them against the engine's facts. The
# prompt asks the model to keep numbers verbatim, but a model told to answer
# "entirely in <language>" sometimes localizes them anyway — non-Latin digits
# (Arabic-Indic ٤٢, Devanagari ६५) or separators (German ``1.000,50``). Latin
# ``\d``/``float`` already handle non-Latin *digits*, but localized *separators*
# misparse (``1.000,50`` -> ``1.0`` and ``50``), which would make the guard
# reject a correct number and fall back to the template. Canonicalizing the
# model text before the guard runs keeps the guard locale-robust (and also fixes
# the long-standing English ``1,000`` -> ``1``/``000`` misparse).

# Non-Latin decimal digits used by the supported locales -> ASCII.
_DIGIT_TABLE = str.maketrans(
    {
        chr(base + i): str(i)
        for base in (0x0660, 0x06F0, 0x0966, 0x09E6, 0xFF10)
        # Arabic-Indic, Extended Arabic-Indic (Persian/Urdu), Devanagari,
        # Bengali, Fullwidth.
        for i in range(10)
    }
)

# Locales whose conventional formatting is decimal-comma / thousands-dot (or
# thousands-space); used only to disambiguate ``.`` vs ``,``.
_COMMA_DECIMAL_LOCALES = frozenset({"de", "es", "pt", "ru", "tr", "it", "fr", "vi", "id"})

# ``.`` plus assorted Unicode spaces, as a thousands separator between digit
# groups.
_DOT_SPACE_THOUSANDS = re.compile(r"(?<=\d)[.\u00a0\u202f\u2009 ](?=\d{3}(?:\D|$))")
_COMMA_THOUSANDS = re.compile(r"(?<=\d),(?=\d{3}(?:\D|$))")
_COMMA_DECIMAL = re.compile(r"(?<=\d),(?=\d)")


def canonicalize_numerals(text: str, locale: str | None = None) -> str:
    """Normalize localized numerals in ``text`` to canonical ASCII form (Latin
    digits, ``.`` decimal, no thousands separators) so a numeric guard matches
    regardless of the language the model answered in. Defensive and idempotent;
    plain ASCII numbers pass through unchanged."""
    code = locale or get_locale()
    out = text.translate(_DIGIT_TABLE)
    # Arabic thousands (U+066C) / decimal (U+066B) separators are unambiguous.
    out = out.replace("٬", "").replace("٫", ".")
    if code in _COMMA_DECIMAL_LOCALES:
        out = _DOT_SPACE_THOUSANDS.sub("", out)
        out = _COMMA_DECIMAL.sub(".", out)
    else:
        out = _COMMA_THOUSANDS.sub("", out)
    return out
