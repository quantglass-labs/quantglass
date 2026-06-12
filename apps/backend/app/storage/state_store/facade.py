# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

"""StateStore facade composing the per-domain stores over one SQLite file.

Routes and services depend on this facade; the domain stores
(settings, watchlist, alerts, strategies, trading, learn) own their
schema and queries.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from app.core.config import AiSettings, ProviderSettings, SafetySettings
from app.storage.secret_store import EncryptedSecretStore
from app.storage.state_store.alerts import AlertsStore
from app.storage.state_store.constitution import ConstitutionStore
from app.storage.state_store.db import connect
from app.storage.state_store.journal import JournalStore
from app.storage.state_store.learn import LearnProgressStore
from app.storage.state_store.migrations import run_migrations
from app.storage.state_store.settings import SettingsStore
from app.storage.state_store.strategies import SavedStrategiesStore
from app.storage.state_store.trading import PaperTradingStore
from app.storage.state_store.watchlist import WatchlistStore


class StateStore:
    def __init__(
        self,
        sqlite_path: Path,
        secret_store: EncryptedSecretStore | None = None,
    ) -> None:
        self.sqlite_path = sqlite_path
        self._secret_store = secret_store or EncryptedSecretStore(
            sqlite_path.parent / "secrets" / "api_keys.enc",
            sqlite_path.parent / "secrets" / "api_keys.key",
        )
        self.settings = SettingsStore(sqlite_path, self._secret_store)
        self.watchlist = WatchlistStore(sqlite_path)
        self.alerts = AlertsStore(sqlite_path)
        self.strategies = SavedStrategiesStore(sqlite_path)
        self.trading = PaperTradingStore(sqlite_path)
        self.learn = LearnProgressStore(sqlite_path)
        self.journal = JournalStore(sqlite_path)
        self.constitution = ConstitutionStore(sqlite_path)

    def initialize(
        self,
        provider_settings: ProviderSettings,
        safety_settings: SafetySettings,
        ai_settings: AiSettings,
    ) -> None:
        self.sqlite_path.parent.mkdir(parents=True, exist_ok=True)
        with connect(self.sqlite_path) as connection:
            self.watchlist.ensure_schema(connection)
            self.settings.ensure_schema(connection)
            self.alerts.ensure_schema(connection)
            self.strategies.ensure_schema(connection)
            self.trading.ensure_schema(connection)
            self.learn.ensure_schema(connection)
            self.journal.ensure_schema(connection)
            self.constitution.ensure_schema(connection)
            run_migrations(connection)
            self.settings.ensure_defaults(
                connection, provider_settings, safety_settings, ai_settings
            )
            connection.commit()

    # ------------------------------------------------------------------
    # Settings
    # ------------------------------------------------------------------

    def get_provider_settings(self) -> ProviderSettings:
        return self.settings.get_provider_settings()

    def get_safety_settings(self) -> SafetySettings:
        return self.settings.get_safety_settings()

    def update_provider_settings(
        self,
        provider_settings: ProviderSettings,
        safety_settings: SafetySettings,
    ) -> None:
        self.settings.update_provider_settings(provider_settings, safety_settings)

    def list_custom_provider_profiles(self) -> list[dict[str, Any]]:
        return self.settings.list_custom_provider_profiles()

    def upsert_custom_provider_profile(self, profile: dict[str, Any]) -> dict[str, Any]:
        return self.settings.upsert_custom_provider_profile(profile)

    def delete_custom_provider_profile(self, profile_id: str) -> bool:
        return self.settings.delete_custom_provider_profile(profile_id)

    def get_ai_settings(self) -> AiSettings:
        return self.settings.get_ai_settings()

    def update_ai_settings(self, ai_settings: AiSettings) -> AiSettings:
        return self.settings.update_ai_settings(ai_settings)

    def get_api_key_value(self, key_id: str | None) -> str:
        return self.settings.get_api_key_value(key_id)

    def get_extension_settings(self, extension_id: str) -> dict[str, Any]:
        return self.settings.get_extension_settings(extension_id)

    def update_extension_settings(
        self,
        extension_id: str,
        settings: dict[str, Any],
    ) -> dict[str, Any]:
        return self.settings.update_extension_settings(extension_id, settings)

    def list_api_keys(self) -> list[dict[str, Any]]:
        return self.settings.list_api_keys()

    def update_api_key(self, key_id: str, value: str) -> dict[str, Any]:
        return self.settings.update_api_key(key_id, value)

    # ------------------------------------------------------------------
    # Watchlist
    # ------------------------------------------------------------------

    def list_watchlist(self) -> list[dict[str, str | None]]:
        return self.watchlist.list_watchlist()

    def add_watchlist_symbol(
        self,
        symbol: str,
        market_type: str,
        notes: str | None = None,
    ) -> dict[str, str | None]:
        return self.watchlist.add_watchlist_symbol(symbol, market_type, notes)

    def delete_watchlist_symbol(self, symbol: str) -> bool:
        return self.watchlist.delete_watchlist_symbol(symbol)

    # ------------------------------------------------------------------
    # Alerts
    # ------------------------------------------------------------------

    def list_alerts(self) -> list[dict[str, Any]]:
        return self.alerts.list_alerts()

    def create_alert(
        self,
        symbol: str,
        condition: str,
        channel: str,
        status: str = "armed",
    ) -> dict[str, Any]:
        return self.alerts.create_alert(symbol, condition, channel, status)

    def get_alert(self, alert_id: str) -> dict[str, Any]:
        return self.alerts.get_alert(alert_id)

    def update_alert(
        self,
        alert_id: str,
        symbol: str,
        condition: str,
        channel: str,
        status: str,
    ) -> dict[str, Any]:
        return self.alerts.update_alert(alert_id, symbol, condition, channel, status)

    def list_alert_history(self) -> list[dict[str, Any]]:
        return self.alerts.list_alert_history()

    def record_alert_fire(
        self,
        alert_id: str,
        message: str,
        fired_at: str | None = None,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        return self.alerts.record_alert_fire(alert_id, message, fired_at)

    # ------------------------------------------------------------------
    # Saved strategies
    # ------------------------------------------------------------------

    def list_saved_strategies(self) -> list[dict[str, Any]]:
        return self.strategies.list_saved_strategies()

    def save_strategy(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self.strategies.save_strategy(payload)

    def delete_saved_strategy(self, strategy_id: str) -> bool:
        return self.strategies.delete_saved_strategy(strategy_id)

    # ------------------------------------------------------------------
    # Paper / live trading
    # ------------------------------------------------------------------

    def get_paper_account(self) -> dict[str, Any]:
        return self.trading.get_paper_account()

    def replace_paper_account(self, account: dict[str, Any]) -> dict[str, Any]:
        return self.trading.replace_paper_account(account)

    def list_paper_trade_intents(self) -> list[dict[str, Any]]:
        return self.trading.list_paper_trade_intents()

    def submit_paper_trade(
        self,
        signal_id: str,
        symbol: str,
        side: str,
        quantity: float,
        entry_price: float,
        trading_mode: str,
        plan: dict[str, Any] | None = None,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        return self.trading.submit_paper_trade(
            signal_id, symbol, side, quantity, entry_price, trading_mode, plan=plan
        )

    def record_live_trade(
        self,
        signal_id: str,
        symbol: str,
        side: str,
        quantity: float,
        entry_price: float,
        provider: str,
        broker_trade: dict[str, Any],
    ) -> dict[str, Any]:
        return self.trading.record_live_trade(
            signal_id, symbol, side, quantity, entry_price, provider, broker_trade
        )

    def process_pending_paper_trades(
        self,
        latest_prices: dict[str, float],
    ) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        return self.trading.process_pending_paper_trades(latest_prices)

    def list_paper_closures(self, limit: int = 200) -> list[dict[str, Any]]:
        return self.trading.list_paper_closures(limit)

    def cancel_paper_intent(self, intent_id: str) -> bool:
        return self.trading.cancel_paper_intent(intent_id)

    def close_paper_position(self, symbol_id: str, latest_price: float):
        return self.trading.close_paper_position(symbol_id, latest_price)

    def enforce_paper_brackets(self, latest_prices: dict[str, float]) -> list[dict[str, Any]]:
        return self.trading.enforce_paper_brackets(latest_prices)

    def refresh_paper_position_marks(self, latest_prices: dict[str, float]) -> dict[str, Any]:
        return self.trading.refresh_paper_position_marks(latest_prices)

    # ------------------------------------------------------------------
    # Learning progress
    # ------------------------------------------------------------------

    def get_learn_progress(self) -> dict[str, Any]:
        return self.learn.get_learn_progress()

    def mark_lesson_complete(self, lesson_id: str) -> None:
        self.learn.mark_lesson_complete(lesson_id)

    def record_lesson_attempt(self, lesson_id: str) -> None:
        self.learn.record_lesson_attempt(lesson_id)

    def get_assessments(self) -> dict[str, Any]:
        return self.learn.get_assessments()

    def record_assessment(self, level: str, score: int, passed: bool) -> None:
        self.learn.record_assessment(level, score, passed)

    def get_completed_missions(self) -> dict[str, str]:
        return self.learn.get_completed_missions()

    def record_mission_complete(self, mission_id: str) -> None:
        self.learn.record_mission_complete(mission_id)

    def get_scenario_results(self) -> dict[str, Any]:
        return self.learn.get_scenario_results()

    def record_scenario_result(self, scenario_id: str, percent: int, passed: bool) -> None:
        self.learn.record_scenario_result(scenario_id, percent, passed)

    def get_review_cards(self) -> dict[str, Any]:
        return self.learn.get_review_cards()

    def upsert_review_card(self, term: str, lesson_id: str, card: dict[str, Any]) -> None:
        self.learn.upsert_review_card(term, lesson_id, card)

    def get_activity_days(self) -> list[str]:
        return self.learn.get_activity_days()

    def get_active_missions(self) -> dict[str, str]:
        return self.learn.get_active_missions()

    def set_mission_active(self, mission_id: str) -> None:
        self.learn.set_mission_active(mission_id)

    def clear_mission_active(self, mission_id: str) -> None:
        self.learn.clear_mission_active(mission_id)

    def get_drill_results(self) -> dict[str, Any]:
        return self.learn.get_drill_results()

    def record_drill_result(self, category: str, percent: int, passed: bool) -> None:
        self.learn.record_drill_result(category, percent, passed)

    def get_journal_notes(self) -> dict[str, Any]:
        return self.journal.get_journal_notes()

    def upsert_journal_note(self, intent_id: str, note: str, tags: list[str]) -> dict[str, Any]:
        return self.journal.upsert_journal_note(intent_id, note, tags)

    def get_constitution(self) -> dict[str, Any] | None:
        return self.constitution.get_constitution()

    def save_constitution(self, rules: dict[str, Any]) -> dict[str, Any]:
        return self.constitution.save_constitution(rules)
