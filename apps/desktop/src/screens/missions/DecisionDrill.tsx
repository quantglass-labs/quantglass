// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Decision drill player. A mission's interactive half: scenario, decision
 * checkpoints, choices graded server-side on Process / Risk / Discipline,
 * consequences per decision, and a risk-officer note. A severe choice
 * fails the run regardless of score — profit logic never passes a mission.
 */

import { useEffect, useState } from 'react';

import { AlertTriangle, ArrowLeft, ShieldCheck } from 'lucide-react';

import { backendClient } from '../../lib/backend';
import type { DrillDetail, DrillGradeResponse } from '../../types';

function ScoreTile({ label, value, bar }: { label: string; value: number; bar: number }) {
  const tone = value >= bar ? 'text-emerald-300' : 'text-amber-300';
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-3 text-center">
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
      <p className="mt-0.5 text-[11px] uppercase tracking-wider text-zinc-500">{label}</p>
    </div>
  );
}

export function DecisionDrill({ category, onExit }: { category: string; onExit: () => void }) {
  const [drill, setDrill] = useState<DrillDetail | null>(null);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [grade, setGrade] = useState<DrillGradeResponse | null>(null);
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    backendClient
      .getDrill(category)
      .then(setDrill)
      .catch(() => setError('Could not load the drill.'));
  }, [category]);

  const reset = () => {
    setStep(0);
    setAnswers({});
    setGrade(null);
  };

  const choose = async (optionId: string) => {
    const next = { ...answers, [String(step)]: optionId };
    setAnswers(next);
    if (drill && step + 1 < drill.checkpoints.length) {
      setStep(step + 1);
      return;
    }
    setGrading(true);
    try {
      setGrade(await backendClient.gradeDrill(category, next));
    } finally {
      setGrading(false);
    }
  };

  if (error) {
    return (
      <p className="rounded-xl border border-amber-500/30 bg-amber-600/10 p-4 text-sm text-amber-300">
        {error}
      </p>
    );
  }
  if (!drill) {
    return <div className="h-48 animate-pulse rounded-xl bg-zinc-800/60" aria-busy="true" />;
  }

  const checkpoint = drill.checkpoints[step];

  return (
    <div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onExit}
          className="flex items-center gap-1 rounded-lg border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-400 transition-colors hover:border-zinc-500"
        >
          <ArrowLeft size={13} /> Back
        </button>
        <h2 className="font-semibold text-zinc-100">Decision drill: {drill.title}</h2>
        <span className="ml-auto text-xs text-zinc-600">
          pass at {drill.pass_percent}% process, no severe violation
          {drill.best_percent !== null ? ` · best ${drill.best_percent}%` : ''}
        </span>
      </div>

      <p className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-sm leading-relaxed text-zinc-300">
        {drill.scenario}
      </p>

      {!grade ? (
        <div className="mt-4 rounded-xl border border-indigo-500/40 bg-indigo-600/10 p-5">
          <p className="text-xs uppercase tracking-wider text-indigo-300">
            Decision {step + 1} of {drill.checkpoints.length}
          </p>
          <p className="mt-2 font-medium text-zinc-100">{checkpoint.question}</p>
          <div className="mt-3 space-y-2">
            {checkpoint.options.map((option) => (
              <button
                key={option.id}
                type="button"
                disabled={grading}
                onClick={() => void choose(option.id)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2.5 text-left text-sm text-zinc-200 transition-colors hover:border-indigo-400/60 hover:bg-indigo-600/10 disabled:opacity-50"
              >
                {option.label}
              </button>
            ))}
          </div>
          {grading ? <p className="mt-3 text-xs text-zinc-500">Grading…</p> : null}
        </div>
      ) : (
        <div className="mt-4">
          <div className="grid grid-cols-3 gap-3">
            <ScoreTile label="Process" value={grade.scores.process} bar={grade.pass_percent} />
            <ScoreTile label="Risk" value={grade.scores.risk} bar={grade.pass_percent} />
            <ScoreTile
              label="Discipline"
              value={grade.scores.discipline}
              bar={grade.pass_percent}
            />
          </div>
          <div
            className={`mt-3 flex items-start gap-3 rounded-xl border p-4 ${
              grade.passed
                ? 'border-emerald-500/40 bg-emerald-600/10'
                : 'border-amber-500/40 bg-amber-600/10'
            }`}
          >
            {grade.passed ? (
              <ShieldCheck size={18} className="mt-0.5 shrink-0 text-emerald-300" />
            ) : (
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-300" />
            )}
            <div>
              <p className="font-semibold text-zinc-100">
                {grade.passed ? 'Drill passed' : 'Drill failed'}
                {grade.severe_violation ? ' — severe risk violation' : ''}
              </p>
              <p className="mt-1 text-sm text-zinc-300">{grade.officer_note}</p>
            </div>
          </div>
          <div className="mt-3 space-y-3">
            {grade.checkpoints.map((item, index) => (
              <div
                key={index}
                className={`rounded-xl border p-4 ${
                  item.severe
                    ? 'border-rose-500/40 bg-rose-600/10'
                    : 'border-zinc-800 bg-zinc-900/40'
                }`}
              >
                <p className="text-sm font-medium text-zinc-200">{item.question}</p>
                {item.chosen ? (
                  <p className="mt-1 text-xs text-zinc-500">You chose: {item.chosen}</p>
                ) : null}
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{item.feedback}</p>
                {item.best_choice ? (
                  <p className="mt-2 text-xs text-emerald-300/80">
                    Stronger play: {item.best_choice}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-center gap-3">
            <button
              type="button"
              onClick={reset}
              className="rounded-lg border border-indigo-500/50 px-5 py-2 text-sm font-semibold text-indigo-300 transition-colors hover:bg-indigo-600/20"
            >
              Replay the drill
            </button>
            <button
              type="button"
              onClick={onExit}
              className="rounded-lg border border-zinc-700 px-5 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-500"
            >
              Back to missions
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
