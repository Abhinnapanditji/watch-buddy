import React, { useState, useRef, useEffect } from "react";
import { FaMicrophone, FaMicrophoneSlash, FaVideo, FaVideoSlash, FaArrowLeft, FaArrowRight, FaCommentDots } from "react-icons/fa";
import { Socket } from "socket.io-client";
import Picker from "@emoji-mart/react";
import data from "@emoji-mart/data";

interface Message {
  id: string;
  text: string;
  sender?: { uuid: string; name: string; avatar: string };
  ts: number;
  isSelf?: boolean;
  reactions?: string[];
}

interface ChatBoxProps {
  messages: Message[];
  onSend: (text: string) => void;
  // NOTE: Added onReact handler to props
  onReact: (messageIndex: number, emoji: string) => void;
  socket: Socket;
  roomId: string; // Unused in this component but kept for context
  nowPlaying?: string;
  onMicToggle: () => void;
  onVideoToggle: () => void;
  micOn: boolean;
  videoOn: boolean;
}

export default function ChatBox({
  messages,
  onSend,
  onReact, // Destructure new prop
  // socket, // Unused
  // roomId, // Unused
  nowPlaying,
  onMicToggle,
  onVideoToggle,
  micOn,
  videoOn,
}: ChatBoxProps) {
  const [input, setInput] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = () => {
    if (input.trim()) {
      onSend(input.trim());
      setInput("");
      setShowEmoji(false); // Close emoji picker after sending
    }
  };

  const micButtonClass = micOn
    ? "bg-red-600 hover:bg-red-700" // Red when active (on)
    : "bg-blue-600 hover:bg-blue-700"; // Blue when inactive (off)

  const videoButtonClass = videoOn
    ? "bg-red-600 hover:bg-red-700" // Red when active (on)
    : "bg-blue-600 hover:bg-blue-700"; // Blue when inactive (off)

  // Use absolute positioning and transform to smoothly collapse/expand the sidebar
  return (
    <div className="relative h-full hide-scrollbar">
      {/* collapse toggle button - Positioned outside the chat content area */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -left-6 top-4 bg-blue-600 text-white rounded px-2 py-1 text-xs z-20 transition-all duration-300"
      >
        {collapsed ? <FaArrowRight /> : <FaArrowLeft />}
      </button>

      {/* Main Chat Box Container - Controlled by transform */}
      <div
        className={`transition-transform duration-300 w-80 relative flex flex-col border-l border-blue-700 h-full bg-[#0f172a]
          ${collapsed ? "transform translate-x-full" : "transform translate-x-0"}` // FIX: Use transform for smooth collapse
        }
      >
        {/* messages */}
        <div className="flex-1 overflow-y-auto p-2 space-y-2 hide-scrollbar">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`p-2 rounded-lg shadow text-sm relative ${m.isSelf ? 'bg-[#3b82f6]/20' : 'bg-[#1e293b]'}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <img
                  src={m.sender?.avatar || "/default.png"}
                  alt=""
                  className="w-6 h-6 rounded-full"
                />
                <span className="font-bold text-blue-300">{m.sender?.name || "Unknown"}</span>
                <span className="text-xs text-gray-400 ml-auto">
                  {new Date(m.ts).toLocaleTimeString()}
                </span>
              </div>
              <p className="pl-8">{m.text}</p>

              {/* Reactions display */}
              {m.reactions && m.reactions.length > 0 && (
                <div className="mt-1 flex gap-1 text-xs">
                    {m.reactions.map((r, idx) => (
                        <span key={idx} className="bg-gray-700 p-1 rounded-full">{r}</span>
                    ))}
                </div>
              )}

              {/* Reaction button (Placeholder) */}
              <button
                  onClick={() => alert("Reaction selection not fully implemented in UI")}
                  className="absolute top-2 right-2 text-gray-500 hover:text-white transition-colors"
                  title="Add Reaction"
              >
                  <FaCommentDots size={12} />
              </button>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* mic/video controls + input */}
        <div className="border-t border-blue-700 p-2 flex-shrink-0">
          <div className="flex justify-center mb-2 gap-4">
            <button
              onClick={onMicToggle}
              className={`p-3 rounded-full text-white ${micButtonClass}`}
              title={micOn ? "Mute" : "Unmute"}
            >
              {micOn ? <FaMicrophone /> : <FaMicrophoneSlash />}
            </button>
            <button
              onClick={onVideoToggle}
              className={`p-3 rounded-full text-white ${videoButtonClass}`}
              title={videoOn ? "Turn Video Off" : "Turn Video On"}
            >
              {videoOn ? <FaVideo /> : <FaVideoSlash />}
            </button>
          </div>
          {nowPlaying && (
            <p className="text-xs text-gray-400 mb-1 text-center truncate">Now Playing: {nowPlaying}</p>
          )}
          <div className="flex items-center gap-2 relative">
            {/* Emoji Picker positioning */}
            {showEmoji && (
              <div className="absolute bottom-full left-0 mb-2 z-50">
                <Picker
                  data={data}
                  // NOTE: Use 'native' property for the emoji character
                  onEmojiSelect={(e: any) => setInput(input + e.native)}
                  onClickOutside={() => setShowEmoji(false)}
                  theme="dark"
                  previewPosition="none"
                />
              </div>
            )}
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Type a message..."
              className="flex-1 p-2 rounded bg-[#0f172a] border border-blue-600 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={() => setShowEmoji(!showEmoji)}
              className="p-3 bg-blue-600 rounded-full hover:bg-blue-700 transition-colors"
            >
              😊
            </button>
            <button
              onClick={send}
              className="px-4 py-2 bg-blue-600 rounded text-white font-bold hover:bg-blue-700 transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      </div>
      <style>{`
        /* For Chrome, Safari, and Opera */
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }

        /* For IE and Edge (legacy) */
        .hide-scrollbar {
          -ms-overflow-style: none;
        }

        /* For Firefox */
        .hide-scrollbar {
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
