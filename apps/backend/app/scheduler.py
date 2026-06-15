# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from datetime import UTC, datetime, timedelta
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.services.event_bus import BackendEventBus
from app.services.execution_engine import ExecutionEngineService


class SchedulerService:
    def __init__(
        self,
        execution_engine: ExecutionEngineService,
        event_bus: BackendEventBus,
        market_corridor: Any | None = None,
        signal_engine: Any | None = None,
        market_refresh_minutes: int = 5,
        signal_refresh_minutes: int = 5,
    ) -> None:
        self._scheduler = AsyncIOScheduler(timezone="UTC")
        self._execution_engine = execution_engine
        self._event_bus = event_bus
        self._market_corridor = market_corridor
        self._signal_engine = signal_engine
        self._market_refresh_minutes = market_refresh_minutes
        self._signal_refresh_minutes = signal_refresh_minutes
        self._last_heartbeat: str | None = None
        self._last_market_refresh: str | None = None
        self._last_signal_refresh: str | None = None
        self._configure_jobs()

    def _configure_jobs(self) -> None:
        self._scheduler.add_job(
            self._heartbeat_job,
            trigger="interval",
            minutes=15,
            id="provider-heartbeat",
            replace_existing=True,
        )
        self._scheduler.add_job(
            self._alert_job,
            trigger="interval",
            minutes=1,
            id="alert-evaluator",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
        )
        self._scheduler.add_job(
            self._paper_job,
            trigger="interval",
            seconds=30,
            id="paper-execution",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
        )
        now = datetime.now(UTC)
        if self._market_corridor is not None:
            self._scheduler.add_job(
                self._market_refresh_job,
                trigger="interval",
                minutes=self._market_refresh_minutes,
                id="market-refresh",
                replace_existing=True,
                coalesce=True,
                max_instances=1,
                # Start ingesting shortly after boot instead of one interval later.
                next_run_time=now + timedelta(seconds=5),
            )
        if self._signal_engine is not None:
            self._scheduler.add_job(
                self._signal_refresh_job,
                trigger="interval",
                minutes=self._signal_refresh_minutes,
                id="signal-refresh",
                replace_existing=True,
                coalesce=True,
                max_instances=1,
                # Warm the signal cache right after boot so returning users (who
                # already have candles) get signals within seconds, not minutes.
                next_run_time=now + timedelta(seconds=15),
            )

    def start(self) -> None:
        if not self._scheduler.running:
            self._scheduler.start()

    def shutdown(self) -> None:
        if self._scheduler.running:
            self._scheduler.shutdown(wait=False)

    def status(self) -> dict[str, object]:
        return {
            "running": self._scheduler.running,
            "jobs": [job.id for job in self._scheduler.get_jobs()],
            "last_heartbeat_utc": self._last_heartbeat,
            "last_market_refresh_utc": self._last_market_refresh,
            "last_signal_refresh_utc": self._last_signal_refresh,
        }

    def _heartbeat_job(self) -> None:
        self._last_heartbeat = datetime.now(UTC).isoformat()
        self._event_bus.publish(
            "backend.heartbeat",
            {
                "observed_at_utc": self._last_heartbeat,
            },
        )

    def _alert_job(self) -> None:
        try:
            self._execution_engine.run_alert_cycle()
        except Exception as exc:
            self._event_bus.publish(
                "scheduler.job_error",
                {
                    "job": "alert-evaluator",
                    "message": str(exc),
                },
            )

    def _paper_job(self) -> None:
        try:
            self._execution_engine.run_paper_cycle()
        except Exception as exc:
            self._event_bus.publish(
                "scheduler.job_error",
                {
                    "job": "paper-execution",
                    "message": str(exc),
                },
            )

    def _market_refresh_job(self) -> None:
        if self._market_corridor is None:
            return
        try:
            result = self._market_corridor.refresh()
            self._last_market_refresh = datetime.now(UTC).isoformat()
            self._event_bus.publish(
                "market.corridor.refreshed",
                {
                    "observed_at_utc": self._last_market_refresh,
                    "refreshed": len(result.get("items", [])) if isinstance(result, dict) else 0,
                },
            )
        except Exception as exc:
            self._event_bus.publish(
                "scheduler.job_error",
                {
                    "job": "market-refresh",
                    "message": str(exc),
                },
            )

    def _signal_refresh_job(self) -> None:
        if self._signal_engine is None:
            return
        try:
            signals = self._signal_engine.list_signals()
            self._last_signal_refresh = datetime.now(UTC).isoformat()
            self._event_bus.publish(
                "signals.refreshed",
                {
                    "observed_at_utc": self._last_signal_refresh,
                    "count": len(signals),
                },
            )
        except Exception as exc:
            self._event_bus.publish(
                "scheduler.job_error",
                {
                    "job": "signal-refresh",
                    "message": str(exc),
                },
            )
