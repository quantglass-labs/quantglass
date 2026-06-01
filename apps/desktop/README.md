# QuantGlass Desktop

Desktop application built with React, TypeScript, Tailwind, React Router, TradingView Lightweight Charts, and a Tauri shell. It still renders the market, signal, and analytics surfaces from local fixtures, but now integrates with the local backend for health, provider settings, AI settings, alerts, and watchlist persistence when the backend is available.

## Windows Client Release

A portable Windows client build is available at `release/windows/QuantGlass-0.1.0-windows-x64-portable.zip`.

- Launch `QuantGlass.exe` on a Windows x64 machine.
- Microsoft Edge WebView2 is required on the client machine.
- This is still a mock-first desktop build: market data stays fixture-driven, backend-backed integrations currently cover health, provider settings, AI settings, alerts, and watchlist persistence, and live trading remains gated.

## Run

```bash
npm install
npm run dev
```

To enable the current backend integration locally, run the FastAPI service from `../backend` on `http://127.0.0.1:8000` or set `VITE_BACKEND_BASE_URL` to the backend origin.

## Build

```bash
npm run build
```

## Tauri Shell

```bash
npm install
npm run tauri:dev
```

The Tauri shell lives in `src-tauri/` and targets the same mock-first desktop build.

For Linux packaging:

```bash
npm run tauri:build
```

For a Windows cross-build from Linux:

```bash
cargo tauri build --target x86_64-pc-windows-gnu --no-bundle
```

That command produces a portable Windows executable at `src-tauri/target/x86_64-pc-windows-gnu/release/quantglass_desktop.exe`. Installer packaging still needs a Windows-oriented bundling toolchain if you want NSIS or MSI output instead of the portable `.exe`.

## Backend Integration Boundary

The first implementation slice now lives in `../backend/` and provides a local FastAPI skeleton aligned to the architecture doc:

- FastAPI app with health, provider-settings, AI settings, alerts, watchlist, and WebSocket skeleton routes
- APScheduler service for periodic local jobs
- SQLite for state scaffolding and DuckDB for analytics scaffolding
- Capability-segregated provider manager for crypto, stocks, news, and trading adapters
