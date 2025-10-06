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

export async function upsertRoomState(roomId: string, state: any) {
  const merged = { ...defaultState, ...state };

  await pool.query(
    `INSERT INTO rooms (id, state, last_active)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET state = $2, last_active = $3`,
    [roomId, merged, Date.now()]
  );
  return merged;
}

export async function touchRoom(roomId: string) {
  await pool.query("UPDATE rooms SET last_active = $1 WHERE id = $2", [Date.now(), roomId]);
}

export async function cleanupInactiveRooms(cutoff: number) {
  const res = await pool.query("DELETE FROM rooms WHERE last_active < $1", [cutoff]);
  return res.rowCount;
}

export async function saveChat(roomId: string, chatEntry: any) {
  await pool.query(
    `INSERT INTO chats (id, room_id, sender, text, reactions, ts)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      chatEntry.id,
      roomId,
      chatEntry.sender,
      chatEntry.text,
      JSON.stringify(chatEntry.reactions || []),
      chatEntry.ts,
    ]
  );
}

export async function getChatHistory(roomId: string) {
  const res = await pool.query(
    `SELECT id, sender, text, ts, reactions
     FROM chats
     WHERE room_id = $1
     ORDER BY ts ASC`,
    [roomId]
  );

  return res.rows.map((r) => {
    let sender = r.sender;
    if (typeof sender === "string") {
      try {
        sender = JSON.parse(sender);
      } catch {
        sender = null;
      }
    }
    if (!sender) {
      sender = {
        uuid: "system",
        name: "Unknown",
        avatar: "https://via.placeholder.com/24",
      };
    }

    return {
      id: r.id,
      sender,
      text: r.text,
      ts: r.ts,
      reactions:
        typeof r.reactions === "string"
          ? JSON.parse(r.reactions)
          : r.reactions || [],
    };
  });
}

export async function addReaction(roomId: string, chatId: string, emoji: string) {
  await pool.query(
    `UPDATE chats
     SET reactions = reactions || $1::jsonb
     WHERE id = $2 AND room_id = $3`,
    [JSON.stringify([emoji]), chatId, roomId]
  );
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
