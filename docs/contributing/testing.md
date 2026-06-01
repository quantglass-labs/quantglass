# Testing Guide

## Backend

Run the complete backend suite:

```bash
PYTHONPATH=apps/backend ./.venv/bin/python -m pytest apps/backend/tests
```

The root shortcut is:

```bash
npm run backend:test
```

## Desktop

```bash
npm --prefix apps/desktop ci
npm run desktop:build
npm --prefix apps/desktop audit --audit-level=moderate
```

## Packaging

```bash
npm run backend:bundle
npm run desktop:tauri:build
```

Tauri packaging requires native Linux, macOS, or Windows dependencies depending
on the target platform.

## What Needs Tests

- Provider adapters.
- Timestamp normalization.
- Signal setup classification.
- Backtest entry/stop/target behavior.
- Secret storage and migration.
- Live-trading safety gates.
- AI narration fact guards.
