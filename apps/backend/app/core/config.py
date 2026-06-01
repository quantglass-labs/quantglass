# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

import os
import sys
from functools import lru_cache
from pathlib import Path
from typing import Any
from typing import Literal

from pydantic import BaseModel, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _platform_app_data_dir() -> Path:
    """Per-user, writable application data directory for the current OS."""
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support"
    if os.name == "nt":
        base = os.environ.get("APPDATA")
        return Path(base) if base else Path.home() / "AppData" / "Roaming"
    base = os.environ.get("XDG_DATA_HOME")
    return Path(base) if base else Path.home() / ".local" / "share"


def _default_data_dir() -> Path:
    """Resolve the local data directory.

    In a normal source checkout we keep state under ``apps/backend/.local`` so the
    developer experience is unchanged. When running from a frozen (PyInstaller)
    bundle ``__file__`` points inside a read-only temp extraction directory, so we
    fall back to a stable, writable per-user application-data location.
    """
    if getattr(sys, "frozen", False):
        return _platform_app_data_dir() / "QuantGlass"
    return Path(__file__).resolve().parents[2] / ".local"


class ProviderRoute(BaseModel):
    primary: str
    secondary: str | None = None
    fallback: str | None = None


class ProviderSettings(BaseModel):
    view_mode: Literal["simple", "advanced"] = "simple"
    crypto_rate_limit_per_minute: int = 24
    stocks_rate_limit_per_minute: int = 58
    crypto: ProviderRoute = Field(
        default_factory=lambda: ProviderRoute(
            primary="ccxt_coinbase",
            secondary="ccxt_kraken",
            fallback="gemini",
        )
    )
    stocks: ProviderRoute = Field(
        default_factory=lambda: ProviderRoute(
            primary="yahoo_public",
        )
    )
    news: ProviderRoute = Field(
        default_factory=lambda: ProviderRoute(
            primary="finnhub_news",
        )
    )
    ai: ProviderRoute = Field(
        default_factory=lambda: ProviderRoute(
            primary="ollama",
            secondary="openai",
        )
    )
    trading: ProviderRoute = Field(
        default_factory=lambda: ProviderRoute(
            primary="alpaca_paper",
            fallback="ccxt_trade",
        )
    )


class SafetySettings(BaseModel):
    trading_mode: Literal["paper", "live"] = "paper"
    act_on_partial_candles: bool = False
    min_backtest_sample: int = 50
    # Live trading stays disabled until the operator explicitly confirms it with a
    # keychain-stored credential. A plain DB flag is not enough to enable real orders.
    live_trading_confirmed: bool = False


class AiSettings(BaseModel):
    model: str = "qwen3:14b-q4_K_M"
    cloud_enabled: bool = False
    # Local Ollama endpoint used by the narration service.
    ollama_base_url: str = "http://127.0.0.1:11434"
    # Hard cap so a missing/slow local model never blocks a signal refresh.
    request_timeout_seconds: float = 8.0


class AppSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="QUANTGLASS_",
        env_nested_delimiter="__",
        extra="ignore",
    )

    app_name: str = "QuantGlass Backend"
    environment: str = "development"
    workspace_root: Path = Field(
        default_factory=lambda: Path(__file__).resolve().parents[4]
    )
    data_dir: Path = Field(default_factory=_default_data_dir)
    sqlite_path: Path | None = None
    duckdb_path: Path | None = None
    parquet_dir: Path | None = None
    enable_alpaca_market_data: bool = False
    alpaca_market_data_key_id: str | None = None
    alpaca_market_data_secret_key: str | None = None
    enable_finnhub_market_data: bool = False
    finnhub_api_key: str | None = None
    enable_polygon_market_data: bool = False
    polygon_api_key: str | None = None
    enable_twelvedata_market_data: bool = False
    twelvedata_api_key: str | None = None
    provider_settings: ProviderSettings = Field(default_factory=ProviderSettings)
    safety: SafetySettings = Field(default_factory=SafetySettings)
    ai: AiSettings = Field(default_factory=AiSettings)

    @model_validator(mode="after")
    def _derive_storage_paths(self) -> "AppSettings":
        """Derive concrete storage paths from ``data_dir`` unless explicitly set.

        Keeping these relative to ``data_dir`` means a single ``QUANTGLASS_DATA_DIR``
        override (used by the packaged desktop app) relocates all local state, while a
        source checkout keeps the historical ``.local/{state,analytics,parquet}`` layout.
        """
        if self.sqlite_path is None:
            self.sqlite_path = self.data_dir / "state" / "quantglass.db"
        if self.duckdb_path is None:
            self.duckdb_path = self.data_dir / "analytics" / "quantglass.duckdb"
        if self.parquet_dir is None:
            self.parquet_dir = self.data_dir / "parquet"
        return self


def apply_api_key_settings(
    settings: AppSettings,
    api_keys: list[dict[str, Any]],
) -> AppSettings:
    indexed_keys = {
        item.get("id"): item.get("value", "")
        for item in api_keys
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    }

    alpaca_key_id = indexed_keys.get("alpaca-market-data-key-id") or None
    alpaca_secret_key = indexed_keys.get("alpaca-market-data-secret-key") or None
    finnhub_api_key = indexed_keys.get("finnhub-api-key") or None
    polygon_api_key = indexed_keys.get("polygon-api-key") or None
    twelvedata_api_key = indexed_keys.get("twelvedata-api-key") or None

    return settings.model_copy(
        update={
            "alpaca_market_data_key_id": alpaca_key_id,
            "alpaca_market_data_secret_key": alpaca_secret_key,
            "enable_alpaca_market_data": bool(alpaca_key_id and alpaca_secret_key),
            "finnhub_api_key": finnhub_api_key,
            "enable_finnhub_market_data": bool(finnhub_api_key),
            "polygon_api_key": polygon_api_key,
            "enable_polygon_market_data": bool(polygon_api_key),
            "twelvedata_api_key": twelvedata_api_key,
            "enable_twelvedata_market_data": bool(twelvedata_api_key),
        },
        deep=True,
    )


@lru_cache
def get_settings() -> AppSettings:
    return AppSettings()