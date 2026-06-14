// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * QuantGlass Copilot (AI2-5): a chat drawer over the engine's read-only
 * tools, reachable from every screen. Answers are grounded - the backend
 * picks tools, executes them deterministically, and narrates only their
 * results; the source chip says whether a model or the template spoke.
 */

import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, X } from 'lucide-react';
import { backendClient } from '../lib/backend';
import type { BackendStatus } from '../types';
import { AiMarkdown } from './AiMarkdown';

type CopilotMessage = {
  role: 'user' | 'assistant';
  text: string;
  source?: string;
  tools?: string[];
};

const STARTERS = [
  'What are the strongest signals right now?',
  'How is my paper account doing?',
  'What patterns show up in my closed trades?',
];

export function Copilot({ backendStatus }: { backendStatus: BackendStatus }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, busy]);

  const ask = async (question: string) => {
    const cleaned = question.trim();
    if (!cleaned || busy) return;
    setDraft('');
    setMessages((current) => [...current, { role: 'user', text: cleaned }]);
    setBusy(true);
    try {
      const result = await backendClient.askCopilot(cleaned);
      setMessages((current) => [
        ...current,
        result.error
          ? { role: 'assistant', text: result.error, source: 'error' }
          : {
              role: 'assistant',
              text: result.answer,
              source: result.source,
              tools: result.toolsUsed,
            },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          text: 'The Copilot request failed - the model may have timed out. The rest of the app keeps working; try again or check Settings → AI.',
          source: 'error',
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  if (backendStatus !== 'online') return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        title="QuantGlass Copilot - ask about your own signals, account, and trades"
        className="fixed bottom-20 right-5 z-50 grid size-12 place-items-center rounded-full border border-accent/40 bg-accentStrong/30 text-accent shadow-lg backdrop-blur-xl transition hover:bg-accentStrong/50 lg:bottom-6"
      >
        {open ? <X className="size-5" /> : <Sparkles className="size-5" />}
      </button>

      {open ? (
        <div className="fixed bottom-36 right-5 z-50 flex max-h-[70vh] w-[min(26rem,calc(100vw-2.5rem))] flex-col rounded-3xl border border-border bg-surface/95 shadow-2xl backdrop-blur-xl lg:bottom-22">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Sparkles className="size-4 text-accent" />
            <p className="text-sm font-semibold text-ink">QuantGlass Copilot</p>
            <p className="ml-auto text-[10px] uppercase tracking-wider text-muted">
              Reads your data · never advice
            </p>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.length === 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-muted">
                  Ask about your own workstation - signals, paper account, watchlist, backtests,
                  closed trades, or your trade review. Answers come from the engine&apos;s read-only
                  data; nothing here can place orders.
                </p>
                {STARTERS.map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    onClick={() => void ask(starter)}
                    className="block w-full rounded-2xl border border-border px-3 py-2 text-left text-xs text-muted transition hover:border-accent/40 hover:text-ink"
                  >
                    {starter}
                  </button>
                ))}
              </div>
            ) : (
              messages.map((message, index) => (
                <div
                  key={`${index}-${message.role}`}
                  className={
                    message.role === 'user'
                      ? 'ml-8 rounded-2xl bg-accentStrong/20 px-3 py-2 text-sm text-ink'
                      : 'mr-4 rounded-2xl border border-border bg-white/[0.03] px-3 py-2 text-sm text-ink'
                  }
                >
                  {message.role === 'assistant' ? (
                    <AiMarkdown className="text-sm leading-relaxed text-ink">
                      {message.text}
                    </AiMarkdown>
                  ) : (
                    <p className="whitespace-pre-wrap leading-relaxed">{message.text}</p>
                  )}
                  {message.role === 'assistant' && message.source ? (
                    <p className="mt-1.5 flex flex-wrap gap-1.5 text-[10px] text-muted">
                      <span className="rounded-full border border-border px-2 py-0.5">
                        {message.source}
                      </span>
                      {(message.tools ?? []).map((tool) => (
                        <span key={tool} className="rounded-full border border-border px-2 py-0.5">
                          {tool}
                        </span>
                      ))}
                    </p>
                  ) : null}
                </div>
              ))
            )}
            {busy ? (
              <div className="mr-4 flex items-center gap-2 rounded-2xl border border-border bg-white/[0.03] px-3 py-2 text-sm text-muted">
                <span className="size-3 shrink-0 animate-spin rounded-full border-2 border-accent/30 border-t-accent motion-reduce:animate-none" />
                Reading your data… large local models can take up to a minute.
              </div>
            ) : null}
          </div>

          <form
            className="flex items-center gap-2 border-t border-border px-3 py-3"
            onSubmit={(event) => {
              event.preventDefault();
              void ask(draft);
            }}
          >
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask about your signals, account, trades…"
              maxLength={500}
              className="flex-1 rounded-2xl border border-border bg-white/[0.04] px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="grid size-9 shrink-0 place-items-center rounded-full border border-accent/40 bg-accentStrong/20 text-accent transition hover:bg-accentStrong/40 disabled:opacity-40"
            >
              <Send className="size-4" />
            </button>
          </form>
        </div>
      ) : null}
    </>
  );
}
