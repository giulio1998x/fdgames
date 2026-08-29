import type {
  SlotOutcome,
  SlotPattern,
  SlotPatternKind,
  SlotsConfig,
} from "@/lib/types";
import { pickWeighted, type Rng } from "@/lib/odds";

export const SPIN_COUNTS = [1, 5, 10, 25] as const;
export type SpinCount = (typeof SPIN_COUNTS)[number];

/** Only a starting point — the streamer replaces these with their own set. */
export const DEFAULT_SYMBOL_LIBRARY = [
  "🍒", "🍋", "🍊", "🍉", "🔔", "⭐", "7️⃣", "🅱️", "💎", "👑",
];

export const MIN_SPIN_MS = 1200;
export const MAX_SPIN_MS = 12000;

export const PATTERN_KINDS: SlotPatternKind[] = ["triple", "pair", "none", "exact"];

export const PATTERN_LABELS: Record<SlotPatternKind, string> = {
  triple: "Three of a kind",
  pair: "A pair, any third symbol",
  none: "No match — three different symbols",
  exact: "One fixed combination",
};

export type Triple = [string, string, string];

/** The three ways a pair can sit across the reels. */
const PAIR_POSITIONS: [number, number][] = [
  [0, 1],
  [0, 2],
  [1, 2],
];

export function isSpinCount(value: number): value is SpinCount {
  return (SPIN_COUNTS as readonly number[]).includes(value);
}

export function parseSpinCount(value: string | null | undefined): SpinCount {
  const parsed = Number(value);
  return isSpinCount(parsed) ? parsed : 1;
}

/**
 * A single spin gets the full ceremony. Longer rounds compress each spin so 25
 * of them stay watchable instead of running for two minutes.
 */
export function spinDurationFor(config: SlotsConfig, spins: number): number {
  if (spins <= 1) return config.spinDurationMs;
  return Math.max(650, Math.round(config.spinDurationMs / Math.sqrt(spins)));
}

/** Every symbol in play, so the blur and the fillers look native to this set. */
export function allSymbols(config: SlotsConfig): string[] {
  const seen = new Set<string>();
  for (const symbol of config.symbolLibrary) if (symbol) seen.add(symbol);
  for (const outcome of config.outcomes) {
    for (const symbol of outcome.pattern.symbols) if (symbol) seen.add(symbol);
    for (const symbol of outcome.pattern.exact) if (symbol) seen.add(symbol);
  }
  return seen.size > 0 ? [...seen] : [...DEFAULT_SYMBOL_LIBRARY];
}

function candidates(pattern: SlotPattern, pool: readonly string[]): string[] {
  const usable = pattern.symbols.filter((symbol) => symbol.length > 0);
  return usable.length > 0 ? usable : [pool[0] ?? DEFAULT_SYMBOL_LIBRARY[0]];
}

/**
 * How many distinct reel pictures this row can show. Counted with a formula
 * rather than by listing them, because "no match" alone runs to hundreds.
 */
export function combinationCount(
  pattern: SlotPattern,
  pool: readonly string[],
): number {
  const n = pool.length;
  switch (pattern.kind) {
    case "triple":
      return candidates(pattern, pool).length;
    case "pair":
      // symbol x (which two reels hold it) x (any different symbol between them)
      return candidates(pattern, pool).length * PAIR_POSITIONS.length * Math.max(0, n - 1);
    case "none":
      // Three different symbols, so it can never be mistaken for a winning row.
      return Math.max(0, n * (n - 1) * (n - 2));
    case "exact":
      return 1;
  }
}

function pick<T>(items: readonly T[], rng: Rng): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

/**
 * Draws one of the row's arrangements uniformly. Built directly rather than by
 * enumerating first, so a row with thousands of pictures costs nothing.
 */
export function pickCombination(
  pattern: SlotPattern,
  pool: readonly string[],
  rng: Rng = Math.random,
): Triple {
  const symbols = pool.length > 0 ? pool : DEFAULT_SYMBOL_LIBRARY;

  switch (pattern.kind) {
    case "triple": {
      const symbol = pick(candidates(pattern, symbols), rng);
      return [symbol, symbol, symbol];
    }
    case "pair": {
      const symbol = pick(candidates(pattern, symbols), rng);
      const [a, b] = pick(PAIR_POSITIONS, rng);
      // The odd reel must differ, or the pair would read as three of a kind.
      const fillers = symbols.filter((s) => s !== symbol);
      const filler = fillers.length > 0 ? pick(fillers, rng) : symbol;

      const triple: Triple = [filler, filler, filler];
      triple[a] = symbol;
      triple[b] = symbol;
      return triple;
    }
    case "none": {
      if (symbols.length < 3) {
        const only = symbols[0] ?? DEFAULT_SYMBOL_LIBRARY[0];
        return [only, only, only];
      }
      const remaining = [...symbols];
      const drawn: string[] = [];
      for (let i = 0; i < 3; i++) {
        const index = Math.min(remaining.length - 1, Math.floor(rng() * remaining.length));
        drawn.push(remaining[index]);
        remaining.splice(index, 1);
      }
      return [drawn[0], drawn[1], drawn[2]];
    }
    case "exact":
      return [...pattern.exact] as Triple;
  }
}

