# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Backtest workbench: stress, Monte Carlo, gates, fingerprint, AI review."""

import unittest

from app.services.research_review import ResearchReviewService, deterministic_verdict
from app.services.signal_engine.workbench import (
    bias_gates,
    experiment_fingerprint,
    monte_carlo_drawdowns,
    stress_table,
)


def _backtest(**overrides):
    base = {
        "win_rate": 0.55,
        "expectancy": 0.4,
        "trade_count": 60,
        "in_sample_expectancy": 0.5,
        "out_of_sample_expectancy": 0.35,
        "out_of_sample_trade_count": 25,
        "out_of_sample_validated": True,
        "max_drawdown": -3.2,
        "profit_factor": 1.6,
        "out_of_sample_outcomes": [0.5, -1.0] * 10,
    }
    base.update(overrides)
    return base


class _Settings:
    cloud_enabled = False


class WorkbenchTests(unittest.TestCase):
    def test_stress_table_reruns_with_worse_costs(self) -> None:
        calls = []

        def rerun(fees, slip):
            calls.append((fees, slip))
            return _backtest(expectancy=0.2)

        rows = stress_table(rerun, 0.1, 0.05, _backtest())
        self.assertEqual([r["scenario"] for r in rows][0], "Base costs")
        self.assertEqual(len(rows), 4)
        self.assertIn((0.1, 0.1), calls)  # slippage x2
        self.assertIn((0.2, 0.1), calls)  # fees + slippage x2

    def test_monte_carlo_deterministic_and_honest_below_sample(self) -> None:
        thin = monte_carlo_drawdowns([0.5, -1.0])
        self.assertFalse(thin["available"])
        full_a = monte_carlo_drawdowns([0.5, -1.0] * 10)
        full_b = monte_carlo_drawdowns([0.5, -1.0] * 10)
        self.assertTrue(full_a["available"])
        self.assertEqual(full_a["p95_max_drawdown_r"], full_b["p95_max_drawdown_r"])
        self.assertLess(full_a["p95_max_drawdown_r"], full_a["median_max_drawdown_r"])
        self.assertIn("caveat", full_a)

    def test_bias_gates_reflect_run_facts(self) -> None:
        gates = {g["id"]: g for g in bias_gates(_backtest(), 20, 0.1, 0.05, True)}
        self.assertEqual(gates["costs"]["status"], "pass")
        self.assertEqual(gates["sample"]["status"], "pass")
        self.assertEqual(gates["oos"]["status"], "pass")
        free = {g["id"]: g for g in bias_gates(_backtest(trade_count=5), 20, 0.0, 0.0, False)}
        self.assertEqual(free["costs"]["status"], "fail")
        self.assertEqual(free["sample"]["status"], "warn")
        self.assertEqual(free["walk_forward"]["status"], "warn")

    def test_fingerprint_is_stable_and_changes_with_inputs(self) -> None:
        a = experiment_fingerprint("BTC", "1d", "x", "long", 0.1, 0.05, 70, "t0", "t1")
        b = experiment_fingerprint("BTC", "1d", "x", "long", 0.1, 0.05, 70, "t0", "t1")
        c = experiment_fingerprint("BTC", "4h", "x", "long", 0.1, 0.05, 70, "t0", "t1")
        self.assertEqual(a["experiment_id"], b["experiment_id"])
        self.assertNotEqual(a["experiment_id"], c["experiment_id"])


class VerdictTests(unittest.TestCase):
    def test_clean_run_is_paper_candidate(self) -> None:
        gates = bias_gates(_backtest(), 20, 0.1, 0.05, True)
        verdict = deterministic_verdict(_backtest(), gates, {})
        self.assertEqual(verdict["verdict"], "Paper candidate")
        self.assertIn("Low-moderate", verdict["overfit_risk"])

    def test_vanished_oos_edge_is_not_approved_and_high_overfit(self) -> None:
        run = _backtest(out_of_sample_expectancy=-0.1, out_of_sample_validated=False)
        gates = bias_gates(run, 20, 0.1, 0.05, True)
        verdict = deterministic_verdict(run, gates, {})
        self.assertEqual(verdict["verdict"], "Not approved")
        self.assertIn("High", verdict["overfit_risk"])

    def test_review_template_carries_verdict_without_model(self) -> None:
        service = ResearchReviewService(ai_settings_provider=lambda: _Settings())
        gates = bias_gates(_backtest(), 20, 0.1, 0.05, True)
        mc = monte_carlo_drawdowns([0.5, -1.0] * 10)
        stress = stress_table(lambda f, s: _backtest(), 0.1, 0.05, _backtest())
        review = service.review(_backtest(), gates, mc, stress)
        self.assertEqual(review["source"], "template")
        self.assertIn("Paper candidate", review["summary"])
        self.assertIn("Next action", review["summary"])
        self.assertIn("paper trading is the supported path", review["live_readiness"])


if __name__ == "__main__":
    unittest.main()
