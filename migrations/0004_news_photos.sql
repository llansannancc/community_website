-- Photos for news stories. Stored in the database (base64), shrunk in the browser before upload.
-- The site creates this table, and adds the news.image_id / news.image_alt columns, by itself
-- (see ensureSchema in src/index.js). The columns aren't added here because SQLite can't
-- skip a column that already exists.
CREATE TABLE IF NOT EXISTS images (
  id          TEXT PRIMARY KEY,          -- random 32-character id, used in the photo's address: /img/<id>
  mime        TEXT NOT NULL,
  data        TEXT NOT NULL,             -- base64
  size        INTEGER NOT NULL,
  uploaded_by INTEGER REFERENCES moderators(id),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
