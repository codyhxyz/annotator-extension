/**
 * Per-page Durable Object WebSocket — presence + live broadcasts.
 *
 * Reconnect is unbounded. The only reason to stop is a conscious
 * `disconnect()` (user toggled off, signed out, navigated). Backoff is
 * exponential with jitter, capped at 30s. The auth token is re-read on
 * every connect attempt so token rotation propagates without manual
 * intervention.
 */

import { getAuthToken } from './api';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8787';

export interface PresenceUser {
  userId: string;
  displayName: string;
  avatarUrl: string;
}

export type RealtimeMessage =
  | { type: 'presence:state'; users: PresenceUser[] }
  | { type: 'presence:join'; user: PresenceUser; users: PresenceUser[] }
  | { type: 'presence:leave'; userId: string; users: PresenceUser[] }
  | { type: 'annotation:create' | 'annotation:update' | 'annotation:delete'; [key: string]: unknown }
  | { type: 'cursor:move'; userId: string; position: { x: number; y: number } };

type Listener = (msg: RealtimeMessage) => void;

let ws: WebSocket | null = null;
let currentUrl: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let attempts = 0;
let stopped = true;
const listeners = new Set<Listener>();

function getWsBase(): string {
  return API_BASE.replace(/^http/, 'ws');
}

/** Exponential backoff w/ jitter, cap 30s. attempts is 0-based. */
function backoffDelay(n: number): number {
  const base = Math.min(30_000, 1000 * Math.pow(2, n));
  const jitter = Math.random() * 500;
  return base + jitter;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function openSocket(pageUrl: string) {
  // Always re-read — if the token was refreshed, we pick up the new value.
  const token = getAuthToken();
  if (!token) return;

  const wsUrl = `${getWsBase()}/ws/page?url=${encodeURIComponent(pageUrl)}&token=${encodeURIComponent(token)}`;
  ws = new WebSocket(wsUrl);

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data) as RealtimeMessage;
      for (const l of listeners) l(msg);
    } catch { /* ignore malformed */ }
  };

  ws.onopen = () => { attempts = 0; };

  ws.onclose = () => {
    ws = null;
    if (stopped || currentUrl !== pageUrl) return;
    const delay = backoffDelay(attempts++);
    reconnectTimer = setTimeout(() => openSocket(pageUrl), delay);
  };

  ws.onerror = () => { ws?.close(); };
}

export function connect(pageUrl: string) {
  if (ws && currentUrl === pageUrl && ws.readyState === WebSocket.OPEN) return;
  disconnect();
  stopped = false;
  currentUrl = pageUrl;
  attempts = 0;
  openSocket(pageUrl);
}

export function disconnect() {
  stopped = true;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (ws) { currentUrl = null; ws.close(); ws = null; }
}

export function send(msg: object) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

export function isConnected(): boolean {
  return ws !== null && ws.readyState === WebSocket.OPEN;
}