/** A handful of arrangements, for the admin preview. */
export function sampleCombinations(
  pattern: SlotPattern,
  pool: readonly string[],
  count = 4,
  rng: Rng = Math.random,
): Triple[] {
  const seen = new Map<string, Triple>();
  const total = combinationCount(pattern, pool);
  const wanted = Math.min(count, Math.max(1, total));

  for (let attempt = 0; attempt < wanted * 40 && seen.size < wanted; attempt++) {
    const triple = pickCombination(pattern, pool, rng);
    seen.set(triple.join("|"), triple);
  }
  return [...seen.values()];
}

export type SlotSpinResult = {
  spinNumber: number;
  outcome: SlotOutcome;
  symbols: Triple;
  amount: number;
};

export type SlotRound = {
  results: SlotSpinResult[];
  totalAmount: number;
  totalEntryCost: number;
};

export function spinOnce(
  config: SlotsConfig,
  rng: Rng = Math.random,
  spinNumber = 1,
  pool = allSymbols(config),
): SlotSpinResult {
  // The row is drawn from the weights first; the picture is chosen afterwards.
  const outcome = pickWeighted(config.outcomes, rng);
  return {
    spinNumber,
    outcome,
    symbols: pickCombination(outcome.pattern, pool, rng),
    amount: outcome.amount,
  };
}

/** Each spin in a multi-spin round is drawn independently. */
export function spinSlots(
  config: SlotsConfig,
  spins: number,
  rng: Rng = Math.random,
): SlotRound {
  if (config.outcomes.length === 0) {
    throw new Error("spinSlots: outcomes table is empty");
  }

  const pool = allSymbols(config);
  const count = Math.max(1, Math.floor(spins));
  const results: SlotSpinResult[] = [];
  for (let i = 0; i < count; i++) {
    results.push(spinOnce(config, rng, i + 1, pool));
  }

  return {
    results,
    totalAmount: results.reduce((sum, r) => sum + r.amount, 0),
    totalEntryCost: config.entryPrice * count,
  };
}

/** How many different pictures the whole machine can show. */
export function totalCombinations(config: SlotsConfig): number {
  const pool = allSymbols(config);
  return config.outcomes.reduce(
    (sum, outcome) => sum + combinationCount(outcome.pattern, pool),
    0,
  );
}

/** How often a neighbouring row echoes a payline symbol, for near misses. */
const NEAR_MISS_CHANCE = 0.45;

export type ReelStrip = {
  strip: string[];
  /** Index in the strip that must come to rest on the centre payline. */
  centerIndex: number;
  /**
   * Highest offset the free-running blur may reach. Past this the reel would
   * expose the landing rows early and spoil the stop.
   */
  blurLimit: number;
};

function neighbourPicker(
  paylineSymbols: readonly string[],
  pool: readonly string[],
  rng: Rng,
) {
  const source = pool.length > 0 ? pool : DEFAULT_SYMBOL_LIBRARY;
  const teases = paylineSymbols.filter((symbol) => symbol.length > 0);
  const random = () => source[Math.min(source.length - 1, Math.floor(rng() * source.length))];

  return () => {
    if (teases.length > 0 && rng() < NEAR_MISS_CHANCE) {
      return teases[Math.min(teases.length - 1, Math.floor(rng() * teases.length))];
    }
    return random();
  };
}

/**
 * The strip a reel scrolls through.
 *
 * The window shows three rows but only the middle one pays, so the strip ends
 * with the result in the centre and a neighbour either side. Neighbours lean
 * toward symbols already on the payline, which is what produces the near misses
 * that make a spin worth watching — a third cherry sitting one row above the
 * two that landed.
 *
 * `blurFrames` is how many symbols the reel runs through at full speed before
 * it stops, so the strip is built exactly long enough for the spin.
 */
export function blurStrip(
  centerSymbol: string,
  paylineSymbols: readonly string[],
  pool: readonly string[],
  blurFrames: number,
  rng: Rng = Math.random,
): ReelStrip {
  const source = pool.length > 0 ? pool : DEFAULT_SYMBOL_LIBRARY;
  const random = () => source[Math.min(source.length - 1, Math.floor(rng() * source.length))];
  const neighbour = neighbourPicker(paylineSymbols, source, rng);

  const runway = Math.max(4, Math.floor(blurFrames));
  const strip: string[] = [];
  // Two rows of lead-in are always visible below the window as it starts.
  for (let i = 0; i < runway + 2; i++) strip.push(random());

  strip.push(neighbour());
  const centerIndex = strip.length;
  strip.push(centerSymbol);
  strip.push(neighbour());

  return {
    strip,
    centerIndex,
    // Stop the blur two rows short so the landing rows stay hidden until the snap.
    blurLimit: Math.max(0, centerIndex - 3),
  };
}

/** Back-compat shape for callers that only need the window, not the runway. */
export function reelStrip(
  centerSymbol: string,
  paylineSymbols: readonly string[],
  pool: readonly string[],
  length = 16,
  rng: Rng = Math.random,
): ReelStrip {
  return blurStrip(centerSymbol, paylineSymbols, pool, Math.max(1, length - 5), rng);
}
