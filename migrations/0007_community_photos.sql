-- "Share a photo": photos of the weather and the area, sent in by the public and approved by a moderator.
-- Also a small preview of each photo for galleries. The site adds these by itself on first run.
ALTER TABLE images ADD COLUMN thumb TEXT;
CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title_en TEXT NOT NULL, title_cy TEXT, place TEXT, taken_on TEXT, credit TEXT,
  image_id TEXT, source TEXT NOT NULL DEFAULT 'moderator',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'deleted')),
  submitted_by INTEGER REFERENCES moderators(id), last_edited_by INTEGER REFERENCES moderators(id),
  needs_other_than INTEGER REFERENCES moderators(id), reviewed_by INTEGER REFERENCES moderators(id),
  reviewed_at TEXT, reject_reason TEXT, published_at TEXT,
  contact_name TEXT, contact_email TEXT, contact_phone TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')));
CREATE INDEX IF NOT EXISTS idx_photos_status_pub ON photos (status, published_at);
