-- Stop & Think — Comments DB schema
-- Cloudflare D1 (SQLite)
-- Run once via: Cloudflare Dashboard → D1 → Console → paste this

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id TEXT NOT NULL,                   -- 'so-good', 'atomic-habits', ...
  parent_id INTEGER,                       -- NULL = top-level, INT = reply to comment ID
  author_name TEXT NOT NULL,
  author_email TEXT NOT NULL,
  content TEXT NOT NULL,
  verify_token TEXT UNIQUE NOT NULL,       -- UUID, sent to email for verification
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'approved'
  ip_hash TEXT,                            -- SHA256(ip + salt) for rate-limit
  created_at INTEGER DEFAULT (unixepoch()),
  verified_at INTEGER,
  expires_at INTEGER,                      -- Token expires at this unixtime (24h after insert)
  FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_comments_page_status
  ON comments(page_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comments_token
  ON comments(verify_token);

CREATE INDEX IF NOT EXISTS idx_comments_ip_recent
  ON comments(ip_hash, created_at);
