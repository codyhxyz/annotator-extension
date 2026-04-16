import type { StorageAdapter } from './adapter';
import { dexieAdapter } from './dexieAdapter';

/** The app-wide storage adapter. Swap in Phase 8 (CLI bridge, remote). */
export const storage: StorageAdapter = dexieAdapter;
