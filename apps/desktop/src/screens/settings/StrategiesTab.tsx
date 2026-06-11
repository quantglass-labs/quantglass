// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useRef, useState } from 'react';

import { Download, Trash2, Upload } from 'lucide-react';

import { Button, EmptyState } from '../../components/ui';
import { formatDateTime } from '../../lib/format';
import type { SavedStrategy, Timeframe } from '../../types';

function normalizeTimeframe(value: unknown): Timeframe | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  const validTimeframes: Timeframe[] = ['15m', '1h', '4h', '1d'];
  return validTimeframes.includes(normalized as Timeframe) ? (normalized as Timeframe) : null;
}

function normalizeSavedStrategy(value: unknown, index: number): SavedStrategy | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<SavedStrategy> & {
    symbol?: unknown;
    symbol_id?: unknown;
    setup?: unknown;
    setup_type?: unknown;
    strategy?: unknown;
    saved_at?: unknown;
  };
  const symbolId =
    typeof candidate.symbolId === 'string'
      ? candidate.symbolId
      : typeof candidate.symbol_id === 'string'
        ? candidate.symbol_id
        : typeof candidate.symbol === 'string'
          ? candidate.symbol
          : '';
  const setupType =
    typeof candidate.setupType === 'string'
      ? candidate.setupType
      : typeof candidate.setup_type === 'string'
        ? candidate.setup_type
        : typeof candidate.setup === 'string'
          ? candidate.setup
          : typeof candidate.strategy === 'string'
            ? candidate.strategy
            : '';
  const timeframe = normalizeTimeframe(candidate.timeframe);
  if (!symbolId.trim() || !setupType.trim() || !timeframe) return null;

  const savedAt =
    typeof candidate.savedAt === 'string' && candidate.savedAt.trim()
      ? candidate.savedAt
      : typeof candidate.saved_at === 'string' && candidate.saved_at.trim()
        ? candidate.saved_at
        : new Date().toISOString();
  const id =
    typeof candidate.id === 'string' && candidate.id.trim()
      ? candidate.id.trim()
      : `${symbolId}-${setupType}-${timeframe}-${Date.now()}-${index}`
          .toLowerCase()
          .replace(/[^a-z0-9_-]+/g, '-')
          .slice(0, 96);
  const name =
    typeof candidate.name === 'string' && candidate.name.trim()
      ? candidate.name.trim()
      : `${symbolId.trim()} ${setupType.trim()}`;
  return {
    id,
    name,
    symbolId: symbolId.trim().toUpperCase(),
    setupType: setupType.trim(),
    timeframe,
    savedAt,
  };
}

