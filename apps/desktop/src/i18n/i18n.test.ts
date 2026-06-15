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
