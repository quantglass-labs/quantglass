// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Shared "premium" surface primitives so screens have one elevation language.
 * MetricTile is the top-lit, soft-shadowed metric card used on the Dashboard,
 * Signals, and Portfolio.
 */

import type { ReactNode } from 'react';

export function MetricTile({
  label,
  hero,
  helper,
  toneClass,
  children,
}: {
  label: string;
  hero?: boolean;
  helper?: string;
  toneClass?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-3xl border p-5 ${
        hero
          ? 'border-accent/30 bg-gradient-to-b from-accentStrong/18 to-transparent shadow-[0_0_46px_-12px] shadow-accent/40'
          : 'border-border bg-gradient-to-b from-white/[0.06] to-white/[0.01] shadow-lg shadow-black/20'
      }`}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{label}</p>
      <div className={`metric-text mt-3 text-3xl leading-tight ${toneClass ?? 'text-ink'}`}>
        {children}
      </div>
      {helper ? <p className="mt-2 text-xs leading-snug text-muted">{helper}</p> : null}
    </div>
  );
}
