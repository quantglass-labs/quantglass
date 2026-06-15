# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Single source of truth for the backend's runtime version string.

Kept as a literal (not read from package metadata) so it is correct inside the
frozen PyInstaller sidecar, where dist-info metadata is not guaranteed to be
collected. ``tests/test_version.py`` asserts this stays in lockstep with the
version declared in ``pyproject.toml`` so the two can never silently drift.
"""

__version__ = "0.2.4"
