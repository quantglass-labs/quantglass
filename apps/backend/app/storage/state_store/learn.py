# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Interactive learning progress persistence."""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

from app.storage.state_store.db import connect
from app.storage.state_store.defaults import now_iso


class LearnProgressStore:
    def __init__(self, sqlite_path: Path) -> None:
        self.sqlite_path = sqlite_path

    def ensure_schema(self, connection: sqlite3.Connection) -> None:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS learn_progress (
                lesson_id TEXT PRIMARY KEY,
                completed_at TEXT NOT NULL,
                attempts INTEGER NOT NULL DEFAULT 1
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS learn_assessments (
                level TEXT PRIMARY KEY,
                score INTEGER NOT NULL,
                passed INTEGER NOT NULL,
                attempts INTEGER NOT NULL DEFAULT 1,
                taken_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS learn_missions (
                mission_id TEXT PRIMARY KEY,
                completed_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS learn_scenarios (
                scenario_id TEXT PRIMARY KEY,
                best_percent INTEGER NOT NULL,
                passed INTEGER NOT NULL,
                attempts INTEGER NOT NULL DEFAULT 1,
                taken_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS learn_review_cards (
                term_key TEXT PRIMARY KEY,
                term TEXT NOT NULL,
                lesson_id TEXT NOT NULL,
                interval_days REAL NOT NULL DEFAULT 0,
                ease REAL NOT NULL DEFAULT 2.5,
                due_at TEXT NOT NULL,
                reps INTEGER NOT NULL DEFAULT 0,
                lapses INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS learn_activity (
                day TEXT PRIMARY KEY,
                events INTEGER NOT NULL DEFAULT 1
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS learn_active_missions (
                mission_id TEXT PRIMARY KEY,
                accepted_at TEXT NOT NULL
            )
            """
        )

    def get_learn_progress(self) -> dict[str, Any]:
        with connect(self.sqlite_path) as connection:
            rows = connection.execute(
                "SELECT lesson_id, completed_at, attempts FROM learn_progress"
            ).fetchall()
        return {row[0]: {"completed_at": row[1], "attempts": row[2]} for row in rows}

    def mark_lesson_complete(self, lesson_id: str) -> None:
        now = now_iso()
        with connect(self.sqlite_path) as connection:
            connection.execute(
                """
                INSERT INTO learn_progress (lesson_id, completed_at, attempts)
                VALUES (?, ?, 1)
                ON CONFLICT(lesson_id) DO UPDATE SET
                    completed_at = excluded.completed_at,
                    attempts = learn_progress.attempts + 1
                """,
                (lesson_id, now),
            )
            self._record_activity(connection)
            connection.commit()

    def record_lesson_attempt(self, lesson_id: str) -> None:
        with connect(self.sqlite_path) as connection:
            existing = connection.execute(
                "SELECT attempts FROM learn_progress WHERE lesson_id = ?",
                (lesson_id,),
            ).fetchone()
            if existing:
                connection.execute(
                    "UPDATE learn_progress SET attempts = attempts + 1 WHERE lesson_id = ?",
                    (lesson_id,),
                )
            else:
                # Attempted but not yet complete — store with a sentinel completed_at.
                connection.execute(
                    "INSERT OR IGNORE INTO learn_progress (lesson_id, completed_at, attempts) VALUES (?, '', 1)",
                    (lesson_id,),
                )
            connection.commit()

    def get_assessments(self) -> dict[str, Any]:
        with connect(self.sqlite_path) as connection:
            rows = connection.execute(
                "SELECT level, score, passed, attempts, taken_at FROM learn_assessments"
            ).fetchall()
        return {
            row[0]: {
                "score": row[1],
                "passed": bool(row[2]),
                "attempts": row[3],
                "taken_at": row[4],
            }
            for row in rows
        }

    def record_assessment(self, level: str, score: int, passed: bool) -> None:
        with connect(self.sqlite_path) as connection:
            connection.execute(
                """
                INSERT INTO learn_assessments (level, score, passed, attempts, taken_at)
                VALUES (?, ?, ?, 1, ?)
                ON CONFLICT(level) DO UPDATE SET
                    score = MAX(learn_assessments.score, excluded.score),
                    passed = MAX(learn_assessments.passed, excluded.passed),
                    attempts = learn_assessments.attempts + 1,
                    taken_at = excluded.taken_at
                """,
                (level, score, int(passed), now_iso()),
            )
            self._record_activity(connection)
            connection.commit()

    def get_completed_missions(self) -> dict[str, str]:
        with connect(self.sqlite_path) as connection:
            rows = connection.execute(
                "SELECT mission_id, completed_at FROM learn_missions"
            ).fetchall()
        return {row[0]: row[1] for row in rows}

    def record_mission_complete(self, mission_id: str) -> None:
        with connect(self.sqlite_path) as connection:
            connection.execute(
                "INSERT OR IGNORE INTO learn_missions (mission_id, completed_at) VALUES (?, ?)",
                (mission_id, now_iso()),
            )
            self._record_activity(connection)
            connection.commit()

    def get_scenario_results(self) -> dict[str, Any]:
        with connect(self.sqlite_path) as connection:
            rows = connection.execute(
                "SELECT scenario_id, best_percent, passed, attempts, taken_at FROM learn_scenarios"
            ).fetchall()
        return {
            row[0]: {
                "best_percent": row[1],
                "passed": bool(row[2]),
                "attempts": row[3],
                "taken_at": row[4],
            }
            for row in rows
        }

    def record_scenario_result(self, scenario_id: str, percent: int, passed: bool) -> None:
        with connect(self.sqlite_path) as connection:
            connection.execute(
                """
                INSERT INTO learn_scenarios (scenario_id, best_percent, passed, attempts, taken_at)
                VALUES (?, ?, ?, 1, ?)
                ON CONFLICT(scenario_id) DO UPDATE SET
                    best_percent = MAX(learn_scenarios.best_percent, excluded.best_percent),
                    passed = MAX(learn_scenarios.passed, excluded.passed),
                    attempts = learn_scenarios.attempts + 1,
                    taken_at = excluded.taken_at
                """,
                (scenario_id, percent, int(passed), now_iso()),
            )
            self._record_activity(connection)
            connection.commit()

    # ------------------------------------------------------------------
    # Mastery loop (ACAD-6): review cards and the daily activity streak.
    # ------------------------------------------------------------------

    def get_review_cards(self) -> dict[str, Any]:
        with connect(self.sqlite_path) as connection:
            rows = connection.execute(
                """
                SELECT term_key, term, lesson_id, interval_days, ease, due_at, reps, lapses
                FROM learn_review_cards
                """
            ).fetchall()
        return {
            row[0]: {
                "term": row[1],
                "lesson_id": row[2],
                "interval_days": row[3],
                "ease": row[4],
                "due_at": row[5],
                "reps": row[6],
                "lapses": row[7],
            }
            for row in rows
        }

    def upsert_review_card(self, term: str, lesson_id: str, card: dict[str, Any]) -> None:
        with connect(self.sqlite_path) as connection:
            connection.execute(
                """
                INSERT INTO learn_review_cards
                    (term_key, term, lesson_id, interval_days, ease, due_at, reps, lapses)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(term_key) DO UPDATE SET
                    interval_days = excluded.interval_days,
                    ease = excluded.ease,
                    due_at = excluded.due_at,
                    reps = excluded.reps,
                    lapses = excluded.lapses
                """,
                (
                    term.lower(),
                    term,
                    lesson_id,
                    card["interval_days"],
                    card["ease"],
                    card["due_at"],
                    card["reps"],
                    card["lapses"],
                ),
            )
            self._record_activity(connection)
            connection.commit()

    def get_active_missions(self) -> dict[str, str]:
        with connect(self.sqlite_path) as connection:
            rows = connection.execute(
                "SELECT mission_id, accepted_at FROM learn_active_missions"
            ).fetchall()
        return {row[0]: row[1] for row in rows}

    def set_mission_active(self, mission_id: str) -> None:
        with connect(self.sqlite_path) as connection:
            connection.execute(
                "INSERT OR IGNORE INTO learn_active_missions (mission_id, accepted_at) VALUES (?, ?)",
                (mission_id, now_iso()),
            )
            self._record_activity(connection)
            connection.commit()

    def clear_mission_active(self, mission_id: str) -> None:
        with connect(self.sqlite_path) as connection:
            connection.execute(
                "DELETE FROM learn_active_missions WHERE mission_id = ?", (mission_id,)
            )
            connection.commit()

    def get_activity_days(self) -> list[str]:
        with connect(self.sqlite_path) as connection:
            rows = connection.execute("SELECT day FROM learn_activity ORDER BY day").fetchall()
        return [row[0] for row in rows]

    def _record_activity(self, connection: sqlite3.Connection) -> None:
        day = now_iso()[:10]
        connection.execute(
            """
            INSERT INTO learn_activity (day, events) VALUES (?, 1)
            ON CONFLICT(day) DO UPDATE SET events = learn_activity.events + 1
            """,
            (day,),
        )
