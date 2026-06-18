// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Bell, Clipboard, ShieldAlert } from 'lucide-react';
import {
  Drawer,
  Button,
  DataStateView,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  MetricStat,
  Panel,
  SignalChip,
} from '../components/ui';
import { backendClient } from '../lib/backend';
import { AiMarkdown } from '../components/AiMarkdown';
import { freshnessClassName, signalFreshness } from '../lib/freshness';
import { formatCurrency, formatDateTime } from '../lib/format';
import type { ScreenState, SignalRecord, SymbolRecord } from '../types';

export function SignalDetailDrawer({
  state,
  open,
  signalRecord,
  symbol,
  onClose,
  onPaperTrade,
  onCreateAlert,
  onCopyJson,
}: {
  state: ScreenState;
  open: boolean;
  signalRecord: SignalRecord | null;
  symbol: SymbolRecord | null;
  onClose: () => void;
  onPaperTrade: () => void;
  onCreateAlert: () => void;
  onCopyJson: () => void;
}) {
  const { t } = useTranslation();
  const retryMockView = () => window.location.reload();

  // Feed records carry the instant deterministic template; the model
  // narration (if a model is configured) is fetched lazily on drawer open
  // so a slow model never stalls the signal feed.
  const [liveNarration, setLiveNarration] = useState<{
    ai_explanation: string;
    narration_source: string;
  } | null>(null);
  const [narratedSignalId, setNarratedSignalId] = useState<string | null>(null);
  if ((signalRecord?.id ?? null) !== narratedSignalId) {
    setNarratedSignalId(signalRecord?.id ?? null);
    setLiveNarration(null);
  }
  useEffect(() => {
    if (!open || !signalRecord) return;
    backendClient
      .narrateSignal(signalRecord.signal.symbol, signalRecord.signal.timeframe)
      .then(setLiveNarration)
      .catch(() => setLiveNarration(null));
  }, [open, signalRecord]);

  const narrationSource =
    liveNarration?.narration_source ?? signalRecord?.signal.narration_source ?? 'template';
  const isModelNarration = narrationSource.startsWith('ollama');
  const narrationLabel = isModelNarration
    ? t('signalDetail.narrationModel')
    : t('signalDetail.narrationRule');
  const narrationSourceDisplay = isModelNarration
    ? t('signalDetail.sourceLocalModel', { model: narrationSource.replace('ollama:', '') })
    : narrationSource === 'template-guarded'
      ? t('signalDetail.sourceGuarded')
      : narrationSource === 'template-fallback'
        ? t('signalDetail.sourceFallback')
        : t('signalDetail.sourceTemplate');

  const freshness = signalRecord ? signalFreshness(signalRecord.signal) : null;

  return (
    <Drawer
      open={open}
      title={
        signalRecord
          ? t('signalDetail.title', { symbol: signalRecord.signal.symbol })
          : t('signalDetail.titleGeneric')
      }
      description={t('signalDetail.description')}
      onClose={onClose}
    >
      {signalRecord ? (
        <DataStateView
          state={state}
          loading={<LoadingSkeleton rows={8} />}
          empty={
            <EmptyState
              title={t('signalDetail.emptyTitle')}
              description={t('signalDetail.emptyDesc')}
            />
          }
          error={
            <ErrorState
              title={t('signalDetail.errorTitle')}
              description={t('signalDetail.errorDesc')}
              onRetry={retryMockView}
            />
          }
          populated={
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-4 rounded-3xl border border-border bg-white/[0.03] p-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                    {t('signalDetail.canonicalSignal')}
                  </p>
                  <h4 className="mt-1 text-2xl font-semibold text-ink">
                    {signalRecord.signal.symbol}
                  </h4>
                  <p className="mt-2 text-sm text-muted">
                    {t('signalDetail.generated', {
                      market: symbol?.marketType,
                      timeframe: signalRecord.signal.timeframe,
                      datetime: formatDateTime(signalRecord.signal.generated_at_utc),
                    })}
                  </p>
                  {freshness ? (
                    <div className="mt-2">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${freshnessClassName(freshness.tone)}`}
                      >
                        {freshness.label}
                      </span>
                      <p className="mt-1 text-xs text-muted">{freshness.detail}</p>
                    </div>
                  ) : null}
                </div>
                <SignalChip
                  signal={signalRecord.signal.signal}
                  subdued={signalRecord.signal.confidence < 55}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <MetricStat
                  label={t('signalDetail.signalId')}
                  value={signalRecord.id}
                  helper={t('signalDetail.signalIdHelper')}
                />
                <MetricStat
                  label={t('signalDetail.riskLevel')}
                  value={signalRecord.signal.risk_level}
                  helper={t('signalDetail.statusHelper', { status: signalRecord.status })}
                />
                <MetricStat
                  label={t('signalDetail.confidence')}
                  value={signalRecord.signal.confidence}
                  helper={t('signalDetail.confidenceHelper')}
                />
                <MetricStat
                  label={t('signalDetail.entryZone')}
                  value={signalRecord.signal.entry_zone
                    .map((level) => formatCurrency(level))
                    .join(' - ')}
                  helper={t('signalDetail.entryZoneHelper')}
                />
                <MetricStat
                  label={t('signalDetail.riskReward')}
                  value={signalRecord.signal.risk_reward.toFixed(1)}
                  helper={signalRecord.signal.fees_slippage_assumed}
                />
              </div>

              <Panel className="p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                  {t('signalDetail.confidenceBasis')}
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <MetricStat
                    label={t('signalDetail.trendAlignment')}
                    value={signalRecord.signal.confidence_basis.trend_alignment.toFixed(2)}
                  />
                  <MetricStat
                    label={t('signalDetail.volumeConfirmation')}
                    value={signalRecord.signal.confidence_basis.volume_confirmation.toFixed(2)}
                  />
                  <MetricStat
                    label={t('signalDetail.volatilityRegime')}
                    value={signalRecord.signal.confidence_basis.volatility_regime}
                  />
                  <MetricStat
                    label={t('signalDetail.setupType')}
                    value={signalRecord.signal.confidence_basis.setup_type}
                  />
                  <MetricStat
                    label={t('signalDetail.backtestedWinRate')}
                    value={`${(signalRecord.signal.confidence_basis.backtested_winrate * 100).toFixed(0)}%`}
                  />
                  <MetricStat
                    label={t('signalDetail.expectancyR')}
                    value={signalRecord.signal.confidence_basis.backtested_expectancy_R.toFixed(2)}
                  />
                  <MetricStat
                    label={t('signalDetail.sampleSize')}
                    value={signalRecord.signal.confidence_basis.backtest_sample_size}
                    helper={
                      signalRecord.signal.confidence_basis.backtest_sample_size < 50
                        ? t('signalDetail.lowSampleWarning')
                        : t('signalDetail.aboveMinThreshold')
                    }
                  />
                  <MetricStat
                    label={t('signalDetail.oosValidated')}
                    value={
                      signalRecord.signal.confidence_basis.out_of_sample_validated
                        ? t('signalDetail.yes')
                        : t('signalDetail.no')
                    }
                    helper={
                      signalRecord.signal.confidence_basis.out_of_sample_validated
                        ? t('signalDetail.oosPositive')
                        : t('signalDetail.oosNotConfirmed')
                    }
                  />
                  {signalRecord.signal.confidence_basis.market_regime ? (
                    <MetricStat
                      label={t('signalDetail.marketRegime')}
                      value={signalRecord.signal.confidence_basis.market_regime}
                    />
                  ) : null}
                  {typeof signalRecord.signal.confidence_basis.confluence_score === 'number' ? (
                    <MetricStat
                      label={t('signalDetail.confluenceScore')}
                      value={signalRecord.signal.confidence_basis.confluence_score.toFixed(2)}
                    />
                  ) : null}
                  {signalRecord.signal.confidence_basis.conformal_guaranteed &&
                  typeof signalRecord.signal.confidence_basis.conformal_lower_r === 'number' &&
                  typeof signalRecord.signal.confidence_basis.conformal_upper_r === 'number' ? (
                    <MetricStat
                      label={t('signalDetail.nextTradeRange')}
                      value={`${signalRecord.signal.confidence_basis.conformal_lower_r.toFixed(2)}R to ${signalRecord.signal.confidence_basis.conformal_upper_r.toFixed(2)}R`}
                      helper={t('signalDetail.conformalHelper', {
                        n: signalRecord.signal.confidence_basis.conformal_sample_size ?? 0,
                      })}
                    />
                  ) : null}
                  {typeof signalRecord.signal.confidence_basis.pooled_sample_size === 'number' ? (
                    <MetricStat
                      label={t('signalDetail.pooledSample')}
                      value={signalRecord.signal.confidence_basis.pooled_sample_size}
                      helper={t('signalDetail.pooledSampleHelper')}
                    />
                  ) : null}
                  {typeof signalRecord.signal.confidence_basis.out_of_sample_sample_size ===
                  'number' ? (
                    <MetricStat
                      label={t('signalDetail.oosSample')}
                      value={signalRecord.signal.confidence_basis.out_of_sample_sample_size}
                    />
                  ) : null}
                </div>
              </Panel>

              <Panel className="p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                  {t('signalDetail.riskLadder')}
                </p>
                <div className="mt-3 space-y-2 text-sm text-muted">
                  <p>
                    {t('signalDetail.stopLossLabel')}:{' '}
                    <span className="metric-text text-ink">
                      {formatCurrency(signalRecord.signal.stop_loss)}
                    </span>
                  </p>
                  <p>
                    {t('signalDetail.takeProfitLabel')}:{' '}
                    <span className="metric-text text-ink">
                      {signalRecord.signal.take_profit
                        .map((level) => formatCurrency(level))
                        .join(', ')}
                    </span>
                  </p>
                  <p>
                    {t('signalDetail.invalidationLabel')}:{' '}
                    <span className="text-ink">{signalRecord.signal.invalidation}</span>
                  </p>
                  <p>
                    {t('signalDetail.feesLabel')}:{' '}
                    <span className="text-ink">{signalRecord.signal.fees_slippage_assumed}</span>
                  </p>
                  <p>
                    {t('signalDetail.candleStatusLabel')}:{' '}
                    <span className="text-ink">{signalRecord.signal.candle_status}</span>
                  </p>
                  <p>
                    {t('signalDetail.dataSourceLabel')}:{' '}
                    <span className="text-ink">{signalRecord.signal.data_source}</span>
                  </p>
                </div>
              </Panel>

              <Panel className="p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                  {t('signalDetail.engineReasons')}
                </p>
                <ul className="mt-3 space-y-2 text-sm text-muted">
                  {signalRecord.signal.reasons.map((reason) => (
                    <li
                      key={reason}
                      className="rounded-2xl border border-border bg-white/[0.03] px-3 py-2"
                    >
                      {reason}
                    </li>
                  ))}
                </ul>
              </Panel>

              <Panel className="p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                  {t('signalDetail.aiExplanation')}
                </p>
                <div className="mt-3 rounded-2xl border border-watch/20 bg-watch/8 p-4 text-sm text-muted">
                  <p className="mb-2">{narrationLabel}</p>
                  <AiMarkdown className="text-sm leading-relaxed text-muted">
                    {liveNarration?.ai_explanation ?? signalRecord.signal.ai_explanation ?? ''}
                  </AiMarkdown>
                </div>
                <p className="mt-2 text-xs text-muted">
                  {t('signalDetail.sourcePrefix', { source: narrationSourceDisplay })}
                </p>
                <p className="mt-3 text-xs text-muted">{signalRecord.signal.disclaimer}</p>
              </Panel>

              <Panel className="p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                  {t('signalDetail.jsonPreview')}
                </p>
                <pre className="mt-3 overflow-x-auto rounded-2xl border border-border bg-surface/50 p-4 text-xs text-muted">
                  {JSON.stringify(signalRecord.signal, null, 2)}
                </pre>
              </Panel>

              <div className="flex flex-wrap gap-3">
                <Button onClick={onPaperTrade}>{t('signalDetail.paperTradeThis')}</Button>
                <Button variant="secondary" onClick={onCreateAlert}>
                  <Bell className="size-4" />
                  {t('signalDetail.createAlert')}
                </Button>
                <button
                  type="button"
                  title={t('signalDetail.liveTradeTitle')}
                  className="rounded-2xl border border-border bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-muted"
                >
                  <ShieldAlert className="mr-2 inline size-4" />
                  {t('signalDetail.liveTradeDisabled')}
                </button>
                <Button variant="ghost" onClick={onCopyJson}>
                  <Clipboard className="size-4" />
                  {t('signalDetail.copyJson')}
                </Button>
              </div>
            </div>
          }
        />
      ) : (
        <EmptyState
          title={t('signalDetail.noSignalTitle')}
          description={t('signalDetail.noSignalDesc')}
        />
      )}
    </Drawer>
  );
}
