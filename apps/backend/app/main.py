# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.alerts import router as alerts_router
from app.api.routes.constitution import router as constitution_router
from app.api.routes.content import router as content_router
from app.api.routes.copilot import router as copilot_router
from app.api.routes.events import router as events_router
from app.api.routes.extensions import router as extensions_router
from app.api.routes.health import router as health_router
from app.api.routes.journal import router as journal_router
from app.api.routes.learn import router as learn_router
from app.api.routes.market import router as market_router
from app.api.routes.mcp import router as mcp_router
from app.api.routes.paper import router as paper_router
from app.api.routes.providers import router as providers_router
from app.api.routes.settings import router as settings_router
from app.api.routes.strategies import router as strategies_router
from app.api.routes.watchlist import router as watchlist_router
from app.core.config import apply_api_key_settings, get_settings
from app.extensions.registry import load_extension_registry
from app.providers.manager import ProviderManager
from app.scheduler import SchedulerService
from app.server_mode import configure_server_mode
from app.services.ai_coach import AiCoachService
from app.services.constitution import ConstitutionService
from app.services.copilot import CopilotService
from app.services.dataset_export import DatasetExportService
from app.services.event_bus import BackendEventBus
from app.services.execution_engine import ExecutionEngineService
from app.services.extension_surface_registry import ExtensionSurfaceRegistry
from app.services.indicator_registry import IndicatorRegistry
from app.services.learn_assessments import LearnAssessmentService
from app.services.learn_live import LearnLiveExerciseService
from app.services.learn_mastery import LearnMasteryService
from app.services.learn_moments import LearnMomentsService
from app.services.learn_readiness import LearnReadinessService
from app.services.learn_service import LearnService
from app.services.lesson_pack_registry import LessonPackRegistry
from app.services.locale import set_locale
from app.services.market_corridor import MarketCorridorService
from app.services.mission_pack_registry import MissionPackRegistry
from app.services.missions import MissionService
from app.services.model_gateway import ModelGateway
from app.services.narration import NarrationService
from app.services.notifications import AlertNotificationService
from app.services.rate_limits import InMemoryRateLimiter
from app.services.research_review import ResearchReviewService
from app.services.review_coach import ReviewCoachService
from app.services.risk_meta import RiskMetaService
from app.services.scenarios import ScenarioService
from app.services.signal_engine import SignalEngineService
from app.services.strategy_registry import StrategyRegistry
from app.services.trade_review import TradeReviewService
from app.services.trading import TradingExecutionService
from app.storage.analytics_store import AnalyticsStore
from app.storage.state_store import StateStore
from app.version import __version__


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    state_store = StateStore(settings.sqlite_path)
    analytics_store = AnalyticsStore(settings.duckdb_path, settings.parquet_dir)
    event_bus = BackendEventBus()
    rate_limiter = InMemoryRateLimiter()
    strategy_registry = StrategyRegistry()
    indicator_registry = IndicatorRegistry()
    surface_registry = ExtensionSurfaceRegistry()
    lesson_pack_registry = LessonPackRegistry()
    mission_pack_registry = MissionPackRegistry()

    state_store.initialize(settings.provider_settings, settings.safety, settings.ai)
    persisted_provider_settings = state_store.get_provider_settings()
    runtime_settings = apply_api_key_settings(settings, state_store.list_api_keys())
    persisted_safety_settings = state_store.get_safety_settings()
    provider_manager = ProviderManager(
        persisted_provider_settings,
        runtime_settings,
        persisted_safety_settings,
        custom_provider_profiles=state_store.list_custom_provider_profiles(),
        api_key_provider=state_store.get_api_key_value,
    )
    # Enabled by the env var (dev) or the persisted UI preference (desktop). Read
    # once at startup; toggling the preference takes effect on the next launch.
    extensions_active = (
        settings.enable_extension_entry_points or state_store.get_extensions_enabled()
    )
    extension_registry = load_extension_registry(
        provider_manager,
        strategy_registry=strategy_registry,
        indicator_registry=indicator_registry,
        surface_registry=surface_registry,
        lesson_pack_registry=lesson_pack_registry,
        mission_pack_registry=mission_pack_registry,
        extension_settings_provider=state_store.get_extension_settings,
        enable_entry_points=extensions_active,
        extension_paths=(
            settings.workspace_root / "extensions",
            settings.data_dir / "extensions",
        ),
    )
    analytics_store.initialize()
    notification_service = AlertNotificationService(state_store)
    trading_service = TradingExecutionService(state_store, provider_manager, event_bus)
    execution_engine = ExecutionEngineService(
        state_store, analytics_store, event_bus, notification_service
    )
    market_corridor_service = MarketCorridorService(
        provider_manager,
        analytics_store,
        rate_limiter,
        watchlist_provider=state_store.list_watchlist,
    )
    model_gateway = ModelGateway(api_key_provider=state_store.get_api_key_value)
    narration_service = NarrationService(
        ai_settings_provider=state_store.get_ai_settings,
        model_gateway=model_gateway,
    )
    signal_engine = SignalEngineService(
        analytics_store=analytics_store,
        min_backtest_sample=state_store.get_safety_settings().min_backtest_sample,
        narrator=narration_service,
        strategy_registry=strategy_registry,
    )
    research_review_service = ResearchReviewService(
        ai_settings_provider=state_store.get_ai_settings,
        model_gateway=model_gateway,
    )
    signal_engine.attach_research_review(research_review_service)
    scheduler_service = SchedulerService(
        execution_engine,
        event_bus,
        market_corridor=market_corridor_service,
        signal_engine=signal_engine,
    )
    learn_service = LearnService(state_store, lesson_pack_registry)
    learn_moments_service = LearnMomentsService(state_store, analytics_store)
    learn_live_service = LearnLiveExerciseService(state_store, analytics_store)
    learn_readiness_service = LearnReadinessService(state_store, learn_moments_service)
    learn_assessment_service = LearnAssessmentService(state_store)
    trade_review_service = TradeReviewService(state_store, analytics_store)
    mission_service = MissionService(state_store, trade_review_service, mission_pack_registry)
    review_coach_service = ReviewCoachService(state_store, trade_review_service, learn_service)
    constitution_service = ConstitutionService(state_store)
    scenario_service = ScenarioService(state_store)
    learn_mastery_service = LearnMasteryService(state_store, learn_service)
    risk_meta_service = RiskMetaService(state_store, trade_review_service, constitution_service)
    ai_coach_service = AiCoachService(
        ai_settings_provider=state_store.get_ai_settings,
        review_coach_service=review_coach_service,
        learn_service=learn_service,
        model_gateway=model_gateway,
    )
    copilot_service = CopilotService(
        ai_settings_provider=state_store.get_ai_settings,
        model_gateway=model_gateway,
    )
    dataset_export_service = DatasetExportService(
        state_store, analytics_store, settings.data_dir / "exports"
    )
    scheduler_service.start()

    app.state.settings = settings
    app.state.state_store = state_store
    app.state.analytics_store = analytics_store
    app.state.provider_manager = provider_manager
    app.state.extension_registry = extension_registry
    app.state.extensions_active = extensions_active
    app.state.strategy_registry = strategy_registry
    app.state.indicator_registry = indicator_registry
    app.state.surface_registry = surface_registry
    app.state.lesson_pack_registry = lesson_pack_registry
    app.state.mission_pack_registry = mission_pack_registry
    app.state.event_bus = event_bus
    app.state.notification_service = notification_service
    app.state.trading_service = trading_service
    app.state.execution_engine = execution_engine
    app.state.market_corridor_service = market_corridor_service
    app.state.signal_engine = signal_engine
    app.state.scheduler_service = scheduler_service
    app.state.rate_limiter = rate_limiter
    app.state.model_gateway = model_gateway
    app.state.learn_service = learn_service
    app.state.learn_moments_service = learn_moments_service
    app.state.learn_live_service = learn_live_service
    app.state.learn_readiness_service = learn_readiness_service
    app.state.learn_assessment_service = learn_assessment_service
    app.state.trade_review_service = trade_review_service
    app.state.mission_service = mission_service
    app.state.review_coach_service = review_coach_service
    app.state.constitution_service = constitution_service
    app.state.scenario_service = scenario_service
    app.state.learn_mastery_service = learn_mastery_service
    app.state.risk_meta_service = risk_meta_service
    app.state.ai_coach_service = ai_coach_service
    app.state.copilot_service = copilot_service
    app.state.dataset_export_service = dataset_export_service

    try:
        yield
    finally:
        scheduler_service.shutdown()


