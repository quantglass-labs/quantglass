// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { ExternalLink, Scale } from 'lucide-react';
import { useTranslation } from 'react-i18next';

async function openExternalLink(url: string) {
  try {
    const { open } = await import('@tauri-apps/plugin-shell');
    await open(url);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export function LegalTab() {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-medium text-ink">{t('settings.legal.communityTitle')}</p>
            <p className="mt-2 text-sm text-muted">{t('settings.legal.communityDesc')}</p>
          </div>
          <Scale className="size-5 text-accent" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
          <p className="font-medium text-ink">{t('settings.legal.sourceTitle')}</p>
          <p className="mt-2 text-sm text-muted">{t('settings.legal.sourceDesc')}</p>
          <button
            type="button"
            className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-accent hover:text-ink"
            onClick={() => void openExternalLink('https://github.com/quantglass-labs/quantglass')}
          >
            {t('settings.legal.githubRepo')}
            <ExternalLink className="size-4" />
          </button>
        </div>
        <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
          <p className="font-medium text-ink">{t('settings.legal.documents')}</p>
          <div className="mt-3 grid gap-2 text-sm">
            <button
              type="button"
              className="inline-flex items-center gap-2 text-accent hover:text-ink"
              onClick={() =>
                void openExternalLink(
                  'https://github.com/quantglass-labs/quantglass/blob/main/LICENSE',
                )
              }
            >
              {t('settings.legal.agplLicense')} <ExternalLink className="size-4" />
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 text-accent hover:text-ink"
              onClick={() =>
                void openExternalLink(
                  'https://github.com/quantglass-labs/quantglass/blob/main/COMMERCIAL-LICENSE.md',
                )
              }
            >
              {t('settings.legal.commercialLicensing')} <ExternalLink className="size-4" />
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 text-accent hover:text-ink"
              onClick={() =>
                void openExternalLink(
                  'https://github.com/quantglass-labs/quantglass/blob/main/DISCLAIMER.md',
                )
              }
            >
              {t('settings.legal.financialDisclaimer')} <ExternalLink className="size-4" />
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 text-accent hover:text-ink"
              onClick={() =>
                void openExternalLink(
                  'https://github.com/quantglass-labs/quantglass/blob/main/THIRD-PARTY-NOTICES.md',
                )
              }
            >
              {t('settings.legal.thirdParty')} <ExternalLink className="size-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-watch/25 bg-watch/10 p-4 text-sm text-muted">
        {t('settings.legal.disclaimer')}
      </div>
    </div>
  );
}