export function StrategiesTab({
  savedStrategies,
  onDeleteSavedStrategy,
  onImportSavedStrategies,
}: {
  savedStrategies: SavedStrategy[];
  onDeleteSavedStrategy: (strategyId: string) => void;
  onImportSavedStrategies: (strategies: SavedStrategy[]) => void;
}) {
  const [strategyTransferStatus, setStrategyTransferStatus] = useState('');
  const [selectedStrategyIds, setSelectedStrategyIds] = useState<Set<string>>(new Set());
  const strategyImportRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setSelectedStrategyIds((current) => {
      const availableIds = new Set(savedStrategies.map((strategy) => strategy.id));
      const retainedIds = Array.from(current).filter((id) => availableIds.has(id));
      if (current.size === 0 || retainedIds.length === 0) {
        return new Set(savedStrategies.map((strategy) => strategy.id));
      }
      return new Set(retainedIds);
    });
  }, [savedStrategies]);

  async function exportSavedStrategies() {
    const strategiesToExport = savedStrategies.filter((strategy) =>
      selectedStrategyIds.has(strategy.id),
    );
    if (!strategiesToExport.length) {
      setStrategyTransferStatus('Select at least one strategy before exporting.');
      return;
    }
    const filename = `quantglass-strategies-${new Date().toISOString().slice(0, 10)}.json`;
    const contents = JSON.stringify(
      {
        schema: 'quantglass.saved-strategies.v1',
        exportedAt: new Date().toISOString(),
        items: strategiesToExport,
      },
      null,
      2,
    );
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const selectedPath = await save({
        defaultPath: filename,
        filters: [{ name: 'QuantGlass strategy JSON', extensions: ['json'] }],
        title: 'Export QuantGlass strategies',
      });
      if (!selectedPath) {
        setStrategyTransferStatus('Export canceled.');
        return;
      }
      const { invoke } = await import('@tauri-apps/api/core');
      const path = await invoke<string>('save_json_export', { path: selectedPath, contents });
      setStrategyTransferStatus(
        `Exported ${strategiesToExport.length} selected strateg${strategiesToExport.length === 1 ? 'y' : 'ies'} to ${path}`,
      );
      return;
    } catch {
      // Browser fallback for non-Tauri preview sessions.
    }

    const blob = new Blob([contents], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStrategyTransferStatus(
      `Exported ${strategiesToExport.length} selected strateg${strategiesToExport.length === 1 ? 'y' : 'ies'} through browser download.`,
    );
  }

  async function importSavedStrategies(file: File | null) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const candidates = Array.isArray(parsed)
        ? parsed
        : parsed &&
            typeof parsed === 'object' &&
            Array.isArray((parsed as { items?: unknown }).items)
          ? (parsed as { items: unknown[] }).items
          : parsed &&
              typeof parsed === 'object' &&
              Array.isArray((parsed as { strategies?: unknown }).strategies)
            ? (parsed as { strategies: unknown[] }).strategies
            : parsed && typeof parsed === 'object'
              ? [parsed]
              : [];
      const strategies = candidates
        .map((candidate, index) => normalizeSavedStrategy(candidate, index))
        .filter((strategy): strategy is SavedStrategy => Boolean(strategy));
      setStrategyTransferStatus(
        strategies.length
          ? `Importing ${strategies.length} strateg${strategies.length === 1 ? 'y' : 'ies'}...`
          : 'No valid strategies found in the selected file.',
      );
      onImportSavedStrategies(strategies);
    } catch {
      setStrategyTransferStatus('Import failed because the selected file is not valid JSON.');
      onImportSavedStrategies([]);
    } finally {
      if (strategyImportRef.current) {
        strategyImportRef.current.value = '';
      }
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border bg-white/[0.03] p-4">
        <div>
          <p className="font-medium text-ink">Strategy library</p>
          <p className="text-sm text-muted">
            Persisted backtest strategies can be exported, imported, or removed from backend
            storage.
          </p>
          {savedStrategies.length ? (
            <p className="mt-2 text-xs text-muted">
              {savedStrategies.filter((strategy) => selectedStrategyIds.has(strategy.id)).length} of{' '}
              {savedStrategies.length} selected for export.
            </p>
          ) : null}
          {strategyTransferStatus ? (
            <p className="mt-2 text-xs text-accent">{strategyTransferStatus}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={strategyImportRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => void importSavedStrategies(event.target.files?.[0] ?? null)}
          />
          <Button variant="secondary" onClick={() => strategyImportRef.current?.click()}>
            <Upload className="size-4" />
            Import
          </Button>
          <Button
            variant="secondary"
            disabled={
              !savedStrategies.length ||
              !savedStrategies.some((strategy) => selectedStrategyIds.has(strategy.id))
            }
            onClick={() => void exportSavedStrategies()}
          >
            <Download className="size-4" />
            Export
          </Button>
        </div>
      </div>
      {savedStrategies.length ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              onClick={() =>
                setSelectedStrategyIds(new Set(savedStrategies.map((strategy) => strategy.id)))
              }
            >
              Select all
            </Button>
            <Button variant="ghost" onClick={() => setSelectedStrategyIds(new Set())}>
              Clear selection
            </Button>
          </div>
          {savedStrategies.map((strategy) => (
            <div key={strategy.id} className="rounded-3xl border border-border bg-white/[0.03] p-4">
              <div className="flex items-start justify-between gap-4">
                <label className="flex min-w-0 flex-1 items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 accent-accent"
                    checked={selectedStrategyIds.has(strategy.id)}
                    onChange={(event) => {
                      setSelectedStrategyIds((current) => {
                        const next = new Set(current);
                        if (event.target.checked) {
                          next.add(strategy.id);
                        } else {
                          next.delete(strategy.id);
                        }
                        return next;
                      });
                    }}
                  />
                  <span className="min-w-0">
                    <span className="block font-medium text-ink">{strategy.name}</span>
                    <span className="mt-2 block text-sm text-muted">
                      {strategy.symbolId} · {strategy.setupType} · {strategy.timeframe}
                    </span>
                    <span className="mt-2 block text-xs text-muted">
                      Saved {formatDateTime(strategy.savedAt)} UTC
                    </span>
                  </span>
                </label>
                <div>
                  <Button
                    variant="danger"
                    title={`Delete ${strategy.name}`}
                    onClick={() => onDeleteSavedStrategy(strategy.id)}
                  >
                    <Trash2 className="size-4" />
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No strategies saved"
          description="Use Backtesting → Save strategy to populate this tab or import a QuantGlass strategy JSON file."
        />
      )}
    </div>
  );
}
