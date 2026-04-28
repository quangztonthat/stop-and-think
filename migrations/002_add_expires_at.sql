-- Migration 002: Add expires_at column for token TTL (24h)
-- Run via Cloudflare Dashboard → D1 → Console (paste statements one at a time)

ALTER TABLE comments ADD COLUMN expires_at INTEGER;

-- Backfill existing pending rows: expire 24h after creation
-- (rows already approved don't need expires_at — they won't be verified again)
UPDATE comments
SET expires_at = created_at + 86400
WHERE expires_at IS NULL AND status = 'pending';
