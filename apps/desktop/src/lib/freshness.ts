// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { CanonicalSignal, Timeframe } from '../types';

export type FreshnessTone = 'fresh' | 'delayed' | 'stale' | 'unknown';

const timeframeSeconds: Record<Timeframe, number> = {
  '15m': 15 * 60,
  '1h': 60 * 60,
  '4h': 4 * 60 * 60,
  '1d': 24 * 60 * 60,
};

export function formatAge(seconds: number): string {
  if (seconds < 90) return `${Math.max(0, Math.round(seconds))}s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)}m`;
  if (seconds < 172800) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

export function signalFreshness(signal: CanonicalSignal): {
  ageLabel: string;
  label: string;
  tone: FreshnessTone;
  detail: string;
} {
  if (typeof signal.data_age_seconds !== 'number') {
    return {
      ageLabel: 'unknown',
      label: 'Freshness unknown',
      tone: 'unknown',
      detail: 'No candle freshness metadata was returned by the backend.',
    };
  }

  const ageSeconds = Math.max(0, signal.data_age_seconds);
  const barSeconds = timeframeSeconds[signal.timeframe] ?? 3600;
  const ageLabel = formatAge(ageSeconds);
  const tone: FreshnessTone =
    ageSeconds <= barSeconds * 2 ? 'fresh' : ageSeconds <= barSeconds * 5 ? 'delayed' : 'stale';

  const label =
    tone === 'fresh'
      ? `Fresh: ${ageLabel}`
      : tone === 'delayed'
        ? `Delayed: ${ageLabel}`
        : `Stale: ${ageLabel}`;

  const detail = signal.last_candle_close_at
    ? `Last closed candle ${signal.last_candle_close_at.replace('T', ' ').slice(0, 16)} UTC`
    : 'Last closed candle time unavailable';

  return { ageLabel, label, tone, detail };
}

export function freshnessClassName(tone: FreshnessTone): string {
  if (tone === 'fresh') return 'border-buy/30 bg-buy/12 text-buy';
  if (tone === 'delayed') return 'border-hold/30 bg-hold/12 text-hold';
  if (tone === 'stale') return 'border-sell/30 bg-sell/12 text-sell';
  return 'border-border bg-white/[0.04] text-muted';
}
