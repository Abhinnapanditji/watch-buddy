// index.ts (server) - replace your existing file with this (keeps DB calls)
import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import roomsRouter from "./routes/rooms";
import {
  getRoomState,
  upsertRoomState,
  saveChat,
  getChatHistory,
  addMember,
  removeMember,
  getUsersInRoom,
  addReaction,
  touchRoom,
  cleanupInactiveRooms,
} from "./services/db";
import { v4 as uuidv4 } from "uuid";

const app = express();

app.use(
  cors({
    origin: ["http://localhost:3000", "http://localhost:5173"],
    methods: ["GET", "POST"],
    credentials: true,
  })
);
app.use(express.json());
app.use("/api/rooms", roomsRouter);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "http://localhost:5173"],
    methods: ["GET", "POST"],
    credentials: true
  },
  path: '/socket.io',
  transports: ['polling', 'websocket'],
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e8,
  allowEIO3: true
});

app.get('/', (req, res) => {
  res.send('Hello World!');
});

// Create a dynamic namespace for each room
const roomNamespace = io.of(/^\/room\/[\w-]+$/);

roomNamespace.on("connection", (socket) => {
  // Extract roomId from namespace
  const roomId = socket.nsp.name.split('/')[2];
  socket.join(roomId); // Auto-join the room on connection
  console.log("[io] connected", socket.id);

  // Basic connect event is handled by io.on("connection") above, no need to listen again

  // Helper function to find socket by UUID
  const findSocketByUUID = (uuid: string) => {
    const sockets = Array.from(socket.nsp.sockets.values());
    return sockets.find(s => s.data?.uuid === uuid);
  };

  // --- WebRTC signalling forwarding (standardized) ---
  socket.on("webrtc:offer", ({ to, sdp }) => {
    console.log(`[webrtc:offer] from ${socket.data?.uuid} -> to ${to}`);
    const targetSocket = findSocketByUUID(to);
    if (targetSocket) {
      targetSocket.emit("webrtc:offer", { from: socket.data?.uuid, sdp });
    } else {
      console.warn(`[webrtc:offer] target not found for uuid=${to}`);
    }
  });

  socket.on("webrtc:answer", ({ to, sdp }) => {
    console.log(`[webrtc:answer] from ${socket.data?.uuid} -> to ${to}`);
    const targetSocket = findSocketByUUID(to);
    if (targetSocket) {
      targetSocket.emit("webrtc:answer", { from: socket.data?.uuid, sdp });
    } else {
      console.warn(`[webrtc:answer] target not found for uuid=${to}`);
    }
  });

  socket.on("webrtc:ice", ({ to, candidate }) => {
    if (candidate) {
      console.log(`[webrtc:ice] from ${socket.data?.uuid} -> to ${to}`);
      const targetSocket = findSocketByUUID(to);
      if (targetSocket) {
        targetSocket.emit("webrtc:ice", { from: socket.data?.uuid, candidate });
      } else {
        console.warn(`[webrtc:ice] target not found for uuid=${to}`);
      }
    }
  });

  // --- Room join / presence / chat / playlist ---
  socket.on("room:join", async (payload) => {
    try {
      const { name, avatar, uuid } = payload;
      console.log(`[room:join] ${socket.id} joining room ${roomId} as ${name}`);

      // CRITICAL: First ensure the room exists
      try {
        console.log(`[room:join] Ensuring room ${roomId} exists...`);
        await upsertRoomState(roomId, {});
        console.log(`[room:join] Room ${roomId} ensured.`);
      } catch (error: any) {
        const roomError = error as Error;
        console.error(`[room:join] Failed to ensure room ${roomId}:`, roomError);
        socket.emit("room:error", {
          message: "Failed to create room. Please try again.",
          error: roomError.message || 'Unknown error occurred'
        });
        return;
      }

      // Store user data on socket
      socket.data = { uuid, name, avatar, roomId } as any;

      try {
        // Add member and touch room
        await addMember(roomId, { uuid, name, avatar });
        await touchRoom(roomId);

        // Fetch all necessary data
        const [state, hist, users] = await Promise.all([
          getRoomState(roomId),
          getChatHistory(roomId),
          getUsersInRoom(roomId)
        ]);

        // Send initial state and history to the new user
        socket.emit("room:state", state || { source: null, isPlaying: false, time: 0 });
        socket.emit("chat:history", hist);

        // Broadcast updated user list to everyone in the namespace
        socket.nsp.to(roomId).emit("user:list", users);

        // Notify existing peers about the new user
        socket.to(roomId).emit("webrtc:new-peer", { id: uuid, name, avatar });

        console.log(`[room:join] Completed join for ${name} (${uuid}) in room ${roomId}`);
      } catch (error: any) {
        const dbError = error as Error;
        console.error(`[room:join] Database error for user ${name} in room ${roomId}:`, dbError);
        socket.emit("room:error", {
          message: "Failed to join room. Please try again.",
          error: dbError.message || 'Database error occurred'
        });
      }
    } catch (error: any) {
      const err = error as Error;
      console.error("[room:join] error", err);
      socket.emit("room:error", {
        message: "An unexpected error occurred",
        error: err.message || 'Unknown error occurred'
      });
    }
  });

  socket.on("video:action", async (data) => {
    const roomId = socket.data?.roomId;
    if (!roomId) return;
    const msg = { ...data, serverTimeMs: Date.now() };
    if (["play", "pause", "seek", "load"].includes(data.type)) {
      const state = (await getRoomState(roomId)) || {};
      state.source = data.source || state.source;
      state.isPlaying = data.type === "play" ? true : data.type === "pause" ? false : state.isPlaying;
      state.time = data.targetTime ?? state.time;
      state.lastActionTs = Date.now();
      await upsertRoomState(roomId, state);
    }
    await touchRoom(roomId);
    socket.to(roomId).emit("video:action", msg);
  });

  socket.on("chat:message", async (payload) => {
    try {
      if (!roomId) {
        console.warn("[chat:message] Could not extract roomId from namespace");
        socket.emit("room:error", {
          message: "Could not send message - room not found",
          error: "Room ID missing"
        });
        return;
      }

      console.log(`[chat:message] recv from socket=${socket.id} payload=`, payload);
      const id = uuidv4();

      const chatEntry = {
        id,
        sender: payload.sender,
        text: payload.text,
        reactions: [],
        ts: Date.now(),
      };

      try {
        await saveChat(roomId, chatEntry);
        await touchRoom(roomId);

        // Broadcast to all clients in this room's namespace
        socket.nsp.to(roomId).emit("chat:message", chatEntry);
        console.log(`[chat:message] Broadcasting to room ${roomId}: ${chatEntry.text}`);
      } catch (error: any) {
        const chatError = error as Error;
        console.error("[chat:message] Database error", chatError);
        socket.emit("room:error", {
          message: "Failed to save chat message",
          error: chatError.message || "Database error occurred"
        });
      }
    } catch (error: any) {
      const err = error as Error;
      console.error("[chat:message] error", err);
      socket.emit("room:error", {
        message: "Failed to process chat message",
        error: err.message || "Unknown error occurred"
      });
    }
  });

  socket.on("chat:reaction", async ({ roomId, msgId, emoji }) => {
    const hist = await getChatHistory(roomId);
    const updated = hist.map((m) => (m.id === msgId ? { ...m, reactions: [...(m.reactions || []), emoji] } : m));
    io.to(roomId).emit("chat:history", updated);
  });

  socket.on("playlist:update", async ({ roomId, playlist }) => {
    const state = (await getRoomState(roomId)) || {};
    state.playlist = playlist;
    await upsertRoomState(roomId, state);
    await touchRoom(roomId);
    io.to(roomId).emit("playlist:update", playlist);
  });

  socket.on("theme:update", async ({ roomId, theme }) => {
    const state = (await getRoomState(roomId)) || {};
    state.theme = theme;
    await upsertRoomState(roomId, state);
    await touchRoom(roomId);
    io.to(roomId).emit("theme:update", theme);
  });

  socket.on("disconnecting", async () => {
    try {
      const roomId = socket.data?.roomId;
      const uuid = socket.data?.uuid;
      console.log(`[disconnecting] ${socket.id} leaving, room=${roomId}`);
      if (roomId && uuid) {
        await removeMember(roomId, uuid);
        io.to(roomId).emit("user:list", await getUsersInRoom(roomId));
      }
      // notify peers in rooms to remove this peer
      const rooms = Array.from(socket.rooms);
      rooms.forEach((r) => {
        if (r !== socket.id) {
          // send uuid so clients can map to their peer list (clients use UUIDs for peer ids)
          io.to(r).emit("webrtc:remove-peer", { id: uuid || socket.id });
        }
      });
    } catch (err) {
      console.error("[disconnecting] error", err);
    }
  });
});

// Cleanup job: delete inactive rooms after 10 minutes
setInterval(async () => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  const deleted = await cleanupInactiveRooms(cutoff);
  if (deleted !== null && deleted > 0) {
    console.log(`[CLEANUP] Deleted ${deleted} inactive rooms`);
  }
}, 60 * 1000);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log("Server listening on", PORT));
