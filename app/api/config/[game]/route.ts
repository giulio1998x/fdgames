import type { NextRequest } from "next/server";

import { isGameId } from "@/lib/types";
import { readGameConfig, resetGameConfig, saveGameConfig } from "@/lib/store";

function notAGame(game: string) {
  return Response.json({ error: `Unknown game "${game}"` }, { status: 404 });
}

const NO_STORE = { "cache-control": "no-store" };

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/config/[game]">) {
  const { game } = await ctx.params;
  if (!isGameId(game)) return notAGame(game);

  const config = await readGameConfig(game);
  return Response.json(config, { headers: NO_STORE });
}

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/config/[game]">) {
  const { game } = await ctx.params;
  if (!isGameId(game)) return notAGame(game);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const saved = await saveGameConfig(game, body);
  return Response.json(saved, { headers: NO_STORE });
}

/** Restores the shipped default table for one game. */
export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/config/[game]">) {
  const { game } = await ctx.params;
  if (!isGameId(game)) return notAGame(game);

  const reset = await resetGameConfig(game);
  return Response.json(reset, { headers: NO_STORE });
}
