# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from __future__ import annotations

import json
import sys
from pathlib import Path

from app.main import app


def main() -> None:
    output_path = (
        Path(sys.argv[1])
        if len(sys.argv) > 1
        else Path("docs/openapi/quantglass-backend.openapi.json")
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(app.openapi(), indent=2, sort_keys=True),
        encoding="utf-8",
    )
    print(output_path)


if __name__ == "__main__":
    main()
