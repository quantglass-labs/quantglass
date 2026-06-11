// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { ShieldCheck } from 'lucide-react';

import { Button } from '../../components/ui';
import type { TradingMode } from '../../types';

export function RiskTab({
  tradingMode,
  liveTradingConfirmed,
  minBacktestSample,
  hasAlpacaCredentials,
  onSetTradingMode,
  onRequestLiveTrading,
  onSetMinBacktestSample,
  onGoToKeys,
}: {
  tradingMode: TradingMode;
  liveTradingConfirmed: boolean;
  minBacktestSample: number;
  hasAlpacaCredentials: boolean;
  onSetTradingMode: (mode: TradingMode) => void;
  onRequestLiveTrading: () => void;
  onSetMinBacktestSample: (value: number) => void;
  onGoToKeys: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-medium text-ink">Trading mode</p>
            <p className="text-sm text-muted">
              Default is paper. Live mode is gated behind saved Alpaca credentials, explicit
              confirmation, and backend live-order safety checks.
            </p>
          </div>
          <ShieldCheck className="size-5 text-accent" />
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            variant={tradingMode === 'paper' ? 'primary' : 'secondary'}
            onClick={() => onSetTradingMode('paper')}
          >
            paper
          </Button>
          <button
            type="button"
            title={
              hasAlpacaCredentials
                ? 'Enable live broker routing'
                : 'Save Alpaca key ID and secret before enabling live mode'
            }
            disabled={!hasAlpacaCredentials}
            className={`rounded-2xl border border-border px-4 py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${tradingMode === 'live' ? 'bg-sell/15 text-sell' : 'bg-white/[0.03] text-muted'}`}
            onClick={onRequestLiveTrading}
          >
            live
          </button>
          <Button variant="ghost" onClick={() => onGoToKeys()}>
            Go to API Keys
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted">
          Live confirmation:{' '}
          {tradingMode === 'live' && liveTradingConfirmed
            ? 'enabled for the current backend settings'
            : 'not enabled'}
          .
          {hasAlpacaCredentials
            ? ' Alpaca credentials are saved.'
            : ' Alpaca credentials are missing.'}
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
          <p className="font-medium text-ink">Partial candles</p>
          <p className="mt-2 text-sm text-muted">
            `act_on_partial_candles = false` is enforced in the current build. Signals use closed
            candles only.
          </p>
        </div>
        <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
          <p className="font-medium text-ink">Minimum backtest sample</p>
          <input
            className="mt-4 w-full"
            type="range"
            min="20"
            max="150"
            step="5"
            value={minBacktestSample}
            onChange={(event) => onSetMinBacktestSample(Number(event.target.value))}
          />
          <p className="mt-2 text-sm text-muted">
            {minBacktestSample} trades. Strategies below this threshold show a warning badge in
            Backtesting.
          </p>
        </div>
      </div>
    </div>
  );
}
