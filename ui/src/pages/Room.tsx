import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import io, { Socket } from "socket.io-client";
import { v4 as uuidv4 } from "uuid";
import HeaderBar from "../components/HeaderBar";
import MediaControls from "../components/MediaControls";
import ChatBox from "../components/ChatBox";
import PlaylistModal from "../components/PlaylistModal";
import UserProfileModal from "../components/UserProfileModal";

// --- INTERFACES ---
interface Peer {
  id: string; // This will be the userUUID
  name: string;
  avatar: string;
  stream: MediaStream | null;
  videoOn: boolean;
}
interface PlaylistVideo {
  title: string;
  url: string;
}
interface Message {
  id: string;
  text: string;
  sender: { uuid: string; name: string; avatar: string };
  ts: number;
  isSelf?: boolean; // Optional as it's only set client-side
  reactions?: string[]; // Match the server-side type
}
// --- END INTERFACES ---

const getDiceBearUrl = (seed: string): string =>
  `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(seed)}`;

// We'll create a room-scoped socket inside the Room component and store it in a ref.
// This lets us connect to a namespace like `${socketUrl}/${roomId}` which reduces
// race conditions that happen when using the default namespace + join event.
// Resolve backend base URL (handles Vite proxy)
const configuredApiBase = import.meta.env.VITE_API_BASE || "http://localhost:4000";
let socketUrl = configuredApiBase;
if (configuredApiBase.startsWith("/")) {
  // fallback to backend on localhost:4000 when VITE_API_BASE is a proxy path
  socketUrl = `${location.protocol}//${location.hostname}:4000`;
}
console.log("Socket.IO base URL:", socketUrl);

