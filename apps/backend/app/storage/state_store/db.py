# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Shared SQLite connection settings for the state stores.

Every store connects through :func:`connect` so WAL journaling and busy
timeouts apply uniformly. WAL persists on the database file, but re-issuing
the pragma per connection keeps behavior correct for fresh files too.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path


def connect(sqlite_path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(sqlite_path, timeout=5.0)
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA busy_timeout=5000")
    connection.execute("PRAGMA foreign_keys=ON")
    return connection
