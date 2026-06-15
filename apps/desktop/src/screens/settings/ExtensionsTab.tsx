// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useMemo, useState } from 'react';

import { Plug } from 'lucide-react';

import { Button, EmptyState } from '../../components/ui';
import { backendClient, type ExtensionsEnabledState } from '../../lib/backend';

import type {
  ExtensionRegistryEntry,
  ExtensionSurfaceEntry,
  IndicatorRegistryEntry,
  StrategyRegistryEntry,
} from '../../types';

export function ExtensionsTab({
  extensionRegistry,
  extensionSurfaces,
  extensionStrategies,
  extensionIndicators,
  extensionSettingsById,
  onUpdateExtensionSettings,
  onUpdateExtensionEnabled,
}: {
  extensionRegistry: ExtensionRegistryEntry[];
  extensionSurfaces: ExtensionSurfaceEntry[];
  extensionStrategies: StrategyRegistryEntry[];
  extensionIndicators: IndicatorRegistryEntry[];
  extensionSettingsById: Record<string, Record<string, unknown>>;
  onUpdateExtensionSettings: (extensionId: string, settings: Record<string, unknown>) => void;
  onUpdateExtensionEnabled: (extensionId: string, enabled: boolean) => void;
}) {
  const [draftExtensionSettings, setDraftExtensionSettings] = useState<
    Record<string, Record<string, unknown>>
  >({});

  const [extensionsState, setExtensionsState] = useState<ExtensionsEnabledState | null>(null);
  const [extensionsBusy, setExtensionsBusy] = useState(false);
  useEffect(() => {
    backendClient
      .getExtensionsEnabled()
      .then(setExtensionsState)
      .catch(() => setExtensionsState(null));
  }, []);
  const toggleExtensions = async () => {
    if (!extensionsState || extensionsBusy) return;
    setExtensionsBusy(true);
    try {
      setExtensionsState(await backendClient.setExtensionsEnabled(!extensionsState.enabled));
    } catch {
      // Leave the prior state; the switch simply doesn't move.
    } finally {
      setExtensionsBusy(false);
    }
  };

  const [prevExtensionRegistry, setPrevExtensionRegistry] = useState(extensionRegistry);
  if (prevExtensionRegistry !== extensionRegistry) {
    setPrevExtensionRegistry(extensionRegistry);
    setDraftExtensionSettings(
      Object.fromEntries(
        extensionRegistry.map((extension) => [
          extension.id,
          {
            ...Object.fromEntries(
              extension.settings
                .filter((setting) => setting.key !== 'enabled')
                .map((setting) => [setting.key, setting.default ?? '']),
            ),
            ...Object.fromEntries(
              Object.entries(extensionSettingsById[extension.id] ?? {}).filter(
                ([key]) => key !== 'enabled',
              ),
            ),
          },
        ]),
      ),
    );
  }

  const extensionIndicatorGroups = useMemo(() => {
    const groups = new Map<string, IndicatorRegistryEntry[]>();
    extensionIndicators.forEach((indicator) => {
      groups.set(indicator.category, [...(groups.get(indicator.category) ?? []), indicator]);
    });
    return Array.from(groups.entries()).sort(([left], [right]) => left.localeCompare(right));
  }, [extensionIndicators]);
  const computedIndicatorCount = useMemo(
    () => extensionIndicators.filter((indicator) => indicator.maturity === 'computed').length,
    [extensionIndicators],
  );

  const extensionSurfaceGroups = useMemo(() => {
    const groups = new Map<ExtensionSurfaceEntry['category'], ExtensionSurfaceEntry[]>();
    extensionSurfaces.forEach((surface) => {
      groups.set(surface.category, [...(groups.get(surface.category) ?? []), surface]);
    });
    return Array.from(groups.entries()).sort(([left], [right]) => left.localeCompare(right));
  }, [extensionSurfaces]);

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-medium text-ink">Extension registry</p>
            <p className="mt-2 text-sm text-muted">
              Installed Python entry-point extensions can register providers, model gateways,
              indicators, strategies, and notification channels. External extension loading is off
              by default and only loads code you have explicitly installed.
            </p>
            {extensionsState ? (
              <div className="mt-3 rounded-2xl border border-border bg-white/[0.02] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-ink">Load extensions</p>
                    <p className="text-xs text-muted">
                      {extensionsState.active
                        ? 'Extensions are loaded in this session.'
                        : 'Extensions are not loaded in this session.'}
                    </p>
                  </div>
                  <Button
                    variant={extensionsState.enabled ? 'primary' : 'secondary'}
                    className="px-3 py-1.5 text-xs"
                    disabled={extensionsBusy}
                    onClick={() => void toggleExtensions()}
                  >
                    {extensionsState.enabled ? 'On' : 'Off'}
                  </Button>
                </div>
                {extensionsState.restartRequired ? (
                  <p className="mt-2 text-xs text-amber-300">
                    Restart QuantGlass to apply — the setting is read when the engine starts.
                  </p>
                ) : null}
              </div>
            ) : null}
            <ul className="mt-3 space-y-1 text-sm text-muted">
              <li>
                <span className="text-ink">Where extensions act:</span> provider extensions join the
                data routing on the Providers tab; strategy extensions appear as setup presets on
                the Backtesting screen and feed the signal engine;
              </li>
              <li>
                indicator extensions register alongside the built-in catalog below; lesson packs add
                tracks to the Academy (Learn) and mission packs add challenges to Missions — both as
                validated content that can never run code;
              </li>
              <li>
                notification extensions add alert delivery channels. Two example packs ship in the
                repo's <span className="text-ink">extensions/</span> folder to copy from.
              </li>
            </ul>
          </div>
          <Plug className="size-5 text-accent" />
        </div>
      </div>
      {extensionRegistry.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {extensionRegistry.map((extension) => {
            const extensionSettings = extension.settings.filter(
              (setting) => setting.key !== 'enabled',
            );
            const isLoaderNotice = extension.id === 'python-entry-points' && !extension.loaded;
            return (
              <div
                key={extension.id}
                className="rounded-3xl border border-border bg-white/[0.03] p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium text-ink">{extension.name}</p>
                    <p className="mt-1 text-xs text-muted">
                      {extension.id} · v{extension.version}
                    </p>
                  </div>
                  <span
                    className={`rounded-full border border-border px-2.5 py-1 text-xs ${extension.loaded ? 'text-buy' : 'text-muted'}`}
                  >
                    {extension.loaded ? 'loaded' : 'inactive'}
                  </span>
                </div>
                <p className="mt-3 text-sm text-muted">{extension.description}</p>
                {extension.trust ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] ${
                        extension.trust.level === 'trusted-content'
                          ? 'border-buy/35 text-buy'
                          : extension.trust.level === 'caution'
                            ? 'border-sell/35 text-sell'
                            : 'border-border text-muted'
                      }`}
                    >
                      {extension.trust.level}
                    </span>
                    {extension.trust.labels.map((label) => (
                      <span
                        key={label}
                        className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                ) : null}
                {extension.trust?.findings.length ? (
                  <ul className="mt-2 space-y-1 text-xs text-hold">
                    {extension.trust.findings.map((finding) => (
                      <li key={finding}>⚠ {finding}</li>
                    ))}
                  </ul>
                ) : null}
                <p className="mt-3 text-xs text-muted">
                  Capabilities: {extension.capabilities.join(', ') || 'none'}
                </p>
                <p className="mt-2 text-xs text-muted">
                  Permissions: {extension.permissions.join(', ') || 'none'}
                </p>
                <p className="mt-2 text-xs text-muted">
                  Settings:{' '}
                  {extensionSettings.length
                    ? extensionSettings.map((setting) => setting.key).join(', ')
                    : 'none'}
                </p>
                {isLoaderNotice ? (
                  <div className="mt-4 rounded-2xl border border-hold/30 bg-hold/10 px-4 py-3 text-sm text-hold">
                    Extension code loading is off. Restart the backend with{' '}
                    <code className="rounded-md bg-black/20 px-1.5 py-0.5 text-xs">
                      npm run backend:dev:extensions
                    </code>{' '}
                    to discover trusted local packs and installed entry points.
                  </div>
                ) : (
                  <div className="mt-4 flex items-center justify-between rounded-2xl border border-border bg-surface/40 px-4 py-3 text-sm text-muted">
                    <span>{extension.enabled ? 'Enabled after backend restart' : 'Disabled'}</span>
                    <button
                      type="button"
                      className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${extension.enabled ? 'bg-buy/12 text-buy' : 'bg-white/8 text-muted'}`}
                      onClick={() => onUpdateExtensionEnabled(extension.id, !extension.enabled)}
                    >
                      {extension.enabled ? 'On' : 'Off'}
                    </button>
                  </div>
                )}
                {extensionSettings.length ? (
                  <div className="mt-4 space-y-3">
                    {extensionSettings.map((setting) => (
                      <label key={setting.key} className="block space-y-2 text-sm text-muted">
                        <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
                          {setting.label}
                        </span>
                        {setting.type === 'boolean' ? (
                          <select
                            className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                            value={String(
                              draftExtensionSettings[extension.id]?.[setting.key] ??
                                setting.default ??
                                false,
                            )}
                            onChange={(event) =>
                              setDraftExtensionSettings((current) => ({
                                ...current,
                                [extension.id]: {
                                  ...(current[extension.id] ?? {}),
                                  [setting.key]: event.target.value === 'true',
                                },
                              }))
                            }
                          >
                            <option value="false">false</option>
                            <option value="true">true</option>
                          </select>
                        ) : setting.type === 'select' ? (
                          <select
                            className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                            value={String(
                              draftExtensionSettings[extension.id]?.[setting.key] ??
                                setting.default ??
                                '',
                            )}
                            onChange={(event) =>
                              setDraftExtensionSettings((current) => ({
                                ...current,
                                [extension.id]: {
                                  ...(current[extension.id] ?? {}),
                                  [setting.key]: event.target.value,
                                },
                              }))
                            }
                          >
                            {setting.options.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            className="w-full rounded-2xl border border-border bg-white/[0.04] px-4 py-3 text-ink outline-none"
                            type={
                              setting.type === 'secret'
                                ? 'password'
                                : setting.type === 'number'
                                  ? 'number'
                                  : 'text'
                            }
                            value={String(
                              draftExtensionSettings[extension.id]?.[setting.key] ??
                                setting.default ??
                                '',
                            )}
                            onChange={(event) =>
                              setDraftExtensionSettings((current) => ({
                                ...current,
                                [extension.id]: {
                                  ...(current[extension.id] ?? {}),
                                  [setting.key]:
                                    setting.type === 'number'
                                      ? Number(event.target.value)
                                      : event.target.value,
                                },
                              }))
                            }
                          />
                        )}
                        {setting.description ? (
                          <span className="block text-xs text-muted">{setting.description}</span>
                        ) : null}
                      </label>
                    ))}
                    <Button
                      onClick={() =>
                        onUpdateExtensionSettings(
                          extension.id,
                          draftExtensionSettings[extension.id] ?? {},
                        )
                      }
                    >
                      Save extension settings
                    </Button>
                  </div>
                ) : null}
                {extension.diagnostics.length ? (
                  <p className="mt-3 text-xs text-hold">{extension.diagnostics.join(' ')}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="No extensions reported"
          description="The backend did not return extension registry metadata."
        />
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium text-ink">Registered strategies</p>
              <p className="mt-2 text-sm text-muted">
                Backtesting uses this registry. Extension strategies appear here and can contribute
                matching setup presets.
              </p>
            </div>
            <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted">
              {extensionStrategies.length}
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {extensionStrategies.map((strategy) => (
              <div key={strategy.id} className="rounded-2xl border border-border bg-surface/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-ink">{strategy.name}</p>
                  <div className="flex flex-wrap gap-1">
                    {strategy.executable ? (
                      <span className="rounded-full border border-buy/30 bg-buy/10 px-2 py-0.5 text-[11px] text-buy">
                        executable
                      </span>
                    ) : null}
                    <span
                      className={`rounded-full border border-border px-2 py-0.5 text-[11px] ${strategy.source === 'extension' ? 'text-accent' : 'text-muted'}`}
                    >
                      {strategy.source}
                    </span>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted">{strategy.description}</p>
                <p className="mt-2 text-xs text-muted">Setups: {strategy.setup_types.join(', ')}</p>
                <p className="mt-1 text-xs text-muted">
                  Markets: {strategy.market_types.join(', ')} / Timeframes:{' '}
                  {strategy.timeframes.join(', ')}
                </p>
                {strategy.extension_id ? (
                  <p className="mt-1 text-xs text-accent">Extension: {strategy.extension_id}</p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium text-ink">Indicator catalog</p>
              <p className="mt-2 text-sm text-muted">
                Computed indicators feed signals and backtests now. Catalog indicators are
                documented contribution targets for community packs and future chart overlays.
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted">
                {extensionIndicators.length} total
              </span>
              <span className="rounded-full border border-buy/30 bg-buy/10 px-2.5 py-1 text-xs text-buy">
                {computedIndicatorCount} computed
              </span>
              <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted">
                {extensionIndicators.length - computedIndicatorCount} catalog
              </span>
            </div>
          </div>
          <div className="mt-4 space-y-4">
            {extensionIndicatorGroups.map(([category, indicators]) => (
              <div key={category} className="rounded-2xl border border-border bg-surface/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                    {category.replaceAll('_', ' ')}
                  </p>
                  <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
                    {indicators.length}
                  </span>
                </div>
                <div className="mt-3 grid gap-3">
                  {indicators.map((indicator) => (
                    <div
                      key={indicator.id}
                      className="rounded-2xl border border-border bg-white/[0.03] p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium text-ink">{indicator.name}</p>
                        <div className="flex flex-wrap gap-1">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[11px] ${indicator.maturity === 'computed' ? 'border-buy/30 bg-buy/10 text-buy' : 'border-border text-muted'}`}
                          >
                            {indicator.maturity ?? 'catalog'}
                          </span>
                          <span
                            className={`rounded-full border border-border px-2 py-0.5 text-[11px] ${indicator.source === 'extension' ? 'text-accent' : 'text-muted'}`}
                          >
                            {indicator.source}
                          </span>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-muted">{indicator.description}</p>
                      <p className="mt-2 text-xs text-muted">
                        Inputs: {indicator.inputs.join(', ') || 'none'} / Outputs:{' '}
                        {indicator.outputs.join(', ') || 'none'}
                      </p>
                      {indicator.families?.length ? (
                        <p className="mt-1 text-xs text-muted">
                          Families: {indicator.families.join(', ')}
                        </p>
                      ) : null}
                      {indicator.extension_id ? (
                        <p className="mt-1 text-xs text-accent">
                          Extension: {indicator.extension_id}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="rounded-3xl border border-border bg-white/[0.03] p-4">
        <p className="font-medium text-ink">Contribution surfaces</p>
        <p className="mt-2 text-sm text-muted">
          Backend-declared extension points that contributors can target with providers, execution
          adapters, notifications, import/export flows, data-quality checks, and UI panels.
        </p>
        {extensionSurfaceGroups.length ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {extensionSurfaceGroups.map(([category, surfaces]) => (
              <div key={category} className="rounded-2xl border border-border bg-surface/40 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                  {category.replace('_', ' ')}
                </p>
                <div className="mt-3 space-y-3">
                  {surfaces.map((surface) => (
                    <div
                      key={surface.id}
                      className="rounded-2xl border border-border bg-white/[0.03] p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium text-ink">{surface.name}</p>
                        <span
                          className={`rounded-full border border-border px-2 py-0.5 text-[11px] ${surface.maturity === 'available' ? 'text-buy' : 'text-hold'}`}
                        >
                          {surface.maturity}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-muted">{surface.description}</p>
                      <p className="mt-2 text-xs text-muted">
                        Source: {surface.source}
                        {surface.extension_id ? ` / ${surface.extension_id}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No contribution surfaces reported"
            description="The backend did not return extension surface metadata."
          />
        )}
      </div>
    </div>
  );
}
