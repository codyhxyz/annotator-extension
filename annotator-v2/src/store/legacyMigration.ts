/**
 * One-shot migration for users upgrading past the "SW owns Dexie" change.
 *
 * Before this change, content scripts opened Dexie in the *host* origin,
 * so every site had its own IndexedDB. After this change, a single
 * extension-origin DB (owned by the SW) is the truth. We reach into the
 * legacy host-origin DB from the content script, ship everything it
 * contains to the SW via bulkPut, and set a per-host flag so we don't
 * try again.
 *
 * Runs once per host at content-script boot. No-ops on fresh installs.
 */

import { storage } from './storage';
import type { Annotation } from './db';

const MIGRATED_KEY = 'annotator_migrated_to_sw_v1';

export async function migrateLegacyHostDbIfNeeded(): Promise<void> {
  if (localStorage.getItem(MIGRATED_KEY)) return;

  // Check for a pre-existing host-origin DB before instantiating one.
  // Without this, the migration code itself creates an empty legacy DB
  // on every fresh install, defeating its purpose.
  try {
    const existing = await indexedDB.databases();
    const hasLegacy = existing.some(d => d.name === 'WebAnnotatorDB');
    if (!hasLegacy) {
      localStorage.setItem(MIGRATED_KEY, '1');
      return;
    }
  } catch { /* Safari etc. may not support databases() — fall through and try. */ }

  try {
    const { default: Dexie } = await import('dexie');
    const legacyDb = new Dexie('WebAnnotatorDB');
    legacyDb.version(6).stores({
      annotations: 'id, url, type, syncStatus, updatedAt, *tags, [url+type]',
    });

    let migrated = 0;
    try {
      const rows = (await legacyDb.table('annotations').toArray()) as Annotation[];
      if (rows.length > 0) {
        await storage.bulkPut(rows);
        migrated = rows.length;
        console.info(`[annotator] migrated ${migrated} legacy annotations from ${location.host}`);
      }
    } finally {
      legacyDb.close();
    }

    // After a successful read+push, tear the legacy DB down so it
    // doesn't linger in host-origin storage forever.
    try { await Dexie.delete('WebAnnotatorDB'); } catch { /* not fatal */ }

    localStorage.setItem(MIGRATED_KEY, '1');
    void migrated;
  } catch (err) {
    console.warn('[annotator] legacy migration failed', err);
    localStorage.setItem(MIGRATED_KEY, '1');
  }
}
