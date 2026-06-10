# Changelog

All notable changes to QuantGlass are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-06-10

First public preview release.

### Added

- FastAPI backend with deterministic indicators, signal generation,
  cost-aware backtesting, alerts, saved strategies, and paper-trading state.
- React + Tauri desktop app with dashboard, watchlist, signals, symbol
  detail, backtesting, alerts, learning, and settings screens.
- Provider adapters for public crypto and US equity market data, plus keyed
  Alpaca, Finnhub, Polygon, and Twelve Data support with custom provider
  profiles.
- AI narration through template fallback and a local/API model gateway
  (Ollama, LM Studio, OpenAI-compatible endpoints, and native providers)
  with fact guards.
- Extension registries for providers, AI gateways, strategies, indicators,
  backtest models, execution adapters, notifications, import/export,
  data-quality checks, and UI surfaces, with workspace extension loading.
- Interactive learning platform with a four-tier curriculum tied to live
  app data.
- Signal data freshness badges and native desktop alerts.
- Encrypted local secret storage with optional OS keychain routing for
  trade-capable keys.
- Backup/restore state bundles and license report generation.
- CI covering lint (ruff, ESLint, Prettier, rustfmt, clippy), tests
  (pytest, Vitest, cargo test), builds, and license reports; tag-driven
  release builds for Linux, Windows, and macOS.

### Security

- Backend binds to loopback only; the desktop shell manages it as a
  sidecar.
- Live broker execution is unavailable in the public preview; paper
  trading is the supported execution path.

[Unreleased]: https://github.com/quantglass-labs/quantglass/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/quantglass-labs/quantglass/releases/tag/v0.1.0
