// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Journal (MSN-4): the capture surface. Every executed paper trade with its
 * plan, process score, and resolved outcome — plus the trader's own
 * reflection note and mistake tags, which feed the Review coach's detectors.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { NotebookPen } from 'lucide-react';

import { AiInsight } from '../components/aiInsight';
import { AiMarkdown } from '../components/AiMarkdown';
import { BackendStatusNotice } from '../components/backendGate';
import { CountUp, FadeIn } from '../components/motion';
import { MetricTile } from '../components/surface';
import { backendClient } from '../lib/backend';
import type { BackendStatus, JournalItem, PaperTradeIntentRecord } from '../types';

// Maps a mistake-tag id to its `journal.tags.<key>` translation subkey.
const TAG_KEYS: Record<string, string> = {
  chased_entry: 'chasedEntry',
  moved_stop: 'movedStop',
  revenge_trade: 'revengeTrade',
  oversized: 'oversized',
  no_plan: 'noPlan',
  fomo_entry: 'fomoEntry',
  exited_early: 'exitedEarly',
  held_loser: 'heldLoser',
  overtraded: 'overtraded',
};

// Tone + `journal.classification.<key>` subkey for each trade classification.
const CLASSIFICATION_META: Record<string, { key: string; tone: string }> = {
  earned_win: { key: 'earnedWin', tone: 'text-emerald-300 border-emerald-500/40' },
  well_played_loss: { key: 'wellPlayedLoss', tone: 'text-sky-300 border-sky-500/40' },
  honest_tuition: { key: 'honestTuition', tone: 'text-zinc-300 border-zinc-600' },
  dangerous_success: { key: 'dangerousSuccess', tone: 'text-amber-300 border-amber-500/40' },
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
  const { t } = useTranslation();
  const [note, setNote] = useState(item.journal_note);
  const [tags, setTags] = useState<string[]>(item.tags);
  const [saving, setSaving] = useState(false);
  const dirty = note !== item.journal_note || tags.join() !== item.tags.join();
  const badge = item.classification ? CLASSIFICATION_META[item.classification] : null;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-zinc-100">{item.symbol}</span>
        <span className="text-xs uppercase tracking-wider text-zinc-500">{item.side}</span>
        <span className="text-xs text-zinc-600">{item.submittedAt?.slice(0, 10)}</span>
        <span className="ml-auto text-sm text-zinc-400">
          {t('journal.process')}{' '}
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
            {t(`journal.classification.${badge.key}`)}
          </span>
        ) : null}
      </div>
      {item.planReason ? (
        <p className="mt-2 text-sm text-zinc-400">
          <span className="text-zinc-600">{t('journal.thesis')}</span> {item.planReason}
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
              {TAG_KEYS[tag] ? t(`journal.tags.${TAG_KEYS[tag]}`) : tag}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-start gap-2">
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={t('journal.notePlaceholder')}
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
          {saving ? t('common.saving') : t('common.save')}
        </button>
      </div>
      <TradePostmortem item={item} />
    </div>
  );
}

