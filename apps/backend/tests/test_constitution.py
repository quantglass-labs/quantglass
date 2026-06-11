# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Constitution adoption, ticket enforcement, and compliance reporting (MSN-5)."""

import unittest
from datetime import UTC, datetime

from app.services.constitution import DEFAULT_RULES, ConstitutionService


class _Store:
    def __init__(self, saved=None, intents=None):
        self.saved = saved
        self.intents = intents or []

    def get_constitution(self):
        return self.saved

    def save_constitution(self, rules):
        self.saved = {"rules": rules, "adopted_at": "2026-06-11T00:00:00+00:00"}
        return self.saved

    def list_paper_trade_intents(self):
        return self.intents


def _plan(**overrides):
    base = {"stop": 95.0, "target": 110.0, "riskPercent": 0.5, "reason": "Pullback."}
    base.update(overrides)
    return base


def _today_intent():
    return {"submittedAt": datetime.now(UTC).isoformat()}


class AdoptionTests(unittest.TestCase):
    def test_unadopted_returns_defaults_and_enforces_nothing(self) -> None:
        service = ConstitutionService(_Store())
        state = service.get()
        self.assertFalse(state["adopted"])
        self.assertEqual(state["rules"], DEFAULT_RULES)
        self.assertEqual(service.check_trade(_plan(stop=None, reason=None)), [])

    def test_adopt_clamps_values(self) -> None:
        service = ConstitutionService(_Store())
        result = service.adopt({"max_risk_percent": 50, "daily_max_trades": 0})
        self.assertEqual(result["rules"]["max_risk_percent"], 10.0)
        self.assertEqual(result["rules"]["daily_max_trades"], 1)
        self.assertTrue(service.get()["adopted"])


class EnforcementTests(unittest.TestCase):
    def setUp(self) -> None:
        self.store = _Store()
        self.service = ConstitutionService(self.store)
        self.service.adopt(dict(DEFAULT_RULES))

    def test_clean_plan_passes(self) -> None:
        self.assertEqual(self.service.check_trade(_plan()), [])

    def test_missing_stop_and_reason_blocked(self) -> None:
        violations = self.service.check_trade(_plan(stop=None, reason="  "))
        self.assertEqual(len(violations), 2)

    def test_oversized_risk_blocked(self) -> None:
        violations = self.service.check_trade(_plan(riskPercent=2.5))
        self.assertTrue(any("1.0%" in violation for violation in violations))

    def test_daily_cap_blocks_after_limit(self) -> None:
        self.store.intents = [_today_intent() for _ in range(5)]
        violations = self.service.check_trade(_plan())
        self.assertTrue(any("daily cap" in violation for violation in violations))

    def test_old_trades_do_not_count_toward_daily_cap(self) -> None:
        self.store.intents = [{"submittedAt": "2026-01-01T00:00:00+00:00"} for _ in range(9)]
        self.assertEqual(self.service.check_trade(_plan()), [])


class ComplianceTests(unittest.TestCase):
    def test_compliance_counts_violations_per_rule(self) -> None:
        service = ConstitutionService(_Store())
        service.adopt(dict(DEFAULT_RULES))
        items = [
            {"process_notes": ["No stop was planned — invalidation undefined."]},
            {"process_notes": ["Risk 2.00% exceeds the 1.0% policy."]},
            {"process_notes": []},
        ]
        report = service.compliance(items)
        checks = {check["id"]: check["violations"] for check in report["checks"]}
        self.assertEqual(checks["require_stop"], 1)
        self.assertEqual(checks["max_risk_percent"], 1)
        self.assertEqual(checks["require_reason"], 0)
        self.assertEqual(report["total_trades"], 3)


if __name__ == "__main__":
    unittest.main()
