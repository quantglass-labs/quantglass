// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Replay mission player (MSN-6). Reveals a stylized historical episode bar by
 * bar; at each decision checkpoint play pauses for a choice. Answers are
 * graded server-side and the debrief explains every checkpoint with engine
 * facts. The player never sees points or debriefs before grading.
 */

import { useEffect, useMemo, useState } from 'react';

import { ArrowLeft, Award, ChevronRight } from 'lucide-react';

import { backendClient } from '../../lib/backend';
import type { ScenarioDetail, ScenarioGradeResponse } from '../../types';

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function CandleChart({
  candles,
  revealed,
}: {
  candles: ScenarioDetail['candles'];
  revealed: number;
}) {
  const visible = candles.slice(0, revealed);
  const { path } = useMemo(() => {
    if (!visible.length) return { path: null };
    const lows = visible.map((candle) => candle.low);
    const highs = visible.map((candle) => candle.high);
    const min = Math.min(...lows);
    const max = Math.max(...highs);
    const span = max - min || 1;
    const width = 720;
    const height = 260;
    const slot = width / candles.length;
    const bodyWidth = Math.max(2, slot * 0.6);
    const y = (price: number) => height - ((price - min) / span) * (height - 16) - 8;
    return {
      path: visible.map((candle, index) => {
        const x = index * slot + slot / 2;
        const up = candle.close >= candle.open;
        const top = y(Math.max(candle.open, candle.close));
        const bottom = y(Math.min(candle.open, candle.close));
        return {
          x,
          up,
          top,
          bottom,
          wickTop: y(candle.high),
          wickBottom: y(candle.low),
          bodyWidth,
        };
      }),
    };
  }, [visible, candles.length]);

  return (
    <svg viewBox="0 0 720 260" className="w-full rounded-lg border border-zinc-800 bg-zinc-950/70">
      {path?.map((bar, index) => (
        <g key={index}>
          <line
            x1={bar.x}
            x2={bar.x}
            y1={bar.wickTop}
            y2={bar.wickBottom}
            stroke={bar.up ? '#34d399' : '#f87171'}
            strokeWidth={1}
          />
          <rect
            x={bar.x - bar.bodyWidth / 2}
            y={bar.top}
            width={bar.bodyWidth}
            height={Math.max(1, bar.bottom - bar.top)}
            fill={bar.up ? '#34d399' : '#f87171'}
          />
        </g>
      ))}
    </svg>
  );
}

export function ScenarioPlayer({
  scenario,
  onExit,
}: {
  scenario: ScenarioDetail;
  onExit: () => void;
}) {
  const firstStop = scenario.checkpoints[0]?.at_bar ?? scenario.candles.length;
  const [revealed, setRevealed] = useState(Math.min(8, firstStop));
  const [checkpointIndex, setCheckpointIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [grade, setGrade] = useState<ScenarioGradeResponse | null>(null);
  const [grading, setGrading] = useState(false);
  const activeCheckpoint = scenario.checkpoints[checkpointIndex];
  const target = activeCheckpoint ? activeCheckpoint.at_bar : scenario.candles.length;
  const atCheckpoint = activeCheckpoint && revealed >= activeCheckpoint.at_bar;
  const finished = revealed >= scenario.candles.length && !activeCheckpoint;

  useEffect(() => {
    if (reducedMotion()) {
      setRevealed((current) => Math.max(current, target));
      return;
    }
    const id = window.setInterval(() => {
      setRevealed((current) => (current >= target ? current : current + 1));
    }, 90);
    return () => window.clearInterval(id);
  }, [target]);

  const handleAnswer = (optionId: string) => {
    setAnswers({ ...answers, [String(checkpointIndex)]: optionId });
    setCheckpointIndex(checkpointIndex + 1);
  };

  const handleGrade = async () => {
    setGrading(true);
    try {
      setGrade(await backendClient.gradeScenario(scenario.id, answers));
    } finally {
      setGrading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onExit}
          className="flex items-center gap-1 rounded-lg border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-400 transition-colors hover:border-zinc-500"
        >
          <ArrowLeft size={13} /> All missions
        </button>
        <h2 className="font-semibold text-zinc-100">{scenario.title}</h2>
        <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] uppercase tracking-wider text-zinc-500">
          {scenario.level}
        </span>
        <span className="ml-auto text-xs text-zinc-600">
          Bar {Math.min(revealed, scenario.candles.length)} / {scenario.candles.length}
        </span>
      </div>
      <p className="mt-2 text-sm text-zinc-400">{scenario.description}</p>

      <div className="mt-4">
        <CandleChart candles={scenario.candles} revealed={revealed} />
      </div>

      {atCheckpoint && !grade ? (
        <div className="mt-4 rounded-xl border border-indigo-500/40 bg-indigo-600/10 p-5">
          <p className="text-xs uppercase tracking-wider text-indigo-300">
            Decision {checkpointIndex + 1} of {scenario.checkpoints.length}
          </p>
          <p className="mt-2 font-medium text-zinc-100">{activeCheckpoint.question}</p>
          <div className="mt-3 space-y-2">
            {activeCheckpoint.options.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => handleAnswer(option.id)}
                className="flex w-full items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2.5 text-left text-sm text-zinc-200 transition-colors hover:border-indigo-400/60 hover:bg-indigo-600/10"
              >
                <ChevronRight size={14} className="shrink-0 text-indigo-400" />
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {finished && !grade ? (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            disabled={grading}
            onClick={() => void handleGrade()}
            className="rounded-lg border border-indigo-500/50 px-6 py-2.5 text-sm font-semibold text-indigo-300 transition-colors hover:bg-indigo-600/20 disabled:opacity-40"
          >
            {grading ? 'Grading…' : 'Get the debrief'}
          </button>
        </div>
      ) : null}

      {grade ? (
        <div className="mt-4">
          <div
            className={`flex items-center gap-3 rounded-xl border p-4 ${
              grade.passed
                ? 'border-emerald-500/40 bg-emerald-600/10'
                : 'border-amber-500/40 bg-amber-600/10'
            }`}
          >
            <Award size={20} className={grade.passed ? 'text-emerald-300' : 'text-amber-300'} />
            <p className="font-semibold text-zinc-100">
              {grade.percent}% — {grade.passed ? 'Passed' : `Below the ${grade.pass_percent}% bar`}
            </p>
            <span className="ml-auto text-xs text-zinc-500">
              {grade.score} / {grade.max_score} points
            </span>
          </div>
          <div className="mt-3 space-y-3">
            {grade.checkpoints.map((item, index) => (
              <div key={index} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-zinc-200">{item.question}</p>
                  <span
                    className={`shrink-0 text-sm font-semibold ${
                      item.points === item.max_points ? 'text-emerald-300' : 'text-amber-300'
                    }`}
                  >
                    {item.points}/{item.max_points}
                  </span>
                </div>
                {item.chosen ? (
                  <p className="mt-1 text-xs text-zinc-500">You chose: {item.chosen}</p>
                ) : null}
                <p className="mt-2 text-sm text-zinc-400">{item.debrief}</p>
                {item.best_choice ? (
                  <p className="mt-2 text-xs text-emerald-300/80">
                    Stronger play: {item.best_choice}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={onExit}
              className="rounded-lg border border-zinc-700 px-5 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-500"
            >
              Back to missions
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
