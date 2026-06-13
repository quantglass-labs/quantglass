# Third-Party Notices

QuantGlass depends on open-source third-party software. This file summarizes the
major dependency families used by the project. The package lockfiles and Python
environment define the exact resolved versions used for a given build.

This summary is not a replacement for each dependency's license text. Packagers
should run a license audit for formal releases.

## Desktop

Major direct dependencies:

- React and React DOM — MIT.
- React Router — MIT.
- Tauri JavaScript API and CLI — Apache-2.0 / MIT ecosystem licensing.
- TradingView Lightweight Charts — Apache-2.0.
- Lucide React — ISC.
- clsx — MIT.
- Vite, TypeScript, Tailwind CSS, PostCSS, Autoprefixer — permissive open-source
  licenses.

The resolved npm dependency licenses are recorded in
`apps/desktop/package-lock.json`.

## Backend

Major direct dependencies:

- FastAPI and Starlette — permissive open-source licenses.
- Pydantic and pydantic-settings — MIT.
- Uvicorn — BSD-style license.
- HTTPX — BSD-style license.
- DuckDB — MIT.
- APScheduler — MIT.
- Cryptography — Apache-2.0 / BSD.
- WebSockets — BSD.
- PyInstaller — GPL-compatible bootloader/project licensing; review PyInstaller
  redistribution guidance for packaged binaries.

## Rust/Tauri Shell

The Tauri shell depends on the Rust crates resolved in
`apps/desktop/src-tauri/Cargo.lock`. Tauri and its ecosystem use permissive
open-source licenses, but formal releases should include generated cargo license
reports.

## Release Recommendation

Before publishing signed releases, generate machine-readable reports:

```bash
npm run license:reports
```

The reports are written under `license-reports/` and uploaded by CI as a
`license-reports` artifact.
