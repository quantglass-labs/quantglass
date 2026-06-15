// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The supported interface languages. `native` is shown in the language picker,
 * `english` feeds the backend "respond in <language>" instruction for AI output,
 * and `dir` drives right-to-left layout. Four languages are RTL: Arabic, Urdu,
 * Persian, and Sindhi.
 */

export type LanguageDir = 'ltr' | 'rtl';

export interface Language {
  code: string;
  native: string;
  english: string;
  dir: LanguageDir;
}

export const LANGUAGES: Language[] = [
  { code: 'en', native: 'English', english: 'English', dir: 'ltr' },
  { code: 'zh', native: '中文', english: 'Chinese (Mandarin)', dir: 'ltr' },
  { code: 'hi', native: 'हिन्दी', english: 'Hindi', dir: 'ltr' },
  { code: 'es', native: 'Español', english: 'Spanish', dir: 'ltr' },
  { code: 'ar', native: 'العربية', english: 'Arabic', dir: 'rtl' },
  { code: 'fr', native: 'Français', english: 'French', dir: 'ltr' },
  { code: 'bn', native: 'বাংলা', english: 'Bengali', dir: 'ltr' },
  { code: 'pt', native: 'Português', english: 'Portuguese', dir: 'ltr' },
  { code: 'ru', native: 'Русский', english: 'Russian', dir: 'ltr' },
  { code: 'ur', native: 'اردو', english: 'Urdu', dir: 'rtl' },
  { code: 'id', native: 'Bahasa Indonesia', english: 'Indonesian', dir: 'ltr' },
  { code: 'de', native: 'Deutsch', english: 'German', dir: 'ltr' },
  { code: 'ja', native: '日本語', english: 'Japanese', dir: 'ltr' },
  { code: 'fa', native: 'فارسی', english: 'Persian', dir: 'rtl' },
  { code: 'tr', native: 'Türkçe', english: 'Turkish', dir: 'ltr' },
  { code: 'ko', native: '한국어', english: 'Korean', dir: 'ltr' },
  { code: 'vi', native: 'Tiếng Việt', english: 'Vietnamese', dir: 'ltr' },
  { code: 'it', native: 'Italiano', english: 'Italian', dir: 'ltr' },
  { code: 'sd', native: 'سنڌي', english: 'Sindhi', dir: 'rtl' },
  { code: 'sw', native: 'Kiswahili', english: 'Swahili', dir: 'ltr' },
];

export const SUPPORTED_CODES: string[] = LANGUAGES.map((language) => language.code);

export const RTL_LANGS: Set<string> = new Set(
  LANGUAGES.filter((language) => language.dir === 'rtl').map((language) => language.code),
);

export function languageByCode(code: string): Language | undefined {
  return LANGUAGES.find((language) => language.code === code);
}
