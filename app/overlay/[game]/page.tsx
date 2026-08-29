import { notFound } from "next/navigation";

import { GameStage } from "@/components/games/GameStage";
import { OverlayShell } from "@/components/OverlayShell";
import { GAME_META } from "@/lib/games/registry";
import { parseBallCount } from "@/lib/games/plinko";
import { parseSpinCount } from "@/lib/games/slots";
import { parsePollMs } from "@/lib/polling";
import { isGameId } from "@/lib/types";

function firstValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function OverlayPage({
  params,
  searchParams,
}: {
  params: Promise<{ game: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { game } = await params;
  if (!isGameId(game)) notFound();

  const query = await searchParams;
  const meta = GAME_META[game];

  const rawEntry = firstValue(query.entry);
  const parsedEntry = rawEntry === null ? NaN : Number(rawEntry.replace(",", "."));
  const entryAmount = Number.isFinite(parsedEntry) && parsedEntry > 0 ? parsedEntry : null;

  return (
    <OverlayShell
      title={meta.name}
      footer={
        entryAmount !== null
          ? `Entry amount for this round: €${entryAmount.toFixed(2)}`
          : "No entry amount passed — add ?entry=5 to the URL"
      }
    >
      <GameStage
        gameId={game}
        entryAmount={entryAmount}
        spinCount={parseSpinCount(firstValue(query.spins))}
        ballCount={parseBallCount(firstValue(query.balls))}
        pollMs={parsePollMs(firstValue(query.poll))}
        tone="overlay"
      />
    </OverlayShell>
  );
}
