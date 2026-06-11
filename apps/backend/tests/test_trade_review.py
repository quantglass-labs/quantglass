# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Process scoring, first-touch outcome resolution, and the 2x2 classifier."""

import unittest

from app.services.trade_review import TradeReviewService


def _intent(**overrides):
    base = {
        "id": "1",
        "symbol": "BTCUSD",
        "side": "long",
        "status": "executed",
        "entryPrice": 100.0,
        "executedPrice": 100.0,
        "executedAt": "2026-06-10T00:00:00Z",
        "submittedAt": "2026-06-10T00:00:00Z",
        "planStop": 95.0,
        "planTarget": 110.0,
        "planRiskPercent": 1.0,
        "planReason": "Pullback in trending regime.",
        "planEmotion": "calm",
    }
    base.update(overrides)
    return base


def _candle(t, high, low, close):
    return {
        "open_time_utc": t,
        "open": close,
        "high": high,
        "low": low,
        "close": close,
        "volume": 1,
    }


class _Analytics:
    def __init__(self, candles):
        self.candles = candles

    def list_market_series(self, minimum_candles=10):
        return [{"symbol": "BTCUSD", "timeframe": "1h"}]

    def list_market_candles(self, symbol, timeframe, limit=320):
        return {"items": self.candles}


class _Store:
    def __init__(self, intents):
        self.intents = intents

    def list_paper_trade_intents(self):
        return self.intents


def _service(intents, candles):
    return TradeReviewService(_Store(intents), _Analytics(candles))


class ProcessScoreTests(unittest.TestCase):
    def test_full_plan_scores_100(self) -> None:
        service = _service([], [])
        score, notes = service.score_process(_intent())
        self.assertEqual(score, 100)
        self.assertEqual(notes, [])

    def test_missing_stop_and_reason_score_low_with_notes(self) -> None:
        service = _service([], [])
        score, notes = service.score_process(
            _intent(planStop=None, planReason=None, planRiskPercent=None, planEmotion=None)
        )
        self.assertEqual(score, 0)
        self.assertEqual(len(notes), 3)

    def test_oversized_risk_and_tilt_emotion_penalized(self) -> None:
        service = _service([], [])
        score, notes = service.score_process(_intent(planRiskPercent=5.0, planEmotion="fomo"))
        self.assertEqual(score, 65)  # 30+15 stop, 20 reason, 0 risk, 0 emotion
        self.assertTrue(any("fomo" in n for n in notes))

    def test_wrong_side_stop_flagged(self) -> None:
        service = _service([], [])
        score, notes = service.score_process(_intent(planStop=105.0))
        self.assertTrue(any("wrong side" in n for n in notes))
        self.assertEqual(score, 85)


class OutcomeTests(unittest.TestCase):
    def test_stop_hit_resolves_minus_one_r(self) -> None:
        candles = [_candle("2026-06-10T01:00:00Z", 101, 94, 96)]
        service = _service([], candles)
        outcome = service.resolve_outcome(_intent())
        self.assertEqual(outcome, {"status": "stopped", "r": -1.0})

    def test_target_hit_resolves_positive_r(self) -> None:
        candles = [_candle("2026-06-10T01:00:00Z", 111, 99, 110)]
        service = _service([], candles)
        outcome = service.resolve_outcome(_intent())
        self.assertEqual(outcome["status"], "target")
        self.assertAlmostEqual(outcome["r"], 2.0)  # (110-100)/(100-95)

    def test_ambiguous_bar_takes_the_stop(self) -> None:
        candles = [_candle("2026-06-10T01:00:00Z", 112, 94, 100)]
        service = _service([], candles)
        outcome = service.resolve_outcome(_intent())
        self.assertEqual(outcome["status"], "stopped")

    def test_unresolved_marks_to_market(self) -> None:
        candles = [_candle("2026-06-10T01:00:00Z", 103, 99, 102.5)]
        service = _service([], candles)
        outcome = service.resolve_outcome(_intent())
        self.assertEqual(outcome["status"], "open")
        self.assertAlmostEqual(outcome["r"], 0.5)

    def test_no_stop_is_unscored(self) -> None:
        service = _service([], [_candle("2026-06-10T01:00:00Z", 103, 99, 102)])
        outcome = service.resolve_outcome(_intent(planStop=None))
        self.assertEqual(outcome["status"], "unscored")


class ClassifierTests(unittest.TestCase):
    def test_dangerous_success_detected(self) -> None:
        # No stop... must still resolve: use stop present but bad process via
        # oversized risk + tilt + no reason -> score < 70, then target hits.
        intent = _intent(planRiskPercent=5.0, planEmotion="fomo", planReason=None)
        candles = [_candle("2026-06-10T01:00:00Z", 111, 99, 110)]
        review = _service([intent], candles).review()
        item = review["items"][0]
        self.assertLess(item["process_score"], 70)
        self.assertGreater(item["outcome_r"], 0)
        self.assertEqual(item["classification"], "dangerous_success")
        self.assertEqual(review["summary"]["dangerous_success_count"], 1)

    def test_well_played_loss(self) -> None:
        candles = [_candle("2026-06-10T01:00:00Z", 101, 94, 96)]
        review = _service([_intent()], candles).review()
        self.assertEqual(review["items"][0]["classification"], "well_played_loss")

    def test_open_trades_not_classified(self) -> None:
        candles = [_candle("2026-06-10T01:00:00Z", 103, 99, 102)]
        review = _service([_intent()], candles).review()
        self.assertIsNone(review["items"][0]["classification"])
        self.assertEqual(review["summary"]["trades"], 1)

    def test_summary_average(self) -> None:
        review = _service([_intent(), _intent(id="2", planReason=None)], []).review()
        self.assertEqual(review["summary"]["average_process_score"], 90)  # (100+80)/2


if __name__ == "__main__":
    unittest.main()
