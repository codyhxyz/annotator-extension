import { liveQuery } from 'dexie';
import { db, type Annotation } from './db';
import type { StorageAdapter, AnnotationFilter } from './adapter';

function applyFilter(filter?: AnnotationFilter) {
  if (!filter || Object.keys(filter).length === 0) {
    return db.annotations.orderBy('updatedAt');
  }
  // Fast paths that can use an index.
  if (filter.url && filter.type) {
    return db.annotations.where('[url+type]').equals([filter.url, filter.type]);
  }
  if (filter.url) return db.annotations.where('url').equals(filter.url);
  if (filter.type) return db.annotations.where('type').equals(filter.type);
  if (filter.syncStatus) return db.annotations.where('syncStatus').equals(filter.syncStatus);
  return db.annotations.orderBy('updatedAt');
}

export const dexieAdapter: StorageAdapter = {
  get: id => db.annotations.get(id),

  list: async filter => {
    const rows = await applyFilter(filter).toArray();
    if (filter?.syncStatus && filter.url) return rows.filter(r => r.syncStatus === filter.syncStatus);
    return rows;
  },

  put: async ann => { await db.annotations.put(ann); },
  bulkPut: async list => { await db.annotations.bulkPut(list); },
  update: async (id, changes) => { await db.annotations.update(id, changes); },
  delete: async id => { await db.annotations.delete(id); },
  bulkDelete: async ids => { await db.annotations.bulkDelete(ids); },

  deleteWhere: async filter => {
    const snapshots = await applyFilter(filter).toArray();
    if (snapshots.length > 0) {
      await db.annotations.bulkDelete(snapshots.map(s => s.id));
    }
    return snapshots;
  },

  subscribe: (filter, cb) => {
    const observable = liveQuery<Annotation[]>(() => applyFilter(filter).toArray());
    const sub = observable.subscribe({ next: cb });
    return () => sub.unsubscribe();
  },
};
