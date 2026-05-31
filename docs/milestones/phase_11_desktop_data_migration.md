# Phase 11 - Desktop Data Migration

## Goal

Remove remaining production-facing dependency on mock fixtures.

## Checklist

- [ ] Migrate dashboard to backend APIs.
- [ ] Migrate symbol detail data to backend APIs.
- [ ] Migrate signals inventory to backend APIs.
- [ ] Migrate backtesting results to backend APIs.
- [ ] Keep explicit loading/empty/error handling on every surface.

## Acceptance Gates

- Production paths are backend-driven.
- Fixtures are either development-only or removed.
