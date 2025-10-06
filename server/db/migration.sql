-- Ensure rooms table has last_active
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS last_active BIGINT;

-- Ensure chats table exists with reactions support
CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  room_id TEXT REFERENCES rooms(id) ON DELETE CASCADE,
  sender JSONB,
  text TEXT,
  reactions JSONB DEFAULT '[]',
  ts BIGINT
);

-- Ensure members table exists
CREATE TABLE IF NOT EXISTS members (
  room_id TEXT REFERENCES rooms(id) ON DELETE CASCADE,
  uuid TEXT,
  name TEXT,
  avatar TEXT,
  PRIMARY KEY (room_id, uuid)
);

-- Optional: backfill last_active for existing rooms
UPDATE rooms SET last_active = EXTRACT(EPOCH FROM NOW()) * 1000 WHERE last_active IS NULL;
