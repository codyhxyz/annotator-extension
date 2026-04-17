/**
 * Wire protocol between clients (content scripts, Feed, Auth pages)
 * and the service worker, which owns the unified Dexie instance.
 *
 * MV3 service workers have IndexedDB access, so we don't need an
 * offscreen document. The SW is the single owner; everyone else
 * proxies through sendMessage.
 *
 * Subscribe semantics use an invalidation broadcast rather than a
 * persistent port: the SW emits INVALIDATION after every write, and
 * clients re-fetch. Simpler than port lifecycle, and the fetch cost
 * is bounded by change rate, not by render rate.
 */

import type { Annotation } from './db';
import type { AnnotationFilter } from './adapter';

export type StorageOp =
  | { op: 'get'; id: string }
  | { op: 'bulkGet'; ids: string[] }
  | { op: 'list'; filter?: AnnotationFilter }
  | { op: 'put'; ann: Annotation }
  | { op: 'bulkPut'; list: Annotation[] }
  | { op: 'update'; id: string; changes: Partial<Annotation> }
  | { op: 'delete'; id: string }
  | { op: 'bulkDelete'; ids: string[] }
  | { op: 'deleteWhere'; filter: AnnotationFilter };

export type StorageRequest = { kind: 'storage' } & StorageOp;
export type SyncRequest = { kind: 'sync.run' };
export type TokenRequest = { kind: 'auth.setToken'; token: string | null };

export type ClientRequest = StorageRequest | SyncRequest | TokenRequest;

export type StorageResponse<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/** Broadcast from SW after any mutation; clients re-fetch their streams. */
export const INVALIDATION_MSG = 'annotator:changed';

export interface InvalidationEvent {
  type: typeof INVALIDATION_MSG;
  /** Optional filter hint so subscribers can short-circuit. */
  affected?: AnnotationFilter;
}
