// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Interactive Learning Platform — LearnScreen
 *
 * Educational use only — not financial advice.
 *
 * Layout:
 *  - Left sidebar  : module tree with tier badges and per-lesson completion dots
 *  - Main content  : lesson viewer (concept → exercise → Try It Live)
 *  - Top bar       : overall progress bar
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  ExerciseResult,
  LiveExercise,
  LiveExerciseResult,
  LearnCatalogResponse,
  LearnMoment,
  LearnReadiness,
  TradeReviewResponse,
  Assessment,
  AssessmentResult,
  LessonRecord,
  LessonStub,
  LessonTier,
} from '@quantglass/contracts';
import { BackendStatusNotice } from '../components/backendGate';
import { LearnTierMapDiagram } from '../components/flow/FlowDiagram';
import { backendClient } from '../lib/backend';
import { AiMarkdown } from '../components/AiMarkdown';
import { LessonVisuals } from './learn/LessonVisuals';
import { GlossaryView, ReferenceView } from './learn/LibraryViews';
import { PracticeView } from './learn/PracticeView';
import { ProgressView } from './learn/ProgressView';
import type { BackendStatus } from '../types';
import {
  BookOpen,
  ChevronRight,
  CheckCircle2,
  Circle,
  GraduationCap,
  ListChecks,
  Lock,
  Lightbulb,
  SquareArrowOutUpRight,
  RotateCcw,
  AlertCircle,
} from 'lucide-react';
import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface LearnScreenProps {
  backendStatus: BackendStatus;
  onNavigate: (path: string) => void;
}

// ---------------------------------------------------------------------------
// Tier metadata
// ---------------------------------------------------------------------------

