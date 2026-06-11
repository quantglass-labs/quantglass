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
            connection.commit()
