/**
 * External API contract — JSON-RPC-style message envelopes that external
 * callers (CLI, MCP servers, other extensions, localhost web tools) can
 * send to the extension via `chrome.runtime.sendMessage` (after being
 * added to manifest `externally_connectable`).
 *
 * The runtime handler is deferred until after the offscreen-document
 * refactor (see KNOWN-LIMITATIONS.md): without unified storage, an
 * "annotator:list" call only sees the current-host DB, which is a lie
 * to callers. Shipping the schema now lets plugins compile against a
 * stable contract before the wire handler lands.
 */

import type { Annotation, AnnotationType } from '../store/db';

export type ApiRequest =
  | { type: 'annotator:ping' }
  | { type: 'annotator:list'; filter?: { url?: string; type?: AnnotationType } }
  | { type: 'annotator:get'; id: string }
  | { type: 'annotator:create'; annotation: Omit<Annotation, 'syncStatus' | 'updatedAt'> }
  | { type: 'annotator:update'; id: string; changes: Partial<Annotation> }
  | { type: 'annotator:delete'; id: string }
  | { type: 'annotator:subscribe'; filter?: { url?: string; type?: AnnotationType } };

export type ApiResponse =
  | { ok: true; type: 'pong' }
  | { ok: true; type: 'list'; annotations: Annotation[] }
  | { ok: true; type: 'annotation'; annotation: Annotation | null }
  | { ok: true; type: 'created'; id: string }
  | { ok: true; type: 'updated' }
  | { ok: true; type: 'deleted' }
  | { ok: false; error: string };

export const PROTOCOL_VERSION = '1.0.0';
