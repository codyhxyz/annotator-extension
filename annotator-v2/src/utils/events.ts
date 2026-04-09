/**
 * Annotation event bus — lifecycle hooks for plugins.
 *
 * Events emitted:
 *   annotation.created  — after a new annotation is added
 *   annotation.updated  — after an annotation is modified
 *   annotation.deleted  — after an annotation is removed
 *   page.annotated      — when annotations exist on the current page
 *
 * Plugins register handlers via `on()`. The event bus also appends
 * events to a JSONL log in localStorage for external consumption.
 */

import type { Annotation } from '../store/db';

export type EventType =
  | 'annotation.created'
  | 'annotation.updated'
  | 'annotation.deleted'
  | 'page.annotated';

export interface AnnotationEvent {
  type: EventType;
  timestamp: number;
  annotation?: Annotation;
  annotationId?: string;
  url?: string;
  metadata?: Record<string, unknown>;
}

type EventHandler = (event: AnnotationEvent) => void | Promise<void>;

const handlers = new Map<EventType, Set<EventHandler>>();
const LOG_KEY = 'annotator_event_log';
const MAX_LOG_ENTRIES = 500;

/** Register a handler for an event type. Returns an unsubscribe function. */
export function on(type: EventType, handler: EventHandler): () => void {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type)!.add(handler);
  return () => handlers.get(type)?.delete(handler);
}

/** Emit an event — calls all registered handlers and appends to log. */
export function emit(type: EventType, data?: Partial<Omit<AnnotationEvent, 'type' | 'timestamp'>>) {
  const event: AnnotationEvent = {
    type,
    timestamp: Date.now(),
    ...data,
  };

  // Call handlers (fire and forget — don't block on async handlers)
  const typeHandlers = handlers.get(type);
  if (typeHandlers) {
    for (const handler of typeHandlers) {
      try { handler(event); } catch (e) { console.warn(`[events] handler error for ${type}:`, e); }
    }
  }

  // Append to local log
  appendToLog(event);
}

/** Read the event log. */
export function getEventLog(): AnnotationEvent[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Clear the event log. */
export function clearEventLog() {
  localStorage.removeItem(LOG_KEY);
  logCache = null;
}

/** Export event log as JSONL. */
export function exportEventLogAsJsonl(): string {
  return getEventLog().map(e => JSON.stringify(e)).join('\n');
}

let logCache: AnnotationEvent[] | null = null;

function appendToLog(event: AnnotationEvent) {
  try {
    if (!logCache) logCache = getEventLog();
    logCache.push(event);
    if (logCache.length > MAX_LOG_ENTRIES) logCache = logCache.slice(-MAX_LOG_ENTRIES);
    localStorage.setItem(LOG_KEY, JSON.stringify(logCache));
  } catch {
    // localStorage full or unavailable — silently skip
  }
}
