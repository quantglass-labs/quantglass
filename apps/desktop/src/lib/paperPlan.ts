// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Pure helpers behind the paper-trade ticket's safety rules, extracted from the
 * confirm handler so they can be tested directly:
 *
 * - every trade must carry a plan (a written reason and a real stop) before it
 *   can be submitted;
 * - the plan's risk-as-%-of-balance is a defensible number, computed the same
 *   way every time;
 * - a backend rejection is classified so a constitution block is surfaced as a
 *   block, never swallowed into a generic failure.
 */

/** The ticket cannot be submitted without a written reason and a positive stop. */
export function isPaperPlanComplete(planReason: string, planStop: string): boolean {
  return planReason.trim().length > 0 && Number(planStop) > 0;
}

/**
 * Risk taken as a percentage of account balance: |entry − stop| × quantity,
 * over balance. Returns 0 when balance is non-positive (nothing to risk
 * against) rather than dividing by zero.
 */
export function computePlanRiskPercent(
  entryPrice: number,
  stop: number,
  quantity: number,
  balance: number,
): number {
  if (!(balance > 0)) return 0;
  return (Math.abs(entryPrice - stop) * quantity * 100) / balance;
}

export interface TradeErrorClassification {
  isConstitution: boolean;
  title: string;
  message: string;
}

/**
 * Classify a failed submission. A constitution violation must read as a block
 * (its own title) and keep the backend's explanation; only opaque/empty errors
 * fall back to a generic, mode-aware message.
 */
export function classifyPaperTradeError(
  detail: string,
  options: { isLive: boolean },
): TradeErrorClassification {
  const isConstitution = detail.includes('constitution');
  const hasUsefulDetail = Boolean(detail) && !detail.startsWith('Backend request failed');
  return {
    isConstitution,
    title: isConstitution ? 'Blocked by your trading constitution' : 'Trade submission failed',
    message: hasUsefulDetail
      ? detail
      : options.isLive
        ? 'The backend rejected the live trade request. Check broker routing and configured credentials, then retry.'
        : 'The backend paper trade request failed, so no persistent paper account change was recorded.',
  };
}
