import React from "react";

export default function PlaylistModal({ playlist, onClose, onRemove }: {
  playlist: { title: string; url: string }[];
  onClose: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-60 z-50">
      <div className="bg-[#1e293b] p-6 rounded-xl w-96">
        <h2 className="text-xl font-bold text-blue-400 mb-4">Playlist</h2>
        <ul className="space-y-2">
          {playlist.map((v, i) => (
            <li key={i} className="flex justify-between items-center p-2 bg-[#0f172a] rounded border border-blue-600">
              <span>{v.title}</span>
              <button
                onClick={() => onRemove(i)}
                className="text-red-400 hover:text-red-300"
              >
                ✖
              </button>
            </li>
          ))}
        </ul>
        <button
          onClick={onClose}
          className="mt-4 w-full py-2 rounded bg-blue-600 text-black font-bold hover:bg-blue-500"
        >
          Close
        </button>
      </div>
    </div>
  );
}
