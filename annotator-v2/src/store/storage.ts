/**
 * Client-side storage singleton — content scripts, Feed, Auth.
 *
 * Proxies every call to the service worker, which owns the unified
 * Dexie instance. Dexie is not imported from this module so it doesn't
 * ship in the content bundle.
 *
 * The SW uses swStorage.ts (dexieAdapter) directly.
 */

import type { StorageAdapter } from './adapter';
import { messagingAdapter } from './messagingAdapter';

export const storage: StorageAdapter = messagingAdapter;
