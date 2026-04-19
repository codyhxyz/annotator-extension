import { randomUUID } from 'crypto';
import { canonicalizeUrl } from './url-canonical.js';

export interface PendingNoteInput {
  url: string;
  text: string;
  color?: string;
  tags?: string[];
}

export interface PendingNote extends PendingNoteInput {
  id: string;
  url: string;        // canonicalized
  createdAt: number;
}

export interface PendingNotesStoreOptions {
  capacity?: number;  // LRU cap; default 1000
}

/**
 * In-memory LRU-capped store of pending notes.
 * - Insertion order preserved via Map iteration semantics.
 * - On capacity overflow, the oldest entry is evicted.
 * - No time-based expiry. Entries live until drained or LRU-evicted.
 */
export class PendingNotesStore {
  private readonly map = new Map<string, PendingNote>();
  private readonly capacity: number;

  constructor(opts: PendingNotesStoreOptions = {}) {
    this.capacity = opts.capacity ?? 1000;
  }

  add(input: PendingNoteInput): string {
    const id = randomUUID();
    const note: PendingNote = {
      id,
      url: canonicalizeUrl(input.url),
      text: input.text,
      color: input.color,
      tags: input.tags,
      createdAt: Date.now(),
    };
    this.map.set(id, note);
    while (this.map.size > this.capacity) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
    return id;
  }

  findByUrl(url: string): PendingNote[] {
    const key = canonicalizeUrl(url);
    const out: PendingNote[] = [];
    for (const note of this.map.values()) {
      if (note.url === key) out.push(note);
    }
    return out;
  }

  delete(id: string): boolean {
    return this.map.delete(id);
  }

  size(): number {
    return this.map.size;
  }
}
