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
    origin: ["http://localhost:3000"],
    methods: ["GET", "POST"],
    credentials: true,
  })
);
app.use(express.json());
app.use("/api/rooms", roomsRouter);

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

io.on("connection", (socket) => {
  console.log("socket connected", socket.id);

  socket.on("user:av-start", ({ roomId }) => {
    socket.to(roomId).emit("user:av-join", { id: socket.id });
  });

  socket.on("webrtc:offer", ({ roomId, sdp, to }) => {
    io.to(to).emit("webrtc:offer", { from: socket.id, sdp });
  });

  socket.on("webrtc:answer", ({ roomId, sdp, to }) => {
    io.to(to).emit("webrtc:answer", { from: socket.id, sdp });
  });

  socket.on("webrtc:ice", ({ roomId, candidate, to }) => {
    io.to(to).emit("webrtc:ice", { from: socket.id, candidate });
  });

  socket.on("room:join", async (payload) => {
    const { roomId, name, avatar, uuid } = payload;
    socket.join(roomId);
    socket.data = { uuid, name, avatar, roomId } as any;

    await addMember(roomId, { uuid, name, avatar });
    await touchRoom(roomId);

    const state = (await getRoomState(roomId)) || {
      source: null,
      isPlaying: false,
      time: 0,
    };
    socket.emit("room:state", state);

    const hist = await getChatHistory(roomId);
    socket.emit("chat:history", hist);

    io.to(roomId).emit("user:list", await getUsersInRoom(roomId));
  });

  socket.on("video:action", async (data) => {
    const roomId = socket.data.roomId;
    const msg = { ...data, serverTimeMs: Date.now() };

    if (["play", "pause", "seek", "load"].includes(data.type)) {
      const state = (await getRoomState(roomId)) || {};
      state.source = data.source || state.source;
      state.isPlaying =
        data.type === "play" ? true : data.type === "pause" ? false : state.isPlaying;
      state.time = data.targetTime ?? state.time;
      state.lastActionTs = Date.now();
      await upsertRoomState(roomId, state);
    }
    await touchRoom(roomId);

    socket.to(roomId).emit("video:action", msg);
  });

  socket.on("chat:message", async (msg) => {
    const roomId = socket.data.roomId;
    const chatEntry = {
      id: uuidv4(),
      sender: {
        uuid: socket.data.uuid,
        name: socket.data.name,
        avatar: socket.data.avatar,
      },
      text: msg.text,
      reactions: [],
      ts: Date.now(),
    };
    await saveChat(roomId, chatEntry);
    await touchRoom(roomId);

    io.to(roomId).emit("chat:message", chatEntry);
  });

  socket.on("chat:reaction", async ({ roomId, msgId, emoji }) => {
  const hist = await getChatHistory(roomId);
  const updated = hist.map((m) =>
    m.id === msgId ? { ...m, reactions: [...(m.reactions || []), emoji] } : m
  );
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
    const roomId = socket.data?.roomId;
    const uuid = socket.data?.uuid;
    if (roomId && uuid) {
      await removeMember(roomId, uuid);
      io.to(roomId).emit("user:list", await getUsersInRoom(roomId));
    }
  });
});

// Cleanup job: delete inactive rooms after 10 mins
setInterval(async () => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  const deleted = await cleanupInactiveRooms(cutoff);
  if (deleted !== null && deleted > 0) {
    console.log(`[CLEANUP] Deleted ${deleted} inactive rooms`);
  }
}, 60 * 1000);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log("Server listening on", PORT));
