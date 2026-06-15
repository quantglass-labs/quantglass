// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { clsx } from 'clsx';
import {
  Bell,
  ChevronRight,
  Briefcase,
  ClipboardCheck,
  GraduationCap,
  NotebookPen,
  Target,
  LayoutDashboard,
  Search,
  Settings,
  ShieldAlert,
  TestTubeDiagonal,
  TrendingUp,
  Wallet,
  Star,
} from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Copilot } from './copilot';
import { DisclaimerChip, PillTabs } from './ui';
import type { BackendStatus, MarketType, SymbolRecord } from '../types';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/signals', label: 'Signals', icon: TrendingUp },
  { to: '/watchlist', label: 'Watchlist', icon: Star },
  { to: '/portfolio', label: 'Portfolio', icon: Briefcase },
  { to: '/backtest', label: 'Backtesting', icon: TestTubeDiagonal },
  { to: '/alerts', label: 'Alerts', icon: Bell },
  { to: '/learn', label: 'Learn', icon: GraduationCap },
  { to: '/missions', label: 'Missions', icon: Target },
  { to: '/journal', label: 'Journal', icon: NotebookPen },
  { to: '/review', label: 'Review', icon: ClipboardCheck },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function SidebarNav() {
  return (
    <>
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            clsx(
              'flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition',
              isActive
                ? 'bg-accentStrong/20 text-ink soft-ring'
                : 'text-muted hover:bg-white/5 hover:text-ink',
            )
          }
        >
          <item.icon className="size-4" />
          {item.label}
        </NavLink>
      ))}
    </>
  );
}

