# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Mission catalog integrity, new criteria types, and community packs."""

import json
import unittest
from datetime import UTC, datetime
from pathlib import Path

from app.services.mission_pack_registry import (
    MissionPackDefinition,
    MissionPackRegistry,
    validate_mission_pack,
)
from app.services.missions import CRITERIA_TYPES, MissionService, _load_missions

_CONTENT = Path(__file__).resolve().parent.parent / "app" / "content"


class _Review:
    def __init__(self, items=None):
        self.items = items or []

    def review(self):
        return {"items": self.items, "summary": {}}


class _Store:
    def __init__(self):
        self.completed = {}
        self.journal = {}
        self.scenarios = {}
        self.progress = {}
        self.assessments = {}
        self.activity = []
        self.cards = {}
        self.constitution = None

    def get_completed_missions(self):
        return self.completed

    def record_mission_complete(self, mission_id):
        self.completed[mission_id] = "now"

    def get_journal_notes(self):
        return self.journal

    def get_scenario_results(self):
        return self.scenarios

    def get_learn_progress(self):
        return self.progress

    def get_assessments(self):
        return self.assessments

    def get_activity_days(self):
        return self.activity

    def get_review_cards(self):
        return self.cards

    def get_constitution(self):
        return self.constitution

    def get_active_missions(self):
        return dict(getattr(self, "active", {}))

    def set_mission_active(self, mission_id):
        if not hasattr(self, "active"):
            self.active = {}
        self.active[mission_id] = "now"

    def clear_mission_active(self, mission_id):
        getattr(self, "active", {}).pop(mission_id, None)

    def get_drill_results(self):
        return dict(getattr(self, "drills", {}))

    def record_drill_result(self, category, percent, passed):
        if not hasattr(self, "drills"):
            self.drills = {}
        best = self.drills.get(category)
        if best is None or percent > best["best_percent"]:
            self.drills[category] = {"best_percent": percent, "passed": passed}


def _item(**overrides):
    base = {
        "id": "1",
        "symbol": "BTCUSD",
        "side": "long",
        "submittedAt": datetime.now(UTC).isoformat(),
        "planReason": "Pullback",
        "planEmotion": "calm",
        "process_score": 100,
        "process_notes": [],
        "outcome_status": "target",
        "outcome_r": 2.0,
        "classification": "earned_win",
    }
    base.update(overrides)
    return base


class CatalogIntegrityTests(unittest.TestCase):
    def test_catalog_has_100_plus_missions_for_every_level(self) -> None:
        missions = _load_missions()
        self.assertGreaterEqual(len(missions), 100)
        levels = {mission["level"] for mission in missions}
        self.assertEqual(levels, {"novice", "intermediate", "advanced", "expert"})
        for level in levels:
            count = sum(1 for mission in missions if mission["level"] == level)
            self.assertGreaterEqual(count, 15, f"{level} needs a real ladder of missions")

    def test_every_mission_is_well_formed(self) -> None:
        lesson_ids = set()
        for tier in ("novice", "intermediate", "advanced", "expert"):
            with open(_CONTENT / "lessons" / f"{tier}.json", encoding="utf-8") as handle:
                lesson_ids.update(lesson["id"] for lesson in json.load(handle))
        with open(_CONTENT / "scenarios" / "scenarios.json", encoding="utf-8") as handle:
            scenario_ids = {scenario["id"] for scenario in json.load(handle)}

        ids = set()
        for mission in _load_missions():
            self.assertNotIn(mission["id"], ids, "duplicate mission id")
            ids.add(mission["id"])
            self.assertTrue(mission["title"] and mission["description"])
            self.assertTrue(mission.get("category"))
            self.assertTrue(mission["criteria"])
            for criterion in mission["criteria"]:
                self.assertIn(criterion["type"], CRITERIA_TYPES, mission["id"])
                self.assertTrue(criterion["label"], mission["id"])
                if criterion["type"] == "scenario_passed":
                    self.assertIn(criterion["scenario_id"], scenario_ids, mission["id"])
            for lesson_id in mission.get("lesson_links", []):
                self.assertIn(lesson_id, lesson_ids, mission["id"])

    def test_ladder_gate_ids_still_exist(self) -> None:
        ids = {mission["id"] for mission in _load_missions()}
        self.assertTrue({"risk-discipline", "accept-the-planned-loss", "the-operator"} <= ids)


