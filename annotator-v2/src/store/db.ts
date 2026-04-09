import Dexie, { type EntityTable } from 'dexie';

export interface Point {
  x: number;
  y: number;
}

export type AnnotationType = 'stroke' | 'note' | 'highlight';
export type PrivacyLevel = 'private' | 'open';
export type SyncStatus = 'pending' | 'synced';

/** Unified annotation — one table, one schema. Type-specific payload in `data` blob. */
export interface Annotation {
  id: string;
  url: string;
  type: AnnotationType;
  privacy: PrivacyLevel;
  syncStatus: SyncStatus;
  data: string;           // JSON blob — type-specific payload
  color: string;
  timestamp: number;      // creation time (ms)
  updatedAt: number;      // LWW clock (unix seconds)
  deletedAt?: number;
  pageTitle: string;
  favicon: string;
  pageSection?: string;
  userId?: string;        // set for remote annotations
  tags?: string[];
}

/** Input type — sync fields injected automatically, not required from callers. */
export type AnnotationInput = Omit<Annotation, 'privacy' | 'syncStatus' | 'updatedAt' | 'deletedAt' | 'userId'>;

// --- Typed data helpers ---

export interface StrokeData {
  points: Point[];
  strokeWidth: number;
}

export interface NoteData {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pinned?: boolean;
}

export interface HighlightData {
  serializedRange: string;
}

export function getStrokeData(ann: Annotation): StrokeData {
  return JSON.parse(ann.data);
}

export function getNoteData(ann: Annotation): NoteData {
  return JSON.parse(ann.data);
}

export function getHighlightData(ann: Annotation): HighlightData {
  return JSON.parse(ann.data);
}

// --- Database ---

const db = new Dexie('WebAnnotatorDB') as Dexie & {
  annotations: EntityTable<Annotation, 'id'>;
  // Legacy tables kept for migration path
  strokes: EntityTable<Record<string, unknown>, 'id'>;
  notes: EntityTable<Record<string, unknown>, 'id'>;
  highlights: EntityTable<Record<string, unknown>, 'id'>;
};

// Legacy versions — keep so Dexie can upgrade through them
db.version(1).stores({ strokes: 'id, url', notes: 'id, url', highlights: 'id, url' });
db.version(2).stores({ strokes: 'id, url', notes: 'id, url', highlights: 'id, url' });
db.version(3).stores({
  strokes: 'id, url, syncStatus, updatedAt',
  notes: 'id, url, syncStatus, updatedAt',
  highlights: 'id, url, syncStatus, updatedAt',
});

// v4: unified table + migrate legacy data
db.version(4).stores({
  annotations: 'id, url, type, syncStatus, updatedAt, *tags, [url+type]',
  strokes: 'id, url, syncStatus, updatedAt',
  notes: 'id, url, syncStatus, updatedAt',
  highlights: 'id, url, syncStatus, updatedAt',
}).upgrade(async tx => {
  const annotations = tx.table('annotations');
  const now = Math.floor(Date.now() / 1000);

  // Migrate strokes
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

  // Migrate notes
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

  // Migrate highlights
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

// v5: drop legacy tables
db.version(5).stores({
  annotations: 'id, url, type, syncStatus, updatedAt, *tags, [url+type]',
  strokes: null,
  notes: null,
  highlights: null,
});

export { db };
