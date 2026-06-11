# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Level assessments: building, grading, and persistence."""

import unittest

from app.services.learn_assessments import LearnAssessmentService
from app.services.learn_service import _load_lessons


class _Store:
    def __init__(self) -> None:
        self.recorded: list[tuple] = []

    def record_assessment(self, level, score, passed):
        self.recorded.append((level, score, passed))


class AssessmentTests(unittest.TestCase):
    def setUp(self) -> None:
        self.store = _Store()
        self.service = LearnAssessmentService(self.store)

    def test_build_serves_questions_without_answers(self) -> None:
        exam = self.service.build_assessment("novice")
        self.assertEqual(exam["level"], "novice")
        self.assertEqual(len(exam["questions"]), 8)
        for question in exam["questions"]:
            self.assertNotIn("correct_index", question)
            self.assertNotIn("explanation", question)
            self.assertGreaterEqual(len(question["options"]), 2)

    def test_perfect_answers_pass_and_persist(self) -> None:
        lessons = {
            lesson["id"]: lesson
            for lesson in _load_lessons()
            if lesson["tier"] == "novice" and lesson["exercise"]["type"] == "multiple_choice"
        }
        exam = self.service.build_assessment("novice")
        answers = {
            q["lesson_id"]: lessons[q["lesson_id"]]["exercise"]["correct_index"]
            for q in exam["questions"]
        }
        result = self.service.grade("novice", answers)
        self.assertTrue(result["passed"])
        self.assertEqual(result["score"], 100)
        self.assertEqual(self.store.recorded, [("novice", 100, True)])

    def test_half_wrong_fails_the_80_bar(self) -> None:
        lessons = {
            lesson["id"]: lesson
            for lesson in _load_lessons()
            if lesson["tier"] == "novice" and lesson["exercise"]["type"] == "multiple_choice"
        }
        exam = self.service.build_assessment("novice")
        answers = {}
        for i, q in enumerate(exam["questions"]):
            correct = lessons[q["lesson_id"]]["exercise"]["correct_index"]
            answers[q["lesson_id"]] = correct if i % 2 == 0 else (correct + 1) % 2
        result = self.service.grade("novice", answers)
        self.assertFalse(result["passed"])
        self.assertLess(result["score"], 80)
        self.assertTrue(all("explanation" in r for r in result["results"]))

    def test_unknown_level_unsupported(self) -> None:
        self.assertFalse(self.service.supports("wizard"))

    def test_empty_answers_score_zero_and_fail(self) -> None:
        result = self.service.grade("novice", {})
        self.assertEqual(result["score"], 0)
        self.assertFalse(result["passed"])
