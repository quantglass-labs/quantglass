// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { ApiKeyField, ProviderRegistryEntry } from '../../types';

export interface ProviderSetupRow {
  id: string;
  label: string;
  description: string;
  keyIds: string[];
  entry: ProviderRegistryEntry | null | undefined;
  fields: ApiKeyField[];
  missingFields: ApiKeyField[];
  status: { label: string; tone: string; detail: string } | null;
}
