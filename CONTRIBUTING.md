# Contributing To QuantGlass

QuantGlass welcomes contributions that improve the local-first market research
workstation while keeping the project honest about risk, data quality, and
statistical evidence.

## Good Contribution Areas

- Provider adapters for market data, news, brokers, and alert channels.
- Extensions for provider, model, indicator, strategy, backtest, execution,
  notification, import/export, data-quality, and UI surfaces.
- Indicators and feature calculations.
- Signal families and backtest realism.
- Local/API AI narration prompts, guards, and model gateway profiles.
- Desktop usability and accessibility.
- Tests, fixtures, documentation, and release automation.

Start with issues labeled `good first issue`, `help wanted`, `provider-adapter`,
`strategy`, `indicator`, `frontend`, `backend`, `testing`, or `docs`. For
starter scopes that are already shaped for review, see
[Good first contribution ideas](docs/contributing/good-first-issues.md).

## Development Setup

Backend:

```bash
python -m venv .venv
./.venv/bin/python -m pip install -e "apps/backend[dev,package]"
npm run backend:test
```

Desktop:

```bash
npm --prefix apps/desktop ci
npm run desktop:build
```

Full local validation:

```bash
npm run validate:backend
npm run desktop:build
```

Tauri packaging requires the platform-specific Tauri build dependencies. Use:

```bash
npm run backend:bundle
npm run desktop:tauri:build
```

## Pull Request Standards

- Keep changes scoped.
- Add or update tests for behavior changes.
- Update docs when behavior, setup, licensing, or user workflows change.
- Do not commit `.venv`, `node_modules`, build outputs, local databases, secrets,
  packaged binaries, or generated state.
- Preserve the local-first design unless the change explicitly introduces an
  optional integration.
- Do not present generated market notes, AI narration, or backtests as financial
  advice.

## Contributor License

By submitting a pull request, you agree to the contributor terms in CLA.md. The
short version: you keep ownership of your contribution, but you grant the project
the right to use and relicense it under both the AGPL community license and
separate commercial licenses.

## Code Style

- Follow the existing project structure.
- Prefer typed contracts over ad hoc payloads.
- Keep provider adapters capability-scoped.
- Keep signal and backtest math deterministic and testable.
- Make AI narration explain engine facts only; do not let the model invent
  prices, probabilities, or recommendations.

## Extension Guides

- Provider adapters: [docs/contributing/provider-adapters.md](docs/contributing/provider-adapters.md)
- Good first issues: [docs/contributing/good-first-issues.md](docs/contributing/good-first-issues.md)
- Extension packages: [docs/contributing/extensions.md](docs/contributing/extensions.md)
- Extension types: [docs/contributing/extension-types.md](docs/contributing/extension-types.md)
- AI model gateways: [docs/contributing/ai-model-gateways.md](docs/contributing/ai-model-gateways.md)
- Strategy plugins: [docs/contributing/strategy-plugins.md](docs/contributing/strategy-plugins.md)

## Reporting Security Issues

Do not open public issues for sensitive security reports. Follow SECURITY.md.
