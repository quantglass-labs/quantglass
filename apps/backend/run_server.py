# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Standalone entrypoint for the bundled QuantGlass backend.

This module is the PyInstaller target that the desktop app launches as a Tauri
sidecar. It starts the FastAPI application with Uvicorn bound to a host/port that
the desktop shell selects at runtime (defaults are provided for manual use).
"""

import argparse
import os


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

    import uvicorn

    from app.main import app

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
