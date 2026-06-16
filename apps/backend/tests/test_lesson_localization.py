# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Locale-aware lesson serving: a translation overlay replaces prose field by
field, falls back to English for anything it omits, and can never alter the
identity or answer-key fields that progress and exam grading depend on."""

import unittest

from app.services import learn_service
from app.services.learn_service import (
    _apply_overlay,
    _localized_lessons,
    _merge_translation,
)
from app.services.locale import set_locale


class MergeTranslationTests(unittest.TestCase):
    def test_overlay_fields_win_missing_fields_fall_back(self) -> None:
        base = {"title": "Candlesticks", "summary": "EN summary", "order": 1}
        overlay = {"title": "Velas"}
        merged = _merge_translation(base, overlay)
        self.assertEqual(merged["title"], "Velas")
        self.assertEqual(merged["summary"], "EN summary")
        self.assertEqual(merged["order"], 1)

    def test_recurses_into_nested_dicts(self) -> None:
        base = {"exercise": {"question": "EN?", "correct_index": 2, "type": "multiple_choice"}}
        overlay = {"exercise": {"question": "ES?"}}
        merged = _merge_translation(base, overlay)
        self.assertEqual(merged["exercise"]["question"], "ES?")
        self.assertEqual(merged["exercise"]["correct_index"], 2)
        self.assertEqual(merged["exercise"]["type"], "multiple_choice")

    def test_lists_are_replaced_wholesale(self) -> None:
        base = {"options": ["a", "b", "c"]}
        overlay = {"options": ["x", "y", "z"]}
        self.assertEqual(_merge_translation(base, overlay)["options"], ["x", "y", "z"])


class ApplyOverlayTests(unittest.TestCase):
    def _base(self) -> dict:
        return {
            "id": "novice-01",
            "module_id": "novice",
            "track_id": "market-foundations",
            "tier": "novice",
            "order": 1,
            "title": "EN title",
            "exercise": {
                "type": "multiple_choice",
                "question": "EN?",
                "options": ["a", "b"],
                "correct_index": 1,
                "explanation": "EN why",
            },
        }

    def test_prose_translated(self) -> None:
        merged = _apply_overlay(
            self._base(),
            {"id": "novice-01", "title": "ES title", "exercise": {"explanation": "ES why"}},
        )
        self.assertEqual(merged["title"], "ES title")
        self.assertEqual(merged["exercise"]["explanation"], "ES why")

    def test_identity_and_answer_keys_cannot_be_overridden(self) -> None:
        # A malformed overlay that tries to change ids and the answer key must be
        # ignored for those fields — only prose is allowed to change.
        merged = _apply_overlay(
            self._base(),
            {
                "id": "HACKED",
                "module_id": "expert",
                "order": 99,
                "title": "ES title",
                "exercise": {"correct_index": 0, "type": "numeric_input", "question": "ES?"},
            },
        )
        self.assertEqual(merged["id"], "novice-01")
        self.assertEqual(merged["module_id"], "novice")
        self.assertEqual(merged["order"], 1)
        self.assertEqual(merged["exercise"]["correct_index"], 1)
        self.assertEqual(merged["exercise"]["type"], "multiple_choice")
        # ...while the prose still came through.
        self.assertEqual(merged["title"], "ES title")
        self.assertEqual(merged["exercise"]["question"], "ES?")


class LocalizedLessonsFallbackTests(unittest.TestCase):
    def test_english_returns_source_curriculum(self) -> None:
        self.assertEqual(_localized_lessons("en"), learn_service._load_lessons())

    def test_unknown_locale_falls_back_to_english(self) -> None:
        # No overlay directory exists for "zz" — every lesson is the English one.
        self.assertEqual(_localized_lessons("zz"), learn_service._load_lessons())

    def test_current_lessons_follows_request_locale(self) -> None:
        try:
            set_locale("ur")
            # No Urdu overlay shipped yet → English fallback, no crash, full catalog.
            self.assertEqual(
                len(learn_service._current_lessons()), len(learn_service._load_lessons())
            )
        finally:
            set_locale("en")


if __name__ == "__main__":
    unittest.main()
