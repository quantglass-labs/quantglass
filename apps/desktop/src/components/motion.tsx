// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Small motion primitives for a more "alive" feel. Both respect
 * prefers-reduced-motion: CountUp snaps to the value, FadeIn renders statically.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

/** Animates a number from its previous value to the new one and formats it. */
export function CountUp({
  value,
  format,
  durationMs = 700,
}: {
  value: number;
  format: (n: number) => string;
  durationMs?: number;
}) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);

  useEffect(() => {
    const from = prev.current;
    const to = value;
    if (from === to || prefersReducedMotion()) {
      prev.current = to;
      setDisplay(to);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) ** 3; // easeOutCubic
      setDisplay(from + (to - from) * eased);
      if (t < 1) {
        raf = requestAnimationFrame(step);
      } else {
        prev.current = to;
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return <>{format(display)}</>;
}

/** Fades + lifts its children in on mount; static when reduced motion is set. */
export function FadeIn({
  children,
  delayMs = 0,
  className,
}: {
  children: ReactNode;
  delayMs?: number;
  className?: string;
}) {
  const [shown, setShown] = useState(prefersReducedMotion());
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const id = window.setTimeout(() => setShown(true), delayMs);
    return () => window.clearTimeout(id);
  }, [delayMs]);
  return (
    <div
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'none' : 'translateY(8px)',
        transition: 'opacity 420ms ease, transform 420ms ease',
      }}
    >
      {children}
    </div>
  );
}
