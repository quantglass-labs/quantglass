# Screenshot pipeline

Deterministic, repeatable screenshots of the QuantGlass UI — for the README
tour, store assets, and (later) visual-regression and multi-language captures.

It renders the **real** React/Vite app in headless Chromium and intercepts
**every** `/api/**` request, serving curated fixtures from [`fixtures/`](fixtures).
So capture needs **no backend, no AI model, and no scheduler** — every screen
comes up fully populated and byte-stable run to run. This is the robust path on
Ubuntu/Wayland: no Xvfb, no native-window capture, no GNOME portal.

## Run

```bash
# 1. Start the desktop dev server (serves the SPA on :1420)
npm --prefix apps/desktop run dev

# 2. Capture (in another shell)
node scripts/screenshots/capture.mjs            # all screens
node scripts/screenshots/capture.mjs dashboard  # just some
```

Output goes to `docs/assets/screenshots/` (override with `OUT_DIR=…`).

Playwright is resolved from the project, then `PLAYWRIGHT_PATH`, then a local
fallback — `npm i -D playwright` to vendor it, or set `PLAYWRIGHT_PATH`.

## How it works

- `capture.mjs` mocks `**/api/**` and `**/health` via `page.route`, returning
  `fixtures/<a>__<b>.json` for `/a/b`. Parameterized routes are handled by
  templates: `_lesson.json` for any `/api/learn/lesson/<id>`, `_corridor_candles.json`
  for any `…/candles`. Unmodeled endpoints get a safe empty `{"items":[]}`.
- Screens (and any pre-shot interaction, e.g. opening the Copilot) are declared
  in the `SCREENS` map. Add an entry to capture a new screen or state.
- Viewport is `1400×923` to match the existing tour.

## Refreshing fixtures

Fixtures are recorded JSON from a real backend (public market data + the demo
paper account; no secrets). To refresh, run a backend and `curl` the endpoints
in `apps/desktop/src/lib/backend.ts` into `fixtures/<sanitized-path>.json`, then
re-capture.

## Captured states

Every README screen is captured, including the interactive ones: the Copilot
panel, the four Settings tabs (`?tab=…`), the trading constitution, the symbol
detail, and the paper-trade ticket (dashboard signal -> drawer -> ticket). Add
a new `SCREENS` entry to capture any future screen or state.
