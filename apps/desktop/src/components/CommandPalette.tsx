// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Global command palette (⌘K / Ctrl+K). A keyboard-first way to jump to any
 * screen or symbol from anywhere — the signature power-user surface. Fully
 * keyboard-driven (↑/↓ to move, ↵ to open, esc to close) and on the design
 * system. Purely a navigation accelerator; it triggers no trades or writes.
 */

import { CornerDownLeft, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { navItems } from './navItems';
import type { SymbolRecord } from '../types';

type Item =
  | { kind: 'nav'; id: string; label: string; to: string; icon: typeof Search }
  | { kind: 'symbol'; id: string; label: string; sub: string };

export function CommandPalette({
  open,
  onClose,
  symbols,
  onSelectSymbol,
}: {
  open: boolean;
  onClose: () => void;
  symbols: SymbolRecord[];
  onSelectSymbol: (symbolId: string) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [prevOpen, setPrevOpen] = useState(open);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fresh state every time the palette opens (render-phase reset, not an effect).
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setQuery('');
      setActive(0);
    }
  }

  // Focus the input on open (a real side effect).
  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const needle = query.trim().toLowerCase();
    const navMatches: Item[] = navItems
      .map((n) => ({
        kind: 'nav' as const,
        id: n.to,
        label: t(`nav.${n.key}`),
        to: n.to,
        icon: n.icon,
      }))
      .filter((n) => !needle || n.label.toLowerCase().includes(needle));
    const symbolMatches: Item[] = needle
      ? symbols
          .filter(
            (s) =>
              s.symbol.toLowerCase().includes(needle) ||
              s.name.toLowerCase().includes(needle) ||
              s.id.toLowerCase().includes(needle),
          )
          .slice(0, 6)
          .map((s) => ({ kind: 'symbol' as const, id: s.id, label: s.symbol, sub: s.name }))
      : [];
    return [...navMatches, ...symbolMatches];
  }, [query, symbols, t]);

  // Clamp the highlighted row at read time so a shrinking result set is safe.
  const activeIndex = items.length ? Math.min(active, items.length - 1) : 0;

  const run = (item: Item | undefined) => {
    if (!item) return;
    if (item.kind === 'nav') navigate(item.to);
    else onSelectSymbol(item.id);
    onClose();
  };

  if (!open) return null;

  const navCount = items.filter((i) => i.kind === 'nav').length;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/55 p-4 pt-[14vh] backdrop-blur-sm"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          setActive(items.length ? (activeIndex + 1) % items.length : 0);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setActive(items.length ? (activeIndex - 1 + items.length) % items.length : 0);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          run(items[activeIndex]);
        }
      }}
    >
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div className="glass-panel relative flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search className="size-4 shrink-0 text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('chrome.cmdk.placeholder')}
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted"
            aria-label={t('chrome.cmdk.placeholder')}
          />
          <kbd className="hidden shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted sm:block">
            esc
          </kbd>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted">{t('chrome.cmdk.empty')}</p>
          ) : (
            <>
              <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted/70">
                {t('chrome.cmdk.navigate')}
              </p>
              {items.map((item, index) => {
                const selected = index === activeIndex;
                const showSymbolHeader = item.kind === 'symbol' && index === navCount;
                return (
                  <div key={`${item.kind}:${item.id}`}>
                    {showSymbolHeader ? (
                      <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted/70">
                        {t('chrome.cmdk.symbols')}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      onMouseEnter={() => setActive(index)}
                      onClick={() => run(item)}
                      className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors ${
                        selected ? 'bg-accent/15 text-ink' : 'text-muted hover:bg-white/5'
                      }`}
                    >
                      {item.kind === 'nav' ? (
                        <item.icon
                          className={`size-4 shrink-0 ${selected ? 'text-accent' : 'text-muted'}`}
                        />
                      ) : (
                        <span
                          className={`grid size-5 shrink-0 place-items-center rounded text-[10px] font-bold ${
                            selected ? 'bg-accent/20 text-accent' : 'bg-white/5 text-muted'
                          }`}
                        >
                          $
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className={`text-sm ${selected ? 'text-ink' : 'text-ink/90'}`}>
                          {item.label}
                        </span>
                        {item.kind === 'symbol' ? (
                          <span className="ml-2 truncate text-xs text-muted">{item.sub}</span>
                        ) : null}
                      </span>
                      {selected ? (
                        <CornerDownLeft className="size-3.5 shrink-0 text-accent" />
                      ) : null}
                    </button>
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-[11px] text-muted">
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border px-1 py-0.5 text-[10px]">↑</kbd>
            <kbd className="rounded border border-border px-1 py-0.5 text-[10px]">↓</kbd>
            {t('chrome.cmdk.hintMove')}
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border px-1 py-0.5 text-[10px]">↵</kbd>
            {t('chrome.cmdk.hintOpen')}
          </span>
        </div>
      </div>
    </div>
  );
}
