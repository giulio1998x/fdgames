"use client";

import { useEffect, useState } from "react";

import { initAudio, isMuted, setMuted } from "@/lib/sound";

/**
 * Streamers often run their own stingers, so the effects have to be easy to
 * silence. The choice is remembered per browser, which is what an OBS source
 * needs — set it once and it sticks across restarts.
 */
export function SoundToggle() {
  const [muted, setLocalMuted] = useState(false);

  // Read after mount: localStorage during SSR would mismatch on hydration.
  useEffect(() => setLocalMuted(isMuted()), []);

  return (
    <button
      type="button"
      aria-label={muted ? "Turn sound on" : "Turn sound off"}
      aria-pressed={!muted}
      onClick={() => {
        const next = !muted;
        setMuted(next);
        setLocalMuted(next);
        if (!next) initAudio();
      }}
      className="rounded border border-white/40 bg-black/60 px-2 py-1 text-sm text-white/80 backdrop-blur-sm transition hover:bg-black/80"
    >
      {muted ? "🔇" : "🔊"}
    </button>
  );
}
