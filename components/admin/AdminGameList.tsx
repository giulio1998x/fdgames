"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { expectedValue, formatEuro, formatMultiplier, weightedAverageMultiplier } from "@/lib/odds";
import { GAME_LIST } from "@/lib/games/registry";
import { multiplierSectors, totalSlices, wheelExpectation } from "@/lib/games/wheel";
import type { ConfigStore, GameId } from "@/lib/types";

type Summary = { ev: number | null; entryPrice: number; detail: string };

/** Blackjack has no weights table, so its EV is only meaningful in its editor. */
function summarise(store: ConfigStore, gameId: GameId): Summary {
  switch (gameId) {
    case "wheel": {
      const boosters = multiplierSectors(store.wheel.outcomes).length;
      return {
        ev: wheelExpectation(store.wheel).expectedValue,
        entryPrice: store.wheel.entryPrice,
        detail: `${totalSlices(store.wheel.outcomes)} slices${
          boosters > 0 ? `, ${boosters} multiplier sector${boosters === 1 ? "" : "s"}` : ""
        }`,
      };
    }
    case "slots":
      return {
        ev: expectedValue(store.slots.outcomes),
        entryPrice: store.slots.entryPrice,
        detail: `${store.slots.outcomes.length} payout rows`,
      };
    case "plinko": {
      const average = weightedAverageMultiplier(store.plinko.slots);
      return {
        ev: store.plinko.entryPrice * average,
        entryPrice: store.plinko.entryPrice,
        detail: `${store.plinko.slots.length} slots, avg ${formatMultiplier(average)}`,
      };
    }
    case "blackjack":
      return {
        ev: null,
        entryPrice: store.blackjack.entryPrice,
        detail: "average is simulated — open the config to see it",
      };
  }
}

export function AdminGameList() {
  const [store, setStore] = useState<ConfigStore | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/config", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`Load failed (${response.status})`);
        return response.json() as Promise<ConfigStore>;
      })
      .then((data) => active && setStore(data))
      .catch((err: Error) => active && setError(err.message));
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex flex-col gap-3">
      {GAME_LIST.map((meta) => {
        const summary = store ? summarise(store, meta.id) : null;
        return (
          <div
            key={meta.id}
            className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-neutral-300 p-4 dark:border-neutral-700"
          >
            <div className="min-w-0">
              <h2 className="font-semibold">{meta.name}</h2>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">{meta.tagline}</p>
              <p className="mt-1 text-xs text-neutral-500">
                {error
                  ? `Config error: ${error}`
                  : summary
                    ? `Entry ${formatEuro(summary.entryPrice)} · ${summary.detail}${
                        summary.ev !== null ? ` · avg result ${formatEuro(summary.ev)}` : ""
                      }`
                    : "Loading config…"}
              </p>
            </div>

            <div className="flex gap-2">
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
          </div>
        );
      })}
    </div>
  );
}
