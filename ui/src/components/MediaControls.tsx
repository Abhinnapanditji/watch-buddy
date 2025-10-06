import React, { useState } from "react";
import { FaUpload, FaSearch, FaDesktop, FaListUl } from "react-icons/fa";

export default function MediaControls({
  onUpload,
  onSearch,
  onScreenShare,
  onPlaylist,
  onThemeChange,
}: {
  onUpload: (file: File) => void;
  onSearch: (query: string) => void;
  onScreenShare: () => void;
  onPlaylist: () => void;
  onThemeChange: (theme: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="flex items-center gap-4 p-3 bg-[#1e293b] border-b border-blue-700">
      {/* Upload file */}
      <label className="flex items-center gap-2 cursor-pointer text-blue-400 hover:text-blue-300">
        <FaUpload />
        <span>Upload</span>
        <input
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
        />
      </label>

      {/* Search */}
      <div className="flex items-center gap-2 flex-1">
        <FaSearch className="text-blue-400" />
        <input
          type="text"
          placeholder="Magnet, YouTube link, or search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full p-2 rounded bg-[#0f172a] border border-blue-600 text-gray-200"
        />
        <button
          onClick={() => onSearch(searchQuery)}
          className="px-3 py-1 rounded bg-blue-600 text-black font-bold hover:bg-blue-500"
        >
          Play
        </button>
      </div>

      {/* Screen share */}
      <button
        onClick={onScreenShare}
        className="flex items-center gap-1 px-3 py-2 rounded bg-blue-600 text-black font-bold hover:bg-blue-500"
      >
        <FaDesktop /> Share
      </button>

      {/* Playlist */}
      <button
        onClick={onPlaylist}
        className="flex items-center gap-1 px-3 py-2 rounded bg-blue-600 text-black font-bold hover:bg-blue-500"
      >
        <FaListUl /> Playlist
      </button>

      {/* Theme dropdown */}
      <div className="relative">
        <select
          onChange={(e) => onThemeChange(e.target.value)}
          className="p-2 rounded bg-[#0f172a] border border-blue-600 text-gray-200"
        >
          <option value="default">Default</option>
          <option value="romantic">Romantic Date ❤️</option>
          <option value="movie">Movie Night 🎬</option>
          <option value="gaming">Gaming 🎮</option>
          <option value="chill">Chill 🌙</option>
        </select>
      </div>
    </div>
  );
}
