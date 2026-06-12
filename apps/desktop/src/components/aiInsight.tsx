// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * AI on every screen: one reusable insight panel. Facts are assembled
 * server-side per surface and narrated on the covenant - fact-guarded,
 * template fallback, source always labeled. Renders nothing while loading
 * fails silently into absence rather than blocking the screen.
 */

import { useEffect, useState } from 'react';

import { Sparkles } from 'lucide-react';

import { backendClient } from '../lib/backend';

export function AiInsight({ surface, title }: { surface: string; title?: string }) {
  const [insight, setInsight] = useState<{ summary: string; source: string } | null>(null);

  useEffect(() => {
    backendClient
      .getSurfaceInsight(surface)
      .then((response) => {
        if (response.summary) setInsight(response);
      })
      .catch(() => setInsight(null));
  }, [surface]);

  if (!insight) return null;
  return (
    <div className="mt-4 rounded-xl border border-indigo-500/25 bg-indigo-600/10 p-4">
      <div className="flex items-center gap-2">
        <Sparkles size={14} className="text-indigo-300" />
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-300">
          {title ?? 'AI read'}
        </p>
        <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-500">
          {insight.source}
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-zinc-200">{insight.summary}</p>
    </div>
  );
}
