"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { DEFAULT_POLL_MS } from "@/lib/polling";
import type { ConfigStore, GameId } from "@/lib/types";

type State<T extends GameId> = {
  config: ConfigStore[T] | null;
  error: string | null;
  loading: boolean;
};

/**
 * Loads one game's config from the API and re-polls it, so an overlay already
 * open in OBS picks up admin edits without a reload or a rebuild. State is only
 * replaced when the payload actually changed, to avoid resetting a live round.
 */
export function useGameConfig<T extends GameId>(gameId: T, pollMs = DEFAULT_POLL_MS) {
  const [state, setState] = useState<State<T>>({
    config: null,
    error: null,
    loading: true,
  });
  const lastPayload = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/config/${gameId}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Config request failed (${response.status})`);

      const payload = await response.text();
      if (payload === lastPayload.current) {
        setState((prev) => (prev.loading ? { ...prev, loading: false } : prev));
        return;
      }

      lastPayload.current = payload;
      setState({ config: JSON.parse(payload) as ConfigStore[T], error: null, loading: false });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : "Could not load config",
      }));
    }
  }, [gameId]);

  useEffect(() => {
    void load();
    if (pollMs <= 0) return;

    const timer = setInterval(() => void load(), pollMs);

    // Coming back to the tab is a strong hint the config may have just changed
    // — it is usually the streamer returning from /admin. Free, and it makes
    // the slower interval far less noticeable.
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, pollMs]);

  return { ...state, refresh: load };
}
