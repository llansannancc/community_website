-- Regular activities (weekly, or one week in the month), managed in the moderator area.
-- The site also creates this table automatically (see ensureSchema in src/index.js).

CREATE TABLE IF NOT EXISTS weekly (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  title_en         TEXT NOT NULL,
  title_cy         TEXT,
  description_en   TEXT NOT NULL DEFAULT '',
  description_cy   TEXT,
  location_en      TEXT NOT NULL,
  location_cy      TEXT,
  organiser        TEXT,
  day              INTEGER NOT NULL CHECK (day BETWEEN 0 AND 6),   -- 0 = Sunday … 6 = Saturday
  start_time       TEXT NOT NULL,                                  -- 'HH:MM'
  end_time         TEXT,
  week_of_month    INTEGER CHECK (week_of_month IN (1, 2, 3, 4, -1)), -- NULL = every week; -1 = last in the month
  starts_on        TEXT,                                           -- optional 'YYYY-MM-DD' (e.g. term dates)
  ends_on          TEXT,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'deleted')),
  submitted_by     INTEGER REFERENCES moderators(id),
  last_edited_by   INTEGER REFERENCES moderators(id),
  needs_other_than INTEGER REFERENCES moderators(id),
  reviewed_by      INTEGER REFERENCES moderators(id),
  reviewed_at      TEXT,
  reject_reason    TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_weekly_status_day ON weekly (status, day);
