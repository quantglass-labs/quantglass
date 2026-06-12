// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Journal (MSN-4): the capture surface. Every executed paper trade with its
 * plan, process score, and resolved outcome — plus the trader's own
 * reflection note and mistake tags, which feed the Review coach's detectors.
 */

import { useEffect, useState } from 'react';

import { NotebookPen } from 'lucide-react';

import { BackendStatusNotice } from '../components/backendGate';
import { backendClient } from '../lib/backend';
import type { BackendStatus, JournalItem } from '../types';

const TAG_LABELS: Record<string, string> = {
  chased_entry: 'Chased entry',
  moved_stop: 'Moved stop',
  revenge_trade: 'Revenge trade',
  oversized: 'Oversized',
  no_plan: 'No plan',
  fomo_entry: 'FOMO entry',
  exited_early: 'Exited early',
  held_loser: 'Held loser',
  overtraded: 'Overtraded',
};

const CLASSIFICATION_LABELS: Record<string, { label: string; tone: string }> = {
  earned_win: { label: 'Earned win', tone: 'text-emerald-300 border-emerald-500/40' },
  well_played_loss: { label: 'Well-played loss', tone: 'text-sky-300 border-sky-500/40' },
  honest_tuition: { label: 'Honest tuition', tone: 'text-zinc-300 border-zinc-600' },
  dangerous_success: { label: 'Dangerous success', tone: 'text-amber-300 border-amber-500/40' },
};

function TradeCard({
  item,
  mistakeTags,
  onSave,
}: {
  item: JournalItem;
  mistakeTags: string[];
  onSave: (intentId: string, note: string, tags: string[]) => Promise<void>;
}) {
  const [note, setNote] = useState(item.journal_note);
  const [tags, setTags] = useState<string[]>(item.tags);
  const [saving, setSaving] = useState(false);
  const dirty = note !== item.journal_note || tags.join() !== item.tags.join();
  const badge = item.classification ? CLASSIFICATION_LABELS[item.classification] : null;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-zinc-100">{item.symbol}</span>
        <span className="text-xs uppercase tracking-wider text-zinc-500">{item.side}</span>
        <span className="text-xs text-zinc-600">{item.submittedAt?.slice(0, 10)}</span>
        <span className="ml-auto text-sm text-zinc-400">
          Process{' '}
          <span className={item.process_score >= 70 ? 'text-emerald-300' : 'text-amber-300'}>
            {item.process_score}
          </span>
        </span>
        {item.outcome_r !== null ? (
          <span className={`text-sm ${item.outcome_r > 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
            {item.outcome_r > 0 ? '+' : ''}
            {item.outcome_r.toFixed(2)}R
          </span>
        ) : null}
        {badge ? (
          <span className={`rounded-full border px-2 py-0.5 text-[10px] ${badge.tone}`}>
            {badge.label}
          </span>
        ) : null}
      </div>
      {item.planReason ? (
        <p className="mt-2 text-sm text-zinc-400">
          <span className="text-zinc-600">Thesis:</span> {item.planReason}
        </p>
      ) : null}
      {item.process_notes.length ? (
        <ul className="mt-2 space-y-0.5 text-xs text-amber-300/80">
          {item.process_notes.map((processNote) => (
            <li key={processNote}>• {processNote}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {mistakeTags.map((tag) => {
          const active = tags.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() =>
                setTags(active ? tags.filter((existing) => existing !== tag) : [...tags, tag])
              }
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                active
                  ? 'border-indigo-400/60 bg-indigo-600/20 text-indigo-200'
                  : 'border-zinc-700 text-zinc-500 hover:border-zinc-500'
              }`}
            >
              {TAG_LABELS[tag] ?? tag}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-start gap-2">
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="What actually happened? What would you repeat — or never do again?"
          rows={2}
          className="flex-1 resize-y rounded-lg border border-zinc-700 bg-zinc-950/60 p-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
        />
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={async () => {
            setSaving(true);
            await onSave(item.id, note, tags);
            setSaving(false);
          }}
          className="rounded-lg border border-indigo-500/50 px-3 py-2 text-xs font-semibold text-indigo-300 transition-colors hover:bg-indigo-600/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

export function JournalScreen({ backendStatus }: { backendStatus: BackendStatus }) {
  const [items, setItems] = useState<JournalItem[] | null>(null);
  const [mistakeTags, setMistakeTags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (backendStatus !== 'online') return;
    backendClient
      .getJournal()
      .then((response) => {
        setItems(response.items);
        setMistakeTags(response.mistake_tags);
      })
      .catch(() => setError('Could not load the journal. Is the backend running?'));
  }, [backendStatus]);

  const handleSave = async (intentId: string, note: string, tags: string[]) => {
    await backendClient.annotateTrade(intentId, { note, tags });
    setItems(
      (current) =>
        current?.map((item) =>
          item.id === intentId ? { ...item, journal_note: note, tags } : item,
        ) ?? null,
    );
  };

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center gap-2">
        <NotebookPen size={20} className="text-indigo-400" />
        <h1 className="text-lg font-semibold text-zinc-100">Journal</h1>
        <span className="ml-auto text-xs text-zinc-600">
          The plan you wrote, the trade you took, and what you make of it.
        </span>
      </div>

      <BackendStatusNotice status={backendStatus} />
      {error ? (
        <p className="mt-6 rounded-xl border border-amber-500/30 bg-amber-600/10 p-4 text-sm text-amber-300">
          {error}
        </p>
      ) : null}
      {!items && !error && backendStatus !== 'offline' ? (
        <div className="mt-6 space-y-3" aria-busy="true">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-40 animate-pulse rounded-xl bg-zinc-800/60" />
          ))}
        </div>
      ) : null}
      {items && items.length === 0 ? (
        <p className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-400">
          No executed paper trades yet. Place a trade with a full plan — stop, target, risk, and
          reason — and it will appear here for review.
        </p>
      ) : null}

      <div className="mt-6 space-y-4">
        {items?.map((item) => (
          <TradeCard key={item.id} item={item} mistakeTags={mistakeTags} onSave={handleSave} />
        ))}
      </div>
      <p className="mt-6 text-xs text-zinc-600">
        Tags feed the Review coach — honest tagging is what makes the recommendations yours.
      </p>
    </div>
  );
}
