# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Guards for mission/drill/scenario locale overlays.

Mirrors test_lesson_localization: prose is translated when an overlay supplies
it, everything else falls back to English, and no overlay can alter the
structural or scoring fields that grading depends on.
"""

from __future__ import annotations

import copy

from app.services import content_locale as cl


def _missions():
    return (
        {
            "id": "demo-1",
            "title": "Demo One",
            "level": "novice",
            "category": "risk-discipline",
            "description": "English description.",
            "lesson_links": ["intermediate-04-risk-reward"],
            "criteria": [
                {"type": "min_trades", "label": "Execute 5 trades", "value": 5},
                {"type": "all_have_stops", "label": "Every trade has a stop"},
            ],
        },
    )


def test_missions_fall_back_to_english_without_overlay():
    cl._load_overlay.cache_clear()
    base = _missions()
    out = cl.localize_missions(base, "fr")
    assert out == base  # no fr overlay shipped for "demo-1" -> identical English


def test_mission_overlay_translates_prose_only(monkeypatch):
    cl._load_overlay.cache_clear()
    overlay = {
        "demo-1": {
            "id": "demo-1",
            "title": "Démo Un",
            "description": "Description française.",
            "criteria": [{"label": "Exécuter 5 transactions"}, {"label": "Chaque trade a un stop"}],
        }
    }
    monkeypatch.setattr(cl, "_load_overlay", lambda *a, **k: overlay)
    base = _missions()
    base_snapshot = copy.deepcopy(base)
    out = cl.localize_missions(base, "fr")
    m = out[0]
    # prose translated
    assert m["title"] == "Démo Un"
    assert m["description"] == "Description française."
    assert m["criteria"][0]["label"] == "Exécuter 5 transactions"
    # structural + scoring fields untouched
    assert m["level"] == "novice"
    assert m["category"] == "risk-discipline"
    assert m["lesson_links"] == ["intermediate-04-risk-reward"]
    assert m["criteria"][0]["type"] == "min_trades"
    assert m["criteria"][0]["value"] == 5
    # the English base is never mutated
    assert base == base_snapshot


def test_partial_overlay_keeps_missing_fields_english(monkeypatch):
    cl._load_overlay.cache_clear()
    overlay = {"demo-1": {"id": "demo-1", "title": "Démo Un"}}  # description omitted
    monkeypatch.setattr(cl, "_load_overlay", lambda *a, **k: overlay)
    out = cl.localize_missions(_missions(), "fr")
    assert out[0]["title"] == "Démo Un"
    assert out[0]["description"] == "English description."  # falls back


def test_drill_overlay_protects_scores(monkeypatch):
    cl._load_overlay.cache_clear()
    drills = {
        "risk-discipline": {
            "category": "risk-discipline",
            "title": "The Sizing Decision",
            "scenario": "English scenario.",
            "checkpoints": [
                {
                    "question": "How do you size?",
                    "options": [
                        {
                            "id": "formula",
                            "label": "Risk 1%",
                            "process": 10,
                            "risk": 10,
                            "discipline": 8,
                            "feedback": "Correct.",
                        },
                        {
                            "id": "round",
                            "label": "Round number",
                            "process": 2,
                            "risk": 0,
                            "discipline": 2,
                            "feedback": "No.",
                        },
                    ],
                }
            ],
        }
    }
    overlay = {
        "risk-discipline": {
            "category": "risk-discipline",
            "title": "La décision de taille",
            "scenario": "Scénario français.",
            "checkpoints": [
                {
                    "question": "Comment dimensionnez-vous ?",
                    "options": [
                        {"id": "formula", "label": "Risquer 1%", "feedback": "Correct."},
                        {"id": "round", "label": "Nombre rond", "feedback": "Non."},
                    ],
                }
            ],
        }
    }
    monkeypatch.setattr(cl, "_load_overlay", lambda *a, **k: overlay)
    out = cl.localize_drills(drills, "fr")
    cp = out["risk-discipline"]["checkpoints"][0]
    assert out["risk-discipline"]["title"] == "La décision de taille"
    assert cp["question"] == "Comment dimensionnez-vous ?"
    assert cp["options"][0]["label"] == "Risquer 1%"
    # scores are immutable regardless of overlay
    assert cp["options"][0]["process"] == 10
    assert cp["options"][0]["risk"] == 10
    assert cp["options"][1]["discipline"] == 2


def test_scenario_overlay_protects_points(monkeypatch):
    cl._load_overlay.cache_clear()
    scenarios = (
        {
            "id": "demo-scenario",
            "title": "Demo",
            "level": "intermediate",
            "description": "English.",
            "pass_percent": 70,
            "candles": [[1, 2, 3, 4, 5]],
            "checkpoints": [
                {
                    "at_bar": 30,
                    "question": "What now?",
                    "options": [
                        {"id": "chase", "label": "Chase", "points": 0, "debrief": "Bad."},
                        {"id": "plan", "label": "Plan", "points": 10, "debrief": "Good."},
                    ],
                }
            ],
        },
    )
    overlay = {
        "demo-scenario": {
            "id": "demo-scenario",
            "title": "Démo",
            "description": "Français.",
            "checkpoints": [
                {
                    "question": "Et maintenant ?",
                    "options": [
                        {"id": "chase", "label": "Poursuivre", "debrief": "Mauvais."},
                        {"id": "plan", "label": "Planifier", "debrief": "Bien."},
                    ],
                }
            ],
        }
    }
    monkeypatch.setattr(cl, "_load_overlay", lambda *a, **k: overlay)
    out = cl.localize_scenarios(scenarios, "fr")
    s = out[0]
    cp = s["checkpoints"][0]
    assert s["title"] == "Démo"
    assert cp["question"] == "Et maintenant ?"
    assert cp["options"][0]["label"] == "Poursuivre"
    # structural / scoring fields untouched
    assert s["pass_percent"] == 70
    assert s["candles"] == [[1, 2, 3, 4, 5]]
    assert cp["at_bar"] == 30
    assert cp["options"][1]["points"] == 10
