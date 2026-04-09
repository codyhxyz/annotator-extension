/** HTTP client for the annotator backend API. */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8787';

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken() {
  return authToken;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!authToken) throw new Error('Not authenticated');

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// --- Auth ---

export interface UserProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export function register(username: string, displayName: string) {
  return request<UserProfile>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, displayName }),
  });
}

export function getMe() {
  return request<UserProfile>('/auth/me');
}

// --- Sync ---

export interface SyncChange {
  id: string;
  action: 'upsert' | 'delete';
  annotation?: {
    id: string;
    url: string;
    type: 'stroke' | 'note' | 'highlight';
    privacy: string;
    data: string;
    color: string;
    page_title: string | null;
    favicon: string | null;
    page_section: string | null;
    created_at: number;
    updated_at: number;
  };
  deletedAt?: number;
}

export interface SyncResponse {
  serverChanges: SyncChange[];
  newCursor: number;
}

export function sync(deviceId: string, lastSyncedAt: number, changes: SyncChange[]) {
  return request<SyncResponse>('/annotations/sync', {
    method: 'POST',
    body: JSON.stringify({ deviceId, lastSyncedAt, changes }),
  });
}

// --- Page annotations ---

export function getPageAnnotations(url: string) {
  return request<{ annotations: Record<string, unknown>[] }>(
    `/annotations/page?url=${encodeURIComponent(url)}`
  );
}


// --- Votes ---

export function castVote(annotationId: string, value: 1 | -1) {
  return request<{ ok: true; scoreDelta: number }>('/votes', {
    method: 'POST',
    body: JSON.stringify({ annotationId, value }),
  });
}

export function getOpenAnnotations(url: string) {
  return request<{ annotations: Record<string, unknown>[] }>(
    `/votes/open?url=${encodeURIComponent(url)}`
  );
}
