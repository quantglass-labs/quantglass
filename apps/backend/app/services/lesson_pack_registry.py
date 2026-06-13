# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Community lesson packs (ACAD-10): the `lessons` extension capability.

A pack is declarative JSON only — a track definition plus lessons with the
same shape the built-in catalog uses (markdown concept, key terms, one
exercise). Packs are validated in plain Python at registration; invalid
packs are rejected whole with actionable diagnostics. Pack lessons render
through the exact same vetted components as built-in content, so a pack can
never inject markup or executable code into the UI.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

VALID_LEVELS = ("novice", "intermediate", "advanced", "expert")
REQUIRED_LESSON_FIELDS = ("id", "title", "summary", "concept", "key_terms", "exercise")
MAX_LESSONS_PER_PACK = 40

# Pack lessons may not declare engine-coupled fields; those stay first-party.
FORBIDDEN_LESSON_FIELDS = ("live_exercise", "visuals", "live_apply", "bridge")


from quantglass_sdk import LessonPackDefinition  # noqa: E402


@dataclass(slots=True)
class _PackRecord:
    definition: LessonPackDefinition
    lessons: list[dict[str, Any]] = field(default_factory=list)


def validate_lesson_pack(pack: LessonPackDefinition) -> list[str]:
    diagnostics: list[str] = []
    if not pack.id or not pack.id.replace("-", "").isalnum():
        diagnostics.append("pack id must be kebab-case alphanumeric")
    if pack.level not in VALID_LEVELS:
        diagnostics.append(f"pack level must be one of {VALID_LEVELS}")
    if not pack.lessons:
        diagnostics.append("pack has no lessons")
    if len(pack.lessons) > MAX_LESSONS_PER_PACK:
        diagnostics.append(f"pack exceeds {MAX_LESSONS_PER_PACK} lessons")

    seen_ids: set[str] = set()
    for index, lesson in enumerate(pack.lessons):
        label = f"lesson[{index}]"
        for required in REQUIRED_LESSON_FIELDS:
            if not lesson.get(required):
                diagnostics.append(f"{label} missing {required}")
        for forbidden in FORBIDDEN_LESSON_FIELDS:
            if forbidden in lesson:
                diagnostics.append(f"{label} may not declare {forbidden} (first-party only)")
        lesson_id = str(lesson.get("id") or "")
        if lesson_id in seen_ids:
            diagnostics.append(f"{label} duplicate id {lesson_id}")
        seen_ids.add(lesson_id)

        key_terms = lesson.get("key_terms")
        if key_terms is not None and not (
            isinstance(key_terms, list)
            and all(
                isinstance(term, dict) and term.get("term") and term.get("definition")
                for term in key_terms
            )
        ):
            diagnostics.append(f"{label} key_terms must be a list of term/definition objects")

        exercise = lesson.get("exercise")
        if isinstance(exercise, dict):
            if exercise.get("type") != "multiple_choice":
                diagnostics.append(f"{label} exercise type must be multiple_choice")
            else:
                options = exercise.get("options")
                correct = exercise.get("correct_index")
                if not isinstance(options, list) or len(options) < 2:
                    diagnostics.append(f"{label} exercise needs at least 2 options")
                elif not isinstance(correct, int) or not 0 <= correct < len(options):
                    diagnostics.append(f"{label} exercise correct_index out of range")
        elif exercise is not None:
            diagnostics.append(f"{label} exercise must be an object")
    return diagnostics


class LessonPackRegistry:
    def __init__(self) -> None:
        self._packs: dict[str, _PackRecord] = {}

    def register(self, definition: LessonPackDefinition) -> list[str]:
        diagnostics = validate_lesson_pack(definition)
        if diagnostics:
            return diagnostics
        lessons = []
        for order, lesson in enumerate(definition.lessons, start=1):
            lessons.append(
                {
                    **lesson,
                    "id": f"{definition.id}-{lesson['id']}",
                    "module_id": definition.level,
                    "tier": definition.level,
                    "track_id": definition.id,
                    "order": order,
                    "source": "community",
                    "source_extension": definition.source_extension,
                }
            )
        self._packs[definition.id] = _PackRecord(definition=definition, lessons=lessons)
        return []

    def list_packs(self) -> list[dict[str, Any]]:
        return [
            {
                "id": record.definition.id,
                "title": record.definition.title,
                "description": record.definition.description,
                "level": record.definition.level,
                "lesson_count": len(record.lessons),
                "source_extension": record.definition.source_extension,
                "attribution": record.definition.attribution,
            }
            for record in self._packs.values()
        ]

    def tracks_for_level(self, level: str) -> list[dict[str, Any]]:
        tracks = []
        for record in self._packs.values():
            if record.definition.level != level:
                continue
            tracks.append(
                {
                    "id": record.definition.id,
                    "title": record.definition.title,
                    "description": record.definition.description,
                    "level": level,
                    "order": 1000,  # community tracks render after first-party ones
                    "source": "community",
                    "lessons": record.lessons,
                }
            )
        return tracks

    def all_lessons(self) -> list[dict[str, Any]]:
        return [lesson for record in self._packs.values() for lesson in record.lessons]

    def get_lesson(self, lesson_id: str) -> dict[str, Any] | None:
        for record in self._packs.values():
            for lesson in record.lessons:
                if lesson["id"] == lesson_id:
                    return lesson
        return None
