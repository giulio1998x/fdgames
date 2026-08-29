/**
 * Shared weighted-draw and expected-value math. Every game that resolves from a
 * weights table goes through here so the odds shown in /admin are exactly the
 * odds the overlay rolls against.
 */

export type Rng = () => number;

export type Weighted = { weight: number };

/** Negative or non-finite weights are treated as zero. */
function safeWeight(w: number): number {
  return Number.isFinite(w) && w > 0 ? w : 0;
}

export function totalWeight(items: readonly Weighted[]): number {
  return items.reduce((sum, item) => sum + safeWeight(item.weight), 0);
}

/** Probability of a single row, 0..1. Returns 0 when nothing has weight. */
export function probabilityOf(item: Weighted, items: readonly Weighted[]): number {
  const total = totalWeight(items);
  return total > 0 ? safeWeight(item.weight) / total : 0;
}

/**
 * EV = sum(amount * weight) / totalWeight
 * Returns 0 for an empty table or one where every weight is zero.
 */
export function expectedValue(
  outcomes: readonly (Weighted & { amount: number })[],
): number {
  const total = totalWeight(outcomes);
  if (total <= 0) return 0;
  const weightedSum = outcomes.reduce(
    (sum, o) => sum + (Number.isFinite(o.amount) ? o.amount : 0) * safeWeight(o.weight),
    0,
  );
  return weightedSum / total;
}

/** Same shape as expectedValue, but over multipliers instead of € amounts. */
export function weightedAverageMultiplier(
  slots: readonly (Weighted & { multiplier: number })[],
): number {
  const total = totalWeight(slots);
  if (total <= 0) return 0;
  const weightedSum = slots.reduce(
    (sum, s) =>
      sum + (Number.isFinite(s.multiplier) ? s.multiplier : 0) * safeWeight(s.weight),
    0,
  );
  return weightedSum / total;
}

/**
 * Draws one item, weighted. Throws on an empty list; falls back to a uniform
 * draw when every weight is zero so a half-edited admin table still resolves.
 */
export function pickWeighted<T extends Weighted>(
  items: readonly T[],
  rng: Rng = Math.random,
): T {
  if (items.length === 0) {
    throw new Error("pickWeighted: no items to draw from");
  }

  const total = totalWeight(items);
  if (total <= 0) {
    return items[Math.floor(rng() * items.length) % items.length];
  }

  let roll = rng() * total;
  for (const item of items) {
    roll -= safeWeight(item.weight);
    if (roll < 0) return item;
  }
  // Only reachable through floating-point drift on the final row.
  return items[items.length - 1];
}

/** Index form of pickWeighted, for callers that need the position too. */
export function pickWeightedIndex(
  items: readonly Weighted[],
  rng: Rng = Math.random,
): number {
  const picked = pickWeighted(items, rng);
  return items.indexOf(picked);
}

export function formatEuro(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `€${safe.toFixed(2)}`;
}

export function formatPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(2)}%`;
}

export function formatMultiplier(multiplier: number): string {
  const safe = Number.isFinite(multiplier) ? multiplier : 0;
  const rounded = Math.round(safe * 100) / 100;
  return `${rounded}x`;
}
