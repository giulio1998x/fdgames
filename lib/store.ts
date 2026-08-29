import { promises as fs } from "node:fs";
import path from "node:path";

import type { ConfigStore, GameId } from "@/lib/types";
import { DEFAULT_CONFIG } from "@/lib/games/registry";
import { normalizeConfig, normalizeStore } from "@/lib/config-schema";

/**
 * Config persistence.
 *
 * Two drivers behind one interface. Locally the config is a JSON file, which
 * needs no setup at all. On Netlify the filesystem is read-only, so it goes to
 * Netlify Blobs instead — the same small blob, just somewhere a serverless
 * function is allowed to write.
 *
 * Server-only: never import this from a client component.
 */

const BLOB_STORE = "stream-prize-games";
const BLOB_KEY = "config";

type StoreDriver = {
  name: "file" | "blobs";
  read(): Promise<unknown>;
  write(store: ConfigStore): Promise<void>;
};

/* ------------------------------------------------------------------ file -- */

/**
 * Where the config lives locally. `DATA_DIR` lets a host with a mounted disk
 * point this somewhere that survives a deploy.
 */
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "games.json");

const fileDriver: StoreDriver = {
  name: "file",
  async read() {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    return JSON.parse(raw);
  },
  async write(store) {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  },
};

/* ----------------------------------------------------------------- blobs -- */

/**
 * Reads are strongly consistent on purpose: the streamer saves in /admin and
 * expects the overlay's next poll to show it. Eventual consistency would let
 * an overlay keep serving the old board for a while, which on stream just
 * looks broken.
 */
async function blobStore() {
  const { getStore } = await import("@netlify/blobs");
  return getStore({ name: BLOB_STORE, consistency: "strong" });
}

const blobsDriver: StoreDriver = {
  name: "blobs",
  async read() {
    const store = await blobStore();
    return store.get(BLOB_KEY, { type: "json" });
  },
  async write(store) {
    const blobs = await blobStore();
    await blobs.setJSON(BLOB_KEY, store);
  },
};

/* ---------------------------------------------------------------- select -- */

/**
 * Netlify injects a Blobs context into the function environment. `STORE_DRIVER`
 * overrides the choice, which is the escape hatch if the detection is ever
 * wrong on a host we have not seen.
 */
function selectDriver(): StoreDriver {
  const forced = process.env.STORE_DRIVER;
  if (forced === "file") return fileDriver;
  if (forced === "blobs") return blobsDriver;

  const onNetlify =
    Boolean(process.env.NETLIFY_BLOBS_CONTEXT) || process.env.NETLIFY === "true";
  return onNetlify ? blobsDriver : fileDriver;
}

export function storeDriverName(): StoreDriver["name"] {
  return selectDriver().name;
}

/** Serialises writes so two admin saves can't interleave a read-modify-write. */
let writeQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(task, task);
  writeQueue = run.catch(() => undefined);
  return run;
}

/**
 * Missing or corrupt config falls back to defaults rather than throwing, so a
 * bad write or a hand-edited file can't take an overlay down mid-stream.
 */
export async function readStore(): Promise<ConfigStore> {
  try {
    const raw = await selectDriver().read();
    if (!raw) return normalizeStore(DEFAULT_CONFIG);
    return normalizeStore(raw);
  } catch {
    return normalizeStore(DEFAULT_CONFIG);
  }
}

export async function readGameConfig<T extends GameId>(
  gameId: T,
): Promise<ConfigStore[T]> {
  const store = await readStore();
  return store[gameId];
}

export async function saveGameConfig<T extends GameId>(
  gameId: T,
  raw: unknown,
): Promise<ConfigStore[T]> {
  return enqueue(async () => {
    const store = await readStore();
    const next = normalizeConfig(gameId, raw);
    await selectDriver().write({ ...store, [gameId]: next });
    return next;
  });
}

export async function resetGameConfig<T extends GameId>(
  gameId: T,
): Promise<ConfigStore[T]> {
  return saveGameConfig(gameId, DEFAULT_CONFIG[gameId]);
}