export function AppShell({
  children,
  marketFilter,
  onMarketFilterChange,
  backendStatus,
  backendErrorMessage,
  aiStatusLabel,
  symbols,
  onSelectSymbol,
}: {
  children: React.ReactNode;
  marketFilter: MarketType | 'all';
  onMarketFilterChange: (value: MarketType | 'all') => void;
  backendStatus: BackendStatus;
  backendErrorMessage?: string | null;
  /** e.g. "qwen3.6:35b · local" when a model is configured; null otherwise. */
  aiStatusLabel?: string | null;
  symbols: SymbolRecord[];
  onSelectSymbol: (symbolId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const searchResults = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    if (!needle) return [];
    return symbols.filter(
      (symbol) =>
        symbol.symbol.toLowerCase().includes(needle) ||
        symbol.name.toLowerCase().includes(needle) ||
        symbol.id.toLowerCase().includes(needle),
    );
  }, [deferredQuery, symbols]);

  return (
    <div className="min-h-screen text-ink">
      <aside className="fixed inset-y-0 left-0 hidden w-72 flex-col border-r border-border bg-surface/70 px-4 py-5 backdrop-blur-xl lg:flex">
        <div className="mb-8 space-y-1 px-2">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl bg-accentStrong/20 text-accent">
              <TrendingUp className="size-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">QuantGlass</h1>
              <p className="text-xs uppercase tracking-[0.18em] text-muted">
                Quantitative desktop terminal
              </p>
            </div>
          </div>
        </div>

        <nav className="space-y-2 px-1">
          <SidebarNav />
        </nav>

        <div className="mt-auto space-y-4 rounded-3xl border border-border bg-white/[0.03] p-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl bg-white/8 text-accent">
              <Wallet className="size-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-ink">Paper trading first</p>
              <p className="text-xs text-muted">
                Paper intents execute through the backend scheduler; live trading remains off.
              </p>
            </div>
          </div>
          <DisclaimerChip compact />
        </div>
      </aside>

      <header className="sticky top-0 z-40 border-b border-border bg-background/70 backdrop-blur-xl lg:ml-72">
        <div className="flex flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="relative w-full max-w-lg">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search symbol or name"
                  className="w-full rounded-2xl border border-border bg-white/[0.04] py-3 pl-11 pr-4 text-sm text-ink outline-none transition placeholder:text-muted focus:border-accent"
                />
                {searchResults.length ? (
                  <div className="glass-panel absolute left-0 right-0 top-[calc(100%+0.5rem)] max-h-72 overflow-y-auto rounded-3xl p-2">
                    {searchResults.slice(0, 6).map((result) => (
                      <button
                        key={result.id}
                        type="button"
                        className="flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left transition hover:bg-white/5"
                        onClick={() => {
                          onSelectSymbol(result.id);
                          setQuery('');
                        }}
                      >
                        <div>
                          <p className="font-medium text-ink">{result.symbol}</p>
                          <p className="text-xs text-muted">{result.name}</p>
                        </div>
                        <ChevronRight className="size-4 text-muted" />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <PillTabs
                value={marketFilter}
                onChange={onMarketFilterChange}
                options={[
                  { value: 'all', label: 'All Markets' },
                  { value: 'crypto', label: 'Crypto' },
                  { value: 'stocks', label: 'Stocks' },
                ]}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span
                className={clsx(
                  'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em]',
                  backendStatus === 'online' && 'border-buy/35 bg-buy/12 text-buy',
                  backendStatus === 'connecting' && 'border-hold/35 bg-hold/12 text-hold',
                  backendStatus === 'offline' && 'border-sell/35 bg-sell/12 text-sell',
                )}
              >
                <span className="size-2 rounded-full bg-current" />
                {backendStatus === 'online'
                  ? 'Backend Online'
                  : backendStatus === 'connecting'
                    ? 'Backend Connecting'
                    : 'Backend Offline'}
              </span>
              <NavLink
                to="/settings"
                title={
                  aiStatusLabel
                    ? 'AI is active across Signals, Backtesting, Review, and Learn. Click to manage.'
                    : 'No AI model configured - narration and coaching use deterministic templates. Click to set one up.'
                }
                className={clsx(
                  'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em]',
                  aiStatusLabel
                    ? 'border-accent/35 bg-accentStrong/12 text-accent'
                    : 'border-border bg-white/[0.04] text-muted',
                )}
              >
                <span className="size-2 rounded-full bg-current" />
                {aiStatusLabel ? `AI · ${aiStatusLabel}` : 'AI off · templates'}
              </NavLink>
              <div className="hidden xl:block">
                <DisclaimerChip compact />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted xl:hidden">
            <ShieldAlert className="size-3.5 text-accent" />
            Educational use only. Not financial advice.
          </div>
        </div>
      </header>

      <main className="px-4 py-6 pb-24 sm:px-6 lg:ml-72 lg:px-8">
        {backendStatus === 'connecting' ? (
          <div
            className="mb-6 flex items-center gap-3 rounded-3xl border border-hold/25 bg-hold/10 px-4 py-4 text-sm text-muted"
            role="status"
          >
            <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-hold/30 border-t-hold motion-reduce:animate-none" />
            <div>
              <p className="font-medium text-ink">Starting the local engine…</p>
              <p className="mt-1">
                The backend is booting and loading market data. The first launch can take up to half
                a minute; panels below fill in as data arrives.
              </p>
            </div>
          </div>
        ) : null}
        {backendStatus === 'offline' && backendErrorMessage ? (
          <div className="mb-6 flex items-start gap-3 rounded-3xl border border-sell/25 bg-sell/10 px-4 py-4 text-sm text-muted">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-sell" />
            <div>
              <p className="font-medium text-ink">Backend unavailable</p>
              <p className="mt-1">{backendErrorMessage}</p>
            </div>
          </div>
        ) : null}
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/90 px-2 py-2 backdrop-blur-xl lg:hidden">
        <div className="grid grid-cols-6 gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                clsx(
                  'flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-medium',
                  isActive ? 'text-ink' : 'text-muted',
                )
              }
            >
              <item.icon className="size-4" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      <Copilot backendStatus={backendStatus} />

      <footer className="border-t border-border/70 px-4 py-4 text-xs text-muted lg:ml-72 lg:px-8">
        Educational use only. Not financial advice.{' '}
        {backendStatus === 'online'
          ? 'Health, provider settings, and watchlist are sourced from the local backend.'
          : 'Backend is unavailable, so data-driven surfaces may be incomplete until it is restored.'}{' '}
        <a
          href={
            import.meta.env.VITE_SAME_ORIGIN === 'true'
              ? '/source'
              : 'https://github.com/quantglass-labs/quantglass'
          }
          target="_blank"
          rel="noreferrer noopener"
          className="underline underline-offset-2 hover:text-ink"
        >
          Source · AGPL-3.0
        </a>
      </footer>
    </div>
  );
}
