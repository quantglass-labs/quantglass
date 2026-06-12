# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Example community mission pack (missions capability).

Missions are declarative criteria only — the engine evaluates them against
the user's own activity, so a pack can never run code. Copy this file,
change the pack id, and design your challenges from the criteria vocabulary
in ``app.services.missions.CRITERIA_TYPES``.
"""

from __future__ import annotations

from app.extensions.sdk import ExtensionManifest, MissionPackDefinition

_MISSIONS = (
    {
        "id": "weekend-scholar",
        "title": "Weekend Scholar",
        "level": "novice",
        "category": "community-challenges",
        "description": (
            "Complete 5 lessons and grade 10 review cards. A community starter "
            "challenge for the studious."
        ),
        "criteria": [
            {"type": "min_lessons_completed", "label": "Complete 5 lessons", "value": 5},
            {"type": "min_review_reps", "label": "10 review reps", "value": 10},
        ],
    },
    {
        "id": "clean-dozen",
        "title": "The Clean Dozen",
        "level": "intermediate",
        "category": "community-challenges",
        "description": (
            "Twelve trades, every one stopped, journaled, and inside risk policy. "
            "Community-grade discipline proof."
        ),
        "criteria": [
            {"type": "min_trades", "label": "Execute 12 trades", "value": 12},
            {"type": "all_have_stops", "label": "Every trade has a stop"},
            {"type": "max_risk_percent_each", "label": "Zero risk breaches"},
            {"type": "min_journaled", "label": "Journal 12 trades", "value": 12},
        ],
    },
)


class Extension:
    manifest = ExtensionManifest(
        id="community-mission-pack-example",
        name="Community Mission Pack: Challenges",
        version="0.1.0",
        description="Example missions capability pack — two community challenges.",
        capabilities=("missions",),
    )

    def register(self, context) -> None:  # noqa: ANN001 — SDK protocol signature
        context.register_mission_pack(
            MissionPackDefinition(
                id="community-challenges",
                title="Community Challenges",
                description="Starter challenges contributed as a mission pack.",
                missions=_MISSIONS,
                source_extension=self.manifest.id,
                attribution="QuantGlass community example",
            )
        )

    def health(self) -> dict[str, object]:
        return {"status": "ok", "loaded": True, "missions": len(_MISSIONS)}
