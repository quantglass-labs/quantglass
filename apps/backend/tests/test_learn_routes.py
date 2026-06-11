# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

import unittest
from datetime import UTC, datetime

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes.learn import router as learn_router
from app.services.learn_service import LearnService


class _StateStore:
    def __init__(self) -> None:
        self.progress: dict[str, dict[str, object]] = {}

    def get_learn_progress(self) -> dict[str, dict[str, object]]:
        return self.progress

    def mark_lesson_complete(self, lesson_id: str) -> None:
        entry = self.progress.setdefault(lesson_id, {"attempts": 0})
        entry["completed_at"] = datetime.now(UTC).isoformat()

    def record_lesson_attempt(self, lesson_id: str) -> None:
        entry = self.progress.setdefault(lesson_id, {"attempts": 0})
        entry["attempts"] = int(entry.get("attempts", 0)) + 1


def _build_client() -> tuple[TestClient, _StateStore]:
    app = FastAPI()
    store = _StateStore()
    app.state.state_store = store
    app.state.learn_service = LearnService(store)
    app.include_router(learn_router)
    return TestClient(app), store


class LearnRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client, self.store = _build_client()

    def test_catalog_groups_levels_into_tracks(self) -> None:
        response = self.client.get("/api/learn/catalog")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        levels = [level["id"] for level in payload["levels"]]
        self.assertEqual(levels, ["novice", "intermediate", "advanced", "expert"])
        total = sum(level["total"] for level in payload["levels"])
        self.assertEqual(payload["progress"]["total"], total)
        self.assertEqual(payload["progress"]["completed"], 0)
        novice = payload["levels"][0]
        track_ids = [track["id"] for track in novice["tracks"]]
        self.assertIn("chart-literacy", track_ids)
        self.assertIn("first-signal", track_ids)
        chart = next(t for t in novice["tracks"] if t["id"] == "chart-literacy")
        self.assertEqual(chart["total"], 4)
        first_lesson = chart["lessons"][0]
        for field in ("id", "order", "title", "summary", "tier", "completed"):
            self.assertIn(field, first_lesson)
        self.assertEqual(sum(track["total"] for track in novice["tracks"]), novice["total"])

    def test_get_lesson_returns_full_content(self) -> None:
        response = self.client.get("/api/learn/lesson/novice-01-candlestick")
        self.assertEqual(response.status_code, 200)
        lesson = response.json()
        self.assertEqual(lesson["id"], "novice-01-candlestick")
        self.assertIn("concept", lesson)
        self.assertIn("exercise", lesson)
        self.assertIn("live_apply", lesson)
        self.assertFalse(lesson["completed"])

    def test_get_unknown_lesson_returns_404(self) -> None:
        response = self.client.get("/api/learn/lesson/no-such-lesson")
        self.assertEqual(response.status_code, 404)

    def test_correct_multiple_choice_answer_marks_complete(self) -> None:
        response = self.client.post(
            "/api/learn/lesson/novice-01-candlestick/check",
            json={"answer": "0"},
        )
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertTrue(result["correct"])
        self.assertEqual(result["score"], 10)
        self.assertIn("explanation", result)
        self.assertIn("novice-01-candlestick", self.store.progress)
        self.assertTrue(self.store.progress["novice-01-candlestick"].get("completed_at"))

    def test_wrong_answer_records_attempt_without_completing(self) -> None:
        response = self.client.post(
            "/api/learn/lesson/novice-01-candlestick/check",
            json={"answer": "2"},
        )
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertFalse(result["correct"])
        self.assertEqual(result["score"], 0)
        entry = self.store.progress["novice-01-candlestick"]
        self.assertEqual(entry["attempts"], 1)
        self.assertFalse(entry.get("completed_at"))

    def test_non_numeric_answer_to_multiple_choice_is_incorrect(self) -> None:
        response = self.client.post(
            "/api/learn/lesson/novice-01-candlestick/check",
            json={"answer": "not-a-number"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["correct"])

    def test_numeric_answer_accepted_within_tolerance(self) -> None:
        response = self.client.post(
            "/api/learn/lesson/intermediate-03-atr/check",
            json={"answer": "63,100"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["correct"])

    def test_numeric_answer_rejected_outside_tolerance(self) -> None:
        response = self.client.post(
            "/api/learn/lesson/intermediate-03-atr/check",
            json={"answer": "70000"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["correct"])

    def test_check_answer_on_unknown_lesson_returns_404(self) -> None:
        response = self.client.post(
            "/api/learn/lesson/no-such-lesson/check",
            json={"answer": "0"},
        )
        self.assertEqual(response.status_code, 404)

    def test_progress_reflects_completed_lessons(self) -> None:
        self.client.post(
            "/api/learn/lesson/novice-01-candlestick/check",
            json={"answer": "0"},
        )
        response = self.client.get("/api/learn/progress")
        self.assertEqual(response.status_code, 200)
        progress = response.json()
        self.assertEqual(progress["completed"], 1)
        self.assertEqual(progress["by_tier"]["novice"]["completed"], 1)
        self.assertEqual(progress["by_tier"]["expert"]["completed"], 0)

    def test_mark_complete_endpoint(self) -> None:
        response = self.client.post("/api/learn/progress/novice-02-trend/complete")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"ok": True, "lesson_id": "novice-02-trend"})
        lesson = self.client.get("/api/learn/lesson/novice-02-trend").json()
        self.assertTrue(lesson["completed"])

    def test_mark_complete_on_unknown_lesson_returns_404(self) -> None:
        response = self.client.post("/api/learn/progress/no-such-lesson/complete")
        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
