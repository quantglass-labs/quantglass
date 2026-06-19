// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * AI on every screen: one reusable insight panel. Facts are assembled
 * server-side per surface and narrated on the covenant - fact-guarded,
 * template fallback, source always labeled. Renders nothing while loading
 * fails silently into absence rather than blocking the screen.
 */

import { useEffect, useState } from 'react';

import { useTranslation } from 'react-i18next';

import { backendClient } from '../lib/backend';
import { AiMarkdown } from './AiMarkdown';
import { QuantGlassMark } from './QuantGlassMark';
import { FadeIn } from './motion';

export function AiInsight({ surface, title }: { surface: string; title?: string }) {
  const { t } = useTranslation();
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
      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-accent/25 bg-accent/10 p-4">
        <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-accent/30 border-t-accent motion-reduce:animate-none" />
        <p className="text-sm text-muted">{t('chrome.aiInsightLoading')}</p>
      </div>
    );
  }
  if (state === 'error' || !insight?.summary) {
    return (
      <div className="mt-4 rounded-2xl border border-border bg-white/[0.03] p-4">
        <p className="text-sm text-muted">{t('chrome.aiInsightError')}</p>
      </div>
    );
  }
  return (
    <FadeIn>
      <div className="group relative mt-4 overflow-hidden rounded-2xl border border-accent/25 bg-gradient-to-br from-accent/12 to-transparent p-4 transition-colors hover:border-accent/40">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
        <div className="flex items-center gap-2">
          <QuantGlassMark className="size-3.5 text-accent drop-shadow-[0_0_6px_rgba(141,183,255,0.55)] transition-transform group-hover:scale-110" />
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            {title ?? t('chrome.aiReadTitle')}
          </p>
          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted">
            {insight.source}
          </span>
        </div>
        <AiMarkdown className="mt-2 text-sm leading-relaxed text-ink">{insight.summary}</AiMarkdown>
      </div>
    </FadeIn>
  );
}
