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
        className="mt-6 flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4"
        role="status"
      >
        <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-zinc-700 border-t-indigo-400 motion-reduce:animate-none" />
        <p className="text-sm text-zinc-400">Connecting to the local engine…</p>
      </div>
    );
  }
  return (
    <div className="mt-6 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-600/10 p-4">
      <WifiOff size={16} className="mt-0.5 shrink-0 text-amber-300" />
      <div>
        <p className="text-sm font-medium text-amber-300">The local engine is not responding.</p>
        <p className="mt-1 text-xs text-zinc-400">
          The backend usually restarts itself within a few seconds. If this persists, restart
          QuantGlass.
        </p>
      </div>
    </div>
  );
}
