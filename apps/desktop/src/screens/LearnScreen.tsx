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

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExerciseResult, LearnCatalogResponse, LessonRecord, LessonStub, LessonTier } from '@quantglass/contracts';
import { backendClient } from '../lib/backend';
import type { BackendStatus } from '../types';
import { BookOpen, ChevronRight, CheckCircle2, Circle, GraduationCap, Lightbulb, SquareArrowOutUpRight, RotateCcw, AlertCircle } from 'lucide-react';
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
  novice:       { badge: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30', ring: 'ring-emerald-500/50', dot: 'bg-emerald-400' },
  intermediate: { badge: 'bg-sky-500/20 text-sky-300 border border-sky-500/30',           ring: 'ring-sky-500/50',     dot: 'bg-sky-400' },
  advanced:     { badge: 'bg-violet-500/20 text-violet-300 border border-violet-500/30',  ring: 'ring-violet-500/50',  dot: 'bg-violet-400' },
  expert:       { badge: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',     ring: 'ring-amber-500/50',   dot: 'bg-amber-400' },
};

const TIER_LABELS: Record<LessonTier, string> = {
  novice: 'Novice',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  expert: 'Expert',
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
    .replace(/`(.+?)`/g, '<code class="font-mono text-amber-300 bg-zinc-800 px-1 rounded text-sm">$1</code>')
    .replace(/^#{1,3} (.+)$/gm, '<h3 class="text-base font-semibold text-zinc-100 mt-4 mb-1">$1</h3>')
    .replace(/^\| (.+) \|$/gm, (line) => {
      const cells = line.split('|').map(c => c.trim()).filter(Boolean);
      const isHeader = false;
      return '<div class="flex gap-4 border-b border-zinc-700/60 py-1">' +
        cells.map(c => `<span class="flex-1 text-sm text-zinc-300">${c}</span>`).join('') +
        '</div>';
    })
    .replace(/^\|---.*$/gm, '')
    .replace(/^- (.+)$/gm, '<li class="ml-4 text-zinc-300 text-sm list-disc">$1</li>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TierBadge({ tier }: { tier: LessonTier }) {
  const c = TIER_COLORS[tier];
  return (
    <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full', c.badge)}>
      {TIER_LABELS[tier]}
    </span>
  );
}

function ProgressBar({ done, total, tier }: { done: number; total: number; tier?: LessonTier }) {
  const p = pct(done, total);
  const barColor = tier ? {
    novice: 'bg-emerald-500',
    intermediate: 'bg-sky-500',
    advanced: 'bg-violet-500',
    expert: 'bg-amber-500',
  }[tier] : 'bg-indigo-500';
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-1.5 rounded-full bg-zinc-700 min-w-0">
        <div
          className={clsx('h-full rounded-full transition-all duration-500', barColor)}
          style={{ width: `${p}%` }}
        />
      </div>
      <span className="text-xs text-zinc-500 shrink-0">{done}/{total}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar module item
// ---------------------------------------------------------------------------

interface ModuleSectionProps {
  module: LearnCatalogResponse['modules'][0];
  activeLessonId: string | null;
  onSelectLesson: (lesson: LessonStub) => void;
  defaultOpen: boolean;
}

function ModuleSection({ module, activeLessonId, onSelectLesson, defaultOpen }: ModuleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const c = TIER_COLORS[module.tier];
  return (
    <div className="mb-2">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-zinc-800/70 transition-colors group text-left"
        onClick={() => setOpen(!open)}
      >
        <ChevronRight
          size={14}
          className={clsx('shrink-0 text-zinc-500 transition-transform duration-200', open && 'rotate-90')}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-medium text-zinc-200 truncate">{module.title}</span>
            <TierBadge tier={module.tier} />
          </div>
          <ProgressBar done={module.completed} total={module.total} tier={module.tier} />
        </div>
      </button>

      {open && (
        <div className="ml-5 mt-0.5 space-y-0.5">
          {module.lessons.map((lesson) => (
            <button
              key={lesson.id}
              onClick={() => onSelectLesson(lesson)}
              className={clsx(
                'w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-left transition-colors',
                activeLessonId === lesson.id
                  ? 'bg-indigo-600/30 text-indigo-200'
                  : 'hover:bg-zinc-800/60 text-zinc-400 hover:text-zinc-200',
              )}
            >
              {lesson.completed ? (
                <CheckCircle2 size={14} className={clsx('shrink-0', c.dot.replace('bg-', 'text-'))} />
              ) : (
                <Circle size={14} className="shrink-0 text-zinc-600" />
              )}
              <span className="text-xs truncate">{lesson.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exercise renderer
// ---------------------------------------------------------------------------

// Wrapped version that captures the answer before calling parent:
interface ExerciseControllerProps {
  lesson: LessonRecord;
  onComplete: () => void;
}

function ExerciseController({ lesson, onComplete }: ExerciseControllerProps) {
  const ex = lesson.exercise;
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [numericValue, setNumericValue] = useState('');
  const [result, setResult] = useState<ExerciseResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setSelectedIndex(null);
    setNumericValue('');
    setResult(null);
  }, [lesson.id]);

  async function handleSubmit() {
    let answer = '';
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
      setResult({ correct: false, explanation: 'Could not reach the backend. Try again.', score: 0 });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-700/60 bg-zinc-800/40 p-5 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Lightbulb size={15} className="text-amber-400 shrink-0" />
        <span className="text-sm font-semibold text-zinc-100">Exercise</span>
      </div>
      <p className="text-sm text-zinc-300 leading-relaxed">{ex.question}</p>

      {'hint' in ex && (ex as { hint?: string }).hint && (
        <p className="text-xs text-zinc-500 italic">{(ex as { hint?: string }).hint}</p>
      )}

      {ex.type === 'multiple_choice' && 'options' in ex && (
        <div className="space-y-2">
          {((ex as { options?: string[] }).options ?? []).map((opt: string, i: number) => (
            <button
              key={i}
              disabled={result !== null || loading}
              onClick={() => { setSelectedIndex(i); setResult(null); }}
              className={clsx(
                'w-full text-left px-4 py-3 rounded-lg text-sm border transition-colors',
                result === null && selectedIndex === i
                  ? 'border-indigo-500 bg-indigo-600/20 text-indigo-100'
                  : result !== null && result.correct && selectedIndex === i
                    ? 'border-emerald-500 bg-emerald-600/20 text-emerald-100'
                  : result !== null && !result.correct && selectedIndex === i
                    ? 'border-red-500 bg-red-600/20 text-red-100'
                    : 'border-zinc-700 bg-zinc-800/60 text-zinc-300 hover:border-zinc-600 hover:text-zinc-100',
              )}
            >
              <span className="font-medium mr-2 text-zinc-500">{String.fromCharCode(65 + i)}.</span>
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
          onKeyDown={(e) => { if (e.key === 'Enter') void handleSubmit(); }}
          disabled={result !== null || loading}
          placeholder="Enter your answer…"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
        />
      )}

      {result === null && (
        <button
          disabled={loading || (ex.type === 'multiple_choice' ? selectedIndex === null : !numericValue.trim())}
          onClick={() => void handleSubmit()}
          className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          {loading ? 'Checking…' : 'Check Answer'}
        </button>
      )}

      {result !== null && (
        <>
          <div className={clsx(
            'rounded-lg p-4 border text-sm',
            result.correct
              ? 'border-emerald-500/40 bg-emerald-600/10 text-emerald-200'
              : 'border-red-500/40 bg-red-600/10 text-red-200',
          )}>
            <div className="flex items-center gap-2 font-semibold mb-2">
              {result.correct ? (
                <CheckCircle2 size={15} className="text-emerald-400" />
              ) : (
                <AlertCircle size={15} className="text-red-400" />
              )}
              {result.correct ? 'Correct!' : "Not quite — here's why:"}
            </div>
            <p className="text-zinc-300 leading-relaxed">{result.explanation}</p>
          </div>
          {!result.correct && (
            <button
              onClick={() => { setResult(null); setSelectedIndex(null); setNumericValue(''); }}
              className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <RotateCcw size={13} />
              Try again
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

function LessonViewer({ lesson, onNavigate, onLessonCompleted }: LessonViewerProps) {
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
        <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center ring-1 shrink-0', c.ring, 'bg-zinc-800')}>
          <BookOpen size={18} className={c.dot.replace('bg-', 'text-')} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <TierBadge tier={lesson.tier} />
            <span className="text-xs text-zinc-500">Lesson {lesson.order}</span>
            {lesson.completed && (
              <span className="flex items-center gap-1 text-xs text-emerald-400">
                <CheckCircle2 size={12} />
                Completed
              </span>
            )}
          </div>
          <h1 className="text-xl font-bold text-zinc-100">{lesson.title}</h1>
          <p className="text-sm text-zinc-400 mt-0.5">{lesson.summary}</p>
        </div>
      </div>

      {/* Concept */}
      <div ref={conceptRef} className="rounded-xl border border-zinc-700/40 bg-zinc-800/30 p-5">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Concept</h2>
        <div
          className="text-sm text-zinc-300 leading-relaxed space-y-1 prose-zinc"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(lesson.concept) }}
        />
      </div>

      {/* Key Terms */}
      {lesson.key_terms?.length > 0 && (
        <div className="rounded-xl border border-zinc-700/40 bg-zinc-800/30 p-5">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Key Terms</h2>
          <dl className="space-y-2">
            {lesson.key_terms.map((kt) => (
              <div key={kt.term} className="flex gap-3">
                <dt className="text-sm font-medium text-zinc-100 shrink-0 w-40 truncate">{kt.term}</dt>
                <dd className="text-sm text-zinc-400 leading-relaxed">{kt.definition}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Exercise */}
      <ExerciseController
        lesson={lesson}
        onComplete={onLessonCompleted}
      />

      {/* Try It Live */}
      {lesson.live_apply && (
        <div className="rounded-xl border border-indigo-500/30 bg-indigo-600/10 p-5">
          <h2 className="text-sm font-semibold text-indigo-300 uppercase tracking-wider mb-2">Try It Live</h2>
          <p className="text-sm text-zinc-300 leading-relaxed mb-3">{lesson.live_apply.cta}</p>
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
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <SquareArrowOutUpRight size={14} />
              Open {lesson.live_apply.screen.charAt(0).toUpperCase() + lesson.live_apply.screen.slice(1)}
            </button>
          )}
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-xs text-zinc-600 text-center pt-2">
        Educational use only — not financial advice.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty / loading states
// ---------------------------------------------------------------------------

function EmptyLearnState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 min-h-[300px] gap-4 text-zinc-500">
      <GraduationCap size={40} className="opacity-30" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LearnScreen (main export)
// ---------------------------------------------------------------------------

export function LearnScreen({ backendStatus, onNavigate }: LearnScreenProps) {
  const [catalog, setCatalog] = useState<LearnCatalogResponse | null>(null);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [activeLesson, setActiveLesson] = useState<LessonRecord | null>(null);
  const [lessonLoading, setLessonLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load catalog
  useEffect(() => {
    if (backendStatus !== 'online') return;
    backendClient.getLearnCatalog()
      .then(setCatalog)
      .catch(() => setError('Failed to load the learning catalog. Is the backend running?'));
  }, [backendStatus]);

  // Auto-select first incomplete lesson once catalog arrives
  useEffect(() => {
    if (!catalog || activeLessonId) return;
    for (const mod of catalog.modules) {
      const first = mod.lessons.find((l) => !l.completed) ?? mod.lessons[0];
      if (first) {
        setActiveLessonId(first.id);
        break;
      }
    }
  }, [catalog]);

  // Load lesson detail when activeLessonId changes
  useEffect(() => {
    if (!activeLessonId || backendStatus !== 'online') return;
    setLessonLoading(true);
    setActiveLesson(null);
    backendClient.getLearnLesson(activeLessonId)
      .then(setActiveLesson)
      .catch(() => setError(`Failed to load lesson '${activeLessonId}'.`))
      .finally(() => setLessonLoading(false));
  }, [activeLessonId, backendStatus]);

  const handleSelectLesson = useCallback((lesson: LessonStub) => {
    setActiveLessonId(lesson.id);
    setError(null);
  }, []);

  const handleLessonCompleted = useCallback(() => {
    // Refresh catalog to pick up new completion state
    backendClient.getLearnCatalog()
      .then(setCatalog)
      .catch(() => undefined);
    // Mark the active lesson as completed in the local state too
    if (activeLesson) {
      setActiveLesson({ ...activeLesson, completed: true });
    }
  }, [activeLesson]);

  if (backendStatus !== 'online') {
    return (
      <div className="flex-1 flex flex-col">
        <EmptyLearnState message="Waiting for backend to come online…" />
      </div>
    );
  }

  const progress = catalog?.progress;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

      {/* Top bar */}
      <div className="shrink-0 border-b border-zinc-800 px-6 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <GraduationCap size={18} className="text-indigo-400" />
          <span className="text-sm font-semibold text-zinc-100">Learn</span>
        </div>
        {progress && (
          <div className="flex items-center gap-3 ml-4 flex-1 max-w-xs">
            <ProgressBar done={progress.completed} total={progress.total} />
            <span className="text-xs text-zinc-500 shrink-0">
              {pct(progress.completed, progress.total)}% complete
            </span>
          </div>
        )}
        <span className="ml-auto text-xs text-zinc-600">Educational use only — not financial advice.</span>
      </div>

      {/* Body */}
      <div className="flex-1 flex min-h-0 overflow-hidden">

        {/* Sidebar */}
        <aside className="w-72 shrink-0 border-r border-zinc-800 overflow-y-auto p-3 hidden md:block">
          {!catalog && (
            <div className="space-y-3 p-2">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="h-12 rounded-lg bg-zinc-800 animate-pulse" />
              ))}
            </div>
          )}
          {catalog?.modules.map((mod, i) => (
            <ModuleSection
              key={mod.id}
              module={mod}
              activeLessonId={activeLessonId}
              onSelectLesson={handleSelectLesson}
              defaultOpen={i === 0 || mod.lessons.some((l) => l.id === activeLessonId)}
            />
          ))}
        </aside>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-600/10 p-4 text-sm text-red-300 mb-4">
              {error}
            </div>
          )}

          {lessonLoading && (
            <div className="space-y-4">
              {[200, 120, 80, 240].map((h, i) => (
                <div key={i} className="rounded-xl bg-zinc-800/60 animate-pulse" style={{ height: h }} />
              ))}
            </div>
          )}

          {!lessonLoading && !activeLesson && !error && (
            <EmptyLearnState message={catalog ? 'Select a lesson to begin.' : 'Loading catalog…'} />
          )}

          {!lessonLoading && activeLesson && (
            <LessonViewer
              lesson={activeLesson}
              onNavigate={onNavigate}
              onLessonCompleted={handleLessonCompleted}
            />
          )}
        </main>
      </div>
    </div>
  );
}
