/**
 * Dexie instance — SW-only. Do not import from content scripts: this
 * module's top-level `new Dexie(...)` would open a per-host IndexedDB.
 * Types and pure helpers live in ./annotation so client code can use
 * them without instantiating Dexie.
 */

import Dexie, { type EntityTable } from 'dexie';
import { normalizeUrl } from '../utils/normalizeUrl';
import type { Annotation } from './annotation';

export * from './annotation';

const db = new Dexie('WebAnnotatorDB') as Dexie & {
  annotations: EntityTable<Annotation, 'id'>;
  strokes: EntityTable<Record<string, unknown>, 'id'>;
  notes: EntityTable<Record<string, unknown>, 'id'>;
  highlights: EntityTable<Record<string, unknown>, 'id'>;
};

db.version(1).stores({ strokes: 'id, url', notes: 'id, url', highlights: 'id, url' });
db.version(2).stores({ strokes: 'id, url', notes: 'id, url', highlights: 'id, url' });
db.version(3).stores({
  strokes: 'id, url, syncStatus, updatedAt',
  notes: 'id, url, syncStatus, updatedAt',
  highlights: 'id, url, syncStatus, updatedAt',
});

db.version(4).stores({
  annotations: 'id, url, type, syncStatus, updatedAt, *tags, [url+type]',
  strokes: 'id, url, syncStatus, updatedAt',
  notes: 'id, url, syncStatus, updatedAt',
  highlights: 'id, url, syncStatus, updatedAt',
}).upgrade(async tx => {
  const annotations = tx.table('annotations');
  const now = Math.floor(Date.now() / 1000);

  for (const s of await tx.table('strokes').toArray()) {
    await annotations.add({
      id: s.id, url: s.url, type: 'stroke',
      privacy: s.privacy || 'private', syncStatus: s.syncStatus || 'pending',
      data: JSON.stringify({ points: s.points, strokeWidth: s.strokeWidth }),
      color: s.color, timestamp: s.timestamp, updatedAt: s.updatedAt || now,
      pageTitle: s.pageTitle || '', favicon: s.favicon || '',
      pageSection: s.pageSection, tags: [],
    });
  }

  for (const n of await tx.table('notes').toArray()) {
    await annotations.add({
      id: n.id, url: n.url, type: 'note',
      privacy: n.privacy || 'private', syncStatus: n.syncStatus || 'pending',
      data: JSON.stringify({ text: n.text, x: n.x, y: n.y, width: n.width, height: n.height, pinned: n.pinned }),
      color: n.color, timestamp: n.timestamp, updatedAt: n.updatedAt || now,
      pageTitle: n.pageTitle || '', favicon: n.favicon || '',
      pageSection: n.pageSection, tags: [],
    });
  }

  for (const h of await tx.table('highlights').toArray()) {
    await annotations.add({
      id: h.id, url: h.url, type: 'highlight',
      privacy: h.privacy || 'private', syncStatus: h.syncStatus || 'pending',
      data: JSON.stringify({ serializedRange: h.serializedRange }),
      color: h.color, timestamp: h.timestamp, updatedAt: h.updatedAt || now,
      pageTitle: h.pageTitle || '', favicon: h.favicon || '',
      pageSection: h.pageSection, tags: [],
    });
  }
});

db.version(5).stores({
  annotations: 'id, url, type, syncStatus, updatedAt, *tags, [url+type]',
  strokes: null,
  notes: null,
  highlights: null,
});

db.version(6).stores({
  annotations: 'id, url, type, syncStatus, updatedAt, *tags, [url+type]',
}).upgrade(async tx => {
  const now = Math.floor(Date.now() / 1000);
  await tx.table('annotations').toCollection().modify(ann => {
    const a = ann as Annotation;
    const normalized = normalizeUrl(a.url);
    if (normalized !== a.url) {
      a.url = normalized;
      a.syncStatus = 'pending';
      a.updatedAt = now;
    }
  });
});

export { db };
