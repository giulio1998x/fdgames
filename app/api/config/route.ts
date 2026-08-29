import { readStore } from "@/lib/store";

/** Every config at once — used by the admin index to show EV per game. */
export async function GET() {
  const store = await readStore();
  return Response.json(store, {
    headers: { "cache-control": "no-store" },
  });
}
