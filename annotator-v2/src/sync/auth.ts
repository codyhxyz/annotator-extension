/**
 * Auth state management — reads Clerk token from chrome.storage
 * (written by the auth page) and keeps the API client in sync.
 */

import { setAuthToken } from './api';

let refreshInterval: ReturnType<typeof setInterval> | null = null;

/** Read the stored Clerk token and set it on the API client. */
export async function loadToken(): Promise<string | null> {
  try {
    if (!chrome?.storage?.local) return null;
    const result = await chrome.storage.local.get(['clerkToken']);
    const token = result.clerkToken || null;
    setAuthToken(token);
    return token;
  } catch {
    return null;
  }
}

/** Start listening for token changes and keep the API client updated. Returns cleanup function. */
export function watchAuthState(onChange?: (signedIn: boolean) => void): () => void {
  loadToken().then(token => onChange?.(!!token));

  let storageListener: ((changes: Record<string, chrome.storage.StorageChange>, area: string) => void) | null = null;
  try {
    storageListener = (changes, area) => {
      if (area === 'local' && changes.clerkToken) {
        const token = changes.clerkToken.newValue || null;
        setAuthToken(token);
        onChange?.(!!token);
      }
    };
    chrome?.storage?.onChanged?.addListener(storageListener);
  } catch {
    storageListener = null;
  }

  refreshInterval = setInterval(() => {
    loadToken();
  }, 30_000);

  return () => {
    unwatchAuthState();
    if (storageListener) {
      try { chrome?.storage?.onChanged?.removeListener(storageListener); } catch {}
    }
  };
}

/** Stop watching auth state. */
export function unwatchAuthState() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

/** Open the auth page in a new tab. */
export function openAuthPage() {
  try {
    const authUrl = chrome.runtime.getURL('src/auth/index.html');
    chrome.tabs.create({ url: authUrl });
  } catch {
    // Fallback: send message to background script
    chrome.runtime.sendMessage({ type: 'OPEN_AUTH' });
  }
}

/** Sign out — clear stored token. */
export async function signOut() {
  setAuthToken(null);
  try {
    await chrome?.storage?.local?.remove(['clerkToken', 'clerkUserId']);
  } catch {
    // chrome.storage not available
  }
}
