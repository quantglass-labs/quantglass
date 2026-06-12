# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Community lesson packs: validation, registration, catalog merge (ACAD-10)."""

import unittest

from app.services.learn_service import LearnService
from app.services.lesson_pack_registry import (
    LessonPackDefinition,
    LessonPackRegistry,
    validate_lesson_pack,
)


def _lesson(**overrides):
    base = {
        "id": "vwap-basics",
        "title": "VWAP Basics",
        "summary": "The session benchmark.",
        "concept": "**VWAP** is the volume-weighted average price.",
        "key_terms": [{"term": "VWAP", "definition": "Volume-weighted average price."}],
        "exercise": {
            "type": "multiple_choice",
            "question": "Q?",
            "options": ["a", "b"],
            "correct_index": 1,
            "explanation": "Because.",
        },
    }
    base.update(overrides)
    return base


def _pack(**overrides):
    base = {
        "id": "community-vwap",
        "title": "VWAP (Community)",
        "description": "Example pack.",
        "level": "intermediate",
        "lessons": (_lesson(),),
        "source_extension": "test-ext",
    }
    base.update(overrides)
    return LessonPackDefinition(**base)


class _Store:
    def get_learn_progress(self):
        return {}

    def record_lesson_attempt(self, lesson_id):
        pass

    def mark_lesson_complete(self, lesson_id):
        pass


class ValidationTests(unittest.TestCase):
    def test_valid_pack_passes(self) -> None:
        self.assertEqual(validate_lesson_pack(_pack()), [])

    def test_missing_fields_and_bad_level_rejected(self) -> None:
        problems = validate_lesson_pack(_pack(level="galactic", lessons=(_lesson(concept=""),)))
        self.assertTrue(any("level" in problem for problem in problems))
        self.assertTrue(any("concept" in problem for problem in problems))

    def test_engine_coupled_fields_forbidden(self) -> None:
        problems = validate_lesson_pack(
            _pack(lessons=(_lesson(visuals=[{"type": "candle_anatomy"}]),))
        )
        self.assertTrue(any("visuals" in problem for problem in problems))

    def test_bad_exercise_rejected(self) -> None:
        bad = _lesson(exercise={"type": "multiple_choice", "options": ["a"], "correct_index": 5})
        problems = validate_lesson_pack(_pack(lessons=(bad,)))
        self.assertTrue(any("options" in problem for problem in problems))


class RegistryTests(unittest.TestCase):
    def test_register_namespaces_ids_and_lists_pack(self) -> None:
        registry = LessonPackRegistry()
        self.assertEqual(registry.register(_pack()), [])
        lessons = registry.all_lessons()
        self.assertEqual(lessons[0]["id"], "community-vwap-vwap-basics")
        self.assertEqual(lessons[0]["track_id"], "community-vwap")
        self.assertEqual(lessons[0]["source"], "community")
        self.assertEqual(registry.list_packs()[0]["lesson_count"], 1)

    def test_invalid_pack_rejected_whole(self) -> None:
        registry = LessonPackRegistry()
        problems = registry.register(_pack(lessons=()))
        self.assertTrue(problems)
        self.assertEqual(registry.all_lessons(), [])


class CatalogMergeTests(unittest.TestCase):
    def test_pack_track_appears_in_catalog_level(self) -> None:
        registry = LessonPackRegistry()
        registry.register(_pack())
        service = LearnService(_Store(), registry)
        catalog = service.get_catalog()
        intermediate = next(level for level in catalog["levels"] if level["id"] == "intermediate")
        community = [
            track for track in intermediate["tracks"] if track.get("source") == "community"
        ]
        self.assertEqual(len(community), 1)
        self.assertEqual(community[0]["lessons"][0]["id"], "community-vwap-vwap-basics")
        # Community tracks sort after first-party ones.
        self.assertEqual(intermediate["tracks"][-1]["id"], "community-vwap")

    def test_pack_lesson_served_and_answer_checked(self) -> None:
        registry = LessonPackRegistry()
        registry.register(_pack())
        service = LearnService(_Store(), registry)
        lesson = service.get_lesson("community-vwap-vwap-basics")
        self.assertIsNotNone(lesson)
        result = service.check_answer("community-vwap-vwap-basics", "1")
        self.assertTrue(result["correct"])

    def test_pack_terms_join_the_glossary(self) -> None:
        registry = LessonPackRegistry()
        registry.register(_pack())
        service = LearnService(_Store(), registry)
        terms = {entry["term"] for entry in service.get_glossary()["items"]}
        self.assertIn("VWAP", terms)


if __name__ == "__main__":
    unittest.main()