export default function Room() {
  const { roomId } = useParams<"roomId">();
  const userUUID = useMemo(() => uuidv4(), []);
  const [searchParams] = useSearchParams();
  const socketRef = useRef<Socket | null>(null);

  // Profile storage keys (per-room preferred)
  const profileKeyRoom = `wb:profile:${roomId}`;
  const profileKeyGlobal = `wb:profile`;

  // Resolve initial name/avatar from (in order): URL search params, per-room saved profile, global saved profile, defaults
  const resolveInitialProfile = () => {
    try {
      const urlName = searchParams.get("name");
      const urlAvatar = searchParams.get("avatar");
      if (urlName || urlAvatar) {
        // If URL provided, prefer them (but we'll remove the query after reading)
        return {
          name: urlName || "Guest",
          avatar: urlAvatar || getDiceBearUrl(urlName || "Guest"),
          fromUrl: true,
        };
      }

      const perRoom = localStorage.getItem(profileKeyRoom);
      if (perRoom) {
        const parsed = JSON.parse(perRoom);
        return { name: parsed.name || "Guest", avatar: parsed.avatar || getDiceBearUrl(parsed.name || "Guest"), fromUrl: false };
      }

      const globalProfile = localStorage.getItem(profileKeyGlobal);
      if (globalProfile) {
        const parsed = JSON.parse(globalProfile);
        return { name: parsed.name || "Guest", avatar: parsed.avatar || getDiceBearUrl(parsed.name || "Guest"), fromUrl: false };
      }
    } catch (e) {
      // ignore parsing errors
    }
    return { name: "Guest", avatar: getDiceBearUrl("Guest"), fromUrl: false };
  };

  const initialProfile = resolveInitialProfile();
  const [userName, setUserName] = useState<string>(initialProfile.name);
  const [avatar, setAvatar] = useState<string>(initialProfile.avatar);
  const [theme, setTheme] = useState("default");
  const [messages, setMessages] = useState<Message[]>([]);
  const [joined, setJoined] = useState(false);
  const [playlist, setPlaylist] = useState<PlaylistVideo[]>([]);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  const [isMicOn, setIsMicOn] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);

  // --- THE CRITICAL FIX: Use a Ref for the stream ---
  const [localStream, _setLocalStream] = useState<MediaStream | null>(null);
  const localStreamRef = useRef(localStream);
  const setLocalStream = (stream: MediaStream | null) => {
    localStreamRef.current = stream;
    _setLocalStream(stream);
  };
  // --- End of the fix ---

  const peerConnections = useRef<Record<string, RTCPeerConnection>>({});
  const avatarUrl = useMemo(() => getDiceBearUrl(userName), [userName]);
  // If the profile came from URL search params, strip them from the URL so the link stays clean
  useEffect(() => {
    try {
      const hasName = searchParams.get("name");
      const hasAvatar = searchParams.get("avatar");
      if (hasName || hasAvatar) {
        // Replace the current history entry with the pathname only (removes query params)
        const clean = window.location.pathname;
        window.history.replaceState(null, "", clean);
      }
    } catch (e) {
      // ignore
    }
    // We only want to run this once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist profile changes to localStorage (per-room). This allows reloads to keep name/avatar
  useEffect(() => {
    try {
      const payload = JSON.stringify({ name: userName, avatar });
      if (roomId) {
        localStorage.setItem(profileKeyRoom, payload);
      } else {
        localStorage.setItem(profileKeyGlobal, payload);
      }
    } catch (e) {
      // ignore storage errors
    }
  }, [userName, avatar, profileKeyRoom, profileKeyGlobal, roomId]);
  // ----------------------------------------------------------------
  // SECTION 1: Top-Level Handlers (wrapped in useCallback)
  // These are now STABLE and will NOT change when localStream changes
  // ----------------------------------------------------------------

  const handleMicToggle = useCallback(() => {
    const stream = localStreamRef.current;
    setIsMicOn((prev) => {
      const newIsOn = !prev;
      if (stream) {
        const track = stream.getAudioTracks()[0];
        if (track) track.enabled = newIsOn;
      }
      return newIsOn;
    });
  }, []); // Empty dependency array - STABLE

  const handleVideoToggle = useCallback(() => {
    const stream = localStreamRef.current;
    setIsVideoOn((prev) => {
      const newIsOn = !prev;
      if (stream) {
        const track = stream.getVideoTracks()[0];
        if (track) track.enabled = newIsOn;
      }
      return newIsOn;
    });
  }, []); // Empty dependency array - STABLE

  const handleUpload = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    const updated = [...playlist, { title: file.name, url }];
    socketRef.current?.emit("playlist:update", { roomId, playlist: updated });
  }, [playlist, roomId]);

  const handleSendMessage = useCallback((text: string) => {
    if (!joined) {
      console.warn('Cannot send chat message - waiting for join completion (state & history)');
      return;
    }
    if (!socketRef.current?.connected) {
      console.warn('Cannot send chat message - socket not connected');
      return;
    }

    const msg: Message = {
      id: `temp-${Date.now()}`,
      text,
      // Use the explicit avatar state (avatar) so custom avatars persist
      sender: { uuid: userUUID, name: userName, avatar: avatar },
      ts: Date.now(),
      isSelf: true,
    };
    console.log('Emitting chat:message', msg);

    // Add to messages immediately for optimistic UI update
    setMessages((prev) => [...prev, { ...msg, isSelf: true }]);

    // Include roomId to make server handling resilient if socket.data wasn't set
    socketRef.current.emit("chat:message", { ...msg, roomId });
  }, [userUUID, userName, avatar, joined, roomId]);

  // 📹 Create Peer Connection
  const createPeerConnection = useCallback((id: string, name?: string, avatar?: string): RTCPeerConnection => {
    console.log("Creating peer connection for:", id);
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit("webrtc:ice", { roomId, to: id, candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      console.log("Received remote track from:", id);
      const stream = event.streams[0];
      setPeers((prev) => {
        const peerData = { id, name: name || "Guest", avatar: avatar || getDiceBearUrl(id), stream, videoOn: true };
        const existing = prev.find((p) => p.id === id);
        if (existing) {
          return prev.map((p) => (p.id === id ? peerData : p));
        }
        return [...prev, peerData];
      });
    };

    const stream = localStreamRef.current; // Read from the ref
    if (stream) {
      console.log("Adding local tracks to new peer connection");
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    }

    peerConnections.current[id] = pc;
    return pc;
  }, [roomId]); // STABLE - localStreamRef is not a dependency

  // --- WebRTC Handlers ---

  const handleNewPeer = useCallback(async ({ id, name, avatar }: { id: string; name: string; avatar: string }) => {
    const stream = localStreamRef.current; // Read from ref
    if (!stream) return console.warn("No local stream, cannot create offer");
    console.log("Creating offer for new peer:", id);
    const pc = createPeerConnection(id, name, avatar);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socketRef.current?.emit("webrtc:offer", { roomId, to: id, sdp: offer });
  }, [createPeerConnection, roomId]); // STABLE

  const handleOffer = useCallback(async ({ from, sdp }: { from: string; sdp: RTCSessionDescriptionInit }) => {
    const stream = localStreamRef.current; // Read from ref
    if (!stream) return console.warn("No local stream, cannot create answer");
    console.log("Handling offer from:", from);
    const pc = createPeerConnection(from);
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socketRef.current?.emit("webrtc:answer", { roomId, to: from, sdp: answer });
  }, [createPeerConnection, roomId]); // STABLE

  const handleAnswer = useCallback(async ({ from, sdp }: { from: string; sdp: RTCSessionDescriptionInit }) => {
    console.log("Handling answer from:", from);
    const pc = peerConnections.current[from];
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    }
  }, []); // STABLE

  const handleIceCandidate = useCallback(async ({ from, candidate }: { from: string; candidate: RTCIceCandidateInit }) => {
    console.log("Handling ICE candidate from:", from);
    const pc = peerConnections.current[from];
    if (pc) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }, []); // STABLE

  const handleUserList = useCallback((users: { uuid: string, name: string, avatar: string }[]) => {
    console.log("Received user list:", users);

    // Update peer state (avatars, names)
    setPeers(prevPeers => {
      const updatedPeers = users
        .filter(user => user.uuid !== userUUID)
        .map(user => {
          const existingPeer = prevPeers.find(p => p.id === user.uuid);
          if (existingPeer) {
            return { ...existingPeer, name: user.name, avatar: user.avatar };
          }
          return {
            id: user.uuid,
            name: user.name,
            avatar: user.avatar,
            stream: null,
            videoOn: false
          };
        });

      // Clean up disconnected peers
      return updatedPeers.filter(peer => {
        const isStillInRoom = users.some(u => u.uuid === peer.id);
        if (!isStillInRoom && peerConnections.current[peer.id]) {
          console.log("Cleaning up disconnected peer:", peer.id);
          peerConnections.current[peer.id].close();
          delete peerConnections.current[peer.id];
        }
        return isStillInRoom;
      });
    });

    const stream = localStreamRef.current; // Read from ref
    if (stream) {
      console.log("Local stream is ready, checking who to connect to...");
      for (const user of users) {
        const peerId = user.uuid;
        if (peerId !== userUUID && !peerConnections.current[peerId]) {
          console.log(`Found new peer in list: ${user.name} (${peerId}). Initiating connection.`);
          handleNewPeer({ id: peerId, name: user.name, avatar: user.avatar });
        }
      }
    } else {
      console.log("Local stream not ready, will not initiate WebRTC.");
    }
  }, [userUUID, handleNewPeer]); // STABLE

  // --- Chat Handlers ---
  const handleChatMessage = useCallback((msg: Message) => {
      console.log("Received chat message:", msg);
      // Only add the message if it's from another user
      if (msg.sender.uuid !== userUUID) {
        setMessages((prev) => [...prev, { ...msg, isSelf: false }]);
      }
    }, [userUUID]); // STABLE

  const handleChatHistory = useCallback((hist: Message[]) => {
    console.log("Received chat history:", hist);
    setMessages(hist.map(msg => ({ ...msg, isSelf: msg.sender.uuid === userUUID })));
    setJoined(true);
  }, [userUUID]); // STABLE

  const handleChatReaction = useCallback(({ msgId, emoji }: { msgId: string, emoji: string }) => {
    console.log(`Received reaction: ${emoji} for msg ${msgId}`);
    setMessages(prev =>
      prev.map(msg =>
        msg.id === msgId
          ? { ...msg, reactions: [...(msg.reactions || []), emoji] }
          : msg
      )
    );
  }, []); // STABLE


  // ----------------------------------------------------------------
  // SECTION 2: `useEffect` Hooks
  // ----------------------------------------------------------------

  // HOOK #1 (Listeners): Runs ONCE on mount to attach all listeners and connect.
  useEffect(() => {
    console.log("HOOK #1: Setting up socket connection and listeners... URL:", import.meta.env.VITE_API_BASE || "http://localhost:4000");

    // Create a namespace-scoped socket for this room
    const s = io(`${socketUrl}/room/${roomId}`, {
      autoConnect: false,
      transports: ['polling', 'websocket'],
      path: '/socket.io',
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      forceNew: true,
    });
    socketRef.current = s;

    // Attach listeners to the room-scoped socket
    s.on("user:list", handleUserList);
    // Track join completion state
    let hasReceivedState = false;
    let hasReceivedHistory = false;

    s.on("room:state", (sState: any) => {
      console.log('Received room:state', sState);
      hasReceivedState = true;
      // Only mark as joined when we have both state and history
      if (hasReceivedState && hasReceivedHistory) {
        console.log('Join complete - received both state and history');
        setJoined(true);
      }
    });

    s.on("chat:history", (hist: Message[]) => {
      console.log("Received chat history:", hist);
      setMessages(hist.map(msg => ({ ...msg, isSelf: msg.sender.uuid === userUUID })));
      hasReceivedHistory = true;
      // Only mark as joined when we have both state and history
      if (hasReceivedState && hasReceivedHistory) {
        console.log('Join complete - received both state and history');
        setJoined(true);
      }
    });

    s.on("user:list", (users: { uuid: string, name: string, avatar: string }[]) => {
      console.log("Received user list:", users);
      handleUserList(users);
    });

    s.on("webrtc:offer", handleOffer);
    s.on("webrtc:answer", handleAnswer);
    s.on("webrtc:ice", handleIceCandidate);
    s.on("chat:message", handleChatMessage);
    s.on("chat:reaction", handleChatReaction);

    s.on('connect', () => {
      console.log('Socket successfully connected:', s.id);
      console.log('Socket connection details:', {
        id: s.id,
        connected: s.connected,
        disconnected: s.disconnected,
      });
      // Immediately join the room on connection (keeps compatibility)
      console.log("Emitting room:join with user details");
      s.emit("room:join", {
        name: userName,
        avatar: avatar,
        uuid: userUUID,
      });
    });

    s.on('connect_error', (error: any) => {
      console.error('Socket connection error:', {
        message: error?.message,
        context: {
          state: s.connected ? 'connected' : 'disconnected',
          transport: s.io?.engine?.transport?.name,
        },
      });
      // Attempt reconnection after a short delay
      setTimeout(() => {
        console.log('Attempting to reconnect...');
        s.connect();
      }, 1000);
    });

    s.on('error', (error: any) => {
      console.error('Socket error:', error);
    });

    s.on('disconnect', () => {
      console.log('Socket disconnected. State:', {
        id: s.id,
        connected: s.connected,
        disconnected: s.disconnected,
      });
      setPeers([]);
      peerConnections.current = {};
    });

    // Connect
    console.log("Connecting socket to namespace...", `${socketUrl}/${roomId}`);
    if (s.connected) {
      console.log('Socket was already connected, forcing reconnect');
      s.disconnect();
    }
    s.connect();

    return () => {
      console.log("Cleaning up socket connection and listeners...");
      s.off("user:list", handleUserList);
      s.off("webrtc:offer", handleOffer);
      s.off("webrtc:answer", handleAnswer);
      s.off("webrtc:ice", handleIceCandidate);
      s.off("chat:message", handleChatMessage);
      s.off("chat:history", handleChatHistory);
      s.off("chat:reaction", handleChatReaction);
      s.off('connect');
      s.off('connect_error');
      s.off('disconnect');
      s.disconnect();
      socketRef.current = null;
    };
  }, [ // All handlers are stable, so this hook runs ONLY ONCE
    roomId, userName, avatar, userUUID,
    handleUserList, handleOffer, handleAnswer, handleIceCandidate,
    handleChatMessage, handleChatHistory, handleChatReaction
  ]);

  // HOOK #2 (Get Media): Runs ONCE on mount to *try* to get media.
  useEffect(() => {
    console.log("HOOK #2: Getting user media...");
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then((stream) => {
        console.log("Media stream acquired!");
        setLocalStream(stream); // This will update the ref
        setIsVideoOn(true);
        setIsMicOn(true);
        // We now have media. Tell the server.
        console.log("Emitting user:media_ready.");
        socketRef.current?.emit("user:media_ready");
      })
      .catch((err) => {
        console.error("Media error:", err);
        alert("Could not access camera or mic. You can still watch and chat.");
      });
  }, []); // Runs only once


  // ----------------------------------------------------------------
  // SECTION 3: JSX Return (Layout)
  // ----------------------------------------------------------------

  return (
    <div
      className={`flex flex-col h-screen text-gray-200 transition-all duration-300 ${
        theme === "romantic" ? "bg-pink-200" :
        theme === "movie" ? "bg-black" :
        theme ==="gaming" ? "bg-green-900" :
        "bg-[#0f172a]"
      }`}
    >
      <HeaderBar
        roomId={roomId!}
        name={userName}
        avatar={avatar}
        onInvite={() => navigator.clipboard.writeText(window.location.href)}
        onEditProfile={() => setShowProfileModal(true)}
      />
      <MediaControls
        onUpload={handleUpload}
        onSearch={(query) => console.log(query)}
        onScreenShare={() => alert("Screen share not implemented")}
        onPlaylist={() => setPlaylistOpen(true)}
        onThemeChange={setTheme}
      />

      <div className="flex flex-1 overflow-hidden flex-col lg:flex-row">
        {/* 🖥️ Video Grid */}
        <div className="flex-1 bg-[#0b132b] flex flex-col items-center justify-center p-2 transition-all">
          {playlist.length > 0 ? (
            <video src={playlist[0].url} controls autoPlay className="w-full h-2/3 rounded-xl" />
          ) : (
            <p className="text-gray-400">No video loaded. Add one via search or upload!</p>
          )}

          {/* 👥 Peer Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mt-3 w-full">

            {/* Render Local Peer (Yourself) */}
            <div key={userUUID} className="relative bg-[#1e293b] rounded-xl overflow-hidden flex flex-col items-center justify-center p-2">
              {isVideoOn && localStream ? (
                <video
                  autoPlay
                  playsInline
                  muted={true}
                  ref={(el) => { if (el) el.srcObject = localStream; }}
                  className="w-full h-40 object-cover rounded-lg"
                />
              ) : (
                <img src={avatar} className="w-16 h-16 rounded-full mb-2" />
              )}
              <span className="text-xs font-medium mt-1">{userName} (You)</span>
            </div>

            {/* Render Remote Peers */}
            {peers.map((peer) => (
              <div key={peer.id} className="relative bg-[#1e293b] rounded-xl overflow-hidden flex flex-col items-center justify-center p-2">
                {peer.videoOn && peer.stream ? (
                  <video
                    autoPlay
                    playsInline
                    muted={false}
                    ref={(el) => { if (el) el.srcObject = peer.stream; }}
                    className="w-full h-40 object-cover rounded-lg"
                  />
                ) : (
                  <img src={peer.avatar} className="w-16 h-16 rounded-full mb-2" />
                )}
                <span className="text-xs font-medium mt-1">{peer.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 💬 Chat Section */}
        <div className="lg:w-80 w-full border-t lg:border-t-0 lg:border-l border-blue-700 bg-[#0f172a] flex flex-col">
          <ChatBox
            messages={messages}
            onSend={handleSendMessage}
            nowPlaying={playlist[0]?.title}
            socket={socketRef.current as unknown as Socket}
            roomId={roomId!}
            onReact={(messageIndex, emoji) => {
              const message = messages[messageIndex];
              if (message) {
                const optimisticReactions = [...(message.reactions || []), emoji];
                setMessages(prev => prev.map(m => m.id === message.id ? { ...m, reactions: optimisticReactions } : m));
                socketRef.current?.emit("chat:reaction", {
                  roomId: roomId,
                  msgId: message.id,
                  emoji: emoji
                });
              }
            }}
            onMicToggle={handleMicToggle}
            onVideoToggle={handleVideoToggle}
            micOn={isMicOn}
            videoOn={isVideoOn}
          />
        </div>
      </div>

      {/* Modals */}
      {playlistOpen && (
        <PlaylistModal
          playlist={playlist}
          onClose={() => setPlaylistOpen(false)}
          onRemove={(i) => {
            const updated = playlist.filter((_, idx) => idx !== i);
            socketRef.current?.emit("playlist:update", { roomId, playlist: updated });
          }}
        />
      )}
      {showProfileModal && (
        <UserProfileModal
          name={userName}
          avatar={avatarUrl}
          onSave={(n, a) => { setUserName(n); setAvatar(a); }}
          onClose={() => setShowProfileModal(false)}
        />
      )}
    </div>
  );
}
