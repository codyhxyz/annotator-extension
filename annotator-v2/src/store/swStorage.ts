/**
 * Service-worker side storage — the unified Dexie instance lives here.
 * Never import this module from a content script or page; that would
 * pull Dexie into the content bundle.
 */

import type { StorageAdapter } from './adapter';
import { dexieAdapter } from './dexieAdapter';

export const swStorage: StorageAdapter = dexieAdapter;
