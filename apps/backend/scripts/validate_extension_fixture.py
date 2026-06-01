# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from app.extensions.validation import validate_candles


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate extension market-data fixtures against QuantGlass candle contracts."
    )
    parser.add_argument(
        "fixture",
        type=Path,
        help="JSON file containing a candle array or an object with a candles array.",
    )
    args = parser.parse_args()

    payload = json.loads(args.fixture.read_text(encoding="utf-8"))
    candles = _extract_candles(payload)
    if candles is None:
        print("fixture must be a JSON array or an object with a candles array", file=sys.stderr)
        return 2

    diagnostics = validate_candles(candles)
    if diagnostics:
        for diagnostic in diagnostics:
            print(diagnostic)
        return 1

    print("fixture ok")
    return 0


def _extract_candles(payload: Any) -> list[dict[str, Any]] | None:
    if isinstance(payload, list) and all(isinstance(item, dict) for item in payload):
        return payload
    if isinstance(payload, dict):
        candles = payload.get("candles")
        if isinstance(candles, list) and all(isinstance(item, dict) for item in candles):
            return candles
    return None


if __name__ == "__main__":
    raise SystemExit(main())
