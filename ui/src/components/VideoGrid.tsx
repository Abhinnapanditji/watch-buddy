import React, { useEffect, useRef } from "react";

export default function VideoGrid({
  localStream,
  remoteStreams,
}: {
  localStream: MediaStream | null;
  remoteStreams: { id: string; stream: MediaStream }[];
}) {
  const localRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localRef.current && localStream) {
      localRef.current.srcObject = localStream;
    }
  }, [localStream]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 p-2 bg-black/40 h-full">
      <video ref={localRef} autoPlay muted playsInline className="rounded-lg w-full h-full object-cover" />
      {remoteStreams.map((r) => (
        <video
          key={r.id}
          ref={(el) => el && (el.srcObject = r.stream)}
          autoPlay
          playsInline
          className="rounded-lg w-full h-full object-cover"
        />
      ))}
    </div>
  );
}
