# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from importlib import import_module
from typing import Any

_httpx = import_module("httpx")
_client = import_module("httpx._client")
_types = import_module("httpx._types")

__all__ = getattr(_httpx, "__all__", [])
__doc__ = getattr(_httpx, "__doc__", None)
__version__ = getattr(_httpx, "__version__", None)


def __getattr__(name: str) -> Any:
	return getattr(_httpx, name)


def __dir__() -> list[str]:
	return sorted(set(globals()) | set(dir(_httpx)))


for _name in dir(_httpx):
	if _name.startswith("__"):
		continue
	globals()[_name] = getattr(_httpx, _name)