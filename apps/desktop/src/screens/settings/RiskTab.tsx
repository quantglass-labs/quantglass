// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-medium text-ink">{t('settings.risk.tradingMode')}</p>
            <p className="text-sm text-muted">{t('settings.risk.tradingModeDesc')}</p>
          </div>
          <ShieldCheck className="size-5 text-accent" />
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            variant={tradingMode === 'paper' ? 'primary' : 'secondary'}
            onClick={() => onSetTradingMode('paper')}
          >
            {t('settings.risk.paper')}
          </Button>
          <button
            type="button"
            title={
              hasAlpacaCredentials
                ? t('settings.risk.enableLive')
                : t('settings.risk.saveAlpacaFirst')
            }
            disabled={!hasAlpacaCredentials}
            className={`rounded-2xl border border-border px-4 py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${tradingMode === 'live' ? 'bg-sell/15 text-sell' : 'bg-white/[0.03] text-muted'}`}
            onClick={onRequestLiveTrading}
          >
            {t('settings.risk.live')}
          </button>
          <Button variant="ghost" onClick={() => onGoToKeys()}>
            {t('settings.risk.goToKeys')}
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted">
          {t('settings.risk.liveConfirmation')}{' '}
          {tradingMode === 'live' && liveTradingConfirmed
            ? t('settings.risk.liveEnabled')
            : t('settings.risk.liveNotEnabled')}
          .{' '}
          {hasAlpacaCredentials ? t('settings.risk.alpacaSaved') : t('settings.risk.alpacaMissing')}
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
          <p className="font-medium text-ink">{t('settings.risk.partialCandles')}</p>
          <p className="mt-2 text-sm text-muted">{t('settings.risk.partialCandlesDesc')}</p>
        </div>
        <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
          <p className="font-medium text-ink">{t('settings.risk.minSample')}</p>
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
            {t('settings.risk.minSampleDesc', { count: minBacktestSample })}
          </p>
        </div>
      </div>
    </div>
  );
}
