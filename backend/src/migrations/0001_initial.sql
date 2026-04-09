-- Users & Auth
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Friendships (mutual confirm)
CREATE TABLE IF NOT EXISTS friendships (
  id TEXT PRIMARY KEY,
  requester_id TEXT NOT NULL REFERENCES users(id),
  addressee_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(requester_id, addressee_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id, status);

-- Annotations (unified, type-discriminated)
CREATE TABLE IF NOT EXISTS annotations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  url TEXT NOT NULL,
  url_hash TEXT NOT NULL,
  type TEXT NOT NULL,
  privacy TEXT NOT NULL DEFAULT 'private',
  data TEXT NOT NULL,
  color TEXT NOT NULL,
  page_title TEXT,
  favicon TEXT,
  page_section TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  deleted_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_annotations_user_url ON annotations(user_id, url_hash);
CREATE INDEX IF NOT EXISTS idx_annotations_url_privacy ON annotations(url_hash, privacy);
CREATE INDEX IF NOT EXISTS idx_annotations_user_updated ON annotations(user_id, updated_at);

-- Votes (open mode)
CREATE TABLE IF NOT EXISTS votes (
  user_id TEXT NOT NULL REFERENCES users(id),
  annotation_id TEXT NOT NULL REFERENCES annotations(id),
  value INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, annotation_id)
);

CREATE INDEX IF NOT EXISTS idx_votes_annotation ON votes(annotation_id);

-- Denormalized scores for fast reads
CREATE TABLE IF NOT EXISTS annotation_scores (
  annotation_id TEXT PRIMARY KEY REFERENCES annotations(id),
  score INTEGER NOT NULL DEFAULT 0,
  vote_count INTEGER NOT NULL DEFAULT 0,
  last_vote_at INTEGER
);

-- Strand affinity (per-user weighting)
CREATE TABLE IF NOT EXISTS strand_affinity (
  user_id TEXT NOT NULL REFERENCES users(id),
  target_user_id TEXT NOT NULL REFERENCES users(id),
  affinity REAL NOT NULL DEFAULT 0.0,
  interaction_count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, target_user_id)
);

-- Sync cursors (per device)
CREATE TABLE IF NOT EXISTS sync_cursors (
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  last_synced_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, device_id)
);
