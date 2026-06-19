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
  earned_win: { key: 'earnedWin', tone: 'text-buy border-buy/40' },
  well_played_loss: { key: 'wellPlayedLoss', tone: 'text-watch border-watch/40' },
  honest_tuition: { key: 'honestTuition', tone: 'text-ink border-border' },
  dangerous_success: { key: 'dangerousSuccess', tone: 'text-hold border-hold/40' },
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
    <div className="rounded-xl border border-border bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-ink">{item.symbol}</span>
        <span className="text-xs uppercase tracking-wider text-muted">{item.side}</span>
        <span className="text-xs text-muted/70">{item.submittedAt?.slice(0, 10)}</span>
        <span className="ml-auto text-sm text-muted">
          {t('journal.process')}{' '}
          <span className={item.process_score >= 70 ? 'text-buy' : 'text-hold'}>
            {item.process_score}
          </span>
        </span>
        {item.outcome_r !== null ? (
          <span className={`text-sm ${item.outcome_r > 0 ? 'text-buy' : 'text-sell'}`}>
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
        <p className="mt-2 text-sm text-muted">
          <span className="text-muted/70">{t('journal.thesis')}</span> {item.planReason}
        </p>
      ) : null}
      {item.process_notes.length ? (
        <ul className="mt-2 space-y-0.5 text-xs text-hold/80">
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
                  ? 'border-accent/60 bg-accent/15 text-accent'
                  : 'border-border text-muted hover:border-white/20'
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
          className="flex-1 resize-y rounded-lg border border-border bg-background/50 p-2.5 text-sm text-ink placeholder:text-muted/70 focus:border-accent focus:outline-none"
        />
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={async () => {
            setSaving(true);
            await onSave(item.id, note, tags);
            setSaving(false);
          }}
          className="rounded-lg border border-accent/50 px-3 py-2 text-xs font-semibold text-accent transition-colors hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-40"
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
          className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs text-accent transition-colors hover:bg-accent/15 disabled:opacity-50"
        >
          {loading ? t('journal.postmortem.reviewing') : t('journal.postmortem.button')}
        </button>
      ) : (
        <div className="rounded-lg border border-accent/25 bg-accent/10 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-accent">
            {t('journal.postmortem.label')}{' '}
            <span className="ml-1 rounded-full border border-border px-2 py-0.5 normal-case text-muted">
              {result.source}
            </span>
          </p>
          <AiMarkdown className="mt-1.5 text-sm leading-relaxed text-ink">
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
        <NotebookPen size={20} className="text-accent" />
        <h1 className="text-lg font-semibold text-ink">{t('journal.title')}</h1>
        <span className="ml-auto text-xs text-muted/70">{t('journal.tagline')}</span>
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
        <p className="mt-6 rounded-xl border border-hold/30 bg-hold/10 p-4 text-sm text-hold">
          {error}
        </p>
      ) : null}
      {!items && !error && backendStatus !== 'offline' ? (
        <div className="mt-6 space-y-3" aria-busy="true">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-40 animate-pulse rounded-xl bg-white/5" />
          ))}
        </div>
      ) : null}
      {items && items.length === 0 ? (
        <p className="mt-6 rounded-xl border border-border bg-white/[0.03] p-4 text-sm text-muted">
          {t('journal.empty')}
        </p>
      ) : null}

      {pendingOrders.length ? (
        <div className="mt-6 rounded-xl border border-border bg-white/[0.03] p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            {t('journal.pendingOrders')}
          </p>
          <ul className="mt-2 space-y-2">
            {pendingOrders.map((order) => (
              <li key={order.id} className="flex items-center gap-3 text-sm">
                <span className="font-medium text-ink">{order.symbol}</span>
                <span className="text-muted">
                  {order.side} {order.quantity}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    void backendClient.cancelPaperTrade(order.id).then(loadPending);
                  }}
                  className="ml-auto rounded-full border border-border px-3 py-1 text-xs text-muted transition-colors hover:border-sell/50 hover:text-sell"
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
      <p className="mt-6 text-xs text-muted/70">{t('journal.footer')}</p>
    </div>
  );
}
