export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  PAGE_ROOM: DurableObjectNamespace;
  CLERK_SECRET_KEY: string;
  CLERK_PUBLISHABLE_KEY: string;
  ENVIRONMENT: string;
}

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export type AnnotationType = 'stroke' | 'note' | 'highlight';
export type PrivacyLevel = 'private' | 'friends' | 'open';
export type SyncStatus = 'pending' | 'synced';
export type FriendshipStatus = 'pending' | 'accepted' | 'blocked';

export interface DbUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  created_at: number;
  updated_at: number;
}

export interface DbAnnotation {
  id: string;
  user_id: string;
  url: string;
  url_hash: string;
  type: AnnotationType;
  privacy: PrivacyLevel;
  data: string;
  color: string;
  page_title: string | null;
  favicon: string | null;
  page_section: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface DbFriendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  created_at: number;
  updated_at: number;
}

export interface DbVote {
  user_id: string;
  annotation_id: string;
  value: number;
  created_at: number;
}

export interface SyncRequest {
  deviceId: string;
  lastSyncedAt: number;
  changes: SyncChange[];
}

export interface SyncChange {
  id: string;
  action: 'upsert' | 'delete';
  annotation?: Omit<DbAnnotation, 'user_id'>;
  deletedAt?: number;
}

export interface SyncResponse {
  serverChanges: SyncChange[];
  newCursor: number;
}