class NewCriteriaTests(unittest.TestCase):
    def _evaluate(self, criterion, items=None, store=None):
        service = MissionService(store or _Store(), _Review(items or []))
        return service._evaluate(criterion, service._build_context())

    def test_min_process_average(self) -> None:
        items = [_item(process_score=80), _item(id="2", process_score=60)]
        result = self._evaluate({"type": "min_process_average", "label": "avg", "value": 70}, items)
        self.assertTrue(result["met"])
        self.assertEqual(result["current"], 70)

    def test_max_daily_trades_uses_worst_day(self) -> None:
        items = [_item(id=str(n)) for n in range(4)]
        result = self._evaluate({"type": "max_daily_trades", "label": "cap", "value": 3}, items)
        self.assertFalse(result["met"])
        self.assertEqual(result["current"], 4)

    def test_symbol_diversity_and_reasons_and_emotions(self) -> None:
        items = [
            _item(id="1", symbol="A"),
            _item(id="2", symbol="B", planReason=None, planEmotion=None),
        ]
        diversity = self._evaluate(
            {"type": "min_symbol_diversity", "label": "d", "value": 2}, items
        )
        reasons = self._evaluate(
            {"type": "min_trades_with_reason", "label": "r", "value": 2}, items
        )
        emotions = self._evaluate({"type": "min_emotions_logged", "label": "e", "value": 1}, items)
        self.assertTrue(diversity["met"])
        self.assertFalse(reasons["met"])
        self.assertTrue(emotions["met"])

    def test_journal_scenario_learn_constitution_criteria(self) -> None:
        store = _Store()
        store.journal = {"1": {"note": "good", "tags": []}}
        store.scenarios = {"the-gap-down": {"passed": True}}
        store.progress = {"l1": {"completed_at": "x"}}
        store.assessments = {"novice": {"passed": True}}
        store.cards = {"atr": {"reps": 5}}
        store.constitution = {"rules": {}, "adopted_at": "x"}
        items = [_item()]

        checks = [
            ({"type": "min_journaled", "label": "j", "value": 1}, True),
            ({"type": "scenario_passed", "label": "s", "scenario_id": "the-gap-down"}, True),
            ({"type": "min_scenarios_passed", "label": "sp", "value": 2}, False),
            ({"type": "min_lessons_completed", "label": "l", "value": 1}, True),
            ({"type": "assessment_passed", "label": "a", "level": "novice"}, True),
            ({"type": "assessment_passed", "label": "a2", "level": "expert"}, False),
            ({"type": "min_review_reps", "label": "rr", "value": 5}, True),
            ({"type": "constitution_adopted", "label": "c"}, True),
        ]
        for criterion, expected in checks:
            result = self._evaluate(criterion, items, store)
            self.assertEqual(result["met"], expected, criterion["type"])

    def test_min_planned_losses_and_zero_tilt(self) -> None:
        items = [
            _item(id="1", outcome_status="stopped"),
            _item(id="2", process_notes=["Entered while 'fomo' — the tilt states ..."]),
        ]
        losses = self._evaluate(
            {"type": "min_planned_losses_taken", "label": "pl", "value": 1}, items
        )
        tilt = self._evaluate({"type": "zero_tilt_entries", "label": "t"}, items)
        self.assertTrue(losses["met"])
        self.assertFalse(tilt["met"])


class MissionPackTests(unittest.TestCase):
    def _pack(self, **overrides):
        base = {
            "id": "community-test",
            "title": "Test Pack",
            "description": "x",
            "missions": (
                {
                    "id": "starter",
                    "title": "Starter",
                    "level": "novice",
                    "description": "Do a thing.",
                    "criteria": [{"type": "min_trades", "label": "Execute 1 trade", "value": 1}],
                },
            ),
        }
        base.update(overrides)
        return MissionPackDefinition(**base)

    def test_valid_pack_registers_with_namespaced_ids(self) -> None:
        registry = MissionPackRegistry()
        self.assertEqual(registry.register(self._pack()), [])
        missions = registry.all_missions()
        self.assertEqual(missions[0]["id"], "community-test-starter")
        self.assertEqual(missions[0]["source"], "community")

    def test_unknown_criterion_type_rejected(self) -> None:
        bad = self._pack(
            missions=(
                {
                    "id": "evil",
                    "title": "Evil",
                    "level": "novice",
                    "description": "x",
                    "criteria": [{"type": "run_code", "label": "nope"}],
                },
            )
        )
        problems = validate_mission_pack(bad)
        self.assertTrue(any("unknown criterion type" in problem for problem in problems))

    def test_out_of_bounds_value_rejected(self) -> None:
        bad = self._pack(
            missions=(
                {
                    "id": "huge",
                    "title": "Huge",
                    "level": "novice",
                    "description": "x",
                    "criteria": [{"type": "min_trades", "label": "x", "value": 99_999_999}],
                },
            )
        )
        problems = validate_mission_pack(bad)
        self.assertTrue(any("0..10000" in problem for problem in problems))

    def test_pack_missions_evaluate_through_the_engine(self) -> None:
        registry = MissionPackRegistry()
        registry.register(self._pack())
        store = _Store()
        service = MissionService(store, _Review([_item()]), registry)
        listing = service.list_missions()
        pack_mission = next(
            mission for mission in listing["items"] if mission["id"] == "community-test-starter"
        )
        self.assertTrue(pack_mission["completed"])
        self.assertEqual(pack_mission["source"], "community")


