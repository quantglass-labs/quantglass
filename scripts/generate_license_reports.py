# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Generate dependency inventory reports for release/license review."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
REPORT_DIR = REPO_ROOT / "license-reports"


def run_json(command: list[str], cwd: Path | None = None) -> object:
    output = subprocess.check_output(command, cwd=str(cwd or REPO_ROOT), text=True)
    return json.loads(output)


def write_report(name: str, payload: object) -> None:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    target = REPORT_DIR / name
    target.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main() -> None:
    write_report(
        "npm-desktop-dependencies.json",
        run_json(["npm", "--prefix", "apps/desktop", "ls", "--json", "--all"]),
    )
    write_report(
        "cargo-tauri-metadata.json",
        run_json(
            [
                "cargo",
                "metadata",
                "--format-version",
                "1",
                "--manifest-path",
                "apps/desktop/src-tauri/Cargo.toml",
            ]
        ),
    )
    write_report(
        "python-backend-packages.json",
        run_json([sys.executable, "-m", "pip", "list", "--format=json"]),
    )
    print(f"License reports written to {REPORT_DIR}")


if __name__ == "__main__":
    main()
