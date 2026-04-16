import { db, type Annotation, type AnnotationInput, type SyncStatus, type PrivacyLevel } from './db';
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
  await db.annotations.add(record);
  emit('annotation.created', { annotation: record });
  return {
    undo: async () => { await db.annotations.delete(data.id); },
    redo: async () => { await db.annotations.add(record); },
  };
}

/** Delete an annotation by id and return an UndoAction to restore it. */
export async function deleteAnnotation(id: string): Promise<UndoAction> {
  const snapshot = await db.annotations.get(id);
  await db.annotations.delete(id);
  emit('annotation.deleted', { annotationId: id, annotation: snapshot });
  return {
    undo: async () => { if (snapshot) await db.annotations.add(snapshot); },
    redo: async () => { await db.annotations.delete(id); },
  };
}

/** Delete multiple annotations by ids. */
export async function deleteAnnotations(ids: string[]): Promise<UndoAction> {
  const snapshots = (await db.annotations.bulkGet(ids)).filter((a): a is Annotation => a !== undefined);
  await db.annotations.bulkDelete(ids);
  for (const s of snapshots) emit('annotation.deleted', { annotationId: s.id, annotation: s });
  return {
    undo: async () => {
      await db.annotations.bulkAdd(snapshots);
      for (const s of snapshots) emit('annotation.created', { annotation: s });
    },
    redo: async () => {
      await db.annotations.bulkDelete(ids);
      for (const s of snapshots) emit('annotation.deleted', { annotationId: s.id, annotation: s });
    },
  };
}

/** Update an annotation's fields and return an UndoAction to restore previous values. */
export async function updateAnnotation(id: string, changes: Partial<Annotation>): Promise<UndoAction> {
  const snapshot = await db.annotations.get(id);
  await db.annotations.update(id, { ...changes, ...dirty() });
  const updated = await db.annotations.get(id);
  emit('annotation.updated', { annotationId: id, annotation: updated });
  const reverseChanges: Partial<Annotation> = {};
  if (snapshot) {
    for (const key of Object.keys(changes) as (keyof Annotation)[]) {
      (reverseChanges as Record<string, unknown>)[key] = snapshot[key];
    }
  }
  return {
    undo: async () => { await db.annotations.update(id, { ...reverseChanges, ...dirty() }); },
    redo: async () => { await db.annotations.update(id, { ...changes, ...dirty() }); },
  };
}

/** Clear all annotations for a URL and return an UndoAction to restore them. */
export async function clearAll(url: string): Promise<UndoAction> {
  const snapshots = await db.annotations.where({ url }).toArray();
  await db.annotations.where({ url }).delete();
  for (const s of snapshots) emit('annotation.deleted', { annotationId: s.id, annotation: s });
  return {
    undo: async () => {
      if (snapshots.length === 0) return;
      await db.annotations.bulkAdd(snapshots);
      for (const s of snapshots) emit('annotation.created', { annotation: s });
    },
    redo: async () => {
      await db.annotations.where({ url }).delete();
      for (const s of snapshots) emit('annotation.deleted', { annotationId: s.id, annotation: s });
    },
  };
}
