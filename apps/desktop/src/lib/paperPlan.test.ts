// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';

import { classifyPaperTradeError, computePlanRiskPercent, isPaperPlanComplete } from './paperPlan';

describe('isPaperPlanComplete', () => {
  it('requires both a written reason and a positive stop', () => {
    expect(isPaperPlanComplete('Breakout retest', '95')).toBe(true);
  });

  it('rejects a missing or whitespace-only reason', () => {
    expect(isPaperPlanComplete('', '95')).toBe(false);
    expect(isPaperPlanComplete('   ', '95')).toBe(false);
  });

  it('rejects a missing, zero, or non-numeric stop', () => {
    expect(isPaperPlanComplete('Breakout retest', '')).toBe(false);
    expect(isPaperPlanComplete('Breakout retest', '0')).toBe(false);
    expect(isPaperPlanComplete('Breakout retest', 'abc')).toBe(false);
  });
});

describe('computePlanRiskPercent', () => {
  it('computes |entry - stop| * quantity as a percent of balance', () => {
    // 5 of risk per unit * 10 units = 50 risked, on a 1000 balance => 5%.
    expect(computePlanRiskPercent(100, 95, 10, 1000)).toBeCloseTo(5, 6);
  });

  it('is direction-agnostic (stop above or below entry)', () => {
    expect(computePlanRiskPercent(95, 100, 10, 1000)).toBeCloseTo(5, 6);
  });

  it('returns 0 for a non-positive balance instead of dividing by zero', () => {
    expect(computePlanRiskPercent(100, 95, 10, 0)).toBe(0);
    expect(computePlanRiskPercent(100, 95, 10, -50)).toBe(0);
  });
});

describe('classifyPaperTradeError', () => {
  it('surfaces a constitution rejection as a block and keeps the explanation', () => {
    const result = classifyPaperTradeError(
      'This trade breaks your constitution: max 1% risk per trade.',
      { isLive: false },
    );
    expect(result.isConstitution).toBe(true);
    expect(result.title).toBe('Blocked by your trading constitution');
    expect(result.message).toContain('max 1% risk');
  });

  it('falls back to a paper-mode message for an opaque error', () => {
    const result = classifyPaperTradeError('Backend request failed: 500', { isLive: false });
    expect(result.isConstitution).toBe(false);
    expect(result.title).toBe('Trade submission failed');
    expect(result.message).toContain('paper trade request failed');
  });

  it('falls back to a live-mode message for an opaque error in live mode', () => {
    const result = classifyPaperTradeError('', { isLive: true });
    expect(result.message).toContain('live trade request');
  });
});
