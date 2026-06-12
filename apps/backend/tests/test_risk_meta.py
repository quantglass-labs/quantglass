# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Portfolio/risk meta-signals (SIG-5): brakes from the user's own account."""

import unittest

from app.services.constitution import ConstitutionService
from app.services.risk_meta import RiskMetaService


def _position(symbol="BTCUSD", side="long", qty=1.0, price=10000.0, pnl=0.0):
    return {"symbolId": symbol, "side": side, "quantity": qty, "averagePrice": price, "pnl": pnl}


class _Store:
    def __init__(self):
        self.account = {"balance": 100000.0, "openPositions": []}
        self.constitution = None
        self.intents = []

    def get_paper_account(self):
        return self.account

    def get_constitution(self):
        return self.constitution

    def save_constitution(self, rules):
        self.constitution = {"rules": rules, "adopted_at": "x"}
        return self.constitution

    def list_paper_trade_intents(self):
        return self.intents


class _Review:
    def __init__(self, items=None):
        self.items = items or []

    def review(self):
        return {"items": self.items, "summary": {}}


def _service(store=None, review=None):
    store = store or _Store()
    return RiskMetaService(store, review or _Review(), ConstitutionService(store))


class RiskMetaTests(unittest.TestCase):
    def test_quiet_account_emits_nothing(self) -> None:
        self.assertEqual(_service().list_risk_signals(), [])

    def test_heat_concentration_and_cluster(self) -> None:
        store = _Store()
        store.account["openPositions"] = [
            _position("A", qty=2.0),
            _position("B"),
            _position("C"),
        ]
        names = {item["display_name"] for item in _service(store).list_risk_signals()}
        self.assertIn("Portfolio Heat Elevated", names)
        self.assertIn("Exposure Concentration Warning", names)
        self.assertIn("Correlated Long Cluster", names)

    def test_drawdown_escalation(self) -> None:
        store = _Store()
        store.account["openPositions"] = [_position(pnl=-6000.0)]
        names = {item["display_name"] for item in _service(store).list_risk_signals()}
        self.assertIn("Drawdown Escalation", names)

    def test_kill_switch_on_degraded_process(self) -> None:
        review = _Review([{"process_score": 30} for _ in range(5)])
        items = _service(review=review).list_risk_signals()
        self.assertIn("Kill Switch: Process Degradation", {i["display_name"] for i in items})
        self.assertTrue(all(i["signal_class"] == "risk" for i in items))


if __name__ == "__main__":
    unittest.main()
