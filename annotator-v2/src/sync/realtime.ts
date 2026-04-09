/**
 * WebSocket client for per-page Durable Object rooms.
 * Handles presence (who's on the page) and live annotation broadcasts.
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
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;
const listeners = new Set<Listener>();

function getWsBase(): string {
  return API_BASE.replace(/^http/, 'ws');
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function connect(pageUrl: string) {
  const token = getAuthToken();
  if (!token) return;

  // Already connected to this page
  if (ws && currentUrl === pageUrl && ws.readyState === WebSocket.OPEN) return;

  disconnect();
  currentUrl = pageUrl;
  reconnectAttempts = 0;

  const wsUrl = `${getWsBase()}/ws/page?url=${encodeURIComponent(pageUrl)}&token=${encodeURIComponent(token)}`;
  ws = new WebSocket(wsUrl);

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data) as RealtimeMessage;
      for (const listener of listeners) {
        listener(msg);
      }
    } catch {
      // ignore malformed messages
    }
  };

  ws.onopen = () => {
    reconnectAttempts = 0;
  };

  ws.onclose = () => {
    if (currentUrl === pageUrl && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      const delay = Math.min(5000 * reconnectAttempts, 15000);
      reconnectTimer = setTimeout(() => connect(pageUrl), delay);
    }
  };

  ws.onerror = () => {
    ws?.close();
  };
}

export function disconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    currentUrl = null;
    ws.close();
    ws = null;
  }
}

export function send(msg: object) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function isConnected(): boolean {
  return ws !== null && ws.readyState === WebSocket.OPEN;
}
