# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Example community lesson pack (ACAD-10).

Shows the `lessons` capability: a pack is one track of declarative lessons
(markdown concept, key terms, a multiple-choice exercise) validated at
registration and rendered through the same vetted components as built-in
content. Copy this file, change the pack id, and write your lessons.
"""

from __future__ import annotations

from app.extensions.sdk import ExtensionManifest, LessonPackDefinition

_LESSONS = (
    {
        "id": "vwap-basics",
        "title": "VWAP: The Session Benchmark",
        "summary": "Why institutions measure fills against the volume-weighted average price.",
        "concept": (
            "**VWAP** (volume-weighted average price) answers one question: what did the "
            "average participant actually pay this session? Each trade contributes its price "
            "weighted by its size, so heavy prints move VWAP and small ones barely register.\n\n"
            "Institutions benchmark executions against it — a buyer filling below VWAP beat "
            "the session's average. That gives the line gravitational pull: above it buyers "
            "are in control on the session; repeated rejections at it mark who is defending."
        ),
        "key_terms": [
            {
                "term": "Session anchor",
                "definition": "The fixed start point (session open) from which VWAP accumulates.",
            },
        ],
        "exercise": {
            "type": "multiple_choice",
            "question": "Price has traded below VWAP all session. Who is in control?",
            "options": [
                "Buyers — the dip is a discount",
                "Sellers — the average participant is underwater on longs",
                "Nobody — VWAP says nothing about control",
            ],
            "correct_index": 1,
            "explanation": (
                "Sustained trade below VWAP means the average long entered higher and is "
                "losing; sellers own the session until price reclaims the line."
            ),
        },
    },
    {
        "id": "vwap-mean-reversion",
        "title": "Trading the Stretch from VWAP",
        "summary": "Distance from VWAP as a mean-reversion measure, and its failure mode.",
        "concept": (
            "Price stretched far from VWAP tends to revert toward it in ranging sessions — "
            "the line is where two-sided business happened, so it acts like fair value.\n\n"
            "The failure mode is the trend day: on those, 'stretched' stays stretched and "
            "every fade loses. The regime gate from the core curriculum applies here too: "
            "mean-reversion reads need a ranging regime, not a trending one."
        ),
        "key_terms": [
            {
                "term": "Fair-value magnet",
                "definition": "A price level that attracts trade because most volume cleared there.",
            },
        ],
        "exercise": {
            "type": "multiple_choice",
            "question": "When does fading the stretch from VWAP systematically fail?",
            "options": [
                "On low-volume sessions",
                "On trend days, where the stretch persists all session",
                "It never fails if the stretch is large enough",
            ],
            "correct_index": 1,
            "explanation": (
                "Trend days are the mean-reversion killer: the regime gate exists to keep "
                "fade setups out of trending sessions."
            ),
        },
    },
)


class Extension:
    manifest = ExtensionManifest(
        id="community-lesson-pack-example",
        name="Community Lesson Pack: VWAP",
        version="0.1.0",
        description="Example lessons capability pack — two VWAP lessons in one track.",
        capabilities=("lessons",),
    )

    def register(self, context) -> None:  # noqa: ANN001 — SDK protocol signature
        context.register_lesson_pack(
            LessonPackDefinition(
                id="community-vwap",
                title="VWAP (Community)",
                description="Session benchmarks and mean reversion, contributed as a lesson pack.",
                level="intermediate",
                lessons=_LESSONS,
                source_extension=self.manifest.id,
                attribution="QuantGlass community example",
            )
        )

    def health(self) -> dict[str, object]:
        return {"status": "ok", "loaded": True, "lessons": len(_LESSONS)}
