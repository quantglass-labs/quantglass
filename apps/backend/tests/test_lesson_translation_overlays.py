# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Structural guards for shipped lesson translation overlays.

Every ``content/lessons/<locale>/`` file is a content-only contribution, so it
is checked the same way the English catalog is: ids must exist in English,
multiple-choice option counts must match (so the English ``correct_index`` still
points at the right answer), and overlays must not carry identity or answer-key
fields — those are English-only by design."""

import json
import unittest
from pathlib import Path

from app.services.locale import LOCALE_NAMES

CONTENT_DIR = Path(__file__).resolve().parent.parent / "app" / "content" / "lessons"
TIERS = ("novice", "intermediate", "advanced", "expert")
_FORBIDDEN_LESSON_KEYS = {"module_id", "track_id", "tier", "order"}
_FORBIDDEN_EXERCISE_KEYS = {"type", "correct_index", "correct_answer", "tolerance_percent"}


def _english_lessons() -> dict[str, dict]:
    lessons: dict[str, dict] = {}
    for tier in TIERS:
        for lesson in json.loads((CONTENT_DIR / f"{tier}.json").read_text(encoding="utf-8")):
            lessons[lesson["id"]] = lesson
    return lessons


def _locale_dirs() -> list[Path]:
    return [
        p for p in CONTENT_DIR.iterdir() if p.is_dir() and p.name in LOCALE_NAMES and p.name != "en"
    ]


class LessonOverlayTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.english = _english_lessons()

    def test_overlays_are_well_formed(self) -> None:
        for locale_dir in _locale_dirs():
            for tier in TIERS:
                path = locale_dir / f"{tier}.json"
                if not path.exists():
                    continue
                entries = json.loads(path.read_text(encoding="utf-8"))
                self.assertIsInstance(entries, list, f"{path} must be a list")
                for entry in entries:
                    where = f"{locale_dir.name}/{tier}.json:{entry.get('id')}"
                    self.assertIn("id", entry, where)
                    base = self.english.get(entry["id"])
                    self.assertIsNotNone(base, f"{where}: id not in English catalog")
                    self.assertEqual(base["tier"], tier, f"{where}: wrong tier file")
                    self.assertFalse(
                        _FORBIDDEN_LESSON_KEYS & entry.keys(),
                        f"{where}: overlay must not set {_FORBIDDEN_LESSON_KEYS & entry.keys()}",
                    )
                    overlay_ex = entry.get("exercise", {})
                    if overlay_ex:
                        self.assertFalse(
                            _FORBIDDEN_EXERCISE_KEYS & overlay_ex.keys(),
                            f"{where}: exercise overlay must not set answer keys",
                        )
                        if "options" in overlay_ex:
                            self.assertEqual(
                                len(overlay_ex["options"]),
                                len(base["exercise"]["options"]),
                                f"{where}: option count must match English",
                            )

    def test_overlay_modules_only_translate_known_ids(self) -> None:
        english_meta = json.loads((CONTENT_DIR / "modules.json").read_text(encoding="utf-8"))
        level_ids = set(english_meta["levels"])
        track_ids = {track["id"] for track in english_meta["tracks"]}
        for locale_dir in _locale_dirs():
            path = locale_dir / "modules.json"
            if not path.exists():
                continue
            overlay = json.loads(path.read_text(encoding="utf-8"))
            for level_id in overlay.get("levels", {}):
                self.assertIn(level_id, level_ids, f"{path}: unknown level {level_id}")
            for track in overlay.get("tracks", []):
                self.assertIn("id", track, f"{path}: track without id")
                self.assertIn(track["id"], track_ids, f"{path}: unknown track {track['id']}")


if __name__ == "__main__":
    unittest.main()
