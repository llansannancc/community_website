-- Llansannan Community website: initial database
-- Times for events are stored as UK local time text: 'YYYY-MM-DDTHH:MM'
-- Audit timestamps are stored as UTC ISO text.

CREATE TABLE moderators (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('lead', 'moderator')),
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by  INTEGER REFERENCES moderators(id)
);

CREATE TABLE events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title_en        TEXT NOT NULL,
  title_cy        TEXT,
  description_en  TEXT NOT NULL DEFAULT '',
  description_cy  TEXT,
  location_en     TEXT NOT NULL,
  location_cy     TEXT,
  start_at        TEXT NOT NULL,
  end_at          TEXT NOT NULL,
  organiser       TEXT,
  -- Private: only moderators can see these. Cleared automatically 30 days after the event.
  contact_name    TEXT,
  contact_email   TEXT,
  contact_phone   TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected', 'deleted')),
  source          TEXT NOT NULL CHECK (source IN ('public', 'moderator')),
  submitted_by    INTEGER REFERENCES moderators(id),   -- set when a moderator created it
  last_edited_by  INTEGER REFERENCES moderators(id),
  -- A moderator who added or changed this must not approve it themselves (second approval rule)
  needs_other_than INTEGER REFERENCES moderators(id),
  reviewed_by     INTEGER REFERENCES moderators(id),
  reviewed_at     TEXT,
  reject_reason   TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_events_status_start ON events (status, start_at);

CREATE TABLE news (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title_en      TEXT NOT NULL,
  title_cy      TEXT,
  summary_en    TEXT NOT NULL,
  summary_cy    TEXT,
  body_en       TEXT NOT NULL DEFAULT '',
  body_cy       TEXT,
  category_en   TEXT NOT NULL DEFAULT 'Community',
  category_cy   TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'rejected', 'deleted')),
  submitted_by  INTEGER NOT NULL REFERENCES moderators(id),
  last_edited_by INTEGER REFERENCES moderators(id),
  needs_other_than INTEGER REFERENCES moderators(id),
  reviewed_by   INTEGER REFERENCES moderators(id),
  reviewed_at   TEXT,
  reject_reason TEXT,
  published_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_news_status_pub ON news (status, published_at);

-- Activity log: every moderator action. Append-only.
CREATE TABLE activity (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  actor_id    INTEGER REFERENCES moderators(id),
  actor_label TEXT NOT NULL,        -- name and email at the time, or 'Public' / 'System'
  action      TEXT NOT NULL,        -- e.g. submitted, created, edited, approved, rejected, deleted, moderator_added
  item_type   TEXT NOT NULL,        -- event, news, moderator, system
  item_id     INTEGER,
  summary     TEXT NOT NULL,        -- one readable line
  details     TEXT                  -- JSON: what changed (before/after)
);
CREATE INDEX idx_activity_at ON activity (at);
CREATE INDEX idx_activity_actor ON activity (actor_id);

-- The log cannot be changed or deleted, even by mistake.
CREATE TRIGGER activity_no_update BEFORE UPDATE ON activity
BEGIN SELECT RAISE(ABORT, 'The activity log is read-only'); END;
CREATE TRIGGER activity_no_delete BEFORE DELETE ON activity
BEGIN SELECT RAISE(ABORT, 'The activity log is read-only'); END;
