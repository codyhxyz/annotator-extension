import type { Annotation, AnnotationInput, SyncStatus, PrivacyLevel } from './db';
import { storage } from './storage';
import type { UndoAction } from '../hooks/useUndoRedo';
import { emit } from '../utils/events';

const now = () => Math.floor(Date.now() / 1000);

const syncDefaults = (): { privacy: PrivacyLevel; syncStatus: SyncStatus; updatedAt: number } =>
  ({ privacy: 'private', syncStatus: 'pending', updatedAt: now() });

function dirty(): { syncStatus: SyncStatus; updatedAt: number } {
  return { syncStatus: 'pending', updatedAt: now() };
}

/** Add an annotation and return an UndoAction to reverse it. */
export async function addAnnotation(data: AnnotationInput): Promise<UndoAction> {
  const record: Annotation = { ...data, ...syncDefaults() };
  await storage.put(record);
  emit('annotation.created', { annotation: record });
  return {
    undo: async () => { await storage.delete(data.id); },
    redo: async () => { await storage.put(record); },
  };
}

/** Delete an annotation by id and return an UndoAction to restore it. */
export async function deleteAnnotation(id: string): Promise<UndoAction> {
  const snapshot = await storage.get(id);
  await storage.delete(id);
  emit('annotation.deleted', { annotationId: id, annotation: snapshot });
  return {
    undo: async () => { if (snapshot) await storage.put(snapshot); },
    redo: async () => { await storage.delete(id); },
  };
}

/** Delete multiple annotations by ids. */
export async function deleteAnnotations(ids: string[]): Promise<UndoAction> {
  const snapshots = (await storage.bulkGet(ids)).filter((a): a is Annotation => a !== undefined);
  await storage.bulkDelete(ids);
  for (const s of snapshots) emit('annotation.deleted', { annotationId: s.id, annotation: s });
  return {
    undo: async () => {
      await storage.bulkPut(snapshots);
      for (const s of snapshots) emit('annotation.created', { annotation: s });
    },
    redo: async () => {
      await storage.bulkDelete(ids);
      for (const s of snapshots) emit('annotation.deleted', { annotationId: s.id, annotation: s });
    },
  };
}

/** Update an annotation's fields and return an UndoAction to restore previous values. */
export async function updateAnnotation(id: string, changes: Partial<Annotation>): Promise<UndoAction> {
  const snapshot = await storage.get(id);
  await storage.update(id, { ...changes, ...dirty() });
  const updated = await storage.get(id);
  emit('annotation.updated', { annotationId: id, annotation: updated });
  const reverseChanges: Partial<Annotation> = {};
  if (snapshot) {
    for (const key of Object.keys(changes) as (keyof Annotation)[]) {
      (reverseChanges as Record<string, unknown>)[key] = snapshot[key];
    }
  }
  return {
    undo: async () => { await storage.update(id, { ...reverseChanges, ...dirty() }); },
    redo: async () => { await storage.update(id, { ...changes, ...dirty() }); },
  };
}

/** Clear all annotations for a URL and return an UndoAction to restore them. */
export async function clearAll(url: string): Promise<UndoAction> {
  const snapshots = await storage.deleteWhere({ url });
  for (const s of snapshots) emit('annotation.deleted', { annotationId: s.id, annotation: s });
  return {
    undo: async () => {
      if (snapshots.length === 0) return;
      await storage.bulkPut(snapshots);
      for (const s of snapshots) emit('annotation.created', { annotation: s });
    },
    redo: async () => {
      await storage.deleteWhere({ url });
      for (const s of snapshots) emit('annotation.deleted', { annotationId: s.id, annotation: s });
    },
  };
}
