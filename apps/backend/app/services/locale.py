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
