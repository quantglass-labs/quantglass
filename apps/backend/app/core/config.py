from functools import lru_cache
from pathlib import Path
from typing import Any
from typing import Literal

from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


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
            secondary="newsapi",
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


class AiSettings(BaseModel):
    model: str = "qwen3:14b-q4_K_M"
    cloud_enabled: bool = False


class AppSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="ALPHATERMINAL_",
        env_nested_delimiter="__",
        extra="ignore",
    )

    app_name: str = "AlphaTerminal Backend"
    environment: str = "development"
    workspace_root: Path = Field(
        default_factory=lambda: Path(__file__).resolve().parents[4]
    )
    data_dir: Path = Field(
        default_factory=lambda: Path(__file__).resolve().parents[2] / ".local"
    )
    sqlite_path: Path = Field(
        default_factory=lambda: Path(__file__).resolve().parents[2]
        / ".local/state/alphaterminal.db"
    )
    duckdb_path: Path = Field(
        default_factory=lambda: Path(__file__).resolve().parents[2]
        / ".local/analytics/alphaterminal.duckdb"
    )
    parquet_dir: Path = Field(
        default_factory=lambda: Path(__file__).resolve().parents[2]
        / ".local/parquet"
    )
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