# Contracts Package

This boundary is reserved for production-grade shared contracts between the desktop app and the backend.

## Intended Contents

- OpenAPI specifications for backend endpoints
- JSON schemas for persistent records and event payloads
- Shared naming conventions for provider routes, safety settings, and signal payloads
- Generated client artifacts later, if they are committed deliberately

## Rule

Business logic stays in `apps/backend` and UI logic stays in `apps/desktop`. Only interface definitions and machine-readable contracts belong here.