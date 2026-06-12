// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { clsx } from 'clsx';
import { AlertTriangle, CheckCircle2, Info, RefreshCcw, X } from 'lucide-react';
import { useEffect } from 'react';
import type { PropsWithChildren, ReactNode } from 'react';
import type { ScreenState, SignalType } from '../types';

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
}

export function Panel({ className, children }: PropsWithChildren<{ className?: string }>) {
  return (
    <section className={clsx('glass-panel rounded-3xl p-5 soft-ring', className)}>
      {children}
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">{eyebrow}</p>
        ) : null}
        <h2 className="text-2xl font-semibold tracking-tight text-ink">{title}</h2>
        {description ? <p className="max-w-3xl text-sm text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function DisclaimerChip({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={clsx(
        'inline-flex items-center gap-2 rounded-full border border-border bg-white/5 px-3 py-1 text-xs text-muted',
        compact ? 'max-w-full' : 'max-w-3xl',
      )}
    >
      <Info className="size-3.5 text-accent" />
      <span>Educational use only. Not financial advice.</span>
    </div>
  );
}

function signalTone(signal: SignalType) {
  if (signal === 'BUY_ZONE') return 'border-buy/30 bg-buy/12 text-buy';
  if (signal === 'SELL') return 'border-sell/30 bg-sell/12 text-sell';
  if (signal === 'HOLD' || signal === 'WAIT') return 'border-hold/30 bg-hold/12 text-hold';
  return 'border-watch/30 bg-watch/12 text-watch';
}

export function SignalChip({ signal, subdued = false }: { signal: SignalType; subdued?: boolean }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em]',
        signalTone(signal),
        subdued && 'opacity-60',
      )}
    >
      {signal.replace('_', ' ')}
    </span>
  );
}

export function ConfidenceRing({ value, size = 72 }: { value: number; size?: number }) {
  const hue =
    value >= 70 ? 'from-buy to-accent' : value >= 55 ? 'from-hold to-accent' : 'from-sell to-hold';
  return (
    <div
      className="relative grid place-items-center rounded-full"
      style={{
        width: size,
        height: size,
        background: `conic-gradient(${value >= 70 ? '#18c37f' : value >= 55 ? '#f0b84b' : '#f05b78'} ${value * 3.6}deg, rgba(255,255,255,0.08) 0deg)`,
      }}
    >
      <div className="grid size-[calc(100%-10px)] place-items-center rounded-full bg-surface text-center">
        <span
          className={clsx(
            'bg-gradient-to-br bg-clip-text text-lg font-semibold text-transparent',
            hue,
          )}
        >
          {value}
        </span>
      </div>
    </div>
  );
}

export function MetricStat({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: ReactNode;
  helper?: ReactNode;
  tone?: 'default' | 'buy' | 'sell' | 'hold' | 'watch';
}) {
  return (
    <div className="space-y-2 rounded-2xl border border-border bg-white/[0.03] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{label}</p>
      <div
        className={clsx(
          'metric-text text-2xl font-medium',
          tone === 'buy' && 'text-buy',
          tone === 'sell' && 'text-sell',
          tone === 'hold' && 'text-hold',
          tone === 'watch' && 'text-watch',
          (!tone || tone === 'default') && 'text-ink',
        )}
      >
        {value}
      </div>
      {helper ? <div className="text-sm text-muted">{helper}</div> : null}
    </div>
  );
}

export function Button({
  children,
  className,
  variant = 'primary',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'bg-accentStrong text-white hover:bg-accent',
        variant === 'secondary' && 'border border-border bg-white/5 text-ink hover:bg-white/10',
        variant === 'ghost' && 'text-muted hover:bg-white/5 hover:text-ink',
        variant === 'danger' && 'bg-sell text-white hover:bg-sell/90',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function PillTabs<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        'inline-flex flex-wrap gap-2 rounded-full border border-border bg-white/5 p-1',
        className,
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={clsx(
            'rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] transition',
            option.value === value
              ? 'bg-accentStrong text-white'
              : 'text-muted hover:bg-white/5 hover:text-ink',
          )}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-60 flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-border bg-white/[0.03] p-8 text-center">
      <div className="rounded-full border border-border bg-white/5 p-3 text-accent">
        <Info className="size-5" />
      </div>
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-ink">{title}</h3>
        <p className="max-w-md text-sm text-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  title,
  description,
  onRetry,
}: {
  title: string;
  description: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex min-h-60 flex-col items-center justify-center gap-4 rounded-3xl border border-sell/35 bg-sell/8 p-8 text-center">
      <div className="rounded-full border border-sell/40 bg-sell/12 p-3 text-sell">
        <AlertTriangle className="size-5" />
      </div>
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-ink">{title}</h3>
        <p className="max-w-md text-sm text-muted">{description}</p>
      </div>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          <RefreshCcw className="size-4" />
          Retry
        </Button>
      ) : null}
    </div>
  );
}

