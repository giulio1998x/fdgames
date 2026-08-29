import { storeDriverName } from "@/lib/store";
import { DEFAULT_POLL_MS } from "@/lib/polling";

/**
 * Cheap deploy check. The one thing worth confirming after going live is that
 * the config store picked the right driver — on a serverless host the file
 * driver would read fine and then fail on the first save, which is easy to miss
 * until a streamer tries to change their payouts mid-stream.
 */
export async function GET() {
  const storeDriver = storeDriverName();
  const onNetlify =
    Boolean(process.env.NETLIFY_BLOBS_CONTEXT) || process.env.NETLIFY === "true";

  return Response.json(
    {
      ok: storeDriver === "blobs" || !onNetlify,
      storeDriver,
      note:
        storeDriver === "blobs"
          ? "Config is stored in Netlify Blobs and survives deploys."
          : onNetlify
            ? "On Netlify but using the file store — saves will fail. Set STORE_DRIVER=blobs."
            : "Local file store at data/games.json.",
      pollSeconds: DEFAULT_POLL_MS / 1000,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
