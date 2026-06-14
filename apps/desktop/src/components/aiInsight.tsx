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
import { AiMarkdown } from './AiMarkdown';

export function AiInsight({ surface, title }: { surface: string; title?: string }) {
  const [insight, setInsight] = useState<{ summary: string; source: string } | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [prevSurface, setPrevSurface] = useState(surface);
  if (prevSurface !== surface) {
    setPrevSurface(surface);
    setState('loading');
  }

  useEffect(() => {
    backendClient
      .getSurfaceInsight(surface)
      .then((response) => {
        setInsight(response);
        setState('ready');
      })
      .catch(() => setState('error'));
  }, [surface]);

  // House rule: an AI panel is never silently absent - it loads, speaks,
  // or says why it can't.
  if (state === 'loading') {
    return (
      <div className="mt-4 flex items-center gap-3 rounded-xl border border-indigo-500/25 bg-indigo-600/10 p-4">
        <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-indigo-500/30 border-t-indigo-300 motion-reduce:animate-none" />
        <p className="text-sm text-zinc-400">
          AI is reading your data… large local models can take up to a minute.
        </p>
      </div>
    );
  }
  if (state === 'error' || !insight?.summary) {
    return (
      <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <p className="text-sm text-zinc-500">
          AI read unavailable right now (model timed out or the request failed). The screen works
          normally without it — check Settings → AI if this persists.
        </p>
      </div>
    );
  }
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
      <AiMarkdown className="mt-2 text-sm leading-relaxed text-zinc-200">
        {insight.summary}
      </AiMarkdown>
    </div>
  );
}
