/**
 * How often an open overlay re-checks the stored config.
 *
 * On a normal server this could be every second and cost nothing, but on
 * serverless hosts every poll is a billed function invocation: at 4s an
 * overlay left open burns ~900 requests an hour, which eats a free tier in a
 * few streams. 20s keeps an admin save reaching OBS quickly enough while
 * costing an eighth as much. Override per overlay with ?poll=<seconds>.
 *
 * Deliberately not a client module — the overlay page reads the query
 * parameter on the server before handing it to the client component.
 */
export const DEFAULT_POLL_MS = 20_000;

export const MIN_POLL_MS = 1_000;
export const MAX_POLL_MS = 600_000;

/** Reads ?poll=<seconds>. 0 turns polling off entirely. */
export function parsePollMs(value: string | null | undefined): number {
  if (value === null || value === undefined || value === "") return DEFAULT_POLL_MS;

  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return DEFAULT_POLL_MS;
  if (seconds === 0) return 0;

  return Math.min(MAX_POLL_MS, Math.max(MIN_POLL_MS, Math.round(seconds * 1000)));
}
