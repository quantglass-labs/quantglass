# QuantGlass

[![CI](https://github.com/quantglass-labs/quantglass/actions/workflows/ci.yml/badge.svg)](https://github.com/quantglass-labs/quantglass/actions/workflows/ci.yml)
[![License: AGPL-3.0-or-later](https://img.shields.io/badge/license-AGPL--3.0--or--later-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/quantglass-labs/quantglass?include_prereleases)](https://github.com/quantglass-labs/quantglass/releases)

QuantGlass is an open-source, local-first trading education and research
workstation for crypto and US equities — a complete trading academy (121
lessons, missions, decision drills) fused with a working quant lab
(evidence-backed signals, statistically honest backtesting, paper trading,
behavioral coaching). Every number the engine shows is one it can defend,
and every concept it teaches can be applied against your own market data.
FastAPI backend, React/Tauri desktop app, typed contracts, extension
registries, and optional local/API AI on a strict fact-guard covenant.

<p align="center">
  <img src="docs/assets/screenshots/dashboard.png" alt="QuantGlass dashboard with market corridor chart and signals" width="900">
</p>

<p align="center">
  <img src="docs/assets/screenshots/symbol-detail.png" alt="Symbol detail with candlestick chart and decision card" width="440">
  <img src="docs/assets/screenshots/backtest.png" alt="Backtesting screen with expectancy metrics" width="440">
</p>

QuantGlass is licensed under **AGPL-3.0-or-later**. The community edition is
free to use, study, modify, and redistribute under the AGPL. Commercial licenses
are available for proprietary embedding, closed-source redistribution,
enterprise deployments, hosted offerings, and support arrangements where AGPL
compliance is not a fit.

QuantGlass is not financial advice. It is research and decision-support
software. See [DISCLAIMER.md](DISCLAIMER.md).

## Public Preview Status

QuantGlass is suitable for **community preview, local research, paper trading,
and extension development**. It is not yet a production trading product.

Current working surface:

- **QuantGlass Academy**: 121 lessons across 23 tracks (novice → expert)
  with exams, live exercises on your own market data, interactive visuals,
  spaced-repetition practice, glossary/reference library, progress
  analytics, and local completion certificates.
- **Missions**: a 108-mission behavioral catalog with interactive decision
  drills (scored on Process / Risk / Discipline), replay missions over
  stylized market episodes, and an unlock ladder gated by conduct.
- **The feedback loop**: plan-aware paper ticket → process scores and the
  decision-vs-outcome 2×2 → Journal (notes, mistake tags) → Review (weekly
  coach, repeated-mistake detection with lesson/mission prescriptions) →
  a user-authored Trading Constitution enforced at the ticket.
- **Signal engine v3**: 32 setup types across 10 taxonomy families with
  evidence-backed confidence (pooled backtests, empirical-Bayes shrinkage,
  conformal intervals, calibration tracking), context signals (regimes,
  volatility, relative strength, macro proxies, event watches), and
  portfolio/risk meta-signals wired to the constitution.
- **Backtesting workbench**: honest train/test splits, cost-stress
  scenarios, Monte Carlo drawdowns, bias/quality gates, experiment
  fingerprints, an AI research review, and a strategy composer constrained
  to data the corridor actually stores.
- **Paper venue at platform parity**: market/limit/stop entries, Day/GTC/GTD
  time in force, trailing stops, live OCO brackets from the trade plan,
  cancel, partial close, account guards, and a closure ledger with
  R-multiples — all on honest closed-candle fills, managed from a dedicated
  Portfolio screen. Live mode maps the same ticket to broker APIs (Alpaca
  reference mapping) and refuses what a broker cannot express instead of
  silently downgrading.
- **AI on every screen, all on the narration covenant**: local or API models
  (Ollama, LM Studio, OpenAI-compatible, Anthropic, Gemini, Azure, Bedrock)
  narrate engine facts behind a numeric fact guard — signal narration, an AI
  daily brief, natural-language alert creation, per-screen insights, drill
  and trade postmortems, backtest review, weekly coaching, a lesson tutor,
  and the **QuantGlass Copilot** (grounded Q&A over read-only engine tools)
  — with deterministic template fallback when no model is configured.
- **MCP server**: the same read-only tools are exposed over the Model
  Context Protocol, so Claude Desktop/Code or any MCP client can use the
  local engine as a grounded market-facts source.
- Local desktop UI with a loopback-only backend sidecar; public crypto and
  US equity market data defaults; multi-timeframe corridor with Parquet
  archive and behavioral dataset export.
- Extension registries for providers, AI gateways, strategies, indicators,
  lesson packs, mission packs, notifications, and more — with local
  automated review and trust labels.

Known limitations:

- Built-in live broker execution is not available in the public preview.
- Trade-capable keys use the OS keychain only when a usable keychain exists;
  otherwise they fall back to the encrypted local secret file.
- Installers are unsigned unless produced by a maintainer release environment.
- Provider availability depends on third-party public/keyed APIs and their rate
  limits.
- Extension APIs are intentionally early and may change before a stable plugin
  ABI is declared.

## Why Contributors Might Care

QuantGlass is built around extension points that are useful to market-data,
quant, desktop, and local-AI contributors:

- Provider adapters for market data, news, brokers, and alert channels.
- Deterministic indicators and regime features.
- Signal families and statistically honest backtests.
- Local/API model narration through Ollama, LM Studio, OpenAI, or any
  OpenAI-compatible gateway, with fact guards.
- Desktop workflows for watchlists, signals, alerts, paper trading, and
  settings.
- Packaging for a local desktop app with a managed backend sidecar.

## Repository Layout

```text
apps/
  backend/        FastAPI service, scheduler, storage, providers, signals
  desktop/        React + Tauri desktop application
packages/
  contracts/      Shared TypeScript API contracts
docs/
  technical/      Architecture and implementation docs
  user-guide/     End-user documentation
  contributing/   Extension and testing guides
examples/
  extensions/     Backend extension examples
  providers/      Provider adapter examples
  strategies/     Strategy examples
```

## Licensing And Commercial Use

- Community license: [AGPL-3.0-or-later](LICENSE).
- Commercial options: [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md).
- AGPL release checklist: [AGPL-COMPLIANCE.md](AGPL-COMPLIANCE.md).
- Third-party notices: [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
- Contributor terms: [CLA.md](CLA.md).
- Trademark guidance: [TRADEMARKS.md](TRADEMARKS.md).

The practical model is open-source core plus paid commercial options:

- Individuals, researchers, educators, and open-source users can use the AGPL
  edition.
- Companies that need proprietary redistribution, private hosted products,
  closed-source forks, or enterprise support can buy a commercial license.

## Quick Start

Install backend dependencies:

```bash
python -m venv .venv
./.venv/bin/python -m pip install -e "apps/backend[dev,package]"
```

Install desktop dependencies:

```bash
npm --prefix apps/desktop ci
```

Run backend validation:

```bash
npm run validate:backend
```

Run the backend in development:

```bash
npm run backend:dev
```

Run the backend with trusted local/installed extensions enabled:

```bash
npm run backend:dev:extensions
```

Run the desktop build:

```bash
npm run desktop:build
```

Run the desktop in development:

```bash
npm run desktop:dev
```

Run Tauri development:

```bash
npm run desktop:tauri:dev
```

Build the backend sidecar and desktop packages:

```bash
npm run backend:bundle
npm run desktop:tauri:build
```

## Common Commands

```bash
npm run backend:test
npm run backend:check
npm run backend:openapi
npm run desktop:build
npm run desktop:tauri:build
npm run validate:backend
npm run validate:release
```

## Contribution Guides

- [Contributing](CONTRIBUTING.md)
- [Good first contribution ideas](docs/contributing/good-first-issues.md)
- [Provider adapters](docs/contributing/provider-adapters.md)
- [Extension system](docs/contributing/extensions.md)
- [Extension types](docs/contributing/extension-types.md)
- [AI model gateways](docs/contributing/ai-model-gateways.md)
- [Strategy contributions](docs/contributing/strategy-plugins.md)
- [Indicator contract](docs/contributing/indicator-contract.md)
- [Testing guide](docs/contributing/testing.md)
- [Roadmap](ROADMAP.md)
- [Governance](GOVERNANCE.md)
- [Security policy](SECURITY.md)

## Project Status

QuantGlass is a young project. It has a working local backend, desktop surface,
release build path, AGPL/commercial licensing docs, and contributor extension
plumbing. Treat it as an alpha/beta research tool until CI, signed packaging,
keychain enforcement for trade-capable keys, and live-trading safety gates
mature.

Paper trading is the supported execution path. Built-in live trading remains
unavailable in the public preview.

## Documentation

- [Technical docs](docs/technical/README.md)
- [User guide](docs/user-guide/README.md)
- [Configuration reference](docs/configuration.md)
- [Changelog](CHANGELOG.md)

QuantGlass publishes its own critique. The
[production audit](docs/production_audit_report.md) is a point-in-time review
of what is and is not trustworthy yet, and the
[production fix roadmap](docs/production_fix_roadmap.md) is the public
hardening backlog derived from it — a good place to find meaningful
contributions.
