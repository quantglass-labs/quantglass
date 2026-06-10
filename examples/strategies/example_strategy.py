# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Example strategy helper for contributors.

Real strategies should live in the signal engine or a future strategy registry,
with known-answer tests and documented assumptions.
"""

from __future__ import annotations


def simple_breakout_signal(
    closes: list[float],
    lookback: int = 20,
) -> list[bool | None]:
    signals: list[bool | None] = []
    for index, close in enumerate(closes):
        if index < lookback:
            signals.append(None)
            continue
        prior_high = max(closes[index - lookback : index])
        signals.append(close > prior_high)
    return signals