export function LoadingSkeleton({ rows = 4, chart = false }: { rows?: number; chart?: boolean }) {
  return (
    <div className="space-y-4 rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="flex items-center gap-3">
        <div className="size-2.5 animate-pulse rounded-full bg-accent/80" />
        <div className="h-3 w-32 animate-pulse rounded-full bg-white/15" />
      </div>
      {chart ? (
        <div className="h-64 animate-pulse rounded-3xl border border-white/8 bg-white/10" />
      ) : null}
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="flex animate-pulse items-center gap-4 rounded-2xl border border-white/6 bg-white/[0.04] px-3 py-3"
        >
          <div className="h-10 w-10 rounded-2xl bg-white/14" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 rounded-full bg-white/14" />
            <div className="h-3 w-2/3 rounded-full bg-white/10" />
          </div>
          <div className="h-6 w-20 rounded-full bg-white/14" />
        </div>
      ))}
    </div>
  );
}

export function DataStateView({
  state,
  isEmpty = false,
  populated,
  loading,
  empty,
  error,
}: {
  state: ScreenState;
  isEmpty?: boolean;
  populated: ReactNode;
  loading?: ReactNode;
  empty?: ReactNode;
  error?: ReactNode;
}) {
  const retryView = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  if (state === 'loading') return <>{loading ?? <LoadingSkeleton />}</>;
  if (state === 'error')
    return (
      <>
        {error ?? (
          <ErrorState
            title="View unavailable"
            description="This surface could not be loaded."
            onRetry={retryView}
          />
        )}
      </>
    );
  if (isEmpty)
    return (
      <>
        {empty ?? (
          <EmptyState
            title="Nothing here yet"
            description="No data is currently available for this view."
          />
        )}
      </>
    );
  return <>{populated}</>;
}

function useEscapeToClose(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);
}

export function Modal({
  open,
  title,
  description,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  useEscapeToClose(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div className="glass-panel relative flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col rounded-[28px] p-6">
        <div className="mb-6 flex shrink-0 items-start justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-xl font-semibold text-ink">{title}</h3>
            {description ? <p className="text-sm text-muted">{description}</p> : null}
          </div>
          <button
            type="button"
            aria-label="Close"
            className="rounded-full p-2 text-muted transition hover:bg-white/5 hover:text-ink"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="-mr-2 min-h-0 flex-1 overflow-y-auto pr-2">{children}</div>
      </div>
    </div>
  );
}

export function Drawer({
  open,
  title,
  description,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  useEscapeToClose(open, onClose);
  if (!open) return null;

  return (
    <div
      className={clsx('fixed inset-y-0 right-0 z-50 w-full max-w-2xl transition', 'translate-x-0')}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="glass-panel absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col rounded-l-[32px] p-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-xl font-semibold text-ink">{title}</h3>
            {description ? <p className="text-sm text-muted">{description}</p> : null}
          </div>
          <button
            type="button"
            className="rounded-full p-2 text-muted transition hover:bg-white/5 hover:text-ink"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal open={open} title={title} description={description} onClose={onClose}>
      <div className="space-y-5">
        <div className="rounded-3xl border border-hold/30 bg-hold/10 p-4 text-sm text-muted">
          Live trading remains disabled by default. This mock only allows paper execution.
          Confirming here changes the settings view, not the execution path.
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            <AlertTriangle className="size-4" />
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function ToastLayer({ toasts }: { toasts: ToastMessage[] }) {
  return (
    <div className="pointer-events-none fixed bottom-20 right-4 z-[60] flex w-full max-w-sm flex-col gap-3 sm:bottom-6">
      {toasts.map((toast) => (
        <div key={toast.id} className="glass-panel pointer-events-auto rounded-3xl p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-full border border-buy/30 bg-buy/12 p-2 text-buy">
              <CheckCircle2 className="size-4" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-ink">{toast.title}</p>
              {toast.description ? <p className="text-xs text-muted">{toast.description}</p> : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
