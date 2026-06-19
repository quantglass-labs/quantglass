// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Shared backend-status visuals. Screens render this above their content so
 * the user always sees what is happening: a spinner while the local engine
 * starts, an actionable card if it is unreachable, nothing once online.
 * House rule: no screen may sit blank or skeleton-spin without explanation.
 */

import { WifiOff } from 'lucide-react';

import type { BackendStatus } from '../types';

export function BackendStatusNotice({ status }: { status: BackendStatus }) {
  if (status === 'online') return null;
  if (status === 'connecting') {
    return (
      <div
        className="mt-6 flex items-center gap-3 rounded-2xl border border-border bg-white/[0.03] p-4"
        role="status"
      >
        <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-border border-t-accent motion-reduce:animate-none" />
        <p className="text-sm text-muted">Connecting to the local engine…</p>
      </div>
    );
  }
  return (
    <div className="mt-6 flex items-start gap-3 rounded-2xl border border-hold/30 bg-hold/10 p-4">
      <WifiOff size={16} className="mt-0.5 shrink-0 text-hold" />
      <div>
        <p className="text-sm font-medium text-hold">The local engine is not responding.</p>
        <p className="mt-1 text-xs text-muted">
          The backend usually restarts itself within a few seconds. If this persists, restart
          QuantGlass.
        </p>
      </div>
    </div>
  );
}
