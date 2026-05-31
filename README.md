# AlphaTerminal

AlphaTerminal is now organized as a production-oriented monorepo with explicit application and package boundaries.

## Repository Layout

```text
apps/
  backend/        FastAPI service, scheduler, storage, provider manager
  desktop/        React + Tauri desktop application
packages/
  contracts/      Shared API contracts, schemas, and integration boundaries
docs/             Product and architecture documentation
mock/             Legacy high-fidelity prototypes and fixture references
```

## Primary Entry Points

- Desktop app: `apps/desktop`
- Backend service: `apps/backend`
- Contracts boundary: `packages/contracts`
- Master implementation plan: `docs/production_implementation_masterplan.md`

## Common Commands

```bash
npm run desktop:build
npm run desktop:dev
npm run desktop:tauri:dev
npm run desktop:tauri:build
```

Backend validation:

```bash
PYTHONPATH=apps/backend ./.venv/bin/python -c "from app.main import app; print(app.title, len(app.routes))"
```

## Naming Convention

- `apps/desktop`: end-user desktop application surface
- `apps/backend`: local production backend and orchestration layer
- `packages/contracts`: language-neutral schemas, OpenAPI, and shared contracts

New implementation work should land in these boundaries rather than under the legacy `mock/` prototypes.
