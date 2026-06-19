// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Sparkles, SquareDashed } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { backendClient } from '../lib/backend';
import { Button, Modal } from './ui';

/**
 * First-run choice so a new user never lands on blank screens, without breaking
 * the "zero market calls until you track a symbol" guarantee: loading the sample
 * setup is an explicit, opt-in action. Dismissing the dialog = "start empty".
 */
export function OnboardingDialog({ open, onDone }: { open: boolean; onDone: () => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<null | 'sample' | 'empty'>(null);

  async function startEmpty() {
    if (busy) return;
    setBusy('empty');
    try {
      await backendClient.setOnboardingCompleted(true);
    } catch {
      // Non-fatal: the prompt simply reappears next launch.
    }
    onDone();
  }

  async function loadSample() {
    if (busy) return;
    setBusy('sample');
    try {
      await backendClient.loadSampleData();
      // Reload so every screen picks up the seeded watchlist + derived data.
      window.location.reload();
    } catch {
      setBusy(null);
    }
  }

  return (
    <Modal
      open={open}
      title={t('onboarding.title')}
      description={t('onboarding.subtitle')}
      onClose={startEmpty}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col rounded-2xl border border-accent/40 bg-accentStrong/10 p-4">
          <div className="mb-2 flex size-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Sparkles className="size-4" />
          </div>
          <p className="text-sm font-semibold text-ink">{t('onboarding.sampleTitle')}</p>
          <p className="mt-1 flex-1 text-sm text-muted">{t('onboarding.sampleDesc')}</p>
          <Button className="mt-3 w-full" onClick={loadSample} disabled={busy !== null}>
            {busy === 'sample' ? t('onboarding.loading') : t('onboarding.loadSample')}
          </Button>
        </div>
        <div className="flex flex-col rounded-2xl border border-border bg-white/[0.03] p-4">
          <div className="mb-2 flex size-9 items-center justify-center rounded-xl bg-white/5 text-muted">
            <SquareDashed className="size-4" />
          </div>
          <p className="text-sm font-semibold text-ink">{t('onboarding.emptyTitle')}</p>
          <p className="mt-1 flex-1 text-sm text-muted">{t('onboarding.emptyDesc')}</p>
          <Button
            variant="secondary"
            className="mt-3 w-full"
            onClick={startEmpty}
            disabled={busy !== null}
          >
            {t('onboarding.startEmpty')}
          </Button>
        </div>
      </div>
      <p className="mt-4 text-xs text-muted">{t('onboarding.note')}</p>
    </Modal>
  );
}
