// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { clsx } from 'clsx';
import { Lock, type LucideIcon } from 'lucide-react';
import { Fragment } from 'react';

import './flow.css';

export type RailItem = {
  id: string;
  title: string;
  sub?: string;
  Icon: LucideIcon;
  accent?: boolean;
  locked?: boolean;
};

function RailArrow() {
  return (
    <span className="qg-rail-conn" aria-hidden>
      <svg viewBox="0 0 44 24" className="qg-rail-arrow">
        <g
          stroke="url(#qg-rail-grad)"
          strokeWidth="2.4"
          fill="none"
          filter="url(#qg-rail-glow)"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="3" y1="12" x2="34" y2="12" />
          <path d="M30 7 L37 12 L30 17" />
        </g>
      </svg>
    </span>
  );
}

/**
 * A premium horizontal "rail": compact glass cards with glowing icon medallions
 * connected by glowing arrows. The visual companion to the feedback-loop board,
 * used for the linear/progression diagrams (pipeline, tiers, evidence).
 */
export function FlowRail({ items, ariaLabel }: { items: RailItem[]; ariaLabel: string }) {
  return (
    <div className="qg-rail" role="img" aria-label={ariaLabel}>
      <svg width="0" height="0" className="absolute" aria-hidden>
        <defs>
          <linearGradient id="qg-rail-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#4a86ff" />
            <stop offset="1" stopColor="#9cc0ff" />
          </linearGradient>
          <filter id="qg-rail-glow" x="-40%" y="-60%" width="180%" height="220%">
            <feGaussianBlur stdDeviation="1.6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>
      {items.map((item, index) => (
        <Fragment key={item.id}>
          <div
            className={clsx(
              'qg-rail-card',
              item.accent && 'qg-rail-card-accent',
              item.locked && 'qg-rail-locked',
            )}
          >
            <span className="qg-rail-med">{item.locked ? <Lock /> : <item.Icon />}</span>
            <span className="qg-rail-title">{item.title}</span>
            {item.sub ? <span className="qg-rail-sub">{item.sub}</span> : null}
          </div>
          {index < items.length - 1 ? <RailArrow /> : null}
        </Fragment>
      ))}
    </div>
  );
}
