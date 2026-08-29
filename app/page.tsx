import Link from "next/link";

import { GAME_LIST } from "@/lib/games/registry";

export const metadata = {
  title: "Stream Prize Games",
  description: "Configurable prize games for live streams.",
};

export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="text-3xl font-semibold">Stream Prize Games</h1>
      <p className="mt-2 text-neutral-700 dark:text-neutral-300">
        Run configurable prize games live on stream. A viewer pays an entry amount, you trigger the
        round from an OBS Browser Source, and the game decides a second amount the viewer then
        sends. You set the payout tables and the odds yourself.
      </p>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
        Prototype: amounts are tracked and displayed, but nothing is charged — there is no payment
        processing.
      </p>

      <h2 className="mt-8 mb-3 text-xl font-semibold">Games</h2>
      <ul className="flex flex-col gap-3">
        {GAME_LIST.map((meta) => (
          <li
            key={meta.id}
            className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-neutral-300 p-4 dark:border-neutral-700"
          >
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold">{meta.name}</h3>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">{meta.tagline}</p>
              <p className="mt-1 text-xs text-neutral-500">{meta.resolution}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Link
                href={`/admin/${meta.id}`}
                className="rounded border border-neutral-400 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
              >
                Streamer settings
              </Link>
              <Link
                href={`/overlay/${meta.id}`}
                target="_blank"
                className="rounded border border-neutral-400 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
              >
                Overlay ↗
              </Link>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-8">
        <Link href="/admin" className="underline">
          All streamer settings →
        </Link>
      </p>
    </main>
  );
}
