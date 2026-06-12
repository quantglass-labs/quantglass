# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""AI coach narrative and lesson tutor (AI-2/AI-3): covenant behaviors."""

import unittest

from app.services.ai_coach import AiCoachService


class _Settings:
    cloud_enabled = False


class _ReviewCoach:
    def __init__(self, trades=10):
        self.trades = trades

    def coach(self):
        return {
            "weekly": {"trades": 3, "average_process_score": 82},
            "summary": {
                "trades": self.trades,
                "average_process_score": 75,
                "process_good_bar": 70,
                "quadrants": {"earned_win": 4},
                "dangerous_success_count": 1,
            },
            "detections": [{"label": "Trading without a stop", "count": 2, "symbols": []}],
        }


class _Learn:
    def get_lesson(self, lesson_id):
        if lesson_id != "known":
            return None
        return {
            "title": "ATR",
            "concept": "ATR measures volatility.",
            "key_terms": [],
            "common_mistakes": [],
        }


def _service(trades=10):
    return AiCoachService(
        ai_settings_provider=lambda: _Settings(),
        review_coach_service=_ReviewCoach(trades),
        learn_service=_Learn(),
    )


class CoachNarrativeTests(unittest.TestCase):
    def test_template_carries_facts_without_model(self) -> None:
        result = _service().weekly_narrative()
        self.assertEqual(result["source"], "template")
        self.assertIn("3 trades", result["summary"])
        self.assertIn("82", result["summary"])
        self.assertIn("Trading without a stop", result["summary"])
        self.assertIn("dangerous success", result["summary"])

    def test_no_trades_yields_honest_empty_state(self) -> None:
        result = _service(trades=0).weekly_narrative()
        self.assertIn("No executed trades", result["summary"])


class TutorTests(unittest.TestCase):
    def test_unconfigured_model_degrades_with_instructions(self) -> None:
        result = _service().tutor("known", "What is ATR?")
        self.assertEqual(result["source"], "unconfigured")
        self.assertIn("Settings", result["error"])

    def test_unknown_lesson_and_empty_question_rejected(self) -> None:
        self.assertEqual(_service().tutor("nope", "Q?")["source"], "error")
        self.assertEqual(_service().tutor("known", "  ")["source"], "error")


if __name__ == "__main__":
    unittest.main()
