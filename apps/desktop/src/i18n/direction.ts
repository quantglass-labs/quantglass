// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Keeps the document direction in sync with the active language. RTL languages
 * (Arabic, Urdu, Persian, Sindhi) flip the whole interface via `dir="rtl"` on
 * <html>, which Tailwind's `rtl:` variants and CSS logical properties pick up.
 */

import { RTL_LANGS } from './languages';

export function directionFor(code: string): 'ltr' | 'rtl' {
  // Normalize region subtags (e.g. "ar-EG" -> "ar").
  const base = code.split('-')[0];
  return RTL_LANGS.has(base) ? 'rtl' : 'ltr';
}

export function applyDirection(code: string): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.lang = code;
  root.dir = directionFor(code);
}
