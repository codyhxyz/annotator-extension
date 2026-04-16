/**
 * StorageAdapter — the seam that makes tools storage-agnostic.
 *
 * The default adapter speaks Dexie. A future adapter can speak SQLite
 * (via the CLI), an in-memory store (for tests), or a remote API.
 *
 * Tools never import `db` directly — they read via useAnnotations() or
 * call into the singleton storage adapter.
 */

import type { Annotation, AnnotationType, SyncStatus } from './db';

export interface AnnotationFilter {
  url?: string;
  type?: AnnotationType;
  syncStatus?: SyncStatus;
}

export interface StorageAdapter {
  get(id: string): Promise<Annotation | undefined>;
  list(filter?: AnnotationFilter): Promise<Annotation[]>;
  put(ann: Annotation): Promise<void>;
  bulkPut(list: Annotation[]): Promise<void>;
  update(id: string, changes: Partial<Annotation>): Promise<void>;
  delete(id: string): Promise<void>;
  bulkDelete(ids: string[]): Promise<void>;
  deleteWhere(filter: AnnotationFilter): Promise<Annotation[]>;
  /** Subscribe to a filtered stream. Returns unsubscribe. */
  subscribe(filter: AnnotationFilter, cb: (list: Annotation[]) => void): () => void;
}
