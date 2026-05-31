"""Build the AlphaTerminal backend into a Tauri sidecar binary.

Runs PyInstaller against ``alphaterminal-backend.spec`` and copies the resulting
single-file executable into ``apps/desktop/src-tauri/binaries`` renamed with the
host Rust target triple, which is the naming Tauri's ``externalBin`` mechanism
requires (e.g. ``alphaterminal-backend-aarch64-apple-darwin``).

Usage (from the repository root, inside the project virtualenv)::

    python apps/backend/scripts/build_sidecar.py

PyInstaller must be installed in the active environment::

    pip install pyinstaller
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_DIR.parents[1]
SIDECAR_DIR = REPO_ROOT / "apps" / "desktop" / "src-tauri" / "binaries"
SPEC_FILE = BACKEND_DIR / "alphaterminal-backend.spec"


def host_target_triple() -> str:
    """Return the host Rust target triple reported by ``rustc``."""
    try:
        output = subprocess.check_output(["rustc", "-Vv"], text=True)
    except (OSError, subprocess.CalledProcessError) as exc:  # pragma: no cover - env specific
        raise SystemExit(
            "Unable to run 'rustc -Vv'. Install the Rust toolchain (rustup) first."
        ) from exc
    for line in output.splitlines():
        if line.startswith("host:"):
            return line.split("host:", 1)[1].strip()
    raise SystemExit("Could not parse host target triple from 'rustc -Vv' output.")


def run_pyinstaller() -> None:
    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--distpath",
        str(BACKEND_DIR / "dist"),
        "--workpath",
        str(BACKEND_DIR / "build"),
        str(SPEC_FILE),
    ]
    print("Running:", " ".join(cmd))
    subprocess.check_call(cmd, cwd=str(BACKEND_DIR))


def main() -> None:
    triple = host_target_triple()
    suffix = ".exe" if sys.platform.startswith("win") else ""
    built = BACKEND_DIR / "dist" / f"alphaterminal-backend{suffix}"

    run_pyinstaller()

    if not built.exists():
        raise SystemExit(f"Expected build artifact not found: {built}")

    SIDECAR_DIR.mkdir(parents=True, exist_ok=True)
    target = SIDECAR_DIR / f"alphaterminal-backend-{triple}{suffix}"
    shutil.copy2(built, target)
    if not suffix:
        target.chmod(0o755)
    print(f"Sidecar ready: {target}")


if __name__ == "__main__":
    main()
