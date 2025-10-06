import React, { useState, useEffect, useMemo } from "react";
import {
  useNavigate,
  createBrowserRouter,
  RouterProvider,
} from "react-router-dom";
// Use the simplified internal loading of tsparticles for a single-file environment
import Particles, { initParticlesEngine } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import { Loader2, Zap } from 'lucide-react'; // Added Zap for the main title icon

// NOTE: Tailwind CSS script injection is removed. Assume it's loaded in index.html.

// --- Utility Functions ---

const getDiceBearUrl = (seed: string): string =>
  `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(seed)}`;


// --- 1. Landing Component (Merged Logic and UI) ---

function Landing() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [avatarSeed, setAvatarSeed] = useState("Guest");
  const [roomCode, setRoomCode] = useState("");
  const [showProfile, setShowProfile] = useState(false);
  const [engineReady, setEngineReady] = useState(false);

  // FIX: Explicitly set the type for 'error' state
  const [error, setError] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [tagline, setTagline] = useState("");
  const fullTagline = "Fun with Friends, Should Never Ends";

  const avatarUrl = useMemo(() => getDiceBearUrl(avatarSeed), [avatarSeed]);

  // Typing animation effect
  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      setTagline(fullTagline.slice(0, i));
      i++;
      if (i > fullTagline.length) clearInterval(timer);
    }, 80);
    return () => clearInterval(timer);
  }, []);

  // Initialize particles engine
  useEffect(() => {
    initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    }).then(() => setEngineReady(true));
  }, []);

  const createRoom = async () => {
    if (!name.trim()) {
      setError("Please enter a name before creating a room.");
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const mockRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
      await new Promise(resolve => setTimeout(resolve, 800)); // Simulate network latency

      const data = { roomId: mockRoomId };

      if (data.roomId) {
        navigate(
          `/room/${data.roomId}?name=${encodeURIComponent(
            name
          )}&avatar=${encodeURIComponent(avatarUrl)}`
        );
      }
    } catch (e) {
      setError("Failed to create room. Please try again.");
      console.error(e);
      setIsLoading(false);
    }
  };

  const joinRoom = () => {
    setError(null);
    if (!roomCode.trim()) {
      setError("Please enter a valid room code to join.");
      return;
    }
    if (!name.trim()) {
      setError("Please enter a name before joining a room.");
      return;
    }

    navigate(
      `/room/${roomCode.trim()}?name=${encodeURIComponent(
        name
      )}&avatar=${encodeURIComponent(avatarUrl)}`
    );
  };

  const randomizeAvatar = () => {
    const newSeed = Math.random().toString(36).substring(7);
    setAvatarSeed(newSeed);
  };

  const particlesOptions = {
    background: { color: { value: "transparent" } },
    fpsLimit: 60,
    particles: {
      color: { value: "#3b82f6" },
      move: {
        direction: "none" as const,
        enable: true,
        outModes: {
            default: "out" as const,
        },
        random: true,
        speed: 0.5,
        straight: false,
      },
      number: { value: 40, density: { enable: true, area: 800 } },
      opacity: { value: 0.3 },
      shape: { type: "circle" },
      size: { value: { min: 1, max: 3 } },
    },
    detectRetina: true,
  };

  return (
    <>
      <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] text-gray-100 p-4 font-inter">
        {/* Animated particles */}
        {engineReady && (
          <Particles
            id="tsparticles"
            className="absolute inset-0"
            options={particlesOptions}
          />
        )}

        {/* Animated glow */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(37,99,235,0.15),transparent_70%)] animate-pulse"></div>

        {/* Main content card */}
        <div className="z-10 text-center p-6 sm:p-8 bg-[#1e293b]/80 rounded-3xl shadow-2xl border border-blue-700 w-full max-w-md backdrop-blur-md">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-blue-400 mb-2 drop-shadow-lg flex items-center justify-center">
            <Zap className="w-8 h-8 mr-2 text-yellow-400" /> WatchBuddy
          </h1>
          <p className="text-sm sm:text-base text-blue-300 h-5 mb-6 opacity-100 transition-opacity duration-1000 ease-in">
            {tagline}
          </p>

          {/* Custom Error Message Display */}
          {error && (
              <div className="mb-4 p-3 bg-red-900/70 border border-red-700 rounded-xl text-sm text-red-300 transition-all duration-300">
                  {error}
              </div>
          )}

          {!showProfile ? (
            <button
              onClick={() => setShowProfile(true)}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-400 text-black font-bold hover:from-blue-500 hover:to-blue-300 transition shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
            >
              Get Started
            </button>
          ) : (
            <>
              {/* Avatar Picker */}
              <div className="flex flex-col items-center mb-4">
                <img
                  src={avatarUrl}
                  alt="Avatar"
                  className="w-20 h-20 sm:w-24 sm:h-24 rounded-full border-4 border-blue-500 shadow-lg mb-2 transition transform hover:scale-105"
                />
                <button
                  onClick={randomizeAvatar}
                  className="text-blue-400 text-sm hover:text-blue-300 transition py-1 px-3 rounded-full hover:bg-[#0f172a]"
                >
                  🔁 Randomize Avatar
                </button>
              </div>

              {/* Username Input */}
              <input
                type="text"
                placeholder="Enter your name..."
                className="w-full p-3 mb-3 rounded-xl bg-[#0f172a] border border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm sm:text-base shadow-inner"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setAvatarSeed(e.target.value || "Guest");
                }}
                onFocus={() => setError(null)}
              />

              {/* Join Room */}
              <div className="flex items-center gap-2 mb-4">
                <input
                  type="text"
                  placeholder="Enter room code..."
                  className="flex-1 p-3 rounded-xl bg-[#0f172a] border border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm sm:text-base shadow-inner"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase().slice(0, 6))}
                  maxLength={6}
                  onFocus={() => setError(null)}
                />
                <button
                  onClick={joinRoom}
                  disabled={isLoading}
                  className="px-4 py-3 bg-blue-600 hover:bg-blue-500 text-black font-semibold rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md text-sm sm:text-base"
                >
                  Join
                </button>
              </div>

              {/* Create Room */}
              <button
                onClick={createRoom}
                disabled={isLoading}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-400 text-black font-bold hover:from-blue-500 hover:to-blue-300 transition shadow-lg hover:shadow-xl flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base transform hover:-translate-y-0.5"
              >
                {isLoading ? (
                  <Loader2 className="animate-spin mr-2" size={20} />
                ) : (
                  "Create Room"
                )}
              </button>
            </>
          )}
        </div>

        <footer className="absolute bottom-3 sm:bottom-4 text-xs text-gray-500 z-10 text-center px-4">
          Made with 💙 By Abhinna Pandit
        </footer>

        {/* Custom Global Styles */}
        <style>
          {`
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap');
            body {
              font-family: 'Inter', sans-serif;
            }
            /* Ensure particles are behind everything */
            #tsparticles {
              z-index: 0 !important;
            }
          `}
        </style>
      </div>
    </>
  );
}


// --- 2. Room Component (Placeholder) ---

import Room from "./Room";


// --- 3. App Component (Router Configuration) ---

const router = createBrowserRouter([
    {
      path: "/",
      element: <Landing />,
    },
    {
      path: "/room/:roomId",
      element: <Room />,
    },
    {
      path: "*",
      element: <div className="flex items-center justify-center min-h-screen bg-gray-900 text-red-400 text-2xl font-bold">404 - Interstellar Void</div>,
    }
]);

export default function App() {
  return (
    <RouterProvider router={router} />
  );
}
