// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Portfolio (PAR-3): the trading desk view. Positions with live marks and
 * one-tap close, working orders with cancel, and the closure history from
 * the ledger - every exit with realized PnL and its R multiple. The AI
 * portfolio read sits on top. Paper venue, closed-candle semantics.
 */

import { useCallback, useEffect, useState } from 'react';

import { Briefcase } from 'lucide-react';

import { AiInsight } from '../components/aiInsight';
import { BackendStatusNotice } from '../components/backendGate';
import { backendClient } from '../lib/backend';
import type {
  BackendStatus,
  PaperAccount,
  PaperClosureRecord,
  PaperTradeIntentRecord,
} from '../types';

const TABS = ['positions', 'orders', 'history'] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  positions: 'Positions',
  orders: 'Working orders',
  history: 'History',
};

function money(value: number): string {
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

export function PortfolioScreen({ backendStatus }: { backendStatus: BackendStatus }) {
  const [tab, setTab] = useState<Tab>('positions');
  const [account, setAccount] = useState<PaperAccount | null>(null);
  const [orders, setOrders] = useState<PaperTradeIntentRecord[]>([]);
  const [closures, setClosures] = useState<PaperClosureRecord[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(() => {
    backendClient
      .getPaperAccount()
      .then((response) => setAccount(response.account))
      .catch(() => setAccount(null));
    backendClient
      .getPaperTrades()
      .then((response) => setOrders(response.items.filter((item) => item.status === 'pending')))
      .catch(() => setOrders([]));
    backendClient
      .getPaperClosures()
      .then((response) => setClosures(response.items))
      .catch(() => setClosures([]));
  }, []);

  useEffect(() => {
    if (backendStatus !== 'online') return;
    refresh();
  }, [backendStatus, refresh]);

  const closePosition = async (symbolId: string, quantity?: number) => {
    try {
      await backendClient.closePaperPosition(symbolId, quantity);
      setNotice(`${symbolId} closed at the latest market price.`);
      refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Close failed.');
    }
  };

  const cancelOrder = async (intentId: string) => {
    try {
      await backendClient.cancelPaperTrade(intentId);
      refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Cancel failed.');
    }
  };

  const realizedTotal = closures?.reduce((sum, closure) => sum + closure.pnl, 0) ?? 0;
  const winners = closures?.filter((closure) => closure.pnl > 0).length ?? 0;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-center gap-2">
        <Briefcase size={20} className="text-indigo-400" />
        <h1 className="text-lg font-semibold text-zinc-100">Portfolio</h1>
        <span className="ml-auto text-xs text-zinc-600">
          Paper venue · fills and exits on closed candles · never financial advice.
        </span>
      </div>

      <BackendStatusNotice status={backendStatus} />
      <AiInsight surface="portfolio" title="Portfolio read" />

      {account ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Balance', money(account.balance), 'text-zinc-100'],
            ['Buying power', money(account.buyingPower), 'text-zinc-100'],
            [
              'Realized P&L',
              money(account.realizedPnl),
              account.realizedPnl >= 0 ? 'text-emerald-300' : 'text-rose-300',
            ],
            ['Open positions', String(account.openPositions.length), 'text-zinc-100'],
          ].map(([label, value, tone]) => (
            <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <p className="text-xs text-zinc-500">{label}</p>
              <p className={`mt-1 text-xl font-semibold ${tone}`}>{value}</p>
            </div>
          ))}
        </div>
      ) : null}

      {notice ? (
        <p className="mt-4 rounded-xl border border-zinc-700 bg-zinc-900/40 p-3 text-sm text-zinc-300">
          {notice}
        </p>
      ) : null}

      <div className="mt-6 flex gap-2">
        {TABS.map((entry) => (
          <button
            key={entry}
            type="button"
            onClick={() => setTab(entry)}
            className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
              tab === entry
                ? 'border-indigo-400/60 bg-indigo-600/20 text-indigo-200'
                : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {TAB_LABELS[entry]}
            {entry === 'orders' && orders.length ? ` (${orders.length})` : ''}
          </button>
        ))}
      </div>

      {tab === 'positions' ? (
        <div className="mt-4 space-y-2">
          {!account?.openPositions.length ? (
            <p className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-500">
              No open positions. Fills land here; stops and targets exit them automatically.
            </p>
          ) : (
            account.openPositions.map((position) => (
              <div
                key={position.symbolId}
                className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4"
              >
                <div>
                  <p className="font-semibold text-zinc-100">{position.symbolId}</p>
                  <p className="text-xs text-zinc-500">
                    {position.side.toUpperCase()} {position.quantity} @{' '}
                    {money(position.averagePrice)}
                  </p>
                </div>
                <span
                  className={`ml-auto font-semibold ${
                    position.pnl >= 0 ? 'text-emerald-300' : 'text-rose-300'
                  }`}
                >
                  {money(position.pnl)}
                </span>
                {position.quantity > 1 ? (
                  <button
                    type="button"
                    title="Scale out: close half the position at the latest closed price"
                    onClick={() => void closePosition(position.symbolId, position.quantity / 2)}
                    className="rounded-full border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:border-amber-500/50 hover:text-amber-300"
                  >
                    Close ½
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void closePosition(position.symbolId)}
                  className="rounded-full border border-zinc-700 px-4 py-1.5 text-xs text-zinc-400 transition-colors hover:border-rose-500/50 hover:text-rose-300"
                >
                  Close
                </button>
              </div>
            ))
          )}
        </div>
      ) : null}

      {tab === 'orders' ? (
        <div className="mt-4 space-y-2">
          {!orders.length ? (
            <p className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-500">
              No working orders. Limit and stop entries wait here until price reaches them, expire
              by their time-in-force, or are cancelled.
            </p>
          ) : (
            orders.map((order) => (
              <div
                key={order.id}
                className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4"
              >
                <div>
                  <p className="font-semibold text-zinc-100">{order.symbol}</p>
                  <p className="text-xs text-zinc-500">
                    {order.side} {order.quantity} · submitted {order.submittedAt.slice(0, 16)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void cancelOrder(order.id)}
                  className="ml-auto rounded-full border border-zinc-700 px-4 py-1.5 text-xs text-zinc-400 transition-colors hover:border-rose-500/50 hover:text-rose-300"
                >
                  Cancel
                </button>
              </div>
            ))
          )}
        </div>
      ) : null}

      {tab === 'history' ? (
        <div className="mt-4">
          {closures === null ? (
            <div className="h-24 animate-pulse rounded-xl bg-zinc-800/60" aria-busy="true" />
          ) : !closures.length ? (
            <p className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-500">
              No closed trades yet. Every exit — stop, target, trailing, or manual — is recorded
              here with its realized P&L and R multiple.
            </p>
          ) : (
            <>
              <p className="mb-3 text-sm text-zinc-400">
                {closures.length} closed · {winners} winners · net{' '}
                <span className={realizedTotal >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                  {money(realizedTotal)}
                </span>
              </p>
              <div className="space-y-2">
                {closures.map((closure, index) => (
                  <div
                    key={`${closure.symbolId}-${closure.closedAt}-${index}`}
                    className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-sm"
                  >
                    <span className="font-medium text-zinc-100">{closure.symbolId}</span>
                    <span className="text-zinc-500">
                      {closure.side} {closure.quantity} · {money(closure.entryPrice)} →{' '}
                      {money(closure.exitPrice)}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] uppercase ${
                        closure.exitKind === 'target'
                          ? 'border-emerald-500/40 text-emerald-300'
                          : closure.exitKind === 'stop'
                            ? 'border-rose-500/40 text-rose-300'
                            : 'border-zinc-600 text-zinc-400'
                      }`}
                    >
                      {closure.exitKind}
                    </span>
                    <span
                      className={`ml-auto font-semibold ${
                        closure.pnl >= 0 ? 'text-emerald-300' : 'text-rose-300'
                      }`}
                    >
                      {money(closure.pnl)}
                    </span>
                    {closure.rMultiple !== null ? (
                      <span className="text-xs text-zinc-500">
                        {closure.rMultiple > 0 ? '+' : ''}
                        {closure.rMultiple}R
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
