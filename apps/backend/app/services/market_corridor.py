import json
from calendar import monthrange
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo
from uuid import uuid4
from typing import Any

from app.providers.manager import ProviderManager
from app.services.rate_limits import InMemoryRateLimiter, RateLimitExceededError
from app.storage.analytics_store import AnalyticsStore


class MarketCorridorService:
    _new_york_tz = ZoneInfo("America/New_York")
    _corridor_targets = [
        {
            "symbol": "BTCUSD",
            "route_domain": "crypto",
            "market_type": "crypto",
            "timeframe": "1h",
        },
        {
            "symbol": "ETHUSD",
            "route_domain": "crypto",
            "market_type": "crypto",
            "timeframe": "1h",
        },
        {
            "symbol": "SOLUSD",
            "route_domain": "crypto",
            "market_type": "crypto",
            "timeframe": "1h",
        },
        {
            "symbol": "LINKUSD",
            "route_domain": "crypto",
            "market_type": "crypto",
            "timeframe": "1h",
        },
        {
            "symbol": "SPY",
            "route_domain": "stocks",
            "market_type": "stocks",
            "timeframe": "1d",
        },
        {
            "symbol": "QQQ",
            "route_domain": "stocks",
            "market_type": "stocks",
            "timeframe": "1d",
        },
        {
            "symbol": "AAPL",
            "route_domain": "stocks",
            "market_type": "stocks",
            "timeframe": "1d",
        },
        {
            "symbol": "MSFT",
            "route_domain": "stocks",
            "market_type": "stocks",
            "timeframe": "1d",
        },
        {
            "symbol": "NVDA",
            "route_domain": "stocks",
            "market_type": "stocks",
            "timeframe": "1d",
        },
        {
            "symbol": "TSLA",
            "route_domain": "stocks",
            "market_type": "stocks",
            "timeframe": "1d",
        },
        {
            "symbol": "COIN",
            "route_domain": "stocks",
            "market_type": "stocks",
            "timeframe": "1d",
        },
        {
            "symbol": "IWM",
            "route_domain": "stocks",
            "market_type": "stocks",
            "timeframe": "1d",
        },
        # Multi-timeframe coverage for the crypto majors so the engine's higher-timeframe
        # filter and intraday setups have real data on both fast and slow horizons.
        {
            "symbol": "BTCUSD",
            "route_domain": "crypto",
            "market_type": "crypto",
            "timeframe": "4h",
        },
        {
            "symbol": "ETHUSD",
            "route_domain": "crypto",
            "market_type": "crypto",
            "timeframe": "4h",
        },
        {
            "symbol": "BTCUSD",
            "route_domain": "crypto",
            "market_type": "crypto",
            "timeframe": "15m",
        },
        {
            "symbol": "ETHUSD",
            "route_domain": "crypto",
            "market_type": "crypto",
            "timeframe": "15m",
        },
    ]

    def __init__(
        self,
        provider_manager: ProviderManager,
        analytics_store: AnalyticsStore,
        rate_limiter: InMemoryRateLimiter,
    ) -> None:
        self._provider_manager = provider_manager
        self._analytics_store = analytics_store
        self._rate_limiter = rate_limiter

    def refresh(self) -> dict[str, object]:
        items: list[dict[str, Any]] = []
        for target in self._corridor_targets:
            items.append(self._refresh_target(target))

        return {
            "refreshed_at_utc": datetime.now(timezone.utc).isoformat(),
            "items": items,
        }

    def get_status(self) -> dict[str, object]:
        return {
            "refreshed_at_utc": datetime.now(timezone.utc).isoformat(),
            "items": self._analytics_store.get_market_candle_corridor_summary(
                [
                    (target["symbol"], target["timeframe"])
                    for target in self._corridor_targets
                ]
            ),
        }

    def get_diagnostics(self) -> dict[str, object]:
        return {
            "items": self._analytics_store.list_market_integrity_diagnostics(),
            "runs": self._analytics_store.list_market_ingest_runs(),
        }

    def get_candles(self, symbol: str, timeframe: str) -> dict[str, object]:
        return self._analytics_store.list_market_candles(symbol, timeframe)

    def _refresh_target(self, target: dict[str, str]) -> dict[str, Any]:
        run_started_at = datetime.now(timezone.utc)
        self._analytics_store.clear_market_integrity_diagnostics(
            target["symbol"],
            target["timeframe"],
        )

        rate_limit_key = f"market_corridor:{target['route_domain']}"
        rate_limit = self._provider_manager.get_rate_limit_per_minute(target["route_domain"])
        try:
            self._rate_limiter.check_and_record(rate_limit_key, rate_limit)
        except RateLimitExceededError as exc:
            self._analytics_store.record_market_integrity_diagnostics(
                [
                    self._build_diagnostic(
                        target=target,
                        provider=target["route_domain"],
                        severity="error",
                        code="rate_limit_exceeded",
                        detail=f"Exceeded {target['route_domain']} corridor limit of {rate_limit}/minute. Retry in {exc.retry_after_seconds}s.",
                    )
                ]
            )
            self._analytics_store.record_market_ingest_run(
                self._build_run_summary(
                    target=target,
                    provider=target["route_domain"],
                    status="rate_limited",
                    started_at=run_started_at,
                    candles_received=0,
                    candles_kept=0,
                    invalid_count=0,
                    duplicate_count=0,
                    gap_count=0,
                    session_gap_count=0,
                    unexpected_gap_count=0,
                    cadence_max_gap_seconds=0,
                    partial_excluded_count=0,
                    invalid_samples=[],
                    gap_samples=[],
                    detail=f"Exceeded {target['route_domain']} corridor limit of {rate_limit}/minute. Retry in {exc.retry_after_seconds}s.",
                )
            )
            raise

        route_chain = self._provider_manager.resolve_chain(target["route_domain"], capability="ohlcv")
        if not route_chain:
            raise RuntimeError(f"No OHLCV providers configured for {target['route_domain']}")

        errors: list[str] = []
        for provider_name in route_chain:
            diagnostics: list[dict[str, Any]] = []
            provider = self._provider_manager.get_client(provider_name)

            if provider is None:
                code = "provider_not_configured" if not self._provider_manager.is_configured(provider_name) else "provider_client_unavailable"
                detail = (
                    f"Provider adapter is disabled or missing credentials for {provider_name}."
                    if code == "provider_not_configured"
                    else f"No executable provider client is registered for {provider_name}."
                )
                diagnostics.append(
                    self._build_diagnostic(
                        target=target,
                        provider=provider_name,
                        severity="error",
                        code=code,
                        detail=detail,
                    )
                )
                self._analytics_store.record_market_integrity_diagnostics(diagnostics)
                errors.append(f"{provider_name}: {detail}")
                continue

            try:
                raw_candles = provider.get_ohlcv(target["symbol"], target["timeframe"])
                candles, validation_diagnostics, stats = self._normalize_and_validate_candles(
                    target=target,
                    provider=provider_name,
                    candles=raw_candles,
                )
                diagnostics.extend(validation_diagnostics)
                self._analytics_store.record_market_integrity_diagnostics(diagnostics)

                if not candles:
                    self._analytics_store.record_market_ingest_run(
                        self._build_run_summary(
                            target=target,
                            provider=provider_name,
                            status="empty",
                            started_at=run_started_at,
                            candles_received=stats["candles_received"],
                            candles_kept=stats["candles_kept"],
                            invalid_count=stats["invalid_count"],
                            duplicate_count=stats["duplicate_count"],
                            gap_count=stats["gap_count"],
                            session_gap_count=stats["session_gap_count"],
                            unexpected_gap_count=stats["unexpected_gap_count"],
                            cadence_max_gap_seconds=stats["cadence_max_gap_seconds"],
                            partial_excluded_count=stats["partial_excluded_count"],
                            invalid_samples=stats["invalid_samples"],
                            gap_samples=stats["gap_samples"],
                            detail="No valid candles remained after normalization.",
                        )
                    )
                    errors.append(f"{provider_name}: no valid candles after normalization")
                    continue

                self._analytics_store.replace_market_candles(
                    symbol=target["symbol"],
                    market_type=target["market_type"],
                    timeframe=target["timeframe"],
                    source=provider_name,
                    candles=candles,
                )
                self._analytics_store.record_market_ingest_run(
                    self._build_run_summary(
                        target=target,
                        provider=provider_name,
                        status="success",
                        started_at=run_started_at,
                        candles_received=stats["candles_received"],
                        candles_kept=stats["candles_kept"],
                        invalid_count=stats["invalid_count"],
                        duplicate_count=stats["duplicate_count"],
                        gap_count=stats["gap_count"],
                        session_gap_count=stats["session_gap_count"],
                        unexpected_gap_count=stats["unexpected_gap_count"],
                        cadence_max_gap_seconds=stats["cadence_max_gap_seconds"],
                        partial_excluded_count=stats["partial_excluded_count"],
                        invalid_samples=stats["invalid_samples"],
                        gap_samples=stats["gap_samples"],
                        detail=None,
                    )
                )

                latest = candles[-1]
                return {
                    "symbol": target["symbol"],
                    "market_type": target["market_type"],
                    "timeframe": target["timeframe"],
                    "provider": provider_name,
                    "candles_ingested": len(candles),
                    "latest_close": latest["close"],
                    "latest_open_time_utc": latest["open_time_utc"],
                    "diagnostics": [item["code"] for item in diagnostics],
                }
            except Exception as exc:
                diagnostics.append(
                    self._build_diagnostic(
                        target=target,
                        provider=provider_name,
                        severity="error",
                        code="provider_fetch_failed",
                        detail=str(exc),
                    )
                )
                self._analytics_store.record_market_integrity_diagnostics(diagnostics)
                self._analytics_store.record_market_ingest_run(
                    self._build_run_summary(
                        target=target,
                        provider=provider_name,
                        status="failed",
                        started_at=run_started_at,
                        candles_received=0,
                        candles_kept=0,
                        invalid_count=0,
                        duplicate_count=0,
                        gap_count=0,
                        session_gap_count=0,
                        unexpected_gap_count=0,
                        cadence_max_gap_seconds=0,
                        partial_excluded_count=0,
                        invalid_samples=[],
                        gap_samples=[],
                        detail=str(exc),
                    )
                )
                errors.append(f"{provider_name}: {exc}")

        raise RuntimeError(f"Market corridor refresh failed for {target['symbol']}: {'; '.join(errors)}")

    def _normalize_and_validate_candles(
        self,
        target: dict[str, str],
        provider: str,
        candles: list[dict[str, Any]],
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, int]]:
        diagnostics: list[dict[str, Any]] = []
        deduped_by_open_time: dict[str, dict[str, Any]] = {}
        duplicate_count = 0
        invalid_count = 0
        partial_excluded_count = 0
        invalid_samples: list[dict[str, Any]] = []

        for candle in candles:
            normalized, normalize_error = self._normalize_single_candle(candle)
            if normalized is None:
                invalid_count += 1
                self._append_invalid_sample(invalid_samples, normalize_error or "normalize_failed", candle)
                continue
            is_valid, validation_error = self._is_valid_candle(normalized)
            if not is_valid:
                invalid_count += 1
                self._append_invalid_sample(invalid_samples, validation_error or "validation_failed", normalized)
                continue
            open_time = normalized["open_time_utc"]
            if open_time in deduped_by_open_time:
                duplicate_count += 1
            deduped_by_open_time[open_time] = normalized

        normalized_candles = [
            deduped_by_open_time[key]
            for key in sorted(deduped_by_open_time.keys())
        ]

        if invalid_count:
            diagnostics.append(
                self._build_diagnostic(
                    target=target,
                    provider=provider,
                    severity="warning",
                    code="invalid_candles_filtered",
                    detail=f"Filtered {invalid_count} candles with invalid timestamp, price, or volume fields.",
                )
            )
        if duplicate_count:
            diagnostics.append(
                self._build_diagnostic(
                    target=target,
                    provider=provider,
                    severity="warning",
                    code="duplicate_candles_deduped",
                    detail=f"Deduplicated {duplicate_count} candles by open time.",
                )
            )

        if not normalized_candles:
            return [], diagnostics, {
                "candles_received": len(candles),
                "candles_kept": 0,
                "invalid_count": invalid_count,
                "duplicate_count": duplicate_count,
                "gap_count": 0,
                "session_gap_count": 0,
                "unexpected_gap_count": 0,
                "cadence_max_gap_seconds": 0,
                "partial_excluded_count": 0,
                "invalid_samples": invalid_samples,
                "gap_samples": [],
            }

        expected_delta = self._expected_delta(target["timeframe"])
        gap_analysis = self._analyze_gaps(normalized_candles, expected_delta, target["market_type"])
        gap_count = gap_analysis["gap_count"]
        if gap_count:
            diagnostics.append(
                self._build_diagnostic(
                    target=target,
                    provider=provider,
                    severity="warning",
                    code="gaps_detected",
                    detail=(
                        f"Detected {gap_count} cadence gaps for {target['symbol']} {target['timeframe']} candles "
                        f"({gap_analysis['session_gap_count']} session-boundary, {gap_analysis['unexpected_gap_count']} unexpected)."
                    ),
                )
            )

        now_utc = datetime.now(timezone.utc)
        latest_open_time = datetime.fromisoformat(normalized_candles[-1]["open_time_utc"])
        if latest_open_time + expected_delta > now_utc:
            normalized_candles = normalized_candles[:-1]
            partial_excluded_count = 1
            diagnostics.append(
                self._build_diagnostic(
                    target=target,
                    provider=provider,
                    severity="warning",
                    code="partial_latest_candle_excluded",
                    detail=f"Excluded the latest partial candle for {target['symbol']} {target['timeframe']}.",
                )
            )

        return normalized_candles, diagnostics, {
            "candles_received": len(candles),
            "candles_kept": len(normalized_candles),
            "invalid_count": invalid_count,
            "duplicate_count": duplicate_count,
            "gap_count": gap_count,
            "session_gap_count": gap_analysis["session_gap_count"],
            "unexpected_gap_count": gap_analysis["unexpected_gap_count"],
            "cadence_max_gap_seconds": gap_analysis["cadence_max_gap_seconds"],
            "partial_excluded_count": partial_excluded_count,
            "invalid_samples": invalid_samples,
            "gap_samples": gap_analysis["gap_samples"],
        }

    @staticmethod
    def _build_run_summary(
        target: dict[str, str],
        provider: str,
        status: str,
        started_at: datetime,
        candles_received: int,
        candles_kept: int,
        invalid_count: int,
        duplicate_count: int,
        gap_count: int,
        session_gap_count: int,
        unexpected_gap_count: int,
        cadence_max_gap_seconds: float,
        partial_excluded_count: int,
        invalid_samples: list[dict[str, Any]],
        gap_samples: list[dict[str, Any]],
        detail: str | None,
    ) -> dict[str, Any]:
        completed_at = datetime.now(timezone.utc)
        return {
            "run_id": str(uuid4()),
            "symbol": target["symbol"],
            "market_type": target["market_type"],
            "timeframe": target["timeframe"],
            "provider": provider,
            "status": status,
            "candles_received": candles_received,
            "candles_kept": candles_kept,
            "invalid_count": invalid_count,
            "duplicate_count": duplicate_count,
            "gap_count": gap_count,
            "session_gap_count": session_gap_count,
            "unexpected_gap_count": unexpected_gap_count,
            "cadence_max_gap_seconds": cadence_max_gap_seconds,
            "partial_excluded_count": partial_excluded_count,
            "invalid_samples": invalid_samples,
            "gap_samples": gap_samples,
            "detail": detail,
            "started_at_utc": started_at.isoformat(),
            "completed_at_utc": completed_at.isoformat(),
        }

    @staticmethod
    def _normalize_single_candle(candle: dict[str, Any]) -> tuple[dict[str, Any] | None, str | None]:
        try:
            open_time = datetime.fromisoformat(str(candle["open_time_utc"]))
            if open_time.tzinfo is None:
                open_time = open_time.replace(tzinfo=timezone.utc)
            else:
                open_time = open_time.astimezone(timezone.utc)
            return {
                "open_time_utc": open_time.isoformat(),
                "open": float(candle["open"]),
                "high": float(candle["high"]),
                "low": float(candle["low"]),
                "close": float(candle["close"]),
                "volume": float(candle["volume"]),
            }, None
        except KeyError as exc:
            return None, f"missing_field:{exc.args[0]}"
        except (TypeError, ValueError) as exc:
            return None, f"parse_error:{exc}"

    @staticmethod
    def _is_valid_candle(candle: dict[str, Any]) -> tuple[bool, str | None]:
        open_price = candle["open"]
        high_price = candle["high"]
        low_price = candle["low"]
        close_price = candle["close"]
        volume = candle["volume"]
        if min(open_price, high_price, low_price, close_price) <= 0:
            return False, "non_positive_price"
        if volume < 0:
            return False, "negative_volume"
        if high_price < max(open_price, close_price):
            return False, "high_below_open_or_close"
        if low_price > min(open_price, close_price):
            return False, "low_above_open_or_close"
        if high_price < low_price:
            return False, "high_below_low"
        return True, None

    @staticmethod
    def _expected_delta(timeframe: str) -> timedelta:
        mapping = {
            "15m": timedelta(minutes=15),
            "1h": timedelta(hours=1),
            "4h": timedelta(hours=4),
            "1d": timedelta(days=1),
        }
        return mapping[timeframe]

    @staticmethod
    def _analyze_gaps(
        candles: list[dict[str, Any]],
        expected_delta: timedelta,
        market_type: str,
    ) -> dict[str, Any]:
        gap_count = 0
        session_gap_count = 0
        unexpected_gap_count = 0
        cadence_max_gap_seconds = 0.0
        gap_samples: list[dict[str, Any]] = []
        for previous, current in zip(candles, candles[1:]):
            previous_open = datetime.fromisoformat(previous["open_time_utc"])
            current_open = datetime.fromisoformat(current["open_time_utc"])
            observed_delta = current_open - previous_open
            cadence_max_gap_seconds = max(cadence_max_gap_seconds, observed_delta.total_seconds())
            if observed_delta <= expected_delta:
                continue

            gap_count += 1
            classification = "unexpected"
            if MarketCorridorService._is_expected_market_gap(
                previous_open=previous_open,
                current_open=current_open,
                expected_delta=expected_delta,
                market_type=market_type,
            ):
                classification = "session_boundary"
                session_gap_count += 1
            else:
                unexpected_gap_count += 1

            if len(gap_samples) < 3:
                gap_samples.append(
                    {
                        "from_open_time_utc": previous["open_time_utc"],
                        "to_open_time_utc": current["open_time_utc"],
                        "observed_gap_seconds": observed_delta.total_seconds(),
                        "expected_gap_seconds": expected_delta.total_seconds(),
                        "classification": classification,
                    }
                )

        return {
            "gap_count": gap_count,
            "session_gap_count": session_gap_count,
            "unexpected_gap_count": unexpected_gap_count,
            "cadence_max_gap_seconds": cadence_max_gap_seconds,
            "gap_samples": gap_samples,
        }

    @staticmethod
    def _is_expected_market_gap(
        previous_open: datetime,
        current_open: datetime,
        expected_delta: timedelta,
        market_type: str,
    ) -> bool:
        if market_type != "stocks":
            return False

        if expected_delta >= timedelta(days=1):
            return MarketCorridorService._is_expected_us_equity_session_gap(
                previous_open.date(),
                current_open.date(),
            )

        return MarketCorridorService._count_expected_us_equity_intraday_opens(
            previous_open,
            current_open,
            expected_delta,
        ) == 0

    @staticmethod
    def _is_expected_us_equity_session_gap(previous_date: date, current_date: date) -> bool:
        skipped_dates: list[date] = []
        cursor = previous_date + timedelta(days=1)
        while cursor < current_date:
            skipped_dates.append(cursor)
            cursor += timedelta(days=1)
        if not skipped_dates:
            return False
        return all(not MarketCorridorService._is_us_equity_trading_day(day) for day in skipped_dates)

    @staticmethod
    def _is_us_equity_trading_day(day: date) -> bool:
        return day.weekday() < 5 and day not in MarketCorridorService._us_equity_holidays(day.year)

    @staticmethod
    def _count_expected_us_equity_intraday_opens(
        previous_open: datetime,
        current_open: datetime,
        expected_delta: timedelta,
    ) -> int:
        previous_local = previous_open.astimezone(MarketCorridorService._new_york_tz)
        current_local = current_open.astimezone(MarketCorridorService._new_york_tz)
        cursor = previous_local + expected_delta
        expected_count = 0

        while cursor < current_local:
            if (
                MarketCorridorService._is_us_equity_trading_day(cursor.date())
                and MarketCorridorService._is_us_equity_intraday_bar_open(cursor)
            ):
                expected_count += 1
            cursor += expected_delta

        return expected_count

    @staticmethod
    def _is_us_equity_intraday_bar_open(open_time: datetime) -> bool:
        local_time = open_time.timetz().replace(tzinfo=None)
        return time(9, 30) <= local_time < time(16, 0)

    @staticmethod
    def _us_equity_holidays(year: int) -> set[date]:
        return {
            MarketCorridorService._observed_date(date(year, 1, 1)),
            MarketCorridorService._nth_weekday(year, 1, 0, 3),
            MarketCorridorService._nth_weekday(year, 2, 0, 3),
            MarketCorridorService._good_friday(year),
            MarketCorridorService._last_weekday(year, 5, 0),
            MarketCorridorService._observed_date(date(year, 6, 19)),
            MarketCorridorService._observed_date(date(year, 7, 4)),
            MarketCorridorService._nth_weekday(year, 9, 0, 1),
            MarketCorridorService._nth_weekday(year, 11, 3, 4),
            MarketCorridorService._observed_date(date(year, 12, 25)),
        }

    @staticmethod
    def _observed_date(day: date) -> date:
        if day.weekday() == 5:
            return day - timedelta(days=1)
        if day.weekday() == 6:
            return day + timedelta(days=1)
        return day

    @staticmethod
    def _nth_weekday(year: int, month: int, weekday: int, occurrence: int) -> date:
        current = date(year, month, 1)
        while current.weekday() != weekday:
            current += timedelta(days=1)
        return current + timedelta(weeks=occurrence - 1)

    @staticmethod
    def _last_weekday(year: int, month: int, weekday: int) -> date:
        current = date(year, month, monthrange(year, month)[1])
        while current.weekday() != weekday:
            current -= timedelta(days=1)
        return current

    @staticmethod
    def _good_friday(year: int) -> date:
        easter = MarketCorridorService._easter_sunday(year)
        return easter - timedelta(days=2)

    @staticmethod
    def _easter_sunday(year: int) -> date:
        a = year % 19
        b = year // 100
        c = year % 100
        d = b // 4
        e = b % 4
        f = (b + 8) // 25
        g = (b - f + 1) // 3
        h = (19 * a + b - d - g + 15) % 30
        i = c // 4
        k = c % 4
        l = (32 + 2 * e + 2 * i - h - k) % 7
        m = (a + 11 * h + 22 * l) // 451
        month = (h + l - 7 * m + 114) // 31
        day = ((h + l - 7 * m + 114) % 31) + 1
        return date(year, month, day)

    @staticmethod
    def _append_invalid_sample(
        samples: list[dict[str, Any]],
        reason: str,
        candle: dict[str, Any],
    ) -> None:
        if len(samples) >= 3:
            return
        samples.append(
            {
                "reason": reason,
                "sample": json.loads(json.dumps(candle, default=str)),
            }
        )

    @staticmethod
    def _build_diagnostic(
        target: dict[str, str],
        provider: str,
        severity: str,
        code: str,
        detail: str,
    ) -> dict[str, Any]:
        return {
            "symbol": target["symbol"],
            "market_type": target["market_type"],
            "timeframe": target["timeframe"],
            "provider": provider,
            "severity": severity,
            "code": code,
            "detail": detail,
            "observed_at_utc": datetime.now(timezone.utc).isoformat(),
        }