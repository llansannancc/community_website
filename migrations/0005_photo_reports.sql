-- Where public photos were sent from (kept until approved, or 30 days), and records of reported photos (90 days).
-- The site also adds these by itself the first time it runs after the update.
ALTER TABLE images ADD COLUMN ip TEXT;
ALTER TABLE images ADD COLUMN place TEXT;
ALTER TABLE images ADD COLUMN network TEXT;
ALTER TABLE images ADD COLUMN device TEXT;
ALTER TABLE images ADD COLUMN fingerprint TEXT;
CREATE TABLE IF NOT EXISTS photo_reports (id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  kind TEXT NOT NULL, item_id INTEGER, item_title TEXT,
  contact_name TEXT, contact_email TEXT, contact_phone TEXT,
  ip TEXT, place TEXT, network TEXT, device TEXT, sent_at TEXT, fingerprint TEXT,
  reported_by INTEGER REFERENCES moderators(id), reason TEXT, expires_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_photo_reports_fp ON photo_reports (fingerprint);
