# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""QuantGlass Copilot (AI2-5): tool routing, covenant guards, template answers."""

import unittest

from app.services.copilot import CopilotService

DESCRIPTIONS = {
    "list_signals": "List signals.",
    "get_paper_account": "Paper account.",
    "list_paper_closures": "Closed trades.",
}


def _tools(calls: list[str] | None = None) -> dict:
    log = calls if calls is not None else []

    def make(name, payload):
        def call():
            log.append(name)
            return payload

        return call

    return {
        "list_signals": make(
            "list_signals", {"items": [{"symbol_id": "BTCUSD", "display_name": "Breakout"}]}
        ),
        "get_paper_account": make(
            "get_paper_account",
            {
                "balance": 100000.0,
                "buyingPower": 95000.0,
                "realizedPnl": 250.0,
                "openPositions": [],
            },
        ),
        "list_paper_closures": make(
            "list_paper_closures", {"items": [{"pnl": 12.5}, {"pnl": -2.5}]}
        ),
    }


class _Off:
    cloud_enabled = False


class _On:
    cloud_enabled = True


class _ScriptedGateway:
    def __init__(self, responses: list[str | None]) -> None:
        self._responses = list(responses)
        self.prompts: list[str] = []

    def complete(self, settings, prompt, response_schema=None):
        self.prompts.append(prompt)
        text = self._responses.pop(0)
        if text is None:
            return None

        class R:
            pass

        result = R()
        result.text = text
        result.source = "test-model"
        return result


class TemplatePathTests(unittest.TestCase):
    def test_keyword_routing_and_template_answer_without_model(self) -> None:
        service = CopilotService(ai_settings_provider=lambda: _Off())
        calls: list[str] = []
        result = service.ask("How is my account balance?", _tools(calls), DESCRIPTIONS)
        self.assertEqual(result["source"], "template")
        self.assertEqual(result["toolsUsed"], ["get_paper_account"])
        self.assertIn("100000", result["answer"])
        self.assertEqual(calls, ["get_paper_account"])

    def test_unroutable_question_falls_back_to_default_tools(self) -> None:
        service = CopilotService(ai_settings_provider=lambda: _Off())
        result = service.ask("hello there", _tools(), DESCRIPTIONS)
        self.assertEqual(result["toolsUsed"], ["list_signals", "get_paper_account"])

    def test_empty_and_oversized_questions_rejected(self) -> None:
        service = CopilotService(ai_settings_provider=lambda: _Off())
        self.assertEqual(service.ask("  ", _tools(), DESCRIPTIONS)["source"], "error")
        self.assertEqual(service.ask("x" * 501, _tools(), DESCRIPTIONS)["source"], "error")


class ModelPathTests(unittest.TestCase):
    def test_model_selects_tools_and_narrates_within_fact_guard(self) -> None:
        gateway = _ScriptedGateway(
            [
                '{"tools": ["list_paper_closures"]}',
                '{"answer": "You closed 2 trades; the larger win was 12.5."}',
            ]
        )
        service = CopilotService(ai_settings_provider=lambda: _On(), model_gateway=gateway)
        result = service.ask("how did my closed trades go?", _tools(), DESCRIPTIONS)
        self.assertEqual(result["source"], "test-model")
        self.assertEqual(result["toolsUsed"], ["list_paper_closures"])
        self.assertIn("12.5", result["answer"])

    def test_invented_numbers_are_guarded_back_to_template(self) -> None:
        gateway = _ScriptedGateway(
            [
                '{"tools": ["list_paper_closures"]}',
                '{"answer": "Your closures made 999999 of profit."}',
            ]
        )
        service = CopilotService(ai_settings_provider=lambda: _On(), model_gateway=gateway)
        result = service.ask("how did my closed trades go?", _tools(), DESCRIPTIONS)
        self.assertEqual(result["source"], "template-guarded")
        self.assertNotIn("999999", result["answer"])

    def test_unknown_tool_proposals_are_disposed_by_the_engine(self) -> None:
        gateway = _ScriptedGateway(
            [
                '{"tools": ["submit_order", "delete_everything"]}',
                '{"answer": "Balance is 100000.0 with 95000.0 buying power."}',
            ]
        )
        service = CopilotService(ai_settings_provider=lambda: _On(), model_gateway=gateway)
        calls: list[str] = []
        result = service.ask("what is my account balance?", _tools(calls), DESCRIPTIONS)
        self.assertEqual(result["toolsUsed"], ["get_paper_account"])
        self.assertNotIn("submit_order", calls)


if __name__ == "__main__":
    unittest.main()
