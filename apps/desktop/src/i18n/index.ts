// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * i18next setup. Resources for all supported languages are bundled at build
 * time (the app is local-first and offline, so no runtime fetch). The active
 * language is detected from localStorage, then the browser, falling back to
 * English; it is persisted under `qg.lang`. Document direction is kept in sync
 * for the four RTL languages.
 */

import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import { applyDirection } from './direction';
import { SUPPORTED_CODES } from './languages';
import { LANGUAGE_STORAGE_KEY } from './storageKey';

import ar from './locales/ar.json';
import bn from './locales/bn.json';
import de from './locales/de.json';
import en from './locales/en.json';
import es from './locales/es.json';
import fa from './locales/fa.json';
import fr from './locales/fr.json';
import hi from './locales/hi.json';
import id from './locales/id.json';
import it from './locales/it.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import pt from './locales/pt.json';
import ru from './locales/ru.json';
import sd from './locales/sd.json';
import sw from './locales/sw.json';
import tr from './locales/tr.json';
import ur from './locales/ur.json';
import vi from './locales/vi.json';
import zh from './locales/zh.json';

const resources = {
  ar: { translation: ar },
  bn: { translation: bn },
  de: { translation: de },
  en: { translation: en },
  es: { translation: es },
  fa: { translation: fa },
  fr: { translation: fr },
  hi: { translation: hi },
  id: { translation: id },
  it: { translation: it },
  ja: { translation: ja },
  ko: { translation: ko },
  pt: { translation: pt },
  ru: { translation: ru },
  sd: { translation: sd },
  sw: { translation: sw },
  tr: { translation: tr },
  ur: { translation: ur },
  vi: { translation: vi },
  zh: { translation: zh },
} as const;

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_CODES,
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ['localStorage'],
    },
  });

applyDirection(i18n.resolvedLanguage ?? i18n.language ?? 'en');
i18n.on('languageChanged', (lng) => applyDirection(lng));

export default i18n;
