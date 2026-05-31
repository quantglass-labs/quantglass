from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.alerts import router as alerts_router
from app.api.routes.content import router as content_router
from app.api.routes.events import router as events_router
from app.api.routes.health import router as health_router
from app.api.routes.market import router as market_router
from app.api.routes.paper import router as paper_router
from app.api.routes.providers import router as providers_router
from app.api.routes.settings import router as settings_router
from app.api.routes.strategies import router as strategies_router
from app.api.routes.watchlist import router as watchlist_router
from app.core.config import apply_api_key_settings, get_settings
from app.providers.manager import ProviderManager
from app.scheduler import SchedulerService
from app.services.event_bus import BackendEventBus
from app.services.execution_engine import ExecutionEngineService
from app.services.market_corridor import MarketCorridorService
from app.services.narration import NarrationService
from app.services.notifications import AlertNotificationService
from app.services.rate_limits import InMemoryRateLimiter
from app.services.signal_engine import SignalEngineService
from app.services.trading import TradingExecutionService
from app.storage.analytics_store import AnalyticsStore
from app.storage.state_store import StateStore


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    state_store = StateStore(settings.sqlite_path)
    analytics_store = AnalyticsStore(settings.duckdb_path, settings.parquet_dir)
    event_bus = BackendEventBus()
    rate_limiter = InMemoryRateLimiter()

    state_store.initialize(settings.provider_settings, settings.safety, settings.ai)
    persisted_provider_settings = state_store.get_provider_settings()
    runtime_settings = apply_api_key_settings(settings, state_store.list_api_keys())
    provider_manager = ProviderManager(persisted_provider_settings, runtime_settings)
    analytics_store.initialize()
    notification_service = AlertNotificationService(state_store)
    trading_service = TradingExecutionService(state_store, provider_manager, event_bus)
    execution_engine = ExecutionEngineService(state_store, analytics_store, event_bus, notification_service)
    market_corridor_service = MarketCorridorService(provider_manager, analytics_store, rate_limiter)
    narration_service = NarrationService(ai_settings_provider=state_store.get_ai_settings)
    signal_engine = SignalEngineService(
        analytics_store=analytics_store,
        min_backtest_sample=state_store.get_safety_settings().min_backtest_sample,
        narrator=narration_service,
    )
    scheduler_service = SchedulerService(
        execution_engine,
        event_bus,
        market_corridor=market_corridor_service,
        signal_engine=signal_engine,
    )
    scheduler_service.start()

    app.state.settings = settings
    app.state.state_store = state_store
    app.state.analytics_store = analytics_store
    app.state.provider_manager = provider_manager
    app.state.event_bus = event_bus
    app.state.notification_service = notification_service
    app.state.trading_service = trading_service
    app.state.execution_engine = execution_engine
    app.state.market_corridor_service = market_corridor_service
    app.state.signal_engine = signal_engine
    app.state.scheduler_service = scheduler_service
    app.state.rate_limiter = rate_limiter

    try:
        yield
    finally:
        scheduler_service.shutdown()


app = FastAPI(
    title="AlphaTerminal Backend",
    version="0.1.0",
    lifespan=lifespan,
)

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
app.include_router(settings_router)
app.include_router(strategies_router)
app.include_router(watchlist_router)
app.include_router(alerts_router)
app.include_router(events_router)