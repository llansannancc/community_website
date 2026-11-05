-- Moderator sign-in sessions (moderators sign in with GitHub).
-- Only a hash of each session token is stored, so a copy of the database can't be used to sign in.

CREATE TABLE IF NOT EXISTS sessions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash    TEXT NOT NULL UNIQUE,
  moderator_id  INTEGER NOT NULL REFERENCES moderators(id),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at    TEXT NOT NULL,
  device        TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_moderator ON sessions (moderator_id);
