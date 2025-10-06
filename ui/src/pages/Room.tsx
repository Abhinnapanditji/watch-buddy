import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import io, { Socket } from "socket.io-client";
import HeaderBar from "../components/HeaderBar";
import MediaControls from "../components/MediaControls";
import ChatBox from "../components/ChatBox";
import PlaylistModal from "../components/PlaylistModal";
import UserProfileModal from "../components/UserProfileModal";

interface Peer {
  id: string;
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
  isSelf: boolean;
  reactions?: string[];
}

const getDiceBearUrl = (seed: string): string =>
  `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(seed)}`;

const socket: Socket = io(import.meta.env.VITE_API_BASE || "http://localhost:4000");

export default function Room() {
  const { roomId } = useParams<"roomId">();
  const [searchParams] = useSearchParams();
  const initialName = searchParams.get("name") || "Guest";
  const initialAvatar = searchParams.get("avatar") || getDiceBearUrl(initialName);

  const [userName, setUserName] = useState(initialName);
  const [avatar, setAvatar] = useState(initialAvatar);
  const [theme, setTheme] = useState("default");
  const [messages, setMessages] = useState<Message[]>([]);
  const [playlist, setPlaylist] = useState<PlaylistVideo[]>([]);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  const [isMicOn, setIsMicOn] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const peerConnections = useRef<Record<string, RTCPeerConnection>>({});

  const avatarUrl = useMemo(() => getDiceBearUrl(userName), [userName]);

  // 🎤 MIC + VIDEO TOGGLES
  const handleMicToggle = useCallback(() => {
    setIsMicOn((prev) => !prev);
    if (localStream) {
      const track = localStream.getAudioTracks()[0];
      if (track) track.enabled = !isMicOn;
    }
  }, [localStream, isMicOn]);

  const handleVideoToggle = useCallback(() => {
    setIsVideoOn((prev) => !prev);
    if (localStream) {
      const track = localStream.getVideoTracks()[0];
      if (track) track.enabled = !isVideoOn;
    }
  }, [localStream, isVideoOn]);

  // 📹 Create Peer Connection
  const createPeerConnection = useCallback((id: string, name?: string, avatar?: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection();
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("webrtc:candidate", { to: id, candidate: event.candidate });
      }
    };
    pc.ontrack = (event) => {
      const stream = event.streams[0];
      setPeers((prev) => {
        const existing = prev.find((p) => p.id === id);
        if (existing)
          return prev.map((p) => (p.id === id ? { ...p, stream, videoOn: true } : p));
        return [...prev, { id, name: name || "Guest", avatar: avatar || getDiceBearUrl(id), stream, videoOn: true }];
      });
    };
    peerConnections.current[id] = pc;
    return pc;
  }, []);

  // 🔗 WebRTC Events
  useEffect(() => {
    const handleNewPeer = async ({ id, name, avatar }: { id: string; name: string; avatar: string }) => {
      if (!localStream) return;
      const pc = createPeerConnection(id, name, avatar);
      localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("webrtc:offer", { to: id, offer });
    };

    const handleOffer = async ({ from, offer }: { from: string; offer: RTCSessionDescriptionInit }) => {
      if (!localStream) return;
      const pc = createPeerConnection(from);
      localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("webrtc:answer", { to: from, answer });
    };

    socket.on("webrtc:new-peer", handleNewPeer);
    socket.on("webrtc:offer", handleOffer);

    return () => {
      socket.off("webrtc:new-peer", handleNewPeer);
      socket.off("webrtc:offer", handleOffer);
    };
  }, [localStream, createPeerConnection]);

  // 🎥 Initialize Local Stream
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then((stream) => setLocalStream(stream))
      .catch((err) => console.error("Media error:", err));
  }, []);

  // 💬 Chat and Playlist
  const handleSendMessage = (text: string) => {
    const msg: Message = {
      id: `temp-${Date.now()}`,
      text,
      sender: { uuid: socket.id!, name: userName, avatar: avatarUrl },
      ts: Date.now(),
      isSelf: true,
    };
    setMessages((prev) => [...prev, msg]);
    socket.emit("chat:message", msg);
  };

  const handleUpload = (file: File) => {
    const url = URL.createObjectURL(file);
    const updated = [...playlist, { title: file.name, url }];
    socket.emit("playlist:update", { roomId, playlist: updated });
  };

  // 🌈 UI + Layout
  return (
    <div
      className={`flex flex-col h-screen text-gray-200 transition-all duration-300 ${
        theme === "romantic" ? "bg-pink-200" :
        theme === "movie" ? "bg-black" :
        theme === "gaming" ? "bg-green-900" :
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
            {[
              { id: socket.id, name: userName, avatar, stream: localStream, videoOn: isVideoOn },
              ...peers
            ].map((peer) => (
              <div key={peer.id} className="relative bg-[#1e293b] rounded-xl overflow-hidden flex flex-col items-center justify-center p-2">
                {peer.videoOn && peer.stream ? (
                  <video
                    autoPlay
                    playsInline
                    muted={peer.id === socket.id}
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
            socket={socket}
            roomId={roomId!}
            onReact={(messageIndex, emoji) => {
              const updatedMessages = [...messages];
              const message = updatedMessages[messageIndex];
              if (message) {
                message.reactions = message.reactions || [];
                message.reactions.push(emoji);
                setMessages(updatedMessages);
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
            socket.emit("playlist:update", { roomId, playlist: updated });
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
