BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS watchlist_entries (
    symbol TEXT PRIMARY KEY,
    market_type TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS provider_settings (
    settings_key TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    condition TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'desktop',
    status TEXT NOT NULL DEFAULT 'armed',
    last_fired TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alert_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    message TEXT NOT NULL,
    channel TEXT NOT NULL,
    fired_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS saved_strategies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    symbol_id TEXT NOT NULL,
    setup_type TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    saved_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS paper_account_state (
    account_key TEXT PRIMARY KEY,
    balance REAL NOT NULL,
    buying_power REAL NOT NULL,
    realized_pnl REAL NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS paper_positions (
    symbol_id TEXT PRIMARY KEY,
    side TEXT NOT NULL,
    quantity REAL NOT NULL,
    average_price REAL NOT NULL,
    pnl REAL NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS paper_trade_intents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    signal_id TEXT NOT NULL,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,
    quantity REAL NOT NULL,
    entry_price REAL NOT NULL,
    trading_mode TEXT NOT NULL,
    submitted_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    executed_at TEXT,
    executed_price REAL,
    provider TEXT,
    external_order_id TEXT,
    broker_status TEXT
);

COMMIT;