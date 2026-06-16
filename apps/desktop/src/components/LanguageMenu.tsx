// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Global interface-language switcher. Lives in the app shell header so it is
 * reachable from every screen. Changing the language updates i18next (which
 * persists the choice and flips document direction for RTL languages) and makes
 * AI insights answer in the chosen language.
 */

import { Check, Languages } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { LANGUAGES, languageByCode } from '../i18n/languages';

export function LanguageMenu() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const current = i18n.resolvedLanguage ?? i18n.language ?? 'en';
  const currentLabel = languageByCode(current)?.native ?? current.toUpperCase();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (code: string) => {
    void i18n.changeLanguage(code);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('common.language.title')}
        title={t('common.language.title')}
        className="inline-flex items-center gap-2 rounded-full border border-border bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted transition hover:text-ink"
      >
        <Languages className="size-3.5" />
        <span className="normal-case tracking-normal">{currentLabel}</span>
      </button>
      {open ? (
        <div
          role="listbox"
          aria-label={t('common.language.title')}
          className="glass-panel absolute end-0 top-[calc(100%+0.5rem)] z-50 max-h-80 w-52 overflow-y-auto rounded-2xl p-1"
        >
          {LANGUAGES.map((language) => {
            const active = language.code === current;
            return (
              <button
                key={language.code}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => choose(language.code)}
                className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-start text-sm transition hover:bg-white/5 ${
                  active ? 'text-ink' : 'text-muted'
                }`}
              >
                <span>{language.native}</span>
                {active ? <Check className="size-3.5 shrink-0 text-accent" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
