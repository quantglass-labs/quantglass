// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useMemo, useRef } from 'react';

import { KeyRound } from 'lucide-react';

import { Button } from '../../components/ui';
import type { ApiKeyField, NotificationTestChannel } from '../../types';
import type { ProviderSetupRow } from './types';

export function KeysTab({
  apiKeys,
  draftApiKeys,
  setDraftApiKeys,
  providerSetupRows,
  focusedProviderSetup,
  focusedProviderKeyIds,
  onSaveApiKey,
  onTestNotification,
  goToProviderSetup,
  onGoToProviders,
}: {
  apiKeys: ApiKeyField[];
  draftApiKeys: Record<string, string>;
  setDraftApiKeys: Dispatch<SetStateAction<Record<string, string>>>;
  providerSetupRows: ProviderSetupRow[];
  focusedProviderSetup: ProviderSetupRow | undefined;
  focusedProviderKeyIds: Set<string>;
  onSaveApiKey: (keyId: string, value: string) => void;
  onTestNotification: (channel: NotificationTestChannel) => void;
  goToProviderSetup: (rowId: string) => void;
  onGoToProviders: () => void;
}) {
  const keyFieldRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const apiKeySections = useMemo(() => {
    const telegramIds = new Set(['telegram-bot-token', 'telegram-chat-id']);
    const emailIds = new Set([
      'smtp-host',
      'smtp-port',
      'smtp-username',
      'smtp-password',
      'smtp-from-email',
      'smtp-to-email',
    ]);
    const aiIds = new Set([
      'openai-api-key',
      'openai-compatible-api-key',
      'anthropic-api-key',
      'google-gemini-api-key',
      'deepseek-api-key',
      'mistral-api-key',
      'groq-api-key',
      'openrouter-api-key',
      'together-api-key',
      'azure-openai-api-key',
      'aws-access-key-id',
      'aws-secret-access-key',
      'aws-session-token',
      'vertex-ai-access-token',
    ]);

    return [
      {
        id: 'providers',
        title: 'Provider credentials',
        description:
          'Market data and trading-provider credentials that affect registry availability and keyed transports.',
        items: apiKeys.filter(
          (field) => !telegramIds.has(field.id) && !emailIds.has(field.id) && !aiIds.has(field.id),
        ),
      },
      {
        id: 'ai',
        title: 'AI model gateways',
        description:
          'Optional keys for OpenAI or OpenAI-compatible model routers. Local Ollama and LM Studio do not need a key by default.',
        items: apiKeys.filter((field) => aiIds.has(field.id)),
      },
      {
        id: 'telegram',
        title: 'Telegram delivery',
        description:
          'Saved bot token and chat destination for Telegram alert delivery and test sends.',
        items: apiKeys.filter((field) => telegramIds.has(field.id)),
      },
      {
        id: 'email',
        title: 'Email delivery',
        description:
          'SMTP host, authentication, sender, and recipients used for email alerts and test sends.',
        items: apiKeys.filter((field) => emailIds.has(field.id)),
      },
    ].filter((section) => section.items.length > 0);
  }, [apiKeys]);

  useEffect(() => {
    if (!focusedProviderSetup) return;
    const firstKeyId = focusedProviderSetup.keyIds[0];
    window.setTimeout(() => {
      keyFieldRefs.current[firstKeyId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 75);
    // Scroll once per focus target; the id is the identity that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedProviderSetup?.id]);

  const notificationTestFieldMap: Partial<Record<string, NotificationTestChannel>> = {
    'telegram-chat-id': 'telegram',
    'smtp-to-email': 'email',
  };

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-border bg-white/[0.03] p-4 text-sm text-muted">
        Notification tests use saved backend values for Telegram and email. Save changes first, then
        test each delivery path.
        <div className="mt-4">
          <Button variant="secondary" onClick={() => onTestNotification('desktop')}>
            Send Desktop test
          </Button>
        </div>
      </div>
      <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              Provider setup map
            </p>
            <p className="mt-2 text-sm text-muted">
              These are the same keyed providers shown in Advanced Providers. Save the listed keys
              below to move a provider from needs setup to configured.
            </p>
          </div>
          <Button variant="secondary" onClick={() => onGoToProviders()}>
            Advanced Providers
          </Button>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {providerSetupRows.map((row) => {
            const isFocused = row === focusedProviderSetup;
            const registryName = row.entry?.name ?? row.id;
            const status = row.status ?? {
              label: 'registry offline',
              tone: 'text-muted',
              detail: 'Provider registry metadata is unavailable while the backend is offline.',
            };
            return (
              <div
                key={row.id}
                className={`rounded-2xl border p-4 text-sm ${isFocused ? 'border-accent/70 bg-accent/10' : 'border-border bg-surface/40'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink">{row.label}</p>
                    <p className="mt-1 text-xs text-muted">{row.description}</p>
                  </div>
                  <span
                    className={`rounded-full border border-border px-2.5 py-1 text-xs ${status.tone}`}
                  >
                    {status.label}
                  </span>
                </div>
                <p className="mt-3 text-xs text-muted">Registry entry: {registryName}</p>
                <p className="mt-2 text-xs text-muted">
                  Required keys:{' '}
                  {row.fields.map((field) => field.label).join(', ') || row.keyIds.join(', ')}
                </p>
                <p className="mt-2 text-xs text-muted">{status.detail}</p>
                {row.missingFields.length ? (
                  <p className="mt-2 text-xs text-hold">
                    Missing: {row.missingFields.map((field) => field.label).join(', ')}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-buy">All required keys are saved.</p>
                )}
                <Button variant="ghost" className="mt-3" onClick={() => goToProviderSetup(row.id)}>
                  Show key fields
                </Button>
              </div>
            );
          })}
        </div>
      </div>
      {apiKeySections.map((section) => (
        <div key={section.id} className="space-y-4">
          <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              {section.title}
            </p>
            <p className="mt-2 text-sm text-muted">{section.description}</p>
          </div>
          {section.items.map((field) => {
            const isFocusedKey = focusedProviderKeyIds.has(field.id);
            const draftValue = draftApiKeys[field.id] ?? '';
            const canSaveKey = !field.secret || Boolean(draftValue.trim());
            return (
              <div
                key={field.id}
                ref={(element) => {
                  keyFieldRefs.current[field.id] = element;
                }}
                className={`rounded-3xl border p-4 ${isFocusedKey ? 'border-accent/70 bg-accent/10' : 'border-border bg-white/[0.03]'}`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-ink">{field.label}</p>
                    <p className="text-sm text-muted">{field.note}</p>
                  </div>
                  <KeyRound className="size-5 text-accent" />
                </div>
                <div className="mt-4 rounded-2xl border border-border bg-surface/40 px-4 py-3 metric-text text-sm text-ink">
                  {field.secret
                    ? field.configured
                      ? 'Configured'
                      : 'Not configured'
                    : field.value || 'Not configured'}
                </div>
                <label className="mt-4 block space-y-2 text-sm text-muted">
                  <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
                    {field.secret && field.configured ? 'New value' : 'Stored value'}
                  </span>
                  <input
                    className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                    type={field.secret ? 'password' : 'text'}
                    autoComplete="off"
                    placeholder={
                      field.secret && field.configured
                        ? 'Leave blank to keep current saved key'
                        : ''
                    }
                    value={draftValue}
                    onChange={(event) =>
                      setDraftApiKeys((current) => ({
                        ...current,
                        [field.id]: event.target.value,
                      }))
                    }
                  />
                </label>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button disabled={!canSaveKey} onClick={() => onSaveApiKey(field.id, draftValue)}>
                    Save key
                  </Button>
                  {field.secret && field.configured ? (
                    <Button variant="danger" onClick={() => onSaveApiKey(field.id, '')}>
                      Clear key
                    </Button>
                  ) : null}
                  {notificationTestFieldMap[field.id] ? (
                    <Button
                      variant="ghost"
                      onClick={() =>
                        onTestNotification(
                          notificationTestFieldMap[field.id] as NotificationTestChannel,
                        )
                      }
                    >
                      Send{' '}
                      {notificationTestFieldMap[field.id] === 'telegram' ? 'Telegram' : 'Email'}{' '}
                      test
                    </Button>
                  ) : null}
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setDraftApiKeys((current) => ({
                        ...current,
                        [field.id]: field.secret ? '' : field.value,
                      }))
                    }
                  >
                    Reset
                  </Button>
                </div>
                {field.tradeEnabled ? (
                  <p className="mt-2 text-xs text-hold">Trade-enabled key</p>
                ) : (
                  <p className="mt-2 text-xs text-muted">
                    Provider, notification, or delivery-scope setting
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