const TIER_COLORS: Record<LessonTier, { badge: string; ring: string; dot: string }> = {
  novice: {
    badge: 'bg-buy/20 text-buy border border-buy/30',
    ring: 'ring-buy/50',
    dot: 'bg-buy',
  },
  intermediate: {
    badge: 'bg-watch/20 text-watch border border-watch/30',
    ring: 'ring-watch/50',
    dot: 'bg-watch',
  },
  advanced: {
    badge: 'bg-violet-500/20 text-violet-300 border border-violet-500/30',
    ring: 'ring-violet-500/50',
    dot: 'bg-violet-400',
  },
  expert: {
    badge: 'bg-hold/20 text-hold border border-hold/30',
    ring: 'ring-hold/50',
    dot: 'bg-hold',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pct(done: number, total: number) {
  if (total === 0) return 0;
  return Math.round((done / total) * 100);
}

function renderMarkdown(text: string): string {
  // Minimal safe Markdown-subset for concept text (bold, code, lists, tables, newlines).
  // No eval, no XSS — plain string manipulation only.
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(
      /`(.+?)`/g,
      '<code class="font-mono text-hold bg-white/[0.06] px-1 rounded text-sm">$1</code>',
    )
    .replace(/^#{1,3} (.+)$/gm, '<h3 class="text-base font-semibold text-ink mt-4 mb-1">$1</h3>')
    .replace(/^\| (.+) \|$/gm, (line) => {
      const cells = line
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean);
      return (
        '<div class="flex gap-4 border-b border-border py-1">' +
        cells.map((c) => `<span class="flex-1 text-sm text-ink">${c}</span>`).join('') +
        '</div>'
      );
    })
    .replace(/^\|---.*$/gm, '')
    .replace(/^- (.+)$/gm, '<li class="ml-4 text-ink text-sm list-disc">$1</li>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TierBadge({ tier }: { tier: LessonTier }) {
  const { t } = useTranslation();
  const c = TIER_COLORS[tier];
  return (
    <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full', c.badge)}>
      {t(`learn.tiers.${tier}`)}
    </span>
  );
}

function ProgressBar({ done, total, tier }: { done: number; total: number; tier?: LessonTier }) {
  const p = pct(done, total);
  const barColor = tier
    ? {
        novice: 'bg-buy',
        intermediate: 'bg-watch',
        advanced: 'bg-violet-500',
        expert: 'bg-hold',
      }[tier]
    : 'bg-accentStrong';
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-1.5 rounded-full bg-white/10 min-w-0">
        <div
          className={clsx('h-full rounded-full transition-all duration-500', barColor)}
          style={{ width: `${p}%` }}
        />
      </div>
      <span className="text-xs text-muted shrink-0">
        {done}/{total}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar module item
// ---------------------------------------------------------------------------

interface LevelSectionProps {
  level: LearnCatalogResponse['levels'][0];
  activeLessonId: string | null;
  onSelectLesson: (lesson: LessonStub) => void;
  defaultOpen: boolean;
  locked?: boolean;
  lockReasons?: string[];
  onTakeAssessment: (level: LessonTier) => void;
}

function LevelSection({
  level,
  activeLessonId,
  onSelectLesson,
  defaultOpen,
  locked,
  lockReasons,
  onTakeAssessment,
}: LevelSectionProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);
  const c = TIER_COLORS[level.id];
  return (
    <div className="mb-2">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors group text-left"
        onClick={() => setOpen(!open)}
      >
        <ChevronRight
          size={14}
          className={clsx(
            'shrink-0 text-muted transition-transform duration-200',
            open && 'rotate-90',
          )}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-medium text-ink truncate">{level.title}</span>
            <TierBadge tier={level.id} />
            {locked ? (
              <span title={(lockReasons ?? []).join(' · ') || t('learn.locked')}>
                <Lock size={12} className="shrink-0 text-muted" />
              </span>
            ) : null}
          </div>
          <ProgressBar done={level.completed} total={level.total} tier={level.id} />
        </div>
        <span
          role="button"
          tabIndex={0}
          title={t('learn.takeAssessment', { level: t(`learn.tiers.${level.id}`) })}
          className="shrink-0 rounded-md p-1 text-muted hover:text-accent hover:bg-white/[0.06]"
          onClick={(event) => {
            event.stopPropagation();
            onTakeAssessment(level.id);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onTakeAssessment(level.id);
          }}
        >
          <ListChecks size={14} />
        </span>
      </button>

      {open && (
        <div className="ml-4 mt-0.5 space-y-1">
          {level.tracks.map((track) => (
            <div key={track.id}>
              <p className="px-3 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                {track.title}
                {track.source === 'community' ? (
                  <span className="ml-1.5 rounded-full border border-watch/40 px-1.5 font-normal normal-case tracking-normal text-watch">
                    {t('learn.community')}
                  </span>
                ) : null}
                <span className="ml-2 font-normal normal-case tracking-normal">
                  {track.completed}/{track.total}
                </span>
              </p>
              <div className="space-y-0.5">
                {track.lessons.map((lesson) => (
                  <button
                    key={lesson.id}
                    onClick={() => onSelectLesson(lesson)}
                    className={clsx(
                      'w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-left transition-colors',
                      activeLessonId === lesson.id
                        ? 'bg-accent/20 text-accent'
                        : 'hover:bg-white/5 text-muted hover:text-ink',
                    )}
                  >
                    {lesson.completed ? (
                      <CheckCircle2
                        size={14}
                        className={clsx('shrink-0', c.dot.replace('bg-', 'text-'))}
                      />
                    ) : (
                      <Circle size={14} className="shrink-0 text-muted/70" />
                    )}
                    <span className="text-xs truncate">{lesson.title}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exercise renderer
// ---------------------------------------------------------------------------

function AssessmentView({
  level,
  onClose,
  onGraded,
}: {
  level: LessonTier;
  onClose: () => void;
  onGraded: () => void;
}) {
  const { t } = useTranslation();
  const [exam, setExam] = useState<Assessment | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    backendClient
      .getAssessment(level)
      .then(setExam)
      .catch(() => setError(t('learn.assessment.loadError')));
  }, [level, t]);

  async function submit() {
    try {
      const graded = await backendClient.submitAssessment(level, answers);
      setResult(graded);
      onGraded();
    } catch {
      setError(t('learn.assessment.submitError'));
    }
  }

  const resultByLesson = new Map((result?.results ?? []).map((r) => [r.lesson_id, r]));

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink capitalize">
          {t('learn.assessment.heading', { level: t(`learn.tiers.${level}`) })}
        </h2>
        <button
          type="button"
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:bg-white/[0.06]"
          onClick={onClose}
        >
          {t('learn.assessment.back')}
        </button>
      </div>
      <p className="mt-1 text-sm text-muted">
        {exam
          ? t('learn.assessment.meta', {
              count: exam.questions.length,
              percent: exam.pass_percent,
            })
          : t('learn.assessment.loading')}
        {' · '}
        {t('learn.assessment.gradedNote')}
      </p>
      {error ? <p className="mt-4 text-sm text-hold">{error}</p> : null}
      {result ? (
        <div
          className={`mt-4 rounded-xl border p-4 text-sm ${
            result.passed
              ? 'border-buy/40 bg-buy/10 text-buy'
              : 'border-hold/40 bg-hold/10 text-hold/90'
          }`}
        >
          {result.passed ? t('learn.assessment.passed') : t('learn.assessment.notYet')} —{' '}
          {t('learn.assessment.scoreLine', {
            score: result.score,
            bar: result.pass_percent,
          })}{' '}
          {result.passed ? t('learn.assessment.gateMet') : t('learn.assessment.reviewRetake')}
        </div>
      ) : null}
      <div className="mt-5 space-y-5">
        {exam?.questions.map((q, qi) => {
          const feedback = resultByLesson.get(q.lesson_id);
          return (
            <div key={q.lesson_id} className="rounded-xl border border-border bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-muted">
                {t('learn.assessment.question', { number: qi + 1, title: q.title })}
              </p>
              <p className="mt-2 text-sm text-ink">{q.question}</p>
              <div className="mt-3 space-y-1.5">
                {q.options.map((option, oi) => (
                  <label
                    key={oi}
                    className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${
                      answers[q.lesson_id] === oi
                        ? 'border-accent/60 bg-accent/15 text-ink'
                        : 'border-border text-muted hover:border-border'
                    }`}
                  >
                    <input
                      type="radio"
                      className="mt-0.5 accent-indigo-500"
                      name={q.lesson_id}
                      checked={answers[q.lesson_id] === oi}
                      disabled={Boolean(result)}
                      onChange={() => setAnswers((current) => ({ ...current, [q.lesson_id]: oi }))}
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
              {feedback ? (
                <p className={`mt-3 text-sm ${feedback.correct ? 'text-buy' : 'text-hold'}`}>
                  {feedback.correct
                    ? t('learn.assessment.correct')
                    : t('learn.assessment.incorrect')}
                  {feedback.explanation}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      {exam && !result ? (
        <button
          type="button"
          disabled={Object.keys(answers).length < exam.questions.length}
          className="mt-5 rounded-lg border border-accent/50 px-4 py-2 text-sm text-accent hover:bg-accent/15 disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={() => void submit()}
        >
          {t('learn.assessment.submit')}
        </button>
      ) : null}
      {result && !result.passed ? (
        <button
          type="button"
          className="mt-5 rounded-lg border border-border px-4 py-2 text-sm text-ink hover:bg-white/[0.06]"
          onClick={() => {
            setResult(null);
            setAnswers({});
            backendClient
              .getAssessment(level)
              .then(setExam)
              .catch(() => undefined);
          }}
        >
          {t('learn.assessment.retake')}
        </button>
      ) : null}
    </div>
  );
}

function LiveExercisePanel({
  lessonId,
  enabled,
  onComplete,
}: {
  lessonId: string;
  enabled: boolean;
  onComplete: () => void;
}) {
  const { t } = useTranslation();
  const [exercise, setExercise] = useState<LiveExercise | null>(null);
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<LiveExerciseResult | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  if (!enabled) return null;

  async function loadExercise() {
    setResult(null);
    setAnswer('');
    setStatus(null);
    try {
      setExercise(await backendClient.getLiveExercise(lessonId));
    } catch {
      setStatus(t('learn.live.unavailable'));
    }
  }

  async function submit() {
    if (!exercise || !answer.trim()) return;
    try {
      const res = await backendClient.checkLiveAnswer(lessonId, {
        answer: answer.trim(),
        params: exercise.params,
      });
      setResult(res);
      if (res.correct) onComplete();
    } catch {
      setStatus(t('learn.live.backendError'));
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-buy/30 bg-buy/10 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-buy">
        {t('learn.live.title')}
      </p>
      <p className="mt-2 text-sm text-muted">{t('learn.live.subtitle')}</p>
      {!exercise ? (
        <button
          type="button"
          className="mt-3 rounded-lg border border-buy/40 px-3 py-1.5 text-sm text-buy hover:bg-buy/15"
          onClick={() => void loadExercise()}
        >
          {t('learn.live.generate')}
        </button>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-ink">{exercise.question}</p>
          <p className="text-xs text-muted">{exercise.hint}</p>
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-lg border border-border bg-panel px-3 py-1.5 text-sm text-ink"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder={t('learn.live.answerPlaceholder')}
            />
            <button
              type="button"
              className="rounded-lg border border-buy/40 px-3 py-1.5 text-sm text-buy hover:bg-buy/15"
              onClick={() => void submit()}
            >
              {t('learn.live.check')}
            </button>
            <button
              type="button"
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:bg-white/[0.06]"
              onClick={() => void loadExercise()}
            >
              {t('learn.live.newNumbers')}
            </button>
          </div>
          {result ? (
            <p className={`text-sm ${result.correct ? 'text-buy' : 'text-hold'}`}>
              {result.correct ? t('learn.live.correct') : t('learn.live.notQuite')}
              {result.explanation}
            </p>
          ) : null}
        </div>
      )}
      {status ? <p className="mt-3 text-sm text-hold">{status}</p> : null}
    </div>
  );
}

// Wrapped version that captures the answer before calling parent:
interface ExerciseControllerProps {
  lesson: LessonRecord;
  onComplete: () => void;
}

function ExerciseController({ lesson, onComplete }: ExerciseControllerProps) {
  const { t } = useTranslation();
  const ex = lesson.exercise;
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [numericValue, setNumericValue] = useState('');
  const [result, setResult] = useState<ExerciseResult | null>(null);
  const [loading, setLoading] = useState(false);

  const [exerciseLessonId, setExerciseLessonId] = useState(lesson.id);
  if (exerciseLessonId !== lesson.id) {
    setExerciseLessonId(lesson.id);
    setSelectedIndex(null);
    setNumericValue('');
    setResult(null);
  }

  async function handleSubmit() {
    let answer: string;
    if (ex.type === 'multiple_choice') {
      if (selectedIndex === null) return;
      answer = String(selectedIndex);
    } else if (ex.type === 'numeric_input') {
      if (!numericValue.trim()) return;
      answer = numericValue.trim();
    } else {
      return;
    }
    setLoading(true);
    try {
      const res = await backendClient.checkLessonAnswer(lesson.id, { answer });
      setResult(res);
      if (res.correct) onComplete();
    } catch {
      setResult({
        correct: false,
        explanation: t('learn.exercise.backendError'),
        score: 0,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-white/[0.04] p-5 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Lightbulb size={15} className="text-hold shrink-0" />
        <span className="text-sm font-semibold text-ink">{t('learn.exercise.title')}</span>
      </div>
      <p className="text-sm text-ink leading-relaxed">{ex.question}</p>

      {'hint' in ex && (ex as { hint?: string }).hint && (
        <p className="text-xs text-muted italic">{(ex as { hint?: string }).hint}</p>
      )}

      {ex.type === 'multiple_choice' && 'options' in ex && (
        <div className="space-y-2">
          {((ex as { options?: string[] }).options ?? []).map((opt: string, i: number) => (
            <button
              key={i}
              disabled={result !== null || loading}
              onClick={() => {
                setSelectedIndex(i);
                setResult(null);
              }}
              className={clsx(
                'w-full text-left px-4 py-3 rounded-lg text-sm border transition-colors',
                result === null && selectedIndex === i
                  ? 'border-accent bg-accent/15 text-ink'
                  : result !== null && result.correct && selectedIndex === i
                    ? 'border-buy bg-buy/15 text-ink'
                    : result !== null && !result.correct && selectedIndex === i
                      ? 'border-red-500 bg-red-600/20 text-red-100'
                      : 'border-border bg-white/5 text-ink hover:border-border hover:text-ink',
              )}
            >
              <span className="font-medium mr-2 text-muted">{String.fromCharCode(65 + i)}.</span>
              {opt}
            </button>
          ))}
        </div>
      )}

      {ex.type === 'numeric_input' && (
        <input
          type="text"
          value={numericValue}
          onChange={(e) => setNumericValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleSubmit();
          }}
          disabled={result !== null || loading}
          placeholder={t('learn.exercise.placeholder')}
          className="w-full bg-white/[0.06] border border-border rounded-lg px-4 py-2 text-sm text-ink placeholder-zinc-500 focus:outline-none focus:border-accent"
        />
      )}

      {result === null && (
        <button
          disabled={
            loading ||
            (ex.type === 'multiple_choice' ? selectedIndex === null : !numericValue.trim())
          }
          onClick={() => void handleSubmit()}
          className="px-5 py-2 bg-accentStrong hover:bg-accentStrong disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          {loading ? t('learn.exercise.checking') : t('learn.exercise.check')}
        </button>
      )}

      {result !== null && (
        <>
          <div
            className={clsx(
              'rounded-lg p-4 border text-sm',
              result.correct
                ? 'border-buy/40 bg-buy/10 text-buy'
                : 'border-red-500/40 bg-red-600/10 text-red-200',
            )}
          >
            <div className="flex items-center gap-2 font-semibold mb-2">
              {result.correct ? (
                <CheckCircle2 size={15} className="text-buy" />
              ) : (
                <AlertCircle size={15} className="text-red-400" />
              )}
              {result.correct ? t('learn.exercise.correct') : t('learn.exercise.notQuite')}
            </div>
            <p className="text-ink leading-relaxed">{result.explanation}</p>
          </div>
          {!result.correct && (
            <button
              onClick={() => {
                setResult(null);
                setSelectedIndex(null);
                setNumericValue('');
              }}
              className="flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors"
            >
              <RotateCcw size={13} />
              {t('learn.exercise.tryAgain')}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lesson viewer (main content area)
// ---------------------------------------------------------------------------

interface LessonViewerProps {
  lesson: LessonRecord;
  onNavigate: (path: string) => void;
  onLessonCompleted: () => void;
}

function TutorPanel({ lessonId }: { lessonId: string }) {
  const { t } = useTranslation();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  const ask = async () => {
    if (!question.trim() || asking) return;
    setAsking(true);
    setAnswer(null);
    setNotice(null);
    try {
      const response = await backendClient.askTutor(lessonId, question);
      if (response.error) {
        setNotice(response.error);
      } else {
        setAnswer(response.answer);
        setSource(response.source);
      }
    } catch {
      setNotice(t('learn.tutor.error'));
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-white/[0.03] p-5">
      <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-2">
        {t('learn.tutor.title')}
      </h2>
      <div className="flex gap-2">
        <input
          type="text"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void ask();
          }}
          placeholder={t('learn.tutor.placeholder')}
          className="flex-1 rounded-lg border border-border bg-background/50 px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:border-accent focus:outline-none"
        />
        <button
          type="button"
          disabled={asking || !question.trim()}
          onClick={() => void ask()}
          className="rounded-lg border border-accent/50 px-4 py-2 text-xs font-semibold text-accent transition-colors hover:bg-accent/15 disabled:opacity-40"
        >
          {asking ? t('learn.tutor.thinking') : t('learn.tutor.ask')}
        </button>
      </div>
      {notice ? <p className="mt-3 text-sm text-hold">{notice}</p> : null}
      {answer ? (
        <div className="mt-3 rounded-lg border border-border bg-background/40 p-3">
          <AiMarkdown className="text-sm leading-relaxed text-ink">{answer}</AiMarkdown>
          <p className="mt-2 text-[11px] text-muted/70">{t('learn.tutor.footer', { source })}</p>
        </div>
      ) : null}
    </div>
  );
}

function LessonViewer({ lesson, onNavigate, onLessonCompleted }: LessonViewerProps) {
  const { t } = useTranslation();
  const c = TIER_COLORS[lesson.tier];
  const conceptRef = useRef<HTMLDivElement>(null);

  // Scroll concept pane to top when lesson changes
  useEffect(() => {
    if (conceptRef.current) {
      conceptRef.current.scrollTop = 0;
    }
  }, [lesson.id]);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div
          className={clsx(
            'w-10 h-10 rounded-xl flex items-center justify-center ring-1 shrink-0',
            c.ring,
            'bg-white/[0.06]',
          )}
        >
          <BookOpen size={18} className={c.dot.replace('bg-', 'text-')} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <TierBadge tier={lesson.tier} />
            <span className="text-xs text-muted">
              {t('learn.lesson.number', { order: lesson.order })}
            </span>
            {lesson.completed && (
              <span className="flex items-center gap-1 text-xs text-buy">
                <CheckCircle2 size={12} />
                {t('learn.lesson.completed')}
              </span>
            )}
          </div>
          <h1 className="text-xl font-bold text-ink">{lesson.title}</h1>
          <p className="text-sm text-muted mt-0.5">{lesson.summary}</p>
        </div>
      </div>

      {/* Concept */}
      <div ref={conceptRef} className="rounded-xl border border-border bg-white/[0.03] p-5">
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
          {t('learn.lesson.concept')}
        </h2>
        <div
          className="text-sm text-ink leading-relaxed space-y-1 prose-zinc"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(lesson.concept) }}
        />

        <LessonVisuals visuals={lesson.visuals} />
      </div>

      {/* Key Terms */}
      {lesson.key_terms?.length > 0 && (
        <div className="rounded-xl border border-border bg-white/[0.03] p-5">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
            {t('learn.lesson.keyTerms')}
          </h2>
          <dl className="space-y-2">
            {lesson.key_terms.map((kt) => (
              <div key={kt.term} className="flex gap-3">
                <dt className="text-sm font-medium text-ink shrink-0 w-40 truncate">{kt.term}</dt>
                <dd className="text-sm text-muted leading-relaxed">{kt.definition}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Common mistakes */}
      {lesson.common_mistakes?.length ? (
        <div className="rounded-xl border border-hold/30 bg-hold/10 p-5">
          <h2 className="text-sm font-semibold text-hold uppercase tracking-wider mb-3">
            {t('learn.lesson.commonMistakes')}
          </h2>
          <ul className="space-y-2">
            {lesson.common_mistakes.map((mistake) => (
              <li key={mistake} className="flex gap-2 text-sm text-ink leading-relaxed">
                <span className="text-hold shrink-0">⚠</span>
                {mistake}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Exercise */}
      <ExerciseController lesson={lesson} onComplete={onLessonCompleted} />
      <LiveExercisePanel
        lessonId={lesson.id}
        enabled={Boolean(lesson.live_exercise)}
        onComplete={onLessonCompleted}
      />

      {/* AI tutor (AI-3) */}
      <TutorPanel lessonId={lesson.id} />

      {/* Try It Live */}
      {/* Bridge: lesson -> mission/scenario */}
      {lesson.bridge ? (
        <div className="rounded-xl border border-buy/30 bg-buy/10 p-5">
          <h2 className="text-sm font-semibold text-buy uppercase tracking-wider mb-2">
            {t('learn.lesson.takeFurther')}
          </h2>
          <p className="text-sm text-ink leading-relaxed mb-3">{lesson.bridge.cta}</p>
          <button
            type="button"
            onClick={() => onNavigate('/missions')}
            className="rounded-lg border border-buy/50 px-3 py-1.5 text-xs font-semibold text-buy transition-colors hover:bg-buy/15"
          >
            {t('learn.lesson.openMissions')}
          </button>
        </div>
      ) : null}

      {lesson.live_apply && (
        <div className="rounded-xl border border-accent/30 bg-accent/10 p-5">
          <h2 className="text-sm font-semibold text-accent uppercase tracking-wider mb-2">
            {t('learn.lesson.tryLive')}
          </h2>
          <p className="text-sm text-ink leading-relaxed mb-3">{lesson.live_apply.cta}</p>
          {lesson.live_apply.screen && (
            <button
              onClick={() => {
                const screenMap: Record<string, string> = {
                  dashboard: '/',
                  signals: '/signals',
                  backtest: '/backtest',
                  watchlist: '/watchlist',
                  alerts: '/alerts',
                  settings: '/settings',
                };
                onNavigate(screenMap[lesson.live_apply.screen] ?? '/');
              }}
              className="flex items-center gap-2 px-4 py-2 bg-accentStrong hover:bg-accentStrong text-white text-sm font-medium rounded-lg transition-colors"
            >
              <SquareArrowOutUpRight size={14} />
              {t('learn.lesson.openScreen', {
                screen: t(`nav.${lesson.live_apply.screen}`, {
                  defaultValue:
                    lesson.live_apply.screen.charAt(0).toUpperCase() +
                    lesson.live_apply.screen.slice(1),
                }),
              })}
            </button>
          )}
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-xs text-muted/70 text-center pt-2">{t('learn.eduDisclaimer')}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty / loading states
// ---------------------------------------------------------------------------

function EmptyLearnState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 min-h-[300px] gap-4 text-muted">
      <GraduationCap size={40} className="opacity-30" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LearnScreen (main export)
// ---------------------------------------------------------------------------

export function LearnScreen({ backendStatus, onNavigate }: LearnScreenProps) {
  const { t } = useTranslation();
  const [catalog, setCatalog] = useState<LearnCatalogResponse | null>(null);
  const [moments, setMoments] = useState<LearnMoment[]>([]);
  const [readiness, setReadiness] = useState<LearnReadiness | null>(null);
  const [tradeReview, setTradeReview] = useState<TradeReviewResponse | null>(null);
  const [assessmentLevel, setAssessmentLevel] = useState<LessonTier | null>(null);
  const [libraryView, setLibraryView] = useState<
    'glossary' | 'reference' | 'practice' | 'progress' | null
  >(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [screenHeight, setScreenHeight] = useState('calc(100dvh - 12rem)');
  const screenRef = useRef<HTMLDivElement | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query || !catalog) return null;
    const results: { lesson: LessonStub; trackTitle: string; level: LessonTier }[] = [];
    for (const level of catalog.levels) {
      for (const track of level.tracks) {
        for (const lessonStub of track.lessons) {
          const haystack = `${lessonStub.title} ${lessonStub.summary} ${track.title}`.toLowerCase();
          if (haystack.includes(query)) {
            results.push({ lesson: lessonStub, trackTitle: track.title, level: level.id });
          }
        }
      }
    }
    return results.slice(0, 30);
  }, [searchQuery, catalog]);

  // Bound the screen to the viewport so the sidebar and lesson pane scroll
  // independently instead of sharing the window scroll.
  useEffect(() => {
    function measure() {
      const top = screenRef.current?.getBoundingClientRect().top ?? 0;
      setScreenHeight(`calc(100dvh - ${Math.max(top, 0) + 12}px)`);
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);

  // The lesson pane starts at the top for every newly opened lesson.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [activeLessonId, assessmentLevel, libraryView]);
  const [activeLesson, setActiveLesson] = useState<LessonRecord | null>(null);
  const [lessonLoading, setLessonLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load catalog
  useEffect(() => {
    if (backendStatus !== 'online') return;
    backendClient
      .getLearnCatalog()
      .then((response) => {
        if (!Array.isArray(response?.levels)) {
          setError(t('learn.errors.catalogStale'));
          return;
        }
        setCatalog(response);
      })
      .catch(() => setError(t('learn.errors.catalogLoad')));
  }, [backendStatus, t]);

  // Load coaching moments derived from the user's own paper trading
  useEffect(() => {
    if (backendStatus !== 'online') return;
    backendClient
      .getLearnMoments()
      .then((response) => setMoments(response.items))
      .catch(() => setMoments([]));
  }, [backendStatus, activeLessonId]);

  // Readiness scores and level unlocks
  useEffect(() => {
    if (backendStatus !== 'online') return;
    backendClient
      .getLearnReadiness()
      .then(setReadiness)
      .catch(() => setReadiness(null));
  }, [backendStatus, activeLessonId]);

  // Process review over the user's executed paper trades (MSN-2)
  useEffect(() => {
    if (backendStatus !== 'online') return;
    backendClient
      .getTradeReview()
      .then(setTradeReview)
      .catch(() => setTradeReview(null));
  }, [backendStatus, activeLessonId]);

  // Auto-select first incomplete lesson once catalog arrives
  // First-lesson selection happens during render once the catalog arrives.
  if (catalog && !activeLessonId) {
    outer: for (const level of catalog.levels) {
      for (const track of level.tracks) {
        const first = track.lessons.find((l) => !l.completed) ?? track.lessons[0];
        if (first) {
          setActiveLessonId(first.id);
          break outer;
        }
      }
    }
  }

  // Load lesson detail when activeLessonId changes
  const [loadingLessonId, setLoadingLessonId] = useState<string | null>(null);
  if (activeLessonId && activeLessonId !== loadingLessonId && backendStatus === 'online') {
    setLoadingLessonId(activeLessonId);
    setLessonLoading(true);
    setActiveLesson(null);
  }
  useEffect(() => {
    if (!activeLessonId || backendStatus !== 'online') return;
    backendClient
      .getLearnLesson(activeLessonId)
      .then(setActiveLesson)
      .catch(() => setError(t('learn.errors.lessonLoad', { id: activeLessonId })))
      .finally(() => setLessonLoading(false));
  }, [activeLessonId, backendStatus, t]);

  const handleSelectLesson = useCallback((lesson: LessonStub) => {
    setLibraryView(null);
    setActiveLessonId(lesson.id);
    setError(null);
  }, []);

  const handleLessonCompleted = useCallback(() => {
    // Refresh catalog to pick up new completion state
    backendClient
      .getLearnCatalog()
      .then(setCatalog)
      .catch(() => undefined);
    // Mark the active lesson as completed in the local state too
    if (activeLesson) {
      setActiveLesson({ ...activeLesson, completed: true });
    }
  }, [activeLesson]);

  if (backendStatus !== 'online') {
    return (
      <div className="mx-auto w-full max-w-3xl px-6">
        <BackendStatusNotice status={backendStatus} />
      </div>
    );
  }

  const progress = catalog?.progress;

  return (
    <div
      ref={screenRef}
      className="flex flex-col min-h-0 overflow-hidden"
      style={{ height: screenHeight }}
    >
      {/* Top bar */}
      <div className="shrink-0 border-b border-border px-6 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <GraduationCap size={18} className="text-accent" />
          <span className="text-sm font-semibold text-ink">{t('learn.title')}</span>
        </div>
        {progress && (
          <div className="flex items-center gap-3 ml-4 flex-1 max-w-xs">
            <ProgressBar done={progress.completed} total={progress.total} />
            <span className="text-xs text-muted shrink-0">
              {t('learn.percentComplete', { percent: pct(progress.completed, progress.total) })}
            </span>
          </div>
        )}
        {readiness ? (
          <div className="hidden lg:flex items-center gap-3 text-[11px] text-muted">
            {(
              [
                ['knowledge', readiness.scores.knowledge],
                ['execution', readiness.scores.execution],
                ['risk', readiness.scores.risk],
                ['psych', readiness.scores.psychology],
                ['consistency', readiness.scores.consistency],
              ] as const
            ).map(([key, value]) => (
              <span
                key={key}
                title={t('learn.readiness.tooltip', { label: t(`learn.readiness.${key}`) })}
              >
                {t(`learn.readiness.${key}`)}{' '}
                <span
                  className={value >= 70 ? 'text-buy' : value >= 40 ? 'text-hold' : 'text-muted'}
                >
                  {value}
                </span>
              </span>
            ))}
          </div>
        ) : null}
        <span className="ml-auto text-xs text-muted/70">{t('learn.eduDisclaimer')}</span>
      </div>

      {/* Tier progression overview (full width) */}
      {catalog ? (
        <div className="shrink-0 border-b border-border px-6 py-3">
          <div className="flex items-baseline gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              {t('learn.tierMap.title')}
            </p>
            <p className="text-xs text-muted">{t('learn.tierMap.subtitle')}</p>
          </div>
          <div className="mt-2">
            <LearnTierMapDiagram
              tiers={catalog.levels.map((level) => ({
                id: level.id,
                title: level.title,
                completed: level.completed,
                total: level.total,
                unlocked: readiness?.levels.find((l) => l.id === level.id)?.unlocked !== false,
              }))}
            />
          </div>
        </div>
      ) : null}

      {/* Body */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-72 shrink-0 border-r border-border overflow-y-auto p-3 hidden md:block">
          <input
            type="search"
            placeholder={t('learn.sidebar.searchPlaceholder')}
            aria-label={t('learn.sidebar.searchLabel')}
            className="mb-3 w-full rounded-lg border border-border bg-background/50 px-3 py-2 text-sm text-ink outline-none placeholder:text-muted/70 focus:border-accent/60"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <div className="mb-3 flex gap-2">
            <button
              type="button"
              onClick={() => setLibraryView(libraryView === 'glossary' ? null : 'glossary')}
              className={clsx(
                'flex-1 rounded-lg border px-2 py-1.5 text-xs transition-colors',
                libraryView === 'glossary'
                  ? 'border-accent/60 bg-accent/15 text-accent'
                  : 'border-border text-muted hover:border-white/20',
              )}
            >
              {t('learn.sidebar.glossary')}
            </button>
            <button
              type="button"
              onClick={() => setLibraryView(libraryView === 'reference' ? null : 'reference')}
              className={clsx(
                'flex-1 rounded-lg border px-2 py-1.5 text-xs transition-colors',
                libraryView === 'reference'
                  ? 'border-accent/60 bg-accent/15 text-accent'
                  : 'border-border text-muted hover:border-white/20',
              )}
            >
              {t('learn.sidebar.reference')}
            </button>
            <button
              type="button"
              onClick={() => setLibraryView(libraryView === 'practice' ? null : 'practice')}
              className={clsx(
                'flex-1 rounded-lg border px-2 py-1.5 text-xs transition-colors',
                libraryView === 'practice'
                  ? 'border-accent/60 bg-accent/15 text-accent'
                  : 'border-border text-muted hover:border-white/20',
              )}
            >
              {t('learn.sidebar.practice')}
            </button>
            <button
              type="button"
              onClick={() => setLibraryView(libraryView === 'progress' ? null : 'progress')}
              className={clsx(
                'flex-1 rounded-lg border px-2 py-1.5 text-xs transition-colors',
                libraryView === 'progress'
                  ? 'border-accent/60 bg-accent/15 text-accent'
                  : 'border-border text-muted hover:border-white/20',
              )}
            >
              {t('learn.sidebar.progress')}
            </button>
          </div>
          {searchResults ? (
            <div className="space-y-0.5">
              {searchResults.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted">{t('learn.sidebar.noMatch')}</p>
              ) : null}
              {searchResults.map(({ lesson: result, trackTitle, level }) => (
                <button
                  key={result.id}
                  onClick={() => handleSelectLesson(result)}
                  className={clsx(
                    'w-full rounded-md px-3 py-2 text-left transition-colors',
                    activeLessonId === result.id
                      ? 'bg-accent/20 text-accent'
                      : 'hover:bg-white/5 text-muted hover:text-ink',
                  )}
                >
                  <span className="block text-xs font-medium truncate">{result.title}</span>
                  <span className="block text-[10px] text-muted/70">
                    {level} · {trackTitle}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
          <div className={searchResults ? 'hidden' : undefined}>
            {!catalog && (
              <div className="space-y-3 p-2">
                {[1, 2, 3, 4].map((n) => (
                  <div key={n} className="h-12 rounded-lg bg-white/[0.06] animate-pulse" />
                ))}
              </div>
            )}
            {catalog?.levels.map((level, i) => (
              <LevelSection
                key={level.id}
                level={level}
                activeLessonId={activeLessonId}
                onSelectLesson={handleSelectLesson}
                onTakeAssessment={(lvl) => setAssessmentLevel(lvl)}
                locked={readiness?.levels.find((l) => l.id === level.id)?.unlocked === false}
                lockReasons={readiness?.levels
                  .find((l) => l.id === level.id)
                  ?.requirements.filter((r) => !r.met)
                  .map((r) => r.label)}
                defaultOpen={
                  i === 0 ||
                  level.tracks.some((track) =>
                    track.lessons.some((lesson) => lesson.id === activeLessonId),
                  )
                }
              />
            ))}
          </div>
        </aside>

        {/* Content */}
        <main ref={mainRef} className="flex-1 overflow-y-auto p-6">
          {assessmentLevel ? (
            <AssessmentView
              level={assessmentLevel}
              onClose={() => setAssessmentLevel(null)}
              onGraded={() => {
                backendClient
                  .getLearnReadiness()
                  .then(setReadiness)
                  .catch(() => undefined);
              }}
            />
          ) : libraryView === 'glossary' ? (
            <GlossaryView
              onOpenLesson={(lessonId) => {
                setLibraryView(null);
                setActiveLessonId(lessonId);
              }}
            />
          ) : libraryView === 'reference' ? (
            <ReferenceView />
          ) : libraryView === 'practice' ? (
            <PracticeView />
          ) : libraryView === 'progress' ? (
            <ProgressView />
          ) : (
            <>
              {!catalog && !error ? (
                <div className="max-w-3xl space-y-3" aria-busy="true">
                  <p className="text-sm text-muted">{t('learn.loadingAcademy')}</p>
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="h-24 rounded-xl bg-white/5 animate-pulse" />
                  ))}
                </div>
              ) : null}
              {tradeReview && tradeReview.summary.trades > 0 ? (
                <div className="mb-4 rounded-xl border border-border bg-white/[0.03] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                    {t('learn.review.title')}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-4 text-sm">
                    <span className="text-ink">
                      {t('learn.review.avgScore')}{' '}
                      <span
                        className={
                          tradeReview.summary.average_process_score >=
                          tradeReview.summary.process_good_bar
                            ? 'text-buy font-semibold'
                            : 'text-hold font-semibold'
                        }
                      >
                        {tradeReview.summary.average_process_score}
                      </span>
                      {t('learn.review.over', { count: tradeReview.summary.trades })}
                    </span>
                    {tradeReview.summary.dangerous_success_count > 0 ? (
                      <span className="text-red-300 font-medium">
                        {tradeReview.summary.dangerous_success_count > 1
                          ? t('learn.review.dangerousMany', {
                              count: tradeReview.summary.dangerous_success_count,
                            })
                          : t('learn.review.dangerousOne', {
                              count: tradeReview.summary.dangerous_success_count,
                            })}
                      </span>
                    ) : null}
                  </div>
                  {(() => {
                    const flagged = tradeReview.items
                      .filter((item) => item.process_notes.length > 0)
                      .slice(0, 3);
                    return flagged.length ? (
                      <ul className="mt-2 space-y-1 text-xs text-muted">
                        {flagged.map((item) => (
                          <li key={item.id}>
                            {item.symbol} {item.side} ({item.process_score}/100):{' '}
                            {item.process_notes[0]}
                          </li>
                        ))}
                      </ul>
                    ) : null;
                  })()}
                </div>
              ) : null}
              {moments.length > 0 && (
                <div className="mb-4 rounded-xl border border-accent/30 bg-accent/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                    {t('learn.moments.title')}
                  </p>
                  <div className="mt-3 space-y-2">
                    {moments.slice(0, 3).map((moment) => (
                      <button
                        key={moment.id}
                        type="button"
                        className="block w-full rounded-lg border border-border bg-white/[0.03] p-3 text-left text-sm text-ink hover:border-accent/60"
                        onClick={() => setActiveLessonId(moment.lesson_id)}
                      >
                        {moment.message}
                        <span className="mt-1 block text-xs text-accent">
                          {t('learn.moments.openLesson')}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {error && (
                <div className="rounded-xl border border-red-500/30 bg-red-600/10 p-4 text-sm text-red-300 mb-4">
                  {error}
                </div>
              )}

              {lessonLoading && (
                <div className="space-y-4">
                  {[200, 120, 80, 240].map((h, i) => (
                    <div
                      key={i}
                      className="rounded-xl bg-white/5 animate-pulse"
                      style={{ height: h }}
                    />
                  ))}
                </div>
              )}

              {!lessonLoading && !activeLesson && !error && (
                <EmptyLearnState
                  message={catalog ? t('learn.selectLesson') : t('learn.loadingCatalog')}
                />
              )}

              {!lessonLoading && activeLesson && (
                <LessonViewer
                  lesson={activeLesson}
                  onNavigate={onNavigate}
                  onLessonCompleted={handleLessonCompleted}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
