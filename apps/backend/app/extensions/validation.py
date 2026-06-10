# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from __future__ import annotations

from datetime import datetime
from typing import Any

REQUIRED_CANDLE_FIELDS = ("open_time_utc", "open", "high", "low", "close", "volume")


def validate_candles(candles: list[dict[str, Any]]) -> list[str]:
    diagnostics: list[str] = []
    previous_open_time: datetime | None = None
    seen_open_times: set[str] = set()

    for index, candle in enumerate(candles):
        for field in REQUIRED_CANDLE_FIELDS:
            if field not in candle:
                diagnostics.append(f"candle[{index}] missing {field}")

        open_time = candle.get("open_time_utc")
        if isinstance(open_time, str):
            if open_time in seen_open_times:
                diagnostics.append(f"candle[{index}] duplicate open_time_utc {open_time}")
            seen_open_times.add(open_time)
            parsed_open_time = _parse_utc(open_time)
            if parsed_open_time is None:
                diagnostics.append(f"candle[{index}] open_time_utc is not ISO UTC")
            elif previous_open_time and parsed_open_time <= previous_open_time:
                diagnostics.append(f"candle[{index}] open_time_utc is not strictly increasing")
            if parsed_open_time:
                previous_open_time = parsed_open_time
        elif "open_time_utc" in candle:
            diagnostics.append(f"candle[{index}] open_time_utc must be a string")

        numeric_values: dict[str, float] = {}
        for field in ("open", "high", "low", "close", "volume"):
            value = candle.get(field)
            if not isinstance(value, (int, float)):
                diagnostics.append(f"candle[{index}] {field} must be numeric")
                continue
            numeric_values[field] = float(value)

        if {"high", "low"}.issubset(numeric_values) and numeric_values["high"] < numeric_values[
            "low"
        ]:
            diagnostics.append(f"candle[{index}] high is below low")
        if {"open", "high", "low", "close"}.issubset(numeric_values):
            if (
                numeric_values["open"] > numeric_values["high"]
                or numeric_values["open"] < numeric_values["low"]
            ):
                diagnostics.append(f"candle[{index}] open is outside high/low range")
            if (
                numeric_values["close"] > numeric_values["high"]
                or numeric_values["close"] < numeric_values["low"]
            ):
                diagnostics.append(f"candle[{index}] close is outside high/low range")
        if numeric_values.get("volume", 0.0) < 0:
            diagnostics.append(f"candle[{index}] volume is negative")

    return diagnostics


def _parse_utc(value: str) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    return parsed
