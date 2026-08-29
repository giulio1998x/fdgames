"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/admin/ui";
import { BlackjackEditor } from "@/components/admin/BlackjackEditor";
import { PlinkoEditor } from "@/components/admin/PlinkoEditor";
import { SlotsEditor } from "@/components/admin/SlotsEditor";
import { WheelEditor } from "@/components/admin/WheelEditor";
import { GAME_META } from "@/lib/games/registry";
import type { GameConfig, GameId } from "@/lib/types";

type SaveState = "idle" | "saving" | "saved" | "error";

export function GameConfigEditor({ gameId }: { gameId: GameId }) {
  const [draft, setDraft] = useState<GameConfig | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  const meta = GAME_META[gameId];

  // Read after mount: rendering window.location during SSR would mismatch.
  useEffect(() => setOrigin(window.location.origin), []);

  // No polling here: an editor that refetched under the cursor would throw away
  // unsaved edits. The overlay is the side that follows the store.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch(`/api/config/${gameId}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`Load failed (${response.status})`);
        const payload = await response.text();
        if (!active) return;
        setDraft(JSON.parse(payload) as GameConfig);
        setSaved(payload);
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : "Load failed");
      }
    })();
    return () => {
      active = false;
    };
  }, [gameId]);

  const dirty = useMemo(
    () => draft !== null && JSON.stringify(draft) !== saved,
    [draft, saved],
  );

  async function save() {
    if (!draft) return;
    setSaveState("saving");
    setMessage(null);

    try {
      const response = await fetch(`/api/config/${gameId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!response.ok) throw new Error(`Save failed (${response.status})`);

      // The server normalises and clamps, so adopt what it stored, not the draft.
      const payload = await response.text();
      setDraft(JSON.parse(payload) as GameConfig);
      setSaved(payload);
      setSaveState("saved");
      setMessage("Saved. Open overlays pick this up within a few seconds.");
    } catch (error) {
      setSaveState("error");
      setMessage(error instanceof Error ? error.message : "Save failed");
    }
  }

  async function resetToDefault() {
    setSaveState("saving");
    try {
      const response = await fetch(`/api/config/${gameId}`, { method: "DELETE" });
      if (!response.ok) throw new Error(`Reset failed (${response.status})`);
      const payload = await response.text();
      setDraft(JSON.parse(payload) as GameConfig);
      setSaved(payload);
      setSaveState("saved");
      setMessage("Restored the shipped default table.");
    } catch (error) {
      setSaveState("error");
      setMessage(error instanceof Error ? error.message : "Reset failed");
    }
  }

  if (!draft) {
    return <p className="text-sm text-neutral-500">{message ?? "Loading config…"}</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{meta.name}</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">{meta.tagline}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/overlay/${gameId}`}
            target="_blank"
            className="rounded border border-neutral-400 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
          >
            Overlay ↗
          </Link>
        </div>
      </header>

      {renderEditor(draft, setDraft)}

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-neutral-300 bg-white/95 py-3 backdrop-blur dark:border-neutral-700 dark:bg-neutral-950/95">
        <Button variant="primary" onClick={save} disabled={!dirty || saveState === "saving"}>
          {saveState === "saving" ? "Saving…" : "Save config"}
        </Button>
        <Button variant="danger" onClick={resetToDefault} disabled={saveState === "saving"}>
          Reset to default
        </Button>
        <span className="text-sm text-neutral-600 dark:text-neutral-400">
          {dirty ? "Unsaved changes" : message ?? "No unsaved changes"}
        </span>
        {message && dirty ? <span className="text-sm text-neutral-500">{message}</span> : null}
      </div>

      <details className="rounded border border-neutral-300 p-3 text-sm dark:border-neutral-700">
        <summary className="cursor-pointer font-medium">OBS Browser Source URL</summary>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          Add this as a Browser Source. It renders on a transparent background, so nothing behind it
          on the scene is covered.
        </p>
        <code className="mt-2 block overflow-x-auto rounded bg-neutral-100 px-2 py-1 dark:bg-neutral-800">
          {`${origin}/overlay/${gameId}?entry=${draft.entryPrice}`}
        </code>
      </details>
    </div>
  );
}

function renderEditor(draft: GameConfig, setDraft: (next: GameConfig) => void) {
  switch (draft.gameId) {
    case "wheel":
      return <WheelEditor config={draft} onChange={setDraft} />;
    case "slots":
      return <SlotsEditor config={draft} onChange={setDraft} />;
    case "plinko":
      return <PlinkoEditor config={draft} onChange={setDraft} />;
    case "blackjack":
      return <BlackjackEditor config={draft} onChange={setDraft} />;
  }
}

