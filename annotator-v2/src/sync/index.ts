// Client-safe re-exports only. Do NOT re-export performSync here —
// that pulls engine.ts → store/db.ts → `new Dexie(...)` into the
// content bundle, which would instantiate per-host databases and
// defeat the whole unification. SW imports engine directly.
export { getAuthToken } from './api';
export { connect, disconnect, subscribe, isConnected } from './realtime';
export { watchAuthState, openAuthPage, signOut } from './auth';
export type { PresenceUser, RealtimeMessage } from './realtime';
