import React from "react";
import { Copy, UserCircle } from "lucide-react";

export default function HeaderBar({
  roomId,
  name,
  avatar,
  onInvite,
  onEditProfile,
}: {
  roomId: string;
  name: string;
  avatar: string;
  onInvite: () => void;
  onEditProfile: () => void;
}) {
  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    alert("Room ID copied!");
  };

  return (
    <div className="flex items-center justify-between bg-[#1e293b] text-gray-200 px-6 py-3 border-b border-blue-800">
      <div className="text-xl font-bold text-blue-400">WatchBuddy</div>

      <div className="flex items-center gap-2">
        <span className="text-sm bg-[#0f172a] px-3 py-1 rounded-lg border border-blue-700">
          Room: {roomId}
        </span>
        <button onClick={copyRoomId} className="ml-1 p-1 hover:text-blue-400">
          <Copy size={16} />
        </button>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onInvite}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-black font-bold"
        >
          Invite Friend
        </button>
        <div
          onClick={onEditProfile}
          className="flex items-center gap-2 cursor-pointer hover:text-blue-400"
        >
          <img
            src={avatar}
            alt="avatar"
            className="w-8 h-8 rounded-full border border-blue-600"
          />
          <span>{name}</span>
        </div>
      </div>
    </div>
  );
}
