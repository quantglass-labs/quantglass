# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later
# syntax=docker/dockerfile:1

# QuantGlass self-host / server mode: one container runs the Python engine and
# serves the web UI on a single port. This is an alternative to the desktop
# installers for users who want the engine always-on (home server, VPS) and
# accessed from a browser. The desktop app remains the primary distribution.

# ---- Stage 1: build the web SPA in same-origin mode ----
FROM node:22-slim AS frontend
WORKDIR /build
COPY apps/desktop/package.json apps/desktop/package-lock.json apps/desktop/
RUN npm --prefix apps/desktop ci
# The contracts package is resolved via a Vite/tsconfig source alias, not npm,
# so it must be present at its repo-relative path during the build.
COPY packages/contracts packages/contracts
COPY apps/desktop apps/desktop
RUN VITE_SAME_ORIGIN=true npm --prefix apps/desktop run build

# ---- Stage 2: Python backend that serves the SPA + API on one port ----
FROM python:3.12-slim AS runtime
WORKDIR /app
COPY packages/quantglass-sdk packages/quantglass-sdk
COPY apps/backend apps/backend
# Install the SDK first (the backend depends on it), then the backend itself.
RUN pip install --no-cache-dir -e packages/quantglass-sdk \
 && pip install --no-cache-dir -e apps/backend
COPY --from=frontend /build/apps/desktop/dist /app/frontend

ENV QUANTGLASS_HOST=0.0.0.0 \
    QUANTGLASS_PORT=8000 \
    QUANTGLASS_FRONTEND_DIR=/app/frontend \
    QUANTGLASS_DATA_DIR=/data

EXPOSE 8000
VOLUME ["/data"]

# Educational/research software, paper trading only. Not financial advice.
CMD ["python", "apps/backend/run_server.py"]
