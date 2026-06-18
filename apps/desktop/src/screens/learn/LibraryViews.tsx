// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Academy library views (MSN-7): the global glossary aggregated from every
 * lesson's key terms, and the reference library (indicators, order types,
 * formulas, scam checklist). Both are read-only lookups that link back into
 * the lessons that teach each concept.
 */

import { useEffect, useMemo, useState } from 'react';

import { BookMarked, BookOpenText } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { backendClient } from '../../lib/backend';
import type { GlossaryEntry, ReferenceSection } from '../../types';

export function GlossaryView({ onOpenLesson }: { onOpenLesson: (lessonId: string) => void }) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<GlossaryEntry[] | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    backendClient
      .getGlossary()
      .then((response) => setEntries(response.items))
      .catch(() => setEntries([]));
  }, []);

  const filtered = useMemo(() => {
    if (!entries) return null;
    const needle = query.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter(
      (entry) =>
        entry.term.toLowerCase().includes(needle) ||
        entry.definition.toLowerCase().includes(needle),
    );
  }, [entries, query]);

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-2">
        <BookOpenText size={18} className="text-indigo-400" />
        <h2 className="text-lg font-semibold text-zinc-100">{t('academy.glossary')}</h2>
        <span className="ml-auto text-xs text-zinc-600">
          {entries
            ? t('academy.termsCount', { count: entries.length })
            : t('academy.loadingEllipsis')}
        </span>
      </div>
      <input
        type="search"
        placeholder={t('academy.searchTermsPlaceholder')}
        aria-label={t('academy.searchGlossaryAria')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="mt-4 w-full rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-indigo-500/60"
      />
      {!filtered ? (
        <div className="mt-4 space-y-2" aria-busy="true">
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="h-14 animate-pulse rounded-lg bg-zinc-800/60" />
          ))}
        </div>
      ) : (
        <dl className="mt-4 space-y-3">
          {filtered.length === 0 ? (
            <p className="text-sm text-zinc-500">{t('academy.noTermsMatch')}</p>
          ) : null}
          {filtered.map((entry) => (
            <div
              key={entry.term}
              className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3"
            >
              <dt className="text-sm font-semibold text-zinc-100">{entry.term}</dt>
              <dd className="mt-1 text-sm leading-relaxed text-zinc-400">
                {entry.definition}{' '}
                <button
                  type="button"
                  onClick={() => onOpenLesson(entry.lesson_id)}
                  className="text-xs text-indigo-300 hover:text-indigo-200"
                >
                  → {entry.lesson_title}
                </button>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export function ReferenceView() {
  const { t } = useTranslation();
  const [sections, setSections] = useState<ReferenceSection[] | null>(null);

  useEffect(() => {
    backendClient
      .getReference()
      .then((response) => setSections(response.sections))
      .catch(() => setSections([]));
  }, []);

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-2">
        <BookMarked size={18} className="text-indigo-400" />
        <h2 className="text-lg font-semibold text-zinc-100">{t('academy.referenceLibrary')}</h2>
      </div>
      {!sections ? (
        <div className="mt-4 space-y-2" aria-busy="true">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-24 animate-pulse rounded-lg bg-zinc-800/60" />
          ))}
        </div>
      ) : (
        <div className="mt-4 space-y-6">
          {sections.map((section) => (
            <div key={section.id}>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
                {section.title}
              </h3>
              <p className="mt-1 text-xs text-zinc-600">{section.description}</p>
              <div className="mt-3 space-y-2">
                {section.items.map((item) => (
                  <div
                    key={item.name}
                    className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3"
                  >
                    <p className="text-sm font-medium text-zinc-100">{item.name}</p>
                    {item.formula ? (
                      <code className="mt-1 block overflow-x-auto rounded bg-zinc-950/70 px-2 py-1 font-mono text-xs text-emerald-300/90">
                        {item.formula}
                      </code>
                    ) : null}
                    <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{item.notes}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
