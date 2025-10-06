-- Rooms table
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  state JSONB,
  last_active BIGINT
);

-- Chats table
CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  room_id TEXT REFERENCES rooms(id) ON DELETE CASCADE,
  sender JSONB NOT NULL,
  text TEXT NOT NULL,
  reactions JSONB DEFAULT '[]',
  ts BIGINT
);

-- Members table
CREATE TABLE IF NOT EXISTS members (
  room_id TEXT REFERENCES rooms(id) ON DELETE CASCADE,
  uuid TEXT,
  name TEXT,
  avatar TEXT,
  PRIMARY KEY (room_id, uuid)
);

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS last_active BIGINT;
