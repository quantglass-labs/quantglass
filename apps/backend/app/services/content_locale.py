# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Locale overlays for mission-engine content (missions, drills, scenarios).

Mirrors the lesson-localization design in ``learn_service``: an English base is
the source of truth, and per-locale overlay files supply *only* translated
prose. Everything structural — ids, categories, levels, lesson links, criterion
types/values, checkpoint anchors, option ids, and every numeric score (points,
process/risk/discipline) — is taken from the English base and can never be
altered by an overlay, so a malformed or partial translation can never change
how a mission grades or a drill scores.

Overlay files live beside the English content:

* ``content/missions/<locale>/missions.json``   (keyed by ``id``)
* ``content/missions/<locale>/drills.json``      (keyed by ``category``)
* ``content/scenarios/<locale>/scenarios.json``  (keyed by ``id``)

Each is a JSON list of partial objects carrying the key field plus whichever
prose fields have been translated. Missing files, missing entries, or missing
fields all fall back to English, so a locale can be filled in incrementally.
"""

from __future__ import annotations

import copy
import json
from functools import cache
from pathlib import Path
from typing import Any

from app.services.locale import DEFAULT_LOCALE

_MISSIONS_DIR = Path(__file__).resolve().parent.parent / "content" / "missions"
_SCENARIOS_DIR = Path(__file__).resolve().parent.parent / "content" / "scenarios"


@cache
def _load_overlay(
    directory: Path, filename: str, locale: str, key: str
) -> dict[str, dict[str, Any]]:
    """Map ``key`` -> partial translated object for ``locale`` (empty if none)."""
    if locale == DEFAULT_LOCALE:
        return {}
    path = directory / locale / filename
    if not path.exists():
        return {}
    with open(path, encoding="utf-8") as handle:
        entries = json.load(handle)
    return {e[key]: e for e in entries if isinstance(e, dict) and key in e}


def _set_if_str(target: dict[str, Any], source: dict[str, Any], field: str) -> None:
    value = source.get(field)
    if isinstance(value, str) and value:
        target[field] = value


def _merge_options(base_opts: list[dict[str, Any]], ovl_opts: Any, *prose: str) -> None:
    """Overlay option prose, matched by option ``id``; scores/ids untouched."""
    if not isinstance(ovl_opts, list):
        return
    by_id = {o.get("id"): o for o in ovl_opts if isinstance(o, dict)}
    for opt in base_opts:
        ovl = by_id.get(opt.get("id"))
        if isinstance(ovl, dict):
            for field in prose:
                _set_if_str(opt, ovl, field)


def _merge_checkpoints(
    base_cps: list[dict[str, Any]], ovl_cps: Any, option_prose: tuple[str, ...]
) -> None:
    """Overlay checkpoint question + option prose, matched positionally."""
    if not isinstance(ovl_cps, list):
        return
    for base_cp, ovl_cp in zip(base_cps, ovl_cps):
        if not isinstance(ovl_cp, dict):
            continue
        _set_if_str(base_cp, ovl_cp, "question")
        if isinstance(base_cp.get("options"), list):
            _merge_options(base_cp["options"], ovl_cp.get("options"), *option_prose)


def localize_missions(
    missions: tuple[dict[str, Any], ...], locale: str
) -> tuple[dict[str, Any], ...]:
    overlay = _load_overlay(_MISSIONS_DIR, "missions.json", locale, "id")
    if not overlay:
        return missions
    out: list[dict[str, Any]] = []
    for mission in missions:
        ovl = overlay.get(mission.get("id"))
        if not ovl:
            out.append(mission)
            continue
        m = copy.deepcopy(mission)
        _set_if_str(m, ovl, "title")
        _set_if_str(m, ovl, "description")
        ovl_criteria = ovl.get("criteria")
        if isinstance(ovl_criteria, list) and isinstance(m.get("criteria"), list):
            for base_c, ovl_c in zip(m["criteria"], ovl_criteria):
                if isinstance(ovl_c, dict):
                    _set_if_str(base_c, ovl_c, "label")
        out.append(m)
    return tuple(out)


def localize_drills(drills: dict[str, dict[str, Any]], locale: str) -> dict[str, dict[str, Any]]:
    overlay = _load_overlay(_MISSIONS_DIR, "drills.json", locale, "category")
    if not overlay:
        return drills
    out: dict[str, dict[str, Any]] = {}
    for category, drill in drills.items():
        ovl = overlay.get(category)
        if not ovl:
            out[category] = drill
            continue
        d = copy.deepcopy(drill)
        _set_if_str(d, ovl, "title")
        _set_if_str(d, ovl, "scenario")
        if isinstance(d.get("checkpoints"), list):
            _merge_checkpoints(d["checkpoints"], ovl.get("checkpoints"), ("label", "feedback"))
        out[category] = d
    return out


def localize_scenarios(
    scenarios: tuple[dict[str, Any], ...], locale: str
) -> tuple[dict[str, Any], ...]:
    overlay = _load_overlay(_SCENARIOS_DIR, "scenarios.json", locale, "id")
    if not overlay:
        return scenarios
    out: list[dict[str, Any]] = []
    for scenario in scenarios:
        ovl = overlay.get(scenario.get("id"))
        if not ovl:
            out.append(scenario)
            continue
        s = copy.deepcopy(scenario)
        _set_if_str(s, ovl, "title")
        _set_if_str(s, ovl, "description")
        if isinstance(s.get("checkpoints"), list):
            _merge_checkpoints(s["checkpoints"], ovl.get("checkpoints"), ("label", "debrief"))
        out.append(s)
    return tuple(out)
