// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function sendNativeNotification(title: string, body: string): Promise<boolean> {
  if (!isTauriRuntime()) {
    return false;
  }

  try {
    const { isPermissionGranted, requestPermission, sendNotification } =
      await import('@tauri-apps/plugin-notification');
    const granted = (await isPermissionGranted()) || (await requestPermission()) === 'granted';
    if (!granted) {
      return false;
    }
    sendNotification({ title, body });
    return true;
  } catch {
    return false;
  }
}
