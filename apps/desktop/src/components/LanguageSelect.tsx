// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Interface language picker. Changing the language updates i18next (which
 * persists the choice to localStorage and flips document direction for RTL
 * languages) and is what makes AI insights answer in the chosen language.
 */

import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { LANGUAGES } from '../i18n/languages';

export function LanguageSelect() {
  const { t, i18n } = useTranslation();
  const current = i18n.resolvedLanguage ?? i18n.language ?? 'en';

  return (
    <div className="rounded-3xl border border-border bg-white/[0.03] p-5">
      <div className="flex items-center gap-2">
        <Languages className="size-4 text-accent" />
        <h3 className="text-sm font-semibold text-ink">{t('common.language.title')}</h3>
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:max-w-sm">
        <label htmlFor="qg-language" className="text-xs font-medium text-muted">
          {t('common.language.label')}
        </label>
        <select
          id="qg-language"
          value={current}
          onChange={(event) => void i18n.changeLanguage(event.target.value)}
          className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
        >
          {LANGUAGES.map((language) => (
            <option key={language.code} value={language.code} className="bg-surface text-ink">
              {language.native}
            </option>
          ))}
        </select>
      </div>
      <p className="mt-2 text-xs leading-snug text-muted">{t('common.language.help')}</p>
    </div>
  );
}
