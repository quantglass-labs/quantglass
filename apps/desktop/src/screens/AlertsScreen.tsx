// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { BellPlus, PencilLine } from 'lucide-react';
import { Button, DataStateView, EmptyState, ErrorState, LoadingSkeleton, Panel, SectionHeading } from '../components/ui';
import { formatDateTime } from '../lib/format';
import type { AlertHistoryItem, AlertRecord, ScreenState, SymbolRecord } from '../types';

export function AlertsScreen({
  state,
  alerts,
  history,
  symbols,
  onOpenAlertModal,
}: {
  state: ScreenState;
  alerts: AlertRecord[];
  history: AlertHistoryItem[];
  symbols: SymbolRecord[];
  onOpenAlertModal: (symbolId: string, signalId?: string, alertId?: string) => void;
}) {
  const retryMockView = () => window.location.reload();

  return (
    <div className="space-y-8">
      <SectionHeading
        eyebrow="Alerts"
        title="Configured triggers and alert history"
        description="Desktop alerts are local, Telegram alerts use saved bot credentials, and email alerts use the saved SMTP delivery settings from API Keys."
        action={
          <Button onClick={() => onOpenAlertModal('BTCUSD')}>
            <BellPlus className="size-4" />
            New alert
          </Button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <Panel>
          <DataStateView
            state={state}
            isEmpty={alerts.length === 0}
            loading={<LoadingSkeleton rows={4} />}
            empty={<EmptyState title="No alerts configured" description="Create a desktop, Telegram, or email alert to populate this screen." action={<Button onClick={() => onOpenAlertModal('BTCUSD')}>Create alert</Button>} />}
            error={<ErrorState title="Alerts list unavailable" description="The configured alerts could not be loaded from the backend." onRetry={retryMockView} />}
            populated={
              <div className="space-y-3">
                {alerts.map((alert) => {
                  const symbol = symbols.find((entry) => entry.id === alert.symbolId);
                  return (
                    <div key={alert.id} className="rounded-3xl border border-border bg-white/[0.03] p-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center gap-3">
                            <p className="font-medium text-ink">{symbol?.symbol}</p>
                            <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${alert.status === 'armed' ? 'bg-buy/12 text-buy' : alert.status === 'paused' ? 'bg-hold/12 text-hold' : 'bg-watch/12 text-watch'}`}>{alert.status}</span>
                          </div>
                          <p className="text-sm text-muted">{alert.condition}</p>
                          <div className="text-xs text-muted">Channel: {alert.channel} · Last fired: {alert.lastFired ? formatDateTime(alert.lastFired) : 'Never'}</div>
                        </div>
                        <Button variant="secondary" onClick={() => onOpenAlertModal(alert.symbolId, undefined, alert.id)}>
                          <PencilLine className="size-4" />
                          Edit alert
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            }
          />
        </Panel>

        <Panel>
          <SectionHeading eyebrow="Recent history" title="Alert audit feed" description="Recent alert firings recorded by the local backend audit trail." />
          <div className="mt-5">
            <DataStateView
              state={state}
              isEmpty={history.length === 0}
              loading={<LoadingSkeleton rows={4} />}
              empty={<EmptyState title="No alert history yet" description="Recent firings will appear here once backend alerts have triggered." action={<Button variant="secondary" onClick={() => onOpenAlertModal('BTCUSD')}>Create alert</Button>} />}
              error={<ErrorState title="Alert history unavailable" description="The recent alert audit feed could not be loaded." onRetry={retryMockView} />}
              populated={
                <div className="space-y-3">
                  {history.map((item) => {
                    const symbol = symbols.find((entry) => entry.id === item.symbolId);
                    return (
                      <div key={item.id} className="rounded-2xl border border-border bg-white/[0.03] p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium text-ink">{symbol?.symbol}</p>
                          <span className="text-xs text-muted">{item.channel}</span>
                        </div>
                        <p className="mt-2 text-sm text-muted">{item.message}</p>
                        <p className="mt-3 text-xs text-muted">{formatDateTime(item.firedAt)} UTC</p>
                      </div>
                    );
                  })}
                </div>
              }
            />
          </div>
        </Panel>
      </div>
    </div>
  );
}