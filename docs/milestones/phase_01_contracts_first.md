# Phase 01 - Contracts First

## Goal

Make `packages/contracts` the single source of truth for all cross-boundary desktop/backend payloads.

## Checklist

- [x] Move canonical signal payloads into contracts.
- [x] Move health, provider settings, AI settings, alerts, and watchlist payloads into contracts.
- [ ] Add dashboard payload contracts.
- [ ] Add symbol detail and news payload contracts.
- [ ] Add backtest run and backtest result contracts.
- [ ] Add strategy persistence contracts.
- [x] Add paper trade intent and paper account contracts.
- [ ] Add WebSocket event contracts.

## Acceptance Gates

- Desktop compiles against shared contracts for all backend-backed domains.
- Backend route payloads conform to the contracts package.
- No duplicate desktop-only types exist for backend-driven payloads.
