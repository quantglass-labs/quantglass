// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Portfolio (PAR-3): the trading desk view. Positions with live marks and
 * one-tap close, working orders with cancel, and the closure history from
 * the ledger - every exit with realized PnL and its R multiple. The AI
 * portfolio read sits on top. Paper venue, closed-candle semantics.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Briefcase } from 'lucide-react';

import { AiInsight } from '../components/aiInsight';
import { BackendStatusNotice } from '../components/backendGate';
import { CountUp } from '../components/motion';
import { MetricTile } from '../components/surface';
import { backendClient } from '../lib/backend';
import type {
  BackendStatus,
  PaperAccount,
  PaperClosureRecord,
  PaperTradeIntentRecord,
} from '../types';

const TABS = ['positions', 'orders', 'history'] as const;
type Tab = (typeof TABS)[number];

function money(value: number): string {
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

export function PortfolioScreen({ backendStatus }: { backendStatus: BackendStatus }) {
  const { t } = useTranslation();
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
      setNotice(t('portfolio.notice.closed', { symbol: symbolId }));
      refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t('portfolio.notice.closeFailed'));
    }
  };

  const cancelOrder = async (intentId: string) => {
    try {
      await backendClient.cancelPaperTrade(intentId);
      refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t('portfolio.notice.cancelFailed'));
    }
  };

  const realizedTotal = closures?.reduce((sum, closure) => sum + closure.pnl, 0) ?? 0;
  const winners = closures?.filter((closure) => closure.pnl > 0).length ?? 0;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-center gap-2">
        <Briefcase size={20} className="text-accent" />
        <h1 className="text-lg font-semibold text-ink">{t('portfolio.title')}</h1>
        <span className="ml-auto text-xs text-muted/70">{t('portfolio.tagline')}</span>
      </div>

      <BackendStatusNotice status={backendStatus} />
      <AiInsight surface="portfolio" title={t('portfolio.aiTitle')} />

      {account ? (
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <MetricTile
            label={t('portfolio.tiles.balance')}
            hero
            helper={t('portfolio.tiles.balanceHelper', { count: account.openPositions.length })}
          >
            <CountUp value={account.balance} format={(n) => money(n)} />
          </MetricTile>
          <MetricTile
            label={t('portfolio.tiles.buyingPower')}
            helper={t('portfolio.tiles.buyingPowerHelper')}
          >
            <CountUp value={account.buyingPower} format={(n) => money(n)} />
          </MetricTile>
          <MetricTile
            label={t('portfolio.tiles.realizedPnl')}
            toneClass={account.realizedPnl >= 0 ? 'text-buy' : 'text-sell'}
            helper={t('portfolio.tiles.realizedPnlHelper')}
          >
            <CountUp value={account.realizedPnl} format={(n) => money(n)} />
          </MetricTile>
          <MetricTile
            label={t('portfolio.tiles.openPositions')}
            toneClass="text-watch"
            helper={t('portfolio.tiles.openPositionsHelper')}
          >
            <CountUp value={account.openPositions.length} format={(n) => String(Math.round(n))} />
          </MetricTile>
        </div>
      ) : null}

      {notice ? (
        <p className="mt-4 rounded-xl border border-border bg-white/[0.03] p-3 text-sm text-ink">
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
                ? 'border-accent/60 bg-accent/15 text-accent'
                : 'border-border text-muted hover:text-ink'
            }`}
          >
            {t(`portfolio.tabs.${entry}`)}
            {entry === 'orders' && orders.length ? ` (${orders.length})` : ''}
          </button>
        ))}
      </div>

      {tab === 'positions' ? (
        <div className="mt-4 space-y-2">
          {!account?.openPositions.length ? (
            <p className="rounded-xl border border-border bg-white/[0.03] p-4 text-sm text-muted">
              {t('portfolio.positions.empty')}
            </p>
          ) : (
            account.openPositions.map((position) => (
              <div
                key={position.symbolId}
                className="flex items-center gap-4 rounded-xl border border-border bg-white/[0.03] p-4"
              >
                <div>
                  <p className="font-semibold text-ink">{position.symbolId}</p>
                  <p className="text-xs text-muted">
                    {position.side.toUpperCase()} {position.quantity} @{' '}
                    {money(position.averagePrice)}
                  </p>
                </div>
                <span
                  className={`ml-auto font-semibold ${
                    position.pnl >= 0 ? 'text-buy' : 'text-sell'
                  }`}
                >
                  {money(position.pnl)}
                </span>
                {position.quantity > 1 ? (
                  <button
                    type="button"
                    title={t('portfolio.positions.scaleOut')}
                    onClick={() => void closePosition(position.symbolId, position.quantity / 2)}
                    className="rounded-full border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:border-hold/50 hover:text-hold"
                  >
                    {t('portfolio.positions.closeHalf')}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void closePosition(position.symbolId)}
                  className="rounded-full border border-border px-4 py-1.5 text-xs text-muted transition-colors hover:border-sell/50 hover:text-sell"
                >
                  {t('portfolio.positions.close')}
                </button>
              </div>
            ))
          )}
        </div>
      ) : null}

      {tab === 'orders' ? (
        <div className="mt-4 space-y-2">
          {!orders.length ? (
            <p className="rounded-xl border border-border bg-white/[0.03] p-4 text-sm text-muted">
              {t('portfolio.orders.empty')}
            </p>
          ) : (
            orders.map((order) => (
              <div
                key={order.id}
                className="flex items-center gap-4 rounded-xl border border-border bg-white/[0.03] p-4"
              >
                <div>
                  <p className="font-semibold text-ink">{order.symbol}</p>
                  <p className="text-xs text-muted">
                    {order.side} {order.quantity} ·{' '}
                    {t('portfolio.orders.submitted', { time: order.submittedAt.slice(0, 16) })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void cancelOrder(order.id)}
                  className="ml-auto rounded-full border border-border px-4 py-1.5 text-xs text-muted transition-colors hover:border-sell/50 hover:text-sell"
                >
                  {t('portfolio.orders.cancel')}
                </button>
              </div>
            ))
          )}
        </div>
      ) : null}

      {tab === 'history' ? (
        <div className="mt-4">
          {closures === null ? (
            <div className="h-24 animate-pulse rounded-xl bg-white/5" aria-busy="true" />
          ) : !closures.length ? (
            <p className="rounded-xl border border-border bg-white/[0.03] p-4 text-sm text-muted">
              {t('portfolio.history.empty')}
            </p>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted">
                {t('portfolio.history.summary', { count: closures.length, winners })}{' '}
                <span className={realizedTotal >= 0 ? 'text-buy' : 'text-sell'}>
                  {money(realizedTotal)}
                </span>
              </p>
              <div className="space-y-2">
                {closures.map((closure, index) => (
                  <div
                    key={`${closure.symbolId}-${closure.closedAt}-${index}`}
                    className="flex items-center gap-3 rounded-xl border border-border bg-white/[0.03] p-3 text-sm"
                  >
                    <span className="font-medium text-ink">{closure.symbolId}</span>
                    <span className="text-muted">
                      {closure.side} {closure.quantity} · {money(closure.entryPrice)} →{' '}
                      {money(closure.exitPrice)}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] uppercase ${
                        closure.exitKind === 'target'
                          ? 'border-buy/40 text-buy'
                          : closure.exitKind === 'stop'
                            ? 'border-sell/40 text-sell'
                            : 'border-border text-muted'
                      }`}
                    >
                      {t(`portfolio.exitKind.${closure.exitKind}`, {
                        defaultValue: closure.exitKind,
                      })}
                    </span>
                    <span
                      className={`ml-auto font-semibold ${
                        closure.pnl >= 0 ? 'text-buy' : 'text-sell'
                      }`}
                    >
                      {money(closure.pnl)}
                    </span>
                    {closure.rMultiple !== null ? (
                      <span className="text-xs text-muted">
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
