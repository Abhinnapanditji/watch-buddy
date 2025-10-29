import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();


const useSSL = process.env.DATABASE_URL?.includes("neon.tech");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});

// Default room state
const defaultState = {
  source: null,
  isPlaying: false,
  time: 0,
  playlist: [],
  theme: "default",
};

export async function getRoomState(roomId: string) {
  const res = await pool.query("SELECT state FROM rooms WHERE id = $1", [roomId]);
  if (res.rows.length === 0) return null;

  const state = res.rows[0].state || {};
  return { ...defaultState, ...state };
}

export async function upsertRoomState(roomId: string, partialState: any) {
  const existingState = (await getRoomState(roomId)) || defaultState;

  const mergedState = { ...existingState, ...partialState };

  await pool.query(
    `INSERT INTO rooms (id, state, last_active)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET state = $2, last_active = $3`,
    [roomId, mergedState, Date.now()]
  );
  return mergedState;
}

export async function touchRoom(roomId: string) {
  await pool.query("UPDATE rooms SET last_active = $1 WHERE id = $2", [Date.now(), roomId]);
}

export async function cleanupInactiveRooms(cutoff: number) {
  const res = await pool.query("DELETE FROM rooms WHERE last_active < $1", [cutoff]);
  return res.rowCount;
}

export async function saveChat(roomId: string, chatEntry: any) {
  const getChatColumns = async () => {
    const res = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'chats' AND table_schema = 'public'`
    );
    return res.rows.map((r) => r.column_name);
  };

  // simple in-memory cache
  if (!(global as any).__chat_columns_cache) {
    (global as any).__chat_columns_cache = await getChatColumns();
  }
  const chatCols: string[] = (global as any).__chat_columns_cache;

  try {
    if (chatCols.includes('sender')) {
      // schema with sender JSONB and reactions/ts
      await pool.query(
        `INSERT INTO chats (id, room_id, sender, text, reactions, ts)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          chatEntry.id,
          roomId,
          chatEntry.sender ? JSON.stringify(chatEntry.sender) : null,
          chatEntry.text,
          JSON.stringify(chatEntry.reactions || []),
          chatEntry.ts || Date.now(),
        ]
      );
    } else if (chatCols.includes('sender_uuid')) {
      // flattened schema (sender_uuid, sender_name, sender_avatar) and created_at
      const createdAt = chatEntry.ts ? new Date(chatEntry.ts) : new Date();
      await pool.query(
        `INSERT INTO chats (id, room_id, sender_uuid, sender_name, sender_avatar, text, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          chatEntry.id,
          roomId,
          chatEntry.sender?.uuid || null,
          chatEntry.sender?.name || null,
          chatEntry.sender?.avatar || null,
          chatEntry.text,
          createdAt,
        ]
      );
    } else {
      // Fallback: insert minimal columns (id, room_id, text, created_at)
      const createdAt = chatEntry.ts ? new Date(chatEntry.ts) : new Date();
      await pool.query(
        `INSERT INTO chats (id, room_id, text, created_at)
         VALUES ($1, $2, $3, $4)`,
        [chatEntry.id, roomId, chatEntry.text, createdAt]
      );
    }
  } catch (err) {
    // If insertion failed due to schema drift, refresh cache and rethrow a clearer error
    try {
      (global as any).__chat_columns_cache = await getChatColumns();
    } catch (e) {
      // ignore cache refresh errors
    }
    throw err;
  }
}

export async function getChatHistory(roomId: string) {
  // Determine which schema version we're using (cache the result)
  if (!(global as any).__chat_columns_cache) {
    const res = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'chats' AND table_schema = 'public'`
    );
    (global as any).__chat_columns_cache = res.rows.map((r) => r.column_name);
  }
  const chatCols: string[] = (global as any).__chat_columns_cache;

  let res;
  if (chatCols.includes('sender')) {
    // JSONB schema version
    res = await pool.query(
      `SELECT id, room_id, sender, text, reactions, ts
       FROM chats
       WHERE room_id = $1
       ORDER BY ts ASC`,
      [roomId]
    );

    return res.rows.map((r) => ({
      id: r.id,
      sender: typeof r.sender === 'string' ? JSON.parse(r.sender) : r.sender,
      text: r.text,
      ts: r.ts,
      reactions: r.reactions || []
    }));
  } else {
    // Flattened schema version
    res = await pool.query(
      `SELECT id, sender_uuid, sender_name, sender_avatar, text, created_at
       FROM chats
       WHERE room_id = $1
       ORDER BY created_at ASC`,
      [roomId]
    );

    return res.rows.map((r) => {
      const sender = r.sender_uuid
        ? { uuid: r.sender_uuid, name: r.sender_name || "Unknown", avatar: r.sender_avatar || "" }
        : { uuid: "system", name: "Unknown", avatar: "https://via.placeholder.com/24" };

      return {
        id: r.id,
        sender,
        text: r.text,
        ts: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
        reactions: [] // reactions are not persisted in this schema version
      };
    });
  }
}

export async function addReaction(roomId: string, chatId: string, emoji: string): Promise<boolean> {
  // Check if reactions column exists
  if (!(global as any).__chat_columns_cache) {
    const res = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'chats' AND table_schema = 'public'`
    );
    (global as any).__chat_columns_cache = res.rows.map((r) => r.column_name);
  }
  const chatCols: string[] = (global as any).__chat_columns_cache;

  if (!chatCols.includes('reactions')) {
    console.warn('Reactions not supported in current schema');
    return false;
  }

  const res = await pool.query(
    `UPDATE chats
       SET reactions = COALESCE(reactions, '[]'::jsonb) || $1::jsonb
       WHERE id = $2 AND room_id = $3`,
    [JSON.stringify([emoji]), chatId, roomId]
  );
  return !!(res && res.rowCount && res.rowCount > 0);
}

// Members management
export async function addMember(roomId: string, member: any) {
  await pool.query(
    `INSERT INTO members (room_id, uuid, name, avatar)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (room_id, uuid) DO UPDATE SET name = $3, avatar = $4`,
    [roomId, member.uuid, member.name, member.avatar]
  );
}

export async function removeMember(roomId: string, uuid: string) {
  await pool.query("DELETE FROM members WHERE room_id = $1 AND uuid = $2", [roomId, uuid]);
}

export async function getUsersInRoom(roomId: string) {
  const res = await pool.query("SELECT uuid, name, avatar FROM members WHERE room_id = $1", [
    roomId,
  ]);
  return res.rows;
}
