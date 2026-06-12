// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useMemo, useState } from 'react';
import { freshnessClassName, signalFreshness } from '../lib/freshness';
import { formatCurrency, formatDateTime } from '../lib/format';
import {
  Button,
  DataStateView,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  Panel,
  SectionHeading,
  SignalChip,
} from '../components/ui';
import type {
  MarketType,
  ScreenState,
  SignalRecord,
  SignalType,
  SymbolRecord,
  Timeframe,
} from '../types';

import { backendClient } from '../lib/backend';
import type { ContextSignal, RiskSignal } from '../types';

const FAMILY_LABELS: Record<string, string> = {
  technical: 'Technical',
  'market-structure': 'Structure',
  volatility: 'Volatility',
  regime: 'Regime',
  'portfolio-risk': 'Risk',
};

export function SignalsScreen({
  state,
  symbols,
  signals,
  signalsError,
  marketFilter,
  onOpenSymbol,
  onOpenSignal,
  onOpenPaperTrade,
}: {
  state: ScreenState;
  symbols: SymbolRecord[];
  signals: SignalRecord[];
  signalsError?: string | null;
  marketFilter: MarketType | 'all';
  onOpenSymbol: (symbolId: string) => void;
  onOpenSignal: (signalId: string) => void;
  onOpenPaperTrade: (signalId: string) => void;
}) {
  const [signalType, setSignalType] = useState<'all' | SignalType>('all');
  const [minConfidence, setMinConfidence] = useState(0);
  const [timeframe, setTimeframe] = useState<'all' | Timeframe>('all');
  const [activeOnly, setActiveOnly] = useState(false);
  const [familyFilter, setFamilyFilter] = useState<string>('all');
  const [contextSignals, setContextSignals] = useState<ContextSignal[]>([]);
  const [riskSignals, setRiskSignals] = useState<RiskSignal[]>([]);
  const [expertUnlocked, setExpertUnlocked] = useState(true);

  useEffect(() => {
    if (state !== 'ready') return;
    backendClient
      .getContextSignals()
      .then((response) => setContextSignals(response.items))
      .catch(() => setContextSignals([]));
    backendClient
      .getRiskSignals()
      .then((response) => setRiskSignals(response.items))
      .catch(() => setRiskSignals([]));
    backendClient
      .getLearnReadiness()
      .then((readiness) =>
        setExpertUnlocked(
          readiness.levels.find((level) => level.id === 'expert')?.unlocked ?? false,
        ),
      )
      .catch(() => setExpertUnlocked(true));
  }, [state]);

  const rows = useMemo(
    () =>
      signals.filter((record) => {
        if (marketFilter !== 'all' && record.marketType !== marketFilter) return false;
        if (signalType !== 'all' && record.signal.signal !== signalType) return false;
        if (record.signal.confidence < minConfidence) return false;
        if (timeframe !== 'all' && record.signal.timeframe !== timeframe) return false;
        if (activeOnly && record.status !== 'active') return false;
        if (familyFilter !== 'all' && (record.signal.family ?? 'technical') !== familyFilter)
          return false;
        // Academy gate (SIG-9): expert-layer signals unlock with expert readiness.
        if (record.signal.layer === 'expert' && !expertUnlocked) return false;
        return true;
      }),
    [
      activeOnly,
      marketFilter,
      minConfidence,
      signalType,
      signals,
      timeframe,
      familyFilter,
      expertUnlocked,
    ],
  );
  const lockedCount = useMemo(
    () =>
      expertUnlocked ? 0 : signals.filter((record) => record.signal.layer === 'expert').length,
    [signals, expertUnlocked],
  );
  const retryMockView = () => window.location.reload();

  return (
    <div className="space-y-8">
      <SectionHeading
        eyebrow="Signals"
        title="Filterable signal inventory"
        description="Current and historical signals with setup type, expectancy, status, and direct routing to the symbol detail screen or signal drawer. Signal records are generated from stored market corridor candles on the backend."
      />

      {signalsError ? (
        <div className="rounded-2xl border border-sell/40 bg-sell/10 p-4">
          <p className="text-sm font-semibold text-ink">Signal feed error</p>
          <p className="mt-1 text-sm text-muted">
            {signalsError} The list below may be stale or empty because the backend is failing, not
            because there are no signals.
          </p>
        </div>
      ) : null}

      {riskSignals.length ? (
        <div className="space-y-2">
          {riskSignals.map((risk) => (
            <div
              key={risk.display_name}
              className={`rounded-2xl border p-4 ${
                risk.severity >= 3
                  ? 'border-rose-500/40 bg-rose-600/10'
                  : 'border-amber-500/40 bg-amber-600/10'
              }`}
            >
              <p className="text-sm font-semibold text-ink">
                {risk.display_name}
                <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted">
                  risk
                </span>
              </p>
              <p className="mt-1 text-sm text-muted">{risk.message}</p>
            </div>
          ))}
        </div>
      ) : null}

      {contextSignals.length ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {contextSignals.slice(0, 12).map((context) => (
            <span
              key={`${context.symbol_id}-${context.timeframe}-${context.display_name}`}
              title={context.message}
              className="shrink-0 rounded-full border border-border bg-white/[0.04] px-3 py-1.5 text-xs text-muted"
            >
              <span className="font-medium text-ink">{context.symbol}</span> {context.timeframe} ·{' '}
              {context.display_name}
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {['all', ...Object.keys(FAMILY_LABELS)].map((family) => (
          <button
            key={family}
            type="button"
            onClick={() => setFamilyFilter(family)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              familyFilter === family
                ? 'border-accent bg-accentStrong/15 text-ink'
                : 'border-border text-muted hover:text-ink'
            }`}
          >
            {family === 'all' ? 'All families' : FAMILY_LABELS[family]}
          </button>
        ))}
        {lockedCount > 0 ? (
          <span className="ml-auto text-xs text-muted">
            {lockedCount} expert-layer signal{lockedCount === 1 ? '' : 's'} locked — unlocks with
            Academy expert readiness
          </span>
        ) : null}
      </div>

      <Panel>
        <div className="grid gap-3 lg:grid-cols-[repeat(4,minmax(0,1fr)),auto]">
          <label className="space-y-2 text-sm text-muted">
            <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
              Signal type
            </span>
            <select
              className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
              value={signalType}
              onChange={(event) => setSignalType(event.target.value as typeof signalType)}
            >
              <option value="all">All</option>
              <option value="BUY_ZONE">Buy zone</option>
              <option value="SELL">Sell</option>
              <option value="HOLD">Hold</option>
              <option value="WAIT">Wait</option>
              <option value="WATCH">Watch</option>
            </select>
          </label>
          <label className="space-y-2 text-sm text-muted">
            <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
              Min confidence
            </span>
            <select
              className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
              value={minConfidence}
              onChange={(event) => setMinConfidence(Number(event.target.value))}
            >
              <option value={0}>0%</option>
              <option value={50}>50%</option>
              <option value={60}>60%</option>
              <option value={70}>70%</option>
            </select>
          </label>
          <label className="space-y-2 text-sm text-muted">
            <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
              Timeframe
            </span>
            <select
              className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
              value={timeframe}
              onChange={(event) => setTimeframe(event.target.value as typeof timeframe)}
            >
              <option value="all">All</option>
              <option value="15m">15m</option>
              <option value="1h">1h</option>
              <option value="4h">4h</option>
              <option value="1d">1d</option>
            </select>
          </label>
          <label className="space-y-2 text-sm text-muted">
            <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
              Status scope
            </span>
            <button
              type="button"
              className={`w-full rounded-2xl border px-4 py-3 text-left ${activeOnly ? 'border-accent bg-accentStrong/15 text-ink' : 'border-border bg-white/[0.04] text-muted'}`}
              onClick={() => setActiveOnly((current) => !current)}
            >
              {activeOnly ? 'Active only' : 'All statuses'}
            </button>
          </label>
          <div className="flex items-end">
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                setSignalType('all');
                setMinConfidence(0);
                setTimeframe('all');
                setActiveOnly(false);
              }}
            >
              Reset filters
            </Button>
          </div>
        </div>
      </Panel>

      <Panel>
        <DataStateView
          state={state}
          isEmpty={rows.length === 0}
          loading={<LoadingSkeleton rows={6} />}
          empty={
            <EmptyState
              title="No signals match the current filter"
              description="Try broadening the market, status, or confidence filters to repopulate the backend-generated table."
            />
          }
          error={
            <ErrorState
              title="Signals table unavailable"
              description="The backend signal inventory could not be loaded."
              onRetry={retryMockView}
            />
          }
          populated={
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-3 text-left">
                <thead>
                  <tr className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                    <th className="px-4">Symbol</th>
                    <th className="px-4">Signal</th>
                    <th className="px-4">Confidence</th>
                    <th className="px-4">R:R</th>
                    <th className="px-4">Setup type</th>
                    <th className="px-4">Backtested win-rate</th>
                    <th className="px-4">Status</th>
                    <th className="px-4">Freshness</th>
                    <th className="px-4">Generated</th>
                    <th className="px-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((record) => {
                    const symbol = symbols.find((entry) => entry.id === record.symbolId);
                    const freshness = signalFreshness(record.signal);
                    return (
                      <tr
                        key={record.id}
                        className={`rounded-3xl border border-border bg-white/[0.03] ${record.signal.confidence < 55 ? 'opacity-80' : ''}`}
                      >
                        <td className="rounded-l-3xl px-4 py-4">
                          <button
                            type="button"
                            className="text-left"
                            onClick={() => onOpenSymbol(record.symbolId)}
                          >
                            <p className="font-medium text-ink">{record.signal.symbol}</p>
                            <p className="text-xs text-muted">
                              {symbol?.marketType} · {record.signal.timeframe}
                            </p>
                          </button>
                        </td>
                        <td className="px-4 py-4">
                          <SignalChip
                            signal={record.signal.signal}
                            subdued={record.signal.confidence < 55}
                          />
                        </td>
                        <td className="metric-text px-4 py-4 text-ink">
                          {record.signal.confidence}
                        </td>
                        <td className="metric-text px-4 py-4 text-ink">
                          {record.signal.risk_reward.toFixed(1)}
                        </td>
                        <td className="px-4 py-4 text-sm text-muted">
                          <p className="text-ink">
                            {record.signal.display_name ??
                              record.signal.confidence_basis.setup_type}
                          </p>
                          <p className="text-xs">
                            {FAMILY_LABELS[record.signal.family ?? ''] ?? record.signal.family}
                            {record.signal.quality !== undefined
                              ? ` · quality ${record.signal.quality}`
                              : ''}
                          </p>
                        </td>
                        <td className="metric-text px-4 py-4 text-ink">
                          {(record.signal.confidence_basis.backtested_winrate * 100).toFixed(0)}%
                        </td>
                        <td className="px-4 py-4 text-sm text-muted">{record.status}</td>
                        <td className="px-4 py-4 text-sm">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${freshnessClassName(freshness.tone)}`}
                          >
                            {freshness.label}
                          </span>
                          <p className="mt-1 max-w-44 text-xs text-muted">{freshness.detail}</p>
                        </td>
                        <td className="px-4 py-4 text-sm text-muted">
                          {formatDateTime(record.signal.generated_at_utc)}
                        </td>
                        <td className="rounded-r-3xl px-4 py-4">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="secondary"
                              className="px-3 py-2 text-xs"
                              onClick={() => onOpenSymbol(record.symbolId)}
                            >
                              Symbol
                            </Button>
                            <Button
                              variant="ghost"
                              className="px-3 py-2 text-xs"
                              onClick={() => onOpenSignal(record.id)}
                            >
                              Detail drawer
                            </Button>
                            <Button
                              className="px-3 py-2 text-xs"
                              onClick={() => onOpenPaperTrade(record.id)}
                            >
                              Paper trade
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          }
        />
      </Panel>

      <Panel>
        <SectionHeading
          eyebrow="Canonical signal shape"
          title="Schema summary"
          description="The table above derives from the same field-for-field canonical signal object shown in the signal detail drawer."
        />
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {signals.slice(0, 3).map((record) => (
            <div key={record.id} className="rounded-2xl border border-border bg-white/[0.03] p-4">
              <p className="font-medium text-ink">{record.signal.symbol}</p>
              <p className="mt-2 text-sm text-muted">
                Entry zone{' '}
                {record.signal.entry_zone.map((level) => formatCurrency(level)).join(' - ')}
              </p>
              <p className="mt-1 text-sm text-muted">
                Fees/slippage {record.signal.fees_slippage_assumed}
              </p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
