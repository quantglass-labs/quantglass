// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';

import type { CanonicalSignal } from '../types';
import { formatAge, freshnessClassName, signalFreshness } from './freshness';

function signalWith(overrides: Partial<CanonicalSignal>): CanonicalSignal {
  return {
    timeframe: '1h',
    data_age_seconds: 60,
    last_candle_close_at: '2026-06-10T14:00:00Z',
    ...overrides,
  } as CanonicalSignal;
}

describe('formatAge', () => {
  it('uses seconds, minutes, hours, and days at the right break points', () => {
    expect(formatAge(45)).toBe('45s');
    expect(formatAge(600)).toBe('10m');
    expect(formatAge(7200)).toBe('2.0h');
    expect(formatAge(259200)).toBe('3.0d');
  });
});

describe('signalFreshness', () => {
  it('reports unknown when freshness metadata is missing', () => {
    const result = signalFreshness(signalWith({ data_age_seconds: undefined }));
    expect(result.tone).toBe('unknown');
    expect(result.label).toBe('Freshness unknown');
  });

  it('marks a signal fresh within two bars of age', () => {
    const result = signalFreshness(signalWith({ data_age_seconds: 3600 }));
    expect(result.tone).toBe('fresh');
    expect(result.label).toMatch(/^Fresh:/);
  });

  it('marks a signal delayed between two and five bars of age', () => {
    const result = signalFreshness(signalWith({ data_age_seconds: 4 * 3600 }));
    expect(result.tone).toBe('delayed');
  });

  it('marks a signal stale beyond five bars of age', () => {
    const result = signalFreshness(signalWith({ data_age_seconds: 6 * 3600 }));
    expect(result.tone).toBe('stale');
    expect(result.detail).toContain('2026-06-10 14:00');
  });
});

describe('freshnessClassName', () => {
  it('returns a distinct class for every tone', () => {
    const classes = (['fresh', 'delayed', 'stale', 'unknown'] as const).map(freshnessClassName);
    expect(new Set(classes).size).toBe(4);
  });
});