class LocaleMiddleware:
    """Pure-ASGI middleware recording each request's ``Accept-Language`` as the
    active locale (see :mod:`app.services.locale`). Implemented as raw ASGI rather
    than ``BaseHTTPMiddleware`` so the ContextVar it sets propagates into the
    endpoint and the threadpool that runs the AI services."""

    def __init__(self, app: object) -> None:
        self.app = app

    async def __call__(self, scope: dict, receive: object, send: object) -> None:
        if scope.get("type") == "http":
            raw: str | None = None
            for key, value in scope.get("headers") or []:
                if key == b"accept-language":
                    raw = value.decode("latin-1")
                    break
            set_locale(raw)
        await self.app(scope, receive, send)  # type: ignore[operator]


app = FastAPI(
    title="QuantGlass Backend",
    version=__version__,
    lifespan=lifespan,
)

app.add_middleware(LocaleMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:1420",
        "http://localhost:1420",
        "http://127.0.0.1:4173",
        "http://localhost:4173",
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "tauri://localhost",
        "http://tauri.localhost",
        "https://tauri.localhost",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(content_router)
app.include_router(market_router)
app.include_router(paper_router)
app.include_router(providers_router)
app.include_router(extensions_router)
app.include_router(settings_router)
app.include_router(strategies_router)
app.include_router(watchlist_router)
app.include_router(alerts_router)
app.include_router(events_router)
app.include_router(learn_router)
app.include_router(journal_router)
app.include_router(constitution_router)
app.include_router(mcp_router)
app.include_router(copilot_router)

# Server/web mode (Docker self-host): the AGPL §13 source offer (always) and an
# optional auth gate when QUANTGLASS_SERVER_AUTH_TOKEN is set. Registered before
# the SPA mount so /source and /__auth are not shadowed by the catch-all "/".
configure_server_mode(app, auth_token=get_settings().server_auth_token)

# When a built frontend directory is configured, serve the SPA at "/". Mounted
# last so it never shadows /api or /ws routes. The desktop sidecar leaves
# frontend_dir unset and skips this.
_frontend_dir = get_settings().frontend_dir
if _frontend_dir is not None and _frontend_dir.is_dir():
    from fastapi.staticfiles import StaticFiles

    app.mount("/", StaticFiles(directory=str(_frontend_dir), html=True), name="frontend")
