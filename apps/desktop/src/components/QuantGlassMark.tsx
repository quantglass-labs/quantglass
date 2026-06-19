// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The QuantGlass brand mark: a lens (the "glass") over a rising chart (the
 * "quant"). Used wherever the product needs to speak for itself — the Copilot
 * launcher, the feedback-loop board — instead of a generic AI sparkle. Behaves
 * like a lucide icon: size and colour come from `className` (currentColor).
 */
export function QuantGlassMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="11" cy="13" r="7" />
      <path d="M15 17 L19.5 21.5" />
      <path d="M6 13.5 L10 9.5 L13 12.5 L19 6.5" />
      <path d="M14.5 6.5 L19 6.5 L19 11" />
    </svg>
  );
}
