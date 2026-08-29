"use client";

import { OverlayStatus } from "@/components/OverlayShell";
import { BlackjackGame } from "@/components/games/BlackjackGame";
import { PlinkoGame } from "@/components/games/PlinkoGame";
import { SlotsGame } from "@/components/games/SlotsGame";
import { WheelGame } from "@/components/games/WheelGame";
import type { BallCount } from "@/lib/games/plinko";
import type { SpinCount } from "@/lib/games/slots";
import { useGameConfig } from "@/lib/use-game-config";
import type { GameId } from "@/lib/types";

/**
 * Picks the right game view and keeps it on the current stored config. Polling
 * lives in useGameConfig, so an overlay left open in OBS follows admin edits.
 */
export function GameStage({
  gameId,
  entryAmount,
  spinCount = 1,
  ballCount = 1,
  pollMs,
  tone = "overlay",
}: {
  gameId: GameId;
  entryAmount: number | null;
  spinCount?: SpinCount;
  ballCount?: BallCount;
  /** How often to re-check the stored config. 0 disables polling. */
  pollMs?: number;
  tone?: "overlay" | "light";
}) {
  const { config, loading, error } = useGameConfig(gameId, pollMs);

  if (error) return <OverlayStatus>Config error: {error}</OverlayStatus>;
  if (loading || !config) return <OverlayStatus>Loading config…</OverlayStatus>;

  switch (config.gameId) {
    case "wheel":
      return (
        <WheelGame config={config} entryAmount={entryAmount} tone={tone} />
      );
    case "slots":
      return (
        <SlotsGame
          config={config}
          entryAmount={entryAmount}
          spinCount={spinCount}
          tone={tone}
        />
      );
    case "plinko":
      return (
        <PlinkoGame
          config={config}
          entryAmount={entryAmount}
          ballCount={ballCount}
          tone={tone}
        />
      );
    case "blackjack":
      return <BlackjackGame config={config} entryAmount={entryAmount} tone={tone} />;
  }
}
