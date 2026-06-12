# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Community mission packs: the `missions` extension capability.

A pack contributes missions as declarative JSON — title, level, category,
and typed criteria drawn from the engine's fixed vocabulary
(``app.services.missions.CRITERIA_TYPES``). Validation rejects unknown
criterion types and unsafe values at registration, mission ids are
namespaced by pack id, and evaluation runs through the same engine as
built-in missions — a pack can never execute code.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.services.missions import CRITERIA_TYPES

VALID_LEVELS = ("novice", "intermediate", "advanced", "expert")
MAX_MISSIONS_PER_PACK = 60
MAX_CRITERIA_PER_MISSION = 8
MAX_NUMERIC_VALUE = 10_000

# Criterion params that must be present per type, beyond `type` and `label`.
REQUIRED_PARAMS: dict[str, tuple[str, ...]] = {
    "min_trades": ("value",),
    "max_dangerous_success": ("value",),
    "min_classification": ("classification", "value"),
    "consecutive_process_scores": ("min_score", "value"),
    "min_process_average": ("value",),
    "min_planned_losses_taken": ("value",),
    "min_resolved": ("value",),
    "min_symbol_diversity": ("value",),
    "max_daily_trades": ("value",),
    "min_trades_with_reason": ("value",),
    "min_emotions_logged": ("value",),
    "min_journaled": ("value",),
    "min_tagged": ("value",),
    "scenario_passed": ("scenario_id",),
    "min_scenarios_passed": ("value",),
    "min_lessons_completed": ("value",),
    "assessment_passed": ("level",),
    "min_review_reps": ("value",),
    "min_streak_days": ("value",),
}


@dataclass(frozen=True, slots=True)
class MissionPackDefinition:
    id: str
    title: str
    description: str
    missions: tuple[dict[str, Any], ...]
    source_extension: str = ""
    attribution: str = ""


@dataclass(slots=True)
class _PackRecord:
    definition: MissionPackDefinition
    missions: list[dict[str, Any]] = field(default_factory=list)


def validate_mission_pack(pack: MissionPackDefinition) -> list[str]:
    diagnostics: list[str] = []
    if not pack.id or not pack.id.replace("-", "").isalnum():
        diagnostics.append("pack id must be kebab-case alphanumeric")
    if not pack.missions:
        diagnostics.append("pack has no missions")
    if len(pack.missions) > MAX_MISSIONS_PER_PACK:
        diagnostics.append(f"pack exceeds {MAX_MISSIONS_PER_PACK} missions")

    seen_ids: set[str] = set()
    for index, mission in enumerate(pack.missions):
        label = f"mission[{index}]"
        for required in ("id", "title", "level", "description", "criteria"):
            if not mission.get(required):
                diagnostics.append(f"{label} missing {required}")
        if mission.get("level") not in VALID_LEVELS:
            diagnostics.append(f"{label} level must be one of {VALID_LEVELS}")
        mission_id = str(mission.get("id") or "")
        if mission_id in seen_ids:
            diagnostics.append(f"{label} duplicate id {mission_id}")
        seen_ids.add(mission_id)

        criteria = mission.get("criteria")
        if not isinstance(criteria, list) or not criteria:
            continue
        if len(criteria) > MAX_CRITERIA_PER_MISSION:
            diagnostics.append(f"{label} exceeds {MAX_CRITERIA_PER_MISSION} criteria")
        for c_index, criterion in enumerate(criteria):
            c_label = f"{label}.criteria[{c_index}]"
            if not isinstance(criterion, dict):
                diagnostics.append(f"{c_label} must be an object")
                continue
            kind = criterion.get("type")
            if kind not in CRITERIA_TYPES:
                diagnostics.append(f"{c_label} unknown criterion type {kind!r}")
                continue
            if not str(criterion.get("label") or "").strip():
                diagnostics.append(f"{c_label} missing label")
            for param in REQUIRED_PARAMS.get(kind, ()):
                if param not in criterion:
                    diagnostics.append(f"{c_label} missing {param}")
            for numeric in ("value", "min_score"):
                value = criterion.get(numeric)
                if value is None:
                    continue
                if not isinstance(value, int) or not 0 <= value <= MAX_NUMERIC_VALUE:
                    diagnostics.append(
                        f"{c_label} {numeric} must be an integer 0..{MAX_NUMERIC_VALUE}"
                    )
    return diagnostics


class MissionPackRegistry:
    def __init__(self) -> None:
        self._packs: dict[str, _PackRecord] = {}

    def register(self, definition: MissionPackDefinition) -> list[str]:
        diagnostics = validate_mission_pack(definition)
        if diagnostics:
            return diagnostics
        missions = [
            {
                **mission,
                "id": f"{definition.id}-{mission['id']}",
                "category": mission.get("category", definition.id),
                "lesson_links": mission.get("lesson_links", []),
                "source": "community",
                "source_extension": definition.source_extension,
            }
            for mission in definition.missions
        ]
        self._packs[definition.id] = _PackRecord(definition=definition, missions=missions)
        return []

    def list_packs(self) -> list[dict[str, Any]]:
        return [
            {
                "id": record.definition.id,
                "title": record.definition.title,
                "description": record.definition.description,
                "mission_count": len(record.missions),
                "source_extension": record.definition.source_extension,
                "attribution": record.definition.attribution,
            }
            for record in self._packs.values()
        ]

    def all_missions(self) -> list[dict[str, Any]]:
        return [mission for record in self._packs.values() for mission in record.missions]
