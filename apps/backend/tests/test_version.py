# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Guard: the runtime version constant must match the packaged version.

This is the cheap CI tripwire for version drift — if someone bumps
``pyproject.toml`` for a release but forgets ``app/version.py`` (or vice
versa), this test fails before a mislabelled build can ship.
"""

import tomllib
from pathlib import Path

from app.version import __version__


def test_runtime_version_matches_pyproject() -> None:
    pyproject = Path(__file__).resolve().parents[1] / "pyproject.toml"
    data = tomllib.loads(pyproject.read_text(encoding="utf-8"))
    assert __version__ == data["project"]["version"], (
        "app/version.py is out of sync with pyproject.toml — bump both together."
    )
