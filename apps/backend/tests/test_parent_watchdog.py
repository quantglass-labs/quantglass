# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""The bundled sidecar must self-terminate when the desktop app dies, so a crash
or force-quit can't leave an orphaned backend holding the analytics DuckDB lock.
``_parent_has_exited`` is the predicate the watchdog loop polls."""

import os
import subprocess
import sys

from run_server import _parent_has_exited


def test_dead_parent_pid_is_detected() -> None:
    # Start and fully reap a child so its PID is gone, then probe it.
    proc = subprocess.Popen([sys.executable, "-c", "pass"])
    proc.wait()
    assert _parent_has_exited(parent_pid=proc.pid, start_ppid=os.getppid()) is True


def test_live_parent_pid_is_not_flagged() -> None:
    # Our own process is alive and our ppid hasn't changed.
    assert _parent_has_exited(parent_pid=os.getpid(), start_ppid=os.getppid()) is False


def test_no_parent_pid_with_stable_ppid_is_not_flagged() -> None:
    assert _parent_has_exited(parent_pid=None, start_ppid=os.getppid()) is False
