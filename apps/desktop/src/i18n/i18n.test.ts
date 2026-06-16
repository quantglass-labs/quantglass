// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { afterAll, describe, expect, it } from 'vitest';

import i18n from './index';
import { directionFor } from './direction';
import { LANGUAGES } from './languages';

afterAll(async () => {
  await i18n.changeLanguage('en');
});

function flatKeys(value: unknown, prefix = ''): string[] {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      flatKeys(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [prefix];
}

describe('i18n catalogs', () => {
  it('bundles every supported language with the core chrome keys', () => {
    expect(LANGUAGES).toHaveLength(20);
    for (const language of LANGUAGES) {
      const bundle = i18n.getResourceBundle(language.code, 'translation') as
        | { nav?: Record<string, string>; common?: { language?: { help?: string } } }
        | undefined;
      expect(bundle?.nav?.dashboard, `${language.code} nav.dashboard`).toBeTruthy();
      expect(bundle?.common?.language?.help, `${language.code} common.language.help`).toBeTruthy();
    }
  });

  it('keeps every language at full key parity with English', () => {
    const englishKeys = flatKeys(i18n.getResourceBundle('en', 'translation')).sort();
    for (const language of LANGUAGES) {
      if (language.code === 'en') continue;
      const keys = flatKeys(i18n.getResourceBundle(language.code, 'translation')).sort();
      const missing = englishKeys.filter((key) => !keys.includes(key));
      expect(missing, `${language.code} is missing keys`).toEqual([]);
    }
  });
});

describe('i18n runtime', () => {
  it('translates nav keys for the active language', async () => {
    await i18n.changeLanguage('en');
    expect(i18n.t('nav.dashboard')).toBe('Dashboard');
    await i18n.changeLanguage('fr');
    expect(i18n.t('nav.dashboard')).toBe('Tableau de bord');
    await i18n.changeLanguage('ja');
    expect(i18n.t('nav.settings')).toBe('設定');
  });

  it('flips document direction for RTL languages', async () => {
    await i18n.changeLanguage('ar');
    expect(document.documentElement.dir).toBe('rtl');
    await i18n.changeLanguage('en');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('classifies all four RTL languages', () => {
    expect(directionFor('ur')).toBe('rtl');
    expect(directionFor('sd')).toBe('rtl');
    expect(directionFor('fa')).toBe('rtl');
    expect(directionFor('ar-EG')).toBe('rtl');
    expect(directionFor('es')).toBe('ltr');
  });
});
