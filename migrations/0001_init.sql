-- Photofram content, edited in the admin Worker and read per request by the
-- public Worker. `data` holds the JSON for each row.
CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY DEFAULT 'site',
  data TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  position INTEGER DEFAULT 0,
  hidden INTEGER DEFAULT 0,
  data TEXT NOT NULL,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  kind TEXT CHECK (kind IN ('review', 'faq')),
  position INTEGER DEFAULT 0,
  hidden INTEGER DEFAULT 0,
  data TEXT NOT NULL,
  created_at TEXT,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_templates_position ON templates (hidden, position, created_at);
CREATE INDEX IF NOT EXISTS idx_items_kind_position ON items (kind, hidden, position, created_at);
