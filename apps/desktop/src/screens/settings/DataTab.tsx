// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Database, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/ui';
import { backendClient } from '../../lib/backend';

export function DataTab() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<null | 'sample' | 'clear'>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  async function loadSample() {
    setBusy('sample');
    try {
      await backendClient.loadSampleData();
      window.location.reload();
    } catch {
      setBusy(null);
    }
  }

  async function clearAll() {
    setBusy('clear');
    try {
      await backendClient.clearAllData();
      window.location.reload();
    } catch {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Database className="size-4" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-ink">{t('onboarding.sampleTitle')}</p>
            <p className="mt-1 text-sm text-muted">{t('onboarding.sampleDesc')}</p>
            <Button className="mt-3" onClick={loadSample} disabled={busy !== null}>
              {busy === 'sample' ? t('onboarding.loading') : t('onboarding.loadSample')}
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-sell/30 bg-sell/[0.04] p-4">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sell/15 text-sell">
            <Trash2 className="size-4" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-ink">{t('settings.data.clearTitle')}</p>
            <p className="mt-1 text-sm text-muted">{t('settings.data.clearDesc')}</p>
            {confirmClear ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="danger" onClick={clearAll} disabled={busy !== null}>
                  {busy === 'clear' ? t('settings.data.clearing') : t('settings.data.confirmClear')}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setConfirmClear(false)}
                  disabled={busy !== null}
                >
                  {t('common.cancel')}
                </Button>
              </div>
            ) : (
              <Button variant="secondary" className="mt-3" onClick={() => setConfirmClear(true)}>
                {t('settings.data.clearAll')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