class ActiveMissionTests(unittest.TestCase):
    def test_accept_caps_at_three_and_abandon_frees_a_slot(self) -> None:
        store = _Store()
        service = MissionService(store, _Review([]))
        ids = [m["id"] for m in _load_missions()[:4]]
        for mission_id in ids[:3]:
            self.assertTrue(service.accept(mission_id)["ok"])
        fourth = service.accept(ids[3])
        self.assertFalse(fourth["ok"])
        self.assertIn("active missions", fourth["error"])
        service.abandon(ids[0])
        self.assertTrue(service.accept(ids[3])["ok"])

    def test_unknown_and_completed_missions_cannot_be_accepted(self) -> None:
        store = _Store()
        store.completed = {"first-steps-lesson": "x"}
        service = MissionService(store, _Review([]))
        self.assertFalse(service.accept("nope")["ok"])
        self.assertFalse(service.accept("first-steps-lesson")["ok"])

    def test_completion_auto_clears_the_active_slot(self) -> None:
        store = _Store()
        store.progress = {"l1": {"completed_at": "x"}}
        store.record_drill_result("academy-scholar", 90, True)
        service = MissionService(store, _Review([]))
        service.accept("first-steps-lesson")
        listing = service.list_missions()
        mission = next(m for m in listing["items"] if m["id"] == "first-steps-lesson")
        self.assertTrue(mission["completed"])
        self.assertFalse(mission["active"])
        self.assertEqual(store.get_active_missions(), {})

    def test_criteria_carry_action_hints(self) -> None:
        service = MissionService(_Store(), _Review([]))
        listing = service.list_missions()
        mission = next(m for m in listing["items"] if m["id"] == "first-steps-trade")
        actions = [c["action"] for c in mission["criteria"]]
        self.assertTrue(all(a and a["route"] and a["cta"] for a in actions))
        self.assertEqual(listing["max_active"], 3)


class DecisionDrillTests(unittest.TestCase):
    def test_every_category_has_a_drill_and_no_answer_leak(self) -> None:
        from app.services.missions import _load_drills

        categories = {m.get("category") for m in _load_missions()}
        drills = _load_drills()
        self.assertEqual(categories, set(drills))
        service = MissionService(_Store(), _Review([]))
        payload = service.get_drill("risk-discipline")
        for checkpoint in payload["checkpoints"]:
            for option in checkpoint["options"]:
                self.assertEqual(set(option), {"id", "label"})

    def test_perfect_run_passes_and_persists(self) -> None:
        from app.services.missions import _load_drills

        drill = _load_drills()["risk-discipline"]
        answers = {
            str(i): max(c["options"], key=lambda o: o["process"])["id"]
            for i, c in enumerate(drill["checkpoints"])
        }
        store = _Store()
        service = MissionService(store, _Review([]))
        result = service.grade_drill("risk-discipline", answers)
        self.assertTrue(result["passed"])
        self.assertEqual(result["scores"]["process"], 100)
        self.assertFalse(result["severe_violation"])
        self.assertTrue(store.get_drill_results()["risk-discipline"]["passed"])

    def test_severe_choice_fails_even_with_high_score(self) -> None:
        from app.services.missions import _load_drills

        drill = _load_drills()["constitution"]
        answers = {}
        for i, checkpoint in enumerate(drill["checkpoints"]):
            severe = next((o for o in checkpoint["options"] if o.get("severe")), None)
            best = max(checkpoint["options"], key=lambda o: o["process"])
            answers[str(i)] = severe["id"] if i == 0 and severe else best["id"]
        result = MissionService(_Store(), _Review([])).grade_drill("constitution", answers)
        self.assertTrue(result["severe_violation"])
        self.assertFalse(result["passed"])
        self.assertIn("dangerous habit", result["officer_note"])

    def test_drill_criterion_gates_builtin_missions(self) -> None:
        store = _Store()
        service = MissionService(store, _Review([]))
        listing = service.list_missions()
        mission = next(m for m in listing["items"] if m["id"] == "first-steps-lesson")
        drill_criterion = mission["criteria"][0]
        self.assertIn("decision drill", drill_criterion["label"])
        self.assertFalse(drill_criterion["met"])
        store.record_drill_result("academy-scholar", 90, True)
        listing = service.list_missions()
        mission = next(m for m in listing["items"] if m["id"] == "first-steps-lesson")
        self.assertTrue(mission["criteria"][0]["met"])


if __name__ == "__main__":
    unittest.main()
