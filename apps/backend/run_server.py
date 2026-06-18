# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Standalone entrypoint for the bundled QuantGlass backend.

This module is the PyInstaller target that the desktop app launches as a Tauri
sidecar. It starts the FastAPI application with Uvicorn bound to a host/port that
the desktop shell selects at runtime (defaults are provided for manual use).

It also runs a *parent watchdog*: the desktop shell kills the sidecar on a
graceful exit, but a crash, force-quit, or ``SIGKILL`` of the app never runs that
handler — which would leave an orphaned backend holding the analytics DuckDB lock
and break the next launch ("Could not set lock on file … quantglass.duckdb"). The
watchdog makes the sidecar self-terminate when its parent goes away, so it can
never outlive the app and strand the lock.
"""

import argparse
import os
import threading
import time

# How often the watchdog checks that the parent is still alive.
_WATCHDOG_INTERVAL_SECONDS = 2.0


def _parent_has_exited(parent_pid: int | None, start_ppid: int) -> bool:
    """True when the launching desktop app is gone.

    Two independent signals, so it works whether or not an explicit parent PID was
    provided and across platforms:

    * **Reparenting** — on POSIX, when the launcher dies the sidecar is reparented
      to init/systemd, so ``getppid()`` changes to ``<= 1``.
    * **Explicit PID liveness** — if the shell passed ``QUANTGLASS_PARENT_PID``, a
      signal-0 probe tells us directly when that process no longer exists.
    """
    current_ppid = os.getppid()
    if current_ppid != start_ppid and current_ppid <= 1:
        return True
    if parent_pid is not None:
        try:
            os.kill(parent_pid, 0)  # liveness probe; sends no signal
        except ProcessLookupError:
            return True
        except (PermissionError, OSError):
            return False  # exists (or undeterminable) — assume alive
    return False


def _start_parent_watchdog() -> None:
    """Spawn a daemon thread that exits the process when the parent app dies."""
    raw = os.environ.get("QUANTGLASS_PARENT_PID", "").strip()
    parent_pid = int(raw) if raw.lstrip("-").isdigit() else None
    start_ppid = os.getppid()

    # Nothing meaningful to watch: no explicit parent and we are already a child
    # of init (e.g. an intentional daemonized/manual launch).
    if parent_pid is None and start_ppid <= 1:
        return

    def _loop() -> None:
        while True:
            time.sleep(_WATCHDOG_INTERVAL_SECONDS)
            try:
                if _parent_has_exited(parent_pid, start_ppid):
                    # Hard-exit so the OS releases the DuckDB file lock at once.
                    os._exit(0)
            except Exception:
                # A transient probe failure must never crash the backend.
                pass

    threading.Thread(target=_loop, name="qg-parent-watchdog", daemon=True).start()


def main() -> None:
    parser = argparse.ArgumentParser(prog="quantglass-backend")
    parser.add_argument(
        "--host",
        default=os.environ.get("QUANTGLASS_HOST", "127.0.0.1"),
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("QUANTGLASS_PORT", "8000")),
    )
    args = parser.parse_args()

    _start_parent_watchdog()

    import uvicorn

    from app.main import app

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
