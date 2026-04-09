/**
 * Sync engine — collects dirty annotations, sends to server,
 * applies server changes back. Bidirectional delta sync.
 */

import { db, type Annotation } from '../store/db';
import { sync as apiSync, type SyncChange } from './api';

const DEVICE_ID_KEY = 'annotator_device_id';
const CURSOR_KEY = 'annotator_sync_cursor';
const SYNC_INTERVAL_MS = 30_000;

let syncTimer: ReturnType<typeof setInterval> | null = null;
let syncing = false;

function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

function getCursor(): number {
  return parseInt(localStorage.getItem(CURSOR_KEY) || '0', 10);
}

function setCursor(cursor: number) {
  localStorage.setItem(CURSOR_KEY, String(cursor));
}

// --- Local ↔ Server conversion (near pass-through now) ---

function toServerChange(ann: Annotation): SyncChange {
  if (ann.deletedAt) {
    return { id: ann.id, action: 'delete', deletedAt: ann.deletedAt };
  }
  return {
    id: ann.id,
    action: 'upsert',
    annotation: {
      id: ann.id,
      url: ann.url,
      type: ann.type,
      privacy: ann.privacy,
      data: ann.data,
      color: ann.color,
      page_title: ann.pageTitle || null,
      favicon: ann.favicon || null,
      page_section: ann.pageSection || null,
      created_at: Math.floor(ann.timestamp / 1000),
      updated_at: ann.updatedAt,
    },
  };
}

function fromServerAnnotation(server: NonNullable<SyncChange['annotation']>): Annotation {
  return {
    id: server.id,
    url: server.url,
    type: server.type,
    privacy: server.privacy as Annotation['privacy'],
    syncStatus: 'synced',
    data: server.data,
    color: server.color,
    timestamp: server.created_at * 1000,
    updatedAt: server.updated_at,
    pageTitle: server.page_title || '',
    favicon: server.favicon || '',
    pageSection: server.page_section || undefined,
    tags: [],
  };
}

// --- Core sync ---

async function collectDirtyChanges(): Promise<SyncChange[]> {
  const dirty = await db.annotations.where('syncStatus').equals('pending').toArray();
  return dirty.map(toServerChange);
}

async function applyServerChanges(changes: SyncChange[]) {
  await db.transaction('rw', db.annotations, async () => {
    const upsertIds = changes
      .filter(c => c.action === 'upsert' && c.annotation)
      .map(c => c.annotation!.id);
    const locals = await db.annotations.bulkGet(upsertIds);
    const localMap = new Map(locals.filter(Boolean).map(a => [a!.id, a!]));

    const toDelete: string[] = [];
    const toPut: Annotation[] = [];

    for (const change of changes) {
      if (change.action === 'delete') {
        toDelete.push(change.id);
      } else if (change.action === 'upsert' && change.annotation) {
        const local = localMap.get(change.annotation.id);
        if (local && local.syncStatus === 'pending' && local.updatedAt > change.annotation.updated_at) {
          continue;
        }
        toPut.push(fromServerAnnotation(change.annotation));
      }
    }

    if (toDelete.length > 0) await db.annotations.bulkDelete(toDelete);
    if (toPut.length > 0) await db.annotations.bulkPut(toPut);
  });
}

async function markSynced(changes: SyncChange[]) {
  const ids = changes.map(c => c.id);
  await db.transaction('rw', db.annotations, async () => {
    for (const id of ids) {
      const ann = await db.annotations.get(id);
      if (ann && ann.syncStatus === 'pending') {
        await db.annotations.update(id, { syncStatus: 'synced' });
      }
    }
  });
}

export async function performSync(): Promise<{ pushed: number; pulled: number }> {
  if (syncing) return { pushed: 0, pulled: 0 };
  syncing = true;

  try {
    const deviceId = getDeviceId();
    const cursor = getCursor();
    const dirtyChanges = await collectDirtyChanges();

    const response = await apiSync(deviceId, cursor, dirtyChanges);

    if (dirtyChanges.length > 0) await markSynced(dirtyChanges);
    if (response.serverChanges.length > 0) await applyServerChanges(response.serverChanges);

    setCursor(response.newCursor);
    return { pushed: dirtyChanges.length, pulled: response.serverChanges.length };
  } finally {
    syncing = false;
  }
}

export function startAutoSync() {
  if (syncTimer) return;
  syncTimer = setInterval(() => {
    performSync().catch(err => console.warn('[sync] auto-sync failed:', err));
  }, SYNC_INTERVAL_MS);
  performSync().catch(err => console.warn('[sync] initial sync failed:', err));
}

export function stopAutoSync() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}

export function isSyncing() {
  return syncing;
}
