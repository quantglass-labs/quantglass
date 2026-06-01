// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { clsx } from 'clsx';
import type { Candle } from '../types';

function normalizeSeries(values: number[]) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values.map((value) => (1 - (value - min) / range) * 100);
}

export function Sparkline({ values, positive }: { values: number[]; positive?: boolean }) {
  const points = normalizeSeries(values)
    .map((value, index) => `${(index / Math.max(1, values.length - 1)) * 100},${value}`)
    .join(' ');

  return (
    <svg viewBox="0 0 100 100" className="h-10 w-20 overflow-visible">
      <polyline
        fill="none"
        stroke={positive ? '#18c37f' : '#f05b78'}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

export function TinyLineChart({ values, tone = 'accent' }: { values: number[]; tone?: 'accent' | 'buy' | 'sell' | 'hold' }) {
  const stroke = tone === 'buy' ? '#18c37f' : tone === 'sell' ? '#f05b78' : tone === 'hold' ? '#f0b84b' : '#8db7ff';
  const fill = `${stroke}22`;
  const normalized = normalizeSeries(values);
  const line = normalized.map((value, index) => `${(index / Math.max(1, values.length - 1)) * 100},${value}`).join(' ');
  const area = `0,100 ${line} 100,100`;

  return (
    <svg viewBox="0 0 100 100" className="h-28 w-full">
      <polygon points={area} fill={fill} />
      <polyline fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={line} />
    </svg>
  );
}

export function BarChart({ values }: { values: number[] }) {
  const max = Math.max(...values.map((value) => Math.abs(value)), 1);
  return (
    <div className="flex h-28 items-end gap-1">
      {values.map((value, index) => (
        <div
          key={index}
          className={clsx('flex-1 rounded-t-lg', value >= 0 ? 'bg-buy/70' : 'bg-sell/70')}
          style={{ height: `${(Math.abs(value) / max) * 100}%` }}
        />
      ))}
    </div>
  );
}