# Phase 02 - Backend Refactor

## Goal

Refactor the backend from route-centric scaffolding to a production-ready service and repository structure.

## Checklist

- [ ] Split inline route logic into services.
- [ ] Introduce repository modules for SQLite and DuckDB access.
- [ ] Define migration strategy for SQLite schema changes.
- [ ] Introduce domain models for provider config, alerts, strategies, and paper account state.
- [ ] Add structured logging and startup diagnostics.

## Acceptance Gates

- Routes are thin orchestration layers only.
- Persistence and business logic are outside route files.
- Schema evolution is deterministic and reviewable.
