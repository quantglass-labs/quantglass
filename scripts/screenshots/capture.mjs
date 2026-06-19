// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Deterministic screenshot pipeline.
 *
 * Renders the real React/Vite UI in headless Chromium and intercepts EVERY
 * `/api/**` request, serving curated fixtures from ./fixtures — so capture
 * needs no backend, no AI model, and no scheduler, and every screen comes up
 * fully populated and identical run to run. This is the robust path on
 * Wayland/Ubuntu (no Xvfb, no native window capture, no GNOME portal).
 *
 *   node scripts/screenshots/capture.mjs                 # capture all
 *   node scripts/screenshots/capture.mjs dashboard learn # capture some
 *
 * Requires a running Vite dev server (the desktop app's, on :1420) and a
 * Playwright Chromium. Set PLAYWRIGHT_PATH to override how Playwright resolves.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX_DIR = path.join(HERE, 'fixtures');
const OUT_DIR = process.env.OUT_DIR || path.join(HERE, '..', '..', 'docs', 'assets', 'screenshots');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:1420';
const VIEWPORT = { width: 1400, height: 923 };

// Resolve Playwright via CommonJS (handles the package directory entry).
function loadChromium() {
  const candidates = [
    process.env.PLAYWRIGHT_PATH,
    'playwright',
    '/home/sali/ai/projects/masterlist/node_modules/playwright',
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      return require(c).chromium;
    } catch {
      /* try next */
    }
  }
  throw new Error('Playwright not found. `npm i -D playwright` or set PLAYWRIGHT_PATH.');
}
const chromium = loadChromium();

// ---- fixtures -------------------------------------------------------------
// fixtures/<a>__<b>.json  ->  /<a>/<b>
const fixtures = new Map();
for (const f of fs.readdirSync(FIX_DIR)) {
  if (!f.endsWith('.json') || f.startsWith('_')) continue;
  const pathname = '/' + f.replace(/\.json$/, '').replace(/__/g, '/');
  fixtures.set(pathname, fs.readFileSync(path.join(FIX_DIR, f), 'utf8'));
}

// Templates served for parameterized routes (any lesson id, any symbol's candles).
const read = (f) => {
  try {
    return fs.readFileSync(path.join(FIX_DIR, f), 'utf8');
  } catch {
    return null;
  }
};
const LESSON = read('_lesson.json');
const CANDLES = read('_corridor_candles.json');

async function fulfillApi(route) {
  const url = new URL(route.request().url());
  const p = url.pathname;
  let body = fixtures.get(p);
  if (!body) {
    if (p === '/health') body = JSON.stringify({ service: 'quantglass-backend', status: 'ok' });
    else if (CANDLES && /\/candles$/.test(p)) body = CANDLES;
    else if (LESSON && /\/api\/learn\/lesson\//.test(p)) body = LESSON;
    else body = '{"items":[]}'; // safe default so nothing errors or hangs
  }
  await route.fulfill({ status: 200, contentType: 'application/json', body });
}

// ---- screens --------------------------------------------------------------
// name -> { route, before? }  (before runs after load, before the shot)
const SCREENS = {
  dashboard: { route: '/' },
  signals: { route: '/signals' },
  watchlist: { route: '/watchlist' },
  portfolio: { route: '/portfolio' },
  backtest: { route: '/backtest' },
  learn: { route: '/learn' },
  alerts: { route: '/alerts' },
  copilot: {
    route: '/learn',
    async before(page) {
      const btn = page.locator('button.fixed.right-5, button.fixed.bottom-20').last();
      await btn.click({ timeout: 4000 }).catch(() => page.mouse.click(1360, 876));
      await page.waitForTimeout(1200);
    },
  },
  // Settings tabs are selected by a `?tab=` query param inside the hash route.
  'settings-providers': { route: '/settings?tab=providers' },
  'settings-apikeys': { route: '/settings?tab=keys' },
  'settings-ai': { route: '/settings?tab=ai' },
  'settings-risk': { route: '/settings?tab=risk' },
  constitution: {
    route: '/review',
    async before(page) {
      // Pin the constitution heading to the top of the frame so the panel fills it.
      await page
        .getByText('Trading Constitution')
        .first()
        .evaluate((el) => el.scrollIntoView({ block: 'start' }))
        .catch(() => {});
      await page.waitForTimeout(800);
    },
  },
  'symbol-detail': {
    route: '/signals',
    async before(page) {
      // Click the first signal's symbol to open the detail drawer.
      await page
        .locator('table button')
        .first()
        .click({ timeout: 4000 })
        .catch(() => {});
      await page.waitForTimeout(1800);
    },
  },
};

const wanted = process.argv.slice(2);
const todo = wanted.length ? wanted : Object.keys(SCREENS);

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
await ctx.route('**/api/**', fulfillApi);
await ctx.route('**/health', fulfillApi);
const page = await ctx.newPage();
fs.mkdirSync(OUT_DIR, { recursive: true });

for (const name of todo) {
  const screen = SCREENS[name];
  if (!screen) { console.log(name, 'SKIP (unknown)'); continue; }
  try {
    await page.goto(BASE + '/#' + screen.route, { waitUntil: 'domcontentloaded', timeout: 20000 });
    // With everything mocked, the app comes online almost immediately.
    await page.waitForFunction(
      () => !document.body.innerText.includes('Starting the local engine'),
      { timeout: 15000 },
    ).catch(() => {});
    await page.waitForTimeout(2500);
    if (screen.before) await screen.before(page);
    await page.screenshot({ path: path.join(OUT_DIR, name + '.png') });
    console.log(name, 'OK', Math.round(fs.statSync(path.join(OUT_DIR, name + '.png')).size / 1024), 'KB');
  } catch (e) {
    console.log(name, 'ERR', e.message.slice(0, 100));
  }
}
await browser.close();
console.log('done ->', OUT_DIR);
