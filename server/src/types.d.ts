export type RoomState = {
  source?: { type: string; url?: string };
  isPlaying?: boolean;
  time?: number; // seconds
  lastActionTs?: number; // ms since epoch
};
