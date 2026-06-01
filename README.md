# QuantGlass

QuantGlass is an open-source, local-first market research and paper-trading
workstation. It combines a FastAPI backend, a React/Tauri desktop app, typed
contracts, deterministic signal and backtest logic, provider adapters, alerting,
and local AI narration.

QuantGlass is licensed under **AGPL-3.0-or-later**. The community edition is
free to use, study, modify, and redistribute under the AGPL. Commercial licenses
are available for proprietary embedding, closed-source redistribution,
enterprise deployments, hosted offerings, and support arrangements where AGPL
compliance is not a fit.

QuantGlass is not financial advice. It is research and decision-support
software. See [DISCLAIMER.md](DISCLAIMER.md).

## Why Contributors Might Care

QuantGlass is built around extension points that are useful to market-data,
quant, desktop, and local-AI contributors:

- Provider adapters for market data, news, brokers, and alert channels.
- Deterministic indicators and regime features.
- Signal families and statistically honest backtests.
- Local Ollama narration with fact guards.
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
  providers/      Provider adapter examples
  strategies/     Strategy examples
```

## Licensing And Commercial Use

- Community license: [AGPL-3.0-or-later](LICENSE).
- Commercial options: [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md).
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
- [Provider adapters](docs/contributing/provider-adapters.md)
- [Strategy contributions](docs/contributing/strategy-plugins.md)
- [Indicator contract](docs/contributing/indicator-contract.md)
- [Testing guide](docs/contributing/testing.md)
- [Roadmap](ROADMAP.md)
- [Governance](GOVERNANCE.md)
- [Security policy](SECURITY.md)

## Project Status

QuantGlass is a young project. It has a working local backend and desktop
surface, but it should be treated as an alpha/beta research tool until the
release checklist, CI, packaging, security hardening, and live-trading safety
gates mature.

Paper trading is the safe default. Live trading must remain explicitly gated.

## Documentation

- [Technical docs](docs/technical/README.md)
- [User guide](docs/user-guide/README.md)
- [Production audit](docs/production_audit_report.md)
- [Production fix roadmap](docs/production_fix_roadmap.md)
