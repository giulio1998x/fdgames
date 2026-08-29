import Link from "next/link";
import { notFound } from "next/navigation";

import { GameConfigEditor } from "@/components/admin/GameConfigEditor";
import { GAME_IDS, isGameId } from "@/lib/types";

export function generateStaticParams() {
  return GAME_IDS.map((game) => ({ game }));
}

export default async function AdminGamePage({
  params,
}: {
  params: Promise<{ game: string }>;
}) {
  const { game } = await params;
  if (!isGameId(game)) notFound();

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <nav className="mb-6 text-sm">
        <Link href="/admin" className="underline">
          ← All games
        </Link>
      </nav>

      <GameConfigEditor gameId={game} />
    </main>
  );
}
