// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Resolves the active interface locale without importing the full i18next
 * instance, so the backend client (and tests) stay decoupled from React. The
 * resolution order mirrors i18next's detector: persisted choice, then browser,
 * then English. The result is always a supported base code.
 */

import { LANGUAGE_STORAGE_KEY } from './storageKey';
import { SUPPORTED_CODES } from './languages';

function clamp(code: string | null | undefined): string | null {
  if (!code) return null;
  const base = code.split('-')[0].toLowerCase();
  return SUPPORTED_CODES.includes(base) ? base : null;
}

export function activeLocale(): string {
  if (typeof window !== 'undefined') {
    try {
      const stored = clamp(window.localStorage?.getItem(LANGUAGE_STORAGE_KEY));
      if (stored) return stored;
    } catch {
      // localStorage may be unavailable (private mode); fall through.
    }
    const fromNavigator = clamp(window.navigator?.language);
    if (fromNavigator) return fromNavigator;
  }
  return 'en';
}
