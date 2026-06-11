// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { ExternalLink, Scale } from 'lucide-react';

async function openExternalLink(url: string) {
  try {
    const { open } = await import('@tauri-apps/plugin-shell');
    await open(url);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export function LegalTab() {
  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-medium text-ink">QuantGlass Community Edition</p>
            <p className="mt-2 text-sm text-muted">
              Licensed under AGPL-3.0-or-later. You may use, study, modify, and redistribute this
              software under the AGPL. Commercial licenses are available for proprietary embedding,
              closed-source redistribution, hosted products, and enterprise support.
            </p>
          </div>
          <Scale className="size-5 text-accent" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
          <p className="font-medium text-ink">Source code</p>
          <p className="mt-2 text-sm text-muted">
            The complete corresponding source for this build is available from the public
            repository.
          </p>
          <button
            type="button"
            className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-accent hover:text-ink"
            onClick={() => void openExternalLink('https://github.com/quantglass-labs/quantglass')}
          >
            GitHub repository
            <ExternalLink className="size-4" />
          </button>
        </div>
        <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
          <p className="font-medium text-ink">Legal documents</p>
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
              AGPL license <ExternalLink className="size-4" />
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
              Commercial licensing <ExternalLink className="size-4" />
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
              Financial disclaimer <ExternalLink className="size-4" />
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
              Third-party notices <ExternalLink className="size-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-watch/25 bg-watch/10 p-4 text-sm text-muted">
        QuantGlass is research and decision-support software. It is not financial advice, an
        investment adviser, a broker-dealer, or a promise of trading performance.
      </div>
    </div>
  );
}
