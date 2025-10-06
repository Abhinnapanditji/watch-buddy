import React, { useState } from "react";

export default function UserProfileModal({
  name,
  avatar,
  onSave,
  onClose,
}: {
  name: string;
  avatar: string;
  onSave: (name: string, avatar: string) => void;
  onClose: () => void;
}) {
  const [newName, setNewName] = useState(name);
  const [newAvatar, setNewAvatar] = useState(avatar);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
      <div className="bg-[#1e293b] p-6 rounded-lg shadow-lg w-96">
        <h2 className="text-xl font-bold mb-4 text-blue-400">Edit Profile</h2>

        {/* Avatar preview */}
        <div className="flex flex-col items-center mb-4">
          <img
            src={newAvatar}
            alt="avatar"
            className="w-20 h-20 rounded-full border border-blue-600 mb-2"
          />
          <button
            onClick={() =>
              setNewAvatar(
                "https://api.dicebear.com/7.x/identicon/svg?seed=" +
                  Math.random().toString(36).substring(7)
              )
            }
            className="px-3 py-1 rounded bg-blue-600 text-black font-bold hover:bg-blue-500"
          >
            Randomize Avatar
          </button>
        </div>

        {/* Name input */}
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="w-full p-2 mb-4 rounded bg-[#0f172a] border border-blue-600 focus:ring-2 focus:ring-blue-500"
        />

        {/* Buttons */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded bg-gray-600 hover:bg-gray-500"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(newName, newAvatar)}
            className="px-4 py-2 rounded bg-blue-600 text-black font-bold hover:bg-blue-500"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
