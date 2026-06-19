// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  Briefcase,
  ClipboardCheck,
  FlaskConical,
  type LucideIcon,
  NotebookPen,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QuantGlassMark } from '../QuantGlassMark';

import './flow.css';

/** The QuantGlass brand mark (Q lens + rising chart arrow) as a stroke icon. */
// Fixed design coordinate system (matches the prototype); the whole board is
// scaled to the container width so it renders pixel-faithfully at any size.
const W = 1180;
const H = 740;

type Step = {
  x: number;
  y: number;
  n: number;
  titleKey: string;
  descKey: string;
  Icon: LucideIcon;
  route: string;
  accent?: boolean;
};

const STEPS: Step[] = [
  {
    x: 60,
    y: 150,
    n: 1,
    titleKey: 'nav.signals',
    descKey: 'howItWorks.steps.signals',
    Icon: TrendingUp,
    route: '/signals',
    accent: true,
  },
  {
    x: 425,
    y: 150,
    n: 2,
    titleKey: 'nav.backtest',
    descKey: 'howItWorks.steps.backtest',
    Icon: FlaskConical,
    route: '/backtest',
  },
  {
    x: 790,
    y: 150,
    n: 3,
    titleKey: 'nav.portfolio',
    descKey: 'howItWorks.steps.portfolio',
    Icon: Briefcase,
    route: '/portfolio',
  },
  {
    x: 790,
    y: 430,
    n: 4,
    titleKey: 'nav.journal',
    descKey: 'howItWorks.steps.journal',
    Icon: NotebookPen,
    route: '/journal',
  },
  {
    x: 425,
    y: 430,
    n: 5,
    titleKey: 'nav.review',
    descKey: 'howItWorks.steps.review',
    Icon: ClipboardCheck,
    route: '/review',
  },
  {
    x: 60,
    y: 430,
    n: 6,
    titleKey: 'review.constitution.title',
    descKey: 'howItWorks.steps.constitution',
    Icon: ShieldCheck,
    route: '/review',
  },
];

/**
 * The QuantGlass feedback loop as a premium card board: six glassy, glowing
 * stage cards with numbered badges, icon medallions, and short descriptions,
 * wired into a loop by glowing connectors around a central emblem. Cards are
 * clickable and navigate to the matching screen.
 */
export function FeedbackLoopBoard({ onNavigate }: { onNavigate: (route: string) => void }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / W);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className="w-full" style={{ height: scale ? H * scale : undefined }}>
      <div
        className="qg-board"
        style={{
          width: W,
          height: H,
          transform: `scale(${scale || 0.0001})`,
          transformOrigin: 'top left',
        }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="qg-board-svg">
          <defs>
            <linearGradient id="qg-board-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#4a86ff" />
              <stop offset="1" stopColor="#9cc0ff" />
            </linearGradient>
            <marker
              id="qg-board-arr"
              markerWidth="11"
              markerHeight="11"
              refX="6.5"
              refY="5"
              orient="auto"
            >
              <path d="M1 1 L9 5 L1 9 Z" fill="#9cc0ff" />
            </marker>
            <filter id="qg-board-glow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g
            stroke="url(#qg-board-grad)"
            strokeWidth="3"
            fill="none"
            filter="url(#qg-board-glow)"
            markerEnd="url(#qg-board-arr)"
          >
            <line x1="396" y1="244" x2="436" y2="244" />
            <line x1="761" y1="244" x2="801" y2="244" />
            <path d="M 955 342 L 955 426" />
            <line x1="784" y1="524" x2="744" y2="524" />
            <line x1="419" y1="524" x2="379" y2="524" />
            <path d="M 225 432 L 225 344" />
          </g>
        </svg>

        {STEPS.map((s) => (
          <button
            key={s.n}
            type="button"
            onClick={() => onNavigate(s.route)}
            className={`qg-board-card${s.accent ? ' qg-board-card-accent' : ''}`}
            style={{ left: s.x, top: s.y }}
          >
            <span className="qg-board-num">{s.n}</span>
            <span className="qg-board-ic">
              <s.Icon />
            </span>
            <span className="qg-board-title">{t(s.titleKey)}</span>
            <span className="qg-board-desc">{t(s.descKey)}</span>
          </button>
        ))}

        <div className="qg-board-core">
          <span className="qg-board-emblem">
            <QuantGlassMark />
          </span>
          <span className="qg-board-cap">
            {t('howItWorks.coreLine1')}
            <b>{t('howItWorks.coreLine2')}</b>
          </span>
        </div>
      </div>
    </div>
  );
}
