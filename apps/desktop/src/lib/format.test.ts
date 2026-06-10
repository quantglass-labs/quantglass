// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';

import { formatCurrency, formatDateTime, formatLargeNumber, formatPercent } from './format';

describe('formatCurrency', () => {
  it('formats USD with two decimals by default', () => {
    expect(formatCurrency(1234.5)).toBe('$1,234.50');
  });

  it('respects a custom fraction digit limit', () => {
    expect(formatCurrency(0.123456, 4)).toBe('$0.1235');
  });
});

describe('formatPercent', () => {
  it('prefixes positive values with a plus sign', () => {
    expect(formatPercent(2.345)).toBe('+2.3%');
  });

  it('prefixes negative values with a minus sign', () => {
    expect(formatPercent(-2.345)).toBe('-2.3%');
  });

  it('leaves zero unsigned', () => {
    expect(formatPercent(0)).toBe('0.0%');
  });
});

describe('formatDateTime', () => {
  it('renders an ISO timestamp in UTC', () => {
    expect(formatDateTime('2026-06-10T14:30:00Z')).toBe('Jun 10, 2:30 PM');
  });
});

describe('formatLargeNumber', () => {
  it('abbreviates billions, millions, and thousands', () => {
    expect(formatLargeNumber(2_500_000_000)).toBe('2.50B');
    expect(formatLargeNumber(3_250_000)).toBe('3.25M');
    expect(formatLargeNumber(9_800)).toBe('9.8K');
  });

  it('keeps small values unabbreviated', () => {
    expect(formatLargeNumber(950)).toBe('950');
  });

  it('abbreviates negative magnitudes', () => {
    expect(formatLargeNumber(-1_500_000)).toBe('-1.50M');
  });
});
