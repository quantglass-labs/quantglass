# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""CI guard for *shipped* mission/drill/scenario locale overlays.

Whereas test_mission_localization exercises the merge logic on synthetic data,
this validates every real overlay file checked into the repo: ids must exist in
the English base, list lengths must match (so positional prose alignment is
sound), option ids must line up, and no overlay may carry a structural or
scoring field. Runs across whatever locales are present, so each new language
is protected automatically.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

_CONTENT = Path(__file__).resolve().parent.parent / "app" / "content"
_MISSIONS = _CONTENT / "missions"
_SCENARIOS = _CONTENT / "scenarios"

_FORBIDDEN_MISSION_KEYS = {"level", "category", "lesson_links", "source"}
_FORBIDDEN_CRITERION_KEYS = {"type", "value"}
_FORBIDDEN_OPTION_KEYS = {"points", "process", "risk", "discipline"}


def _base(path: Path, key: str) -> dict:
    return {e[key]: e for e in json.load(open(path, encoding="utf-8"))}


def _mission_locales() -> list[str]:
    return sorted(p.name for p in _MISSIONS.iterdir() if p.is_dir())


def _scenario_locales() -> list[str]:
    return sorted(p.name for p in _SCENARIOS.iterdir() if p.is_dir())


@pytest.mark.parametrize("locale", _mission_locales())
def test_mission_overlays_align_with_base(locale: str):
    base = _base(_MISSIONS / "missions.json", "id")
    path = _MISSIONS / locale / "missions.json"
    if not path.exists():
        pytest.skip(f"no missions overlay for {locale}")
    for entry in json.load(open(path, encoding="utf-8")):
        mid = entry["id"]
        assert mid in base, f"{locale}: unknown mission id {mid}"
        assert not (_FORBIDDEN_MISSION_KEYS & entry.keys()), (
            f"{locale}/{mid}: structural key in overlay"
        )
        if "criteria" in entry:
            assert len(entry["criteria"]) == len(base[mid].get("criteria", [])), (
                f"{locale}/{mid}: criteria count drift"
            )
            for crit in entry["criteria"]:
                assert not (_FORBIDDEN_CRITERION_KEYS & crit.keys()), (
                    f"{locale}/{mid}: scoring key in criterion"
                )


@pytest.mark.parametrize("locale", _mission_locales())
def test_drill_overlays_align_with_base(locale: str):
    base = _base(_MISSIONS / "drills.json", "category")
    path = _MISSIONS / locale / "drills.json"
    if not path.exists():
        pytest.skip(f"no drills overlay for {locale}")
    for entry in json.load(open(path, encoding="utf-8")):
        cat = entry["category"]
        assert cat in base, f"{locale}: unknown drill category {cat}"
        for i, cp in enumerate(entry.get("checkpoints", [])):
            base_cps = base[cat]["checkpoints"]
            assert i < len(base_cps), f"{locale}/{cat}: extra checkpoint {i}"
            base_ids = {o["id"] for o in base_cps[i]["options"]}
            for opt in cp.get("options", []):
                assert opt["id"] in base_ids, f"{locale}/{cat}: unknown option id {opt['id']}"
                assert not (_FORBIDDEN_OPTION_KEYS & opt.keys()), (
                    f"{locale}/{cat}: scoring key in option"
                )


@pytest.mark.parametrize("locale", _scenario_locales())
def test_scenario_overlays_align_with_base(locale: str):
    base = _base(_SCENARIOS / "scenarios.json", "id")
    path = _SCENARIOS / locale / "scenarios.json"
    if not path.exists():
        pytest.skip(f"no scenarios overlay for {locale}")
    for entry in json.load(open(path, encoding="utf-8")):
        sid = entry["id"]
        assert sid in base, f"{locale}: unknown scenario id {sid}"
        assert "candles" not in entry and "pass_percent" not in entry, (
            f"{locale}/{sid}: structural key in overlay"
        )
        for i, cp in enumerate(entry.get("checkpoints", [])):
            base_cps = base[sid]["checkpoints"]
            assert i < len(base_cps), f"{locale}/{sid}: extra checkpoint {i}"
            base_ids = {o["id"] for o in base_cps[i]["options"]}
            for opt in cp.get("options", []):
                assert opt["id"] in base_ids, f"{locale}/{sid}: unknown option id {opt['id']}"
                assert "points" not in opt, f"{locale}/{sid}: points in overlay option"
