# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Interactive Learning Platform service.

Serves a structured curriculum across four tiers (novice -> intermediate ->
advanced -> expert). Lesson content lives in JSON files under
``app/content/lessons`` so curriculum contributions are pure-content changes;
this module only loads the catalog and evaluates exercises.
"""

from __future__ import annotations

import json
from functools import cache, lru_cache
from pathlib import Path
from typing import Any

from app.services.locale import DEFAULT_LOCALE, get_locale
from app.storage.state_store import StateStore

_CONTENT_DIR = Path(__file__).resolve().parent.parent / "content" / "lessons"

# Lesson fields whose values are translated prose; everything else (ids, the
# track/tier/order skeleton, and the exercise answer keys) is identity data that
# must stay byte-identical to English so progress and exam grading are unaffected.
# These are restored from the English base after a translation overlay is merged,
# so a malformed overlay can never silently break answer-checking.
_PROTECTED_LESSON_KEYS = ("id", "module_id", "track_id", "tier", "order")
_PROTECTED_EXERCISE_KEYS = ("type", "correct_index", "correct_answer", "tolerance_percent")


@lru_cache(maxsize=1)
def _load_catalog_meta() -> dict[str, Any]:
    with open(_CONTENT_DIR / "modules.json", encoding="utf-8") as handle:
        return json.load(handle)


@lru_cache(maxsize=1)
def _load_lessons() -> tuple[dict[str, Any], ...]:
    """The English source curriculum — the fallback every locale builds on."""
    lessons: list[dict[str, Any]] = []
    for tier in _load_catalog_meta()["level_order"]:
        with open(_CONTENT_DIR / f"{tier}.json", encoding="utf-8") as handle:
            lessons.extend(json.load(handle))
    return tuple(lessons)


@cache
def _load_locale_overlay(locale: str) -> dict[str, dict[str, Any]]:
    """Map lesson id -> partial translated lesson for ``locale``.

    Translations live in ``content/lessons/<locale>/<tier>.json`` as a list of
    partial lesson objects (each carrying at least ``id`` plus the prose fields
    that have been translated). Missing files or missing lessons simply fall
    back to English, so a locale can be filled in lesson-by-lesson.
    """
    if locale == DEFAULT_LOCALE:
        return {}
    overlay: dict[str, dict[str, Any]] = {}
    locale_dir = _CONTENT_DIR / locale
    if not locale_dir.is_dir():
        return overlay
    for tier in _load_catalog_meta()["level_order"]:
        path = locale_dir / f"{tier}.json"
        if not path.exists():
            continue
        with open(path, encoding="utf-8") as handle:
            for entry in json.load(handle):
                if isinstance(entry, dict) and "id" in entry:
                    overlay[entry["id"]] = entry
    return overlay


def _merge_translation(base: Any, overlay: Any) -> Any:
    """Field-by-field overlay with English fallback.

    Recurses into dicts (so a translation can override just ``exercise.question``
    while keeping the rest of the exercise); scalars and lists are replaced
    wholesale when the overlay supplies them, and left as English otherwise.
    """
    if isinstance(base, dict) and isinstance(overlay, dict):
        merged = dict(base)
        for key, value in overlay.items():
            existing = base.get(key)
            merged[key] = (
                _merge_translation(existing, value)
                if isinstance(existing, dict) and isinstance(value, dict)
                else value
            )
        return merged
    return overlay


def _apply_overlay(lesson: dict[str, Any], translation: dict[str, Any]) -> dict[str, Any]:
    """Merge a translation onto an English lesson, then restore the identity and
    answer-key fields so they can never be altered by a translation."""
    merged = _merge_translation(lesson, translation)
    for key in _PROTECTED_LESSON_KEYS:
        if key in lesson:
            merged[key] = lesson[key]
    base_ex = lesson.get("exercise")
    if isinstance(base_ex, dict) and isinstance(merged.get("exercise"), dict):
        for key in _PROTECTED_EXERCISE_KEYS:
            if key in base_ex:
                merged["exercise"][key] = base_ex[key]
    return merged


@cache
def _localized_lessons(locale: str) -> tuple[dict[str, Any], ...]:
    """The curriculum in ``locale``, with per-lesson, per-field English fallback."""
    overlay = _load_locale_overlay(locale)
    if not overlay:
        return _load_lessons()
    return tuple(
        _apply_overlay(lesson, overlay[lesson["id"]]) if lesson["id"] in overlay else lesson
        for lesson in _load_lessons()
    )


def _current_lessons() -> tuple[dict[str, Any], ...]:
    """The curriculum localized to the active request locale (ContextVar)."""
    return _localized_lessons(get_locale())


@lru_cache(maxsize=1)
def _load_reference() -> tuple[dict[str, Any], ...]:
    reference_file = _CONTENT_DIR.parent / "reference" / "reference.json"
    with open(reference_file, encoding="utf-8") as handle:
        return tuple(json.load(handle))


@cache
def _localized_meta(locale: str) -> dict[str, Any]:
    """The catalog skeleton (level + track titles/descriptions) in ``locale``.

    Translations live in ``content/lessons/<locale>/modules.json`` as a partial
    object (``{"levels": {id: {...}}, "tracks": [{id, ...}]}``); the structural
    keys (``level_order`` and every ``id``/``level``/``order``) are always taken
    from English so the catalog shape is locale-independent.
    """
    meta = _load_catalog_meta()
    if locale == DEFAULT_LOCALE:
        return meta
    overlay_path = _CONTENT_DIR / locale / "modules.json"
    if not overlay_path.exists():
        return meta
    with open(overlay_path, encoding="utf-8") as handle:
        overlay = json.load(handle)
    level_overlay = overlay.get("levels", {}) or {}
    levels = {
        level_id: {
            **_merge_translation(level_meta, level_overlay.get(level_id, {})),
            "id": level_id,
        }
        for level_id, level_meta in meta["levels"].items()
    }
    track_overlay = {
        track["id"]: track
        for track in overlay.get("tracks", []) or []
        if isinstance(track, dict) and "id" in track
    }
    tracks = [
        {
            **_merge_translation(track, track_overlay.get(track["id"], {})),
            "id": track["id"],
            "level": track["level"],
            "order": track["order"],
        }
        for track in meta["tracks"]
    ]
    return {**meta, "levels": levels, "tracks": tracks}


def _current_meta() -> dict[str, Any]:
    return _localized_meta(get_locale())


def _tier_order() -> list[str]:
    return _load_catalog_meta()["level_order"]


def _level_meta() -> dict[str, dict[str, str]]:
    return _current_meta()["levels"]


def _tracks() -> list[dict[str, str]]:
    return _current_meta()["tracks"]


# ---------------------------------------------------------------------------
# LearnService
# ---------------------------------------------------------------------------


class LearnService:
    def __init__(self, state_store: StateStore, lesson_pack_registry: Any | None = None) -> None:
        self._store = state_store
        self._packs = lesson_pack_registry

    def _all_lessons(self) -> list[dict[str, Any]]:
        lessons = list(_current_lessons())
        if self._packs is not None:
            lessons.extend(self._packs.all_lessons())
        return lessons

    def get_catalog(self) -> dict[str, Any]:
        progress = self._store.get_learn_progress()
        completed_ids = {lid for lid, data in progress.items() if data.get("completed_at")}
        levels = []
        for level_id in _tier_order():
            meta = _level_meta()[level_id]
            level_tracks = []
            level_completed = 0
            level_total = 0
            for track in sorted(
                (t for t in _tracks() if t["level"] == level_id),
                key=lambda t: t["order"],
            ):
                track_lessons = sorted(
                    (les for les in _current_lessons() if les.get("track_id") == track["id"]),
                    key=lambda les: les["order"],
                )
                track_completed = sum(1 for les in track_lessons if les["id"] in completed_ids)
                level_completed += track_completed
                level_total += len(track_lessons)
                level_tracks.append(
                    {
                        **track,
                        "lessons": [self._lesson_stub(les, completed_ids) for les in track_lessons],
                        "completed": track_completed,
                        "total": len(track_lessons),
                    }
                )
            if self._packs is not None:
                for track in self._packs.tracks_for_level(level_id):
                    pack_lessons = track["lessons"]
                    pack_completed = sum(1 for les in pack_lessons if les["id"] in completed_ids)
                    level_completed += pack_completed
                    level_total += len(pack_lessons)
                    level_tracks.append(
                        {
                            **track,
                            "lessons": [
                                self._lesson_stub(les, completed_ids) for les in pack_lessons
                            ],
                            "completed": pack_completed,
                            "total": len(pack_lessons),
                        }
                    )
            levels.append(
                {
                    **meta,
                    "tracks": level_tracks,
                    "completed": level_completed,
                    "total": level_total,
                }
            )
        total = len(_current_lessons())
        done = len(completed_ids & {les["id"] for les in _current_lessons()})
        return {
            "levels": levels,
            "progress": {
                "total": total,
                "completed": done,
                "by_tier": {
                    tier: {
                        "total": sum(1 for les in _current_lessons() if les["module_id"] == tier),
                        "completed": sum(
                            1
                            for les in _current_lessons()
                            if les["module_id"] == tier and les["id"] in completed_ids
                        ),
                    }
                    for tier in _tier_order()
                },
            },
        }

    def get_glossary(self) -> dict[str, Any]:
        """Every key term across the catalog, deduped, with its source lesson."""
        seen: dict[str, dict[str, Any]] = {}
        for lesson in self._all_lessons():
            for key_term in lesson.get("key_terms", []):
                term = key_term["term"]
                if term.lower() not in seen:
                    seen[term.lower()] = {
                        "term": term,
                        "definition": key_term["definition"],
                        "lesson_id": lesson["id"],
                        "lesson_title": lesson["title"],
                    }
        items = sorted(seen.values(), key=lambda entry: entry["term"].lower())
        return {"items": items}

    def get_reference(self) -> dict[str, Any]:
        """The reference library: indicators, order types, formulas, red flags."""
        return {"sections": list(_load_reference())}

    def get_lesson(self, lesson_id: str) -> dict[str, Any] | None:
        lesson = next((les for les in self._all_lessons() if les["id"] == lesson_id), None)
        if lesson is None:
            return None
        progress = self._store.get_learn_progress()
        completed_ids = {lid for lid, data in progress.items() if data.get("completed_at")}
        return {**lesson, "completed": lesson_id in completed_ids}

    def check_answer(self, lesson_id: str, answer: str) -> dict[str, Any]:
        lesson = next((les for les in self._all_lessons() if les["id"] == lesson_id), None)
        if lesson is None:
            return {"correct": False, "explanation": "Lesson not found.", "score": 0}

        self._store.record_lesson_attempt(lesson_id)
        ex = lesson["exercise"]

        if ex["type"] == "multiple_choice":
            try:
                chosen_index = int(answer)
            except (ValueError, TypeError):
                chosen_index = -1
            correct = chosen_index == ex["correct_index"]

        elif ex["type"] == "numeric_input":
            try:
                given = float(answer.replace(",", "").strip())
                expected = float(ex["correct_answer"].replace(",", "").strip())
                tolerance = abs(expected) * (ex.get("tolerance_percent", 1.0) / 100)
                correct = abs(given - expected) <= tolerance
            except (ValueError, TypeError):
                correct = False

        else:
            correct = False

        if correct:
            self._store.mark_lesson_complete(lesson_id)

        return {
            "correct": correct,
            "explanation": ex["explanation"],
            "score": 10 if correct else 0,
        }

    def get_progress(self) -> dict[str, Any]:
        progress = self._store.get_learn_progress()
        completed_ids = {lid for lid, data in progress.items() if data.get("completed_at")}
        total = len(_current_lessons())
        done = len(completed_ids & {les["id"] for les in _current_lessons()})
        return {
            "total": total,
            "completed": done,
            "by_tier": {
                tier: {
                    "total": sum(1 for les in _current_lessons() if les["module_id"] == tier),
                    "completed": sum(
                        1
                        for les in _current_lessons()
                        if les["module_id"] == tier and les["id"] in completed_ids
                    ),
                }
                for tier in _tier_order()
            },
        }

    # ------------------------------------------------------------------

    @staticmethod
    def _lesson_stub(lesson: dict[str, Any], completed_ids: set[str]) -> dict[str, Any]:
        return {
            "id": lesson["id"],
            "order": lesson["order"],
            "title": lesson["title"],
            "summary": lesson["summary"],
            "tier": lesson["tier"],
            "completed": lesson["id"] in completed_ids,
        }
