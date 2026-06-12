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


class NlAlertTests(unittest.TestCase):
    def test_unconfigured_model_degrades_with_manual_path(self) -> None:
        result = _service().parse_alert("alert me when BTC crosses 100k", ["BTCUSD"])
        self.assertFalse(result["ok"])
        self.assertIn("type the condition directly", result["error"])

    def test_model_proposal_validated_by_deterministic_parser(self) -> None:
        class _Gateway:
            def complete(self, settings, prompt, response_schema=None):
                class R:
                    text = '{"symbol": "BTCUSD", "condition": "crosses above 100000"}'
                    source = "test-model"

                return R()

        class _On:
            cloud_enabled = True

        service = AiCoachService(
            ai_settings_provider=lambda: _On(),
            review_coach_service=_ReviewCoach(),
            learn_service=_Learn(),
            model_gateway=_Gateway(),
        )
        result = service.parse_alert("btc over 100k", ["BTCUSD"])
        self.assertTrue(result["ok"])
        self.assertEqual(result["condition"], "crosses above 100000")
        self.assertIn("crosses above 100000", result["preview"])

    def test_invalid_model_proposal_rejected_by_parser(self) -> None:
        class _Gateway:
            def complete(self, settings, prompt, response_schema=None):
                class R:
                    text = '{"symbol": "BTCUSD", "condition": "moons soon"}'
                    source = "test-model"

                return R()

        class _On:
            cloud_enabled = True

        service = AiCoachService(
            ai_settings_provider=lambda: _On(),
            review_coach_service=_ReviewCoach(),
            learn_service=_Learn(),
            model_gateway=_Gateway(),
        )
        result = service.parse_alert("btc to the moon", ["BTCUSD"])
        self.assertFalse(result["ok"])
        self.assertIn("rejected", result["error"])


class DailyBriefTests(unittest.TestCase):
    def test_template_brief_carries_facts(self) -> None:
        facts = {
            "regimes": [{"symbol": "BTC/USD", "timeframe": "1d", "state": "Trending Regime"}],
            "top_signals": [{"symbol": "BTC/USD", "name": "Breakout Retest", "confidence": 62}],
            "risk_warnings": ["Portfolio Heat Elevated"],
        }
        result = _service().daily_brief(facts)
        self.assertEqual(result["source"], "template")
        self.assertIn("Trending Regime", result["summary"])
        self.assertIn("Breakout Retest", result["summary"])
        self.assertIn("Portfolio Heat Elevated", result["summary"])


class PostmortemTests(unittest.TestCase):
    def test_drill_template_carries_scores_and_severity(self) -> None:
        result = _service().postmortem(
            "drill",
            {
                "scores": {"process": 80, "risk": 60, "discipline": 70},
                "severe_violation": True,
            },
        )
        self.assertEqual(result["source"], "template")
        self.assertIn("80", result["summary"])
        self.assertIn("severe", result["summary"])

    def test_trade_template_carries_score_and_classification(self) -> None:
        result = _service().postmortem(
            "trade",
            {
                "process_score": 45,
                "classification": "dangerous_success",
                "process_notes": ["No stop on the plan"],
            },
        )
        self.assertEqual(result["source"], "template")
        self.assertIn("45", result["summary"])
        self.assertIn("dangerous_success", result["summary"])
        self.assertIn("No stop on the plan", result["summary"])

    def test_unknown_kind_rejected(self) -> None:
        self.assertEqual(_service().postmortem("vibes", {})["source"], "error")