function TradePostmortem({ item }: { item: JournalItem }) {
  const { t } = useTranslation();
  const [result, setResult] = useState<{ summary: string; source: string } | null>(null);
  const [loading, setLoading] = useState(false);
  if (!item.classification) return null;

  const ask = async () => {
    setLoading(true);
    try {
      setResult(
        await backendClient.getPostmortem('trade', {
          symbol: item.symbol,
          side: item.side,
          plan_reason: item.planReason,
          process_score: item.process_score,
          process_notes: item.process_notes,
          outcome_r: item.outcome_r,
          classification: item.classification,
        }),
      );
    } catch {
      setResult({ summary: t('journal.postmortem.unavailable'), source: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-3">
      {!result ? (
        <button
          type="button"
          disabled={loading}
          onClick={() => void ask()}
          className="rounded-full border border-indigo-500/30 bg-indigo-600/10 px-3 py-1.5 text-xs text-indigo-300 transition-colors hover:bg-indigo-600/20 disabled:opacity-50"
        >
          {loading ? t('journal.postmortem.reviewing') : t('journal.postmortem.button')}
        </button>
      ) : (
        <div className="rounded-lg border border-indigo-500/25 bg-indigo-600/10 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-300">
            {t('journal.postmortem.label')}{' '}
            <span className="ml-1 rounded-full border border-zinc-700 px-2 py-0.5 normal-case text-zinc-500">
              {result.source}
            </span>
          </p>
          <AiMarkdown className="mt-1.5 text-sm leading-relaxed text-zinc-200">
            {result.summary}
          </AiMarkdown>
        </div>
      )}
    </div>
  );
}

export function JournalScreen({ backendStatus }: { backendStatus: BackendStatus }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<JournalItem[] | null>(null);
  const [mistakeTags, setMistakeTags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendingOrders, setPendingOrders] = useState<PaperTradeIntentRecord[]>([]);

  const loadPending = () => {
    backendClient
      .getPaperTrades()
      .then((response) =>
        setPendingOrders(response.items.filter((item) => item.status === 'pending')),
      )
      .catch(() => setPendingOrders([]));
  };

  useEffect(() => {
    if (backendStatus !== 'online') return;
    backendClient
      .getJournal()
      .then((response) => {
        setItems(response.items);
        setMistakeTags(response.mistake_tags);
      })
      .catch(() => setError(t('journal.loadError')));
    loadPending();
  }, [backendStatus, t]);

  const summary = useMemo(() => {
    if (!items?.length) return null;
    const resolved = items.filter((item) => item.outcome_r !== null);
    const netR = resolved.reduce((sum, item) => sum + (item.outcome_r ?? 0), 0);
    const avgProcess = items.reduce((sum, item) => sum + item.process_score, 0) / items.length;
    const tagged = items.filter((item) => item.tags.length > 0).length;
    return { count: items.length, netR, avgProcess, tagged };
  }, [items]);

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
        <h1 className="text-lg font-semibold text-zinc-100">{t('journal.title')}</h1>
        <span className="ml-auto text-xs text-zinc-600">{t('journal.tagline')}</span>
      </div>

      <BackendStatusNotice status={backendStatus} />
      <AiInsight surface="journal" title={t('journal.aiTitle')} />

      {summary ? (
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <MetricTile
            label={t('journal.tiles.tradesLogged')}
            hero
            helper={t('journal.tiles.tradesLoggedHelper')}
          >
            <CountUp value={summary.count} format={(n) => String(Math.round(n))} />
          </MetricTile>
          <MetricTile
            label={t('journal.tiles.avgProcess')}
            toneClass={summary.avgProcess >= 70 ? 'text-buy' : 'text-watch'}
            helper={t('journal.tiles.avgProcessHelper')}
          >
            <CountUp value={summary.avgProcess} format={(n) => String(Math.round(n))} />
          </MetricTile>
          <MetricTile
            label={t('journal.tiles.netR')}
            toneClass={summary.netR >= 0 ? 'text-buy' : 'text-sell'}
            helper={t('journal.tiles.netRHelper')}
          >
            <CountUp value={summary.netR} format={(n) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}R`} />
          </MetricTile>
          <MetricTile
            label={t('journal.tiles.taggedForReview')}
            toneClass="text-watch"
            helper={t('journal.tiles.taggedForReviewHelper')}
          >
            <CountUp value={summary.tagged} format={(n) => String(Math.round(n))} />
          </MetricTile>
        </div>
      ) : null}

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
          {t('journal.empty')}
        </p>
      ) : null}

      {pendingOrders.length ? (
        <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            {t('journal.pendingOrders')}
          </p>
          <ul className="mt-2 space-y-2">
            {pendingOrders.map((order) => (
              <li key={order.id} className="flex items-center gap-3 text-sm">
                <span className="font-medium text-zinc-200">{order.symbol}</span>
                <span className="text-zinc-500">
                  {order.side} {order.quantity}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    void backendClient.cancelPaperTrade(order.id).then(loadPending);
                  }}
                  className="ml-auto rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-400 transition-colors hover:border-rose-500/50 hover:text-rose-300"
                >
                  {t('common.cancel')}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-6 space-y-4">
        {items?.map((item, index) => (
          <FadeIn key={item.id} delayMs={Math.min(index, 8) * 50}>
            <TradeCard item={item} mistakeTags={mistakeTags} onSave={handleSave} />
          </FadeIn>
        ))}
      </div>
      <p className="mt-6 text-xs text-zinc-600">{t('journal.footer')}</p>
    </div>
  );
}
