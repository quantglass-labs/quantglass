// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useMemo, useRef } from 'react';

import { KeyRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
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
        titleKey: 'settings.keys.sectionProvidersTitle',
        descKey: 'settings.keys.sectionProvidersDesc',
        items: apiKeys.filter(
          (field) => !telegramIds.has(field.id) && !emailIds.has(field.id) && !aiIds.has(field.id),
        ),
      },
      {
        id: 'ai',
        titleKey: 'settings.keys.sectionAiTitle',
        descKey: 'settings.keys.sectionAiDesc',
        items: apiKeys.filter((field) => aiIds.has(field.id)),
      },
      {
        id: 'telegram',
        titleKey: 'settings.keys.sectionTelegramTitle',
        descKey: 'settings.keys.sectionTelegramDesc',
        items: apiKeys.filter((field) => telegramIds.has(field.id)),
      },
      {
        id: 'email',
        titleKey: 'settings.keys.sectionEmailTitle',
        descKey: 'settings.keys.sectionEmailDesc',
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
        {t('settings.keys.notifTestsHint')}
        <div className="mt-4">
          <Button variant="secondary" onClick={() => onTestNotification('desktop')}>
            {t('settings.keys.sendDesktopTest')}
          </Button>
        </div>
      </div>
      <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              {t('settings.keys.providerSetupMap')}
            </p>
            <p className="mt-2 text-sm text-muted">{t('settings.keys.providerSetupMapDesc')}</p>
          </div>
          <Button variant="secondary" onClick={() => onGoToProviders()}>
            {t('settings.keys.advancedProviders')}
          </Button>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {providerSetupRows.map((row) => {
            const isFocused = row === focusedProviderSetup;
            const registryName = row.entry?.name ?? row.id;
            const status = row.status ?? {
              label: t('settings.keys.registryOffline'),
              tone: 'text-muted',
              detail: t('settings.keys.registryOfflineDetail'),
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
                <p className="mt-3 text-xs text-muted">
                  {t('settings.keys.registryEntry', { name: registryName })}
                </p>
                <p className="mt-2 text-xs text-muted">
                  {t('settings.keys.requiredKeys', {
                    keys:
                      row.fields.map((field) => field.label).join(', ') || row.keyIds.join(', '),
                  })}
                </p>
                <p className="mt-2 text-xs text-muted">{status.detail}</p>
                {row.missingFields.length ? (
                  <p className="mt-2 text-xs text-hold">
                    {t('settings.keys.missing', {
                      fields: row.missingFields.map((field) => field.label).join(', '),
                    })}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-buy">{t('settings.keys.allKeysSaved')}</p>
                )}
                <Button variant="ghost" className="mt-3" onClick={() => goToProviderSetup(row.id)}>
                  {t('settings.keys.showKeyFields')}
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
              {t(section.titleKey)}
            </p>
            <p className="mt-2 text-sm text-muted">{t(section.descKey)}</p>
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
                      ? t('settings.keys.configured')
                      : t('settings.keys.notConfigured')
                    : field.value || t('settings.keys.notConfigured')}
                </div>
                <label className="mt-4 block space-y-2 text-sm text-muted">
                  <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
                    {field.secret && field.configured
                      ? t('settings.keys.newValue')
                      : t('settings.keys.storedValue')}
                  </span>
                  <input
                    className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                    type={field.secret ? 'password' : 'text'}
                    autoComplete="off"
                    placeholder={
                      field.secret && field.configured
                        ? t('settings.keys.keepBlankPlaceholder')
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
                    {t('settings.keys.saveKey')}
                  </Button>
                  {field.secret && field.configured ? (
                    <Button variant="danger" onClick={() => onSaveApiKey(field.id, '')}>
                      {t('settings.keys.clearKey')}
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
                      {notificationTestFieldMap[field.id] === 'telegram'
                        ? t('settings.keys.sendTelegramTest')
                        : t('settings.keys.sendEmailTest')}
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
                    {t('settings.keys.reset')}
                  </Button>
                </div>
                {field.tradeEnabled ? (
                  <p className="mt-2 text-xs text-hold">{t('settings.keys.tradeEnabledKey')}</p>
                ) : (
                  <p className="mt-2 text-xs text-muted">
                    {t('settings.keys.providerScopeSetting')}
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
