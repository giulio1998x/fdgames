import type { Outcome, WheelConfig, WheelOutcome, WheelSectorKind } from "@/lib/types";
import { pickWeighted, probabilityOf, type Rng } from "@/lib/odds";

export const MIN_OUTCOMES = 2;
export const MAX_OUTCOMES = 20;
export const MAX_TOTAL_SLICES = 120;
export const MAX_MULTIPLIER = 1000;

/**
 * Multipliers chain, so a board that is mostly multipliers could in principle
 * respin forever. After this many in a row the next spin is forced to draw from
 * the paying sectors.
 */
export const MAX_MULTIPLIER_CHAIN = 8;

export const SECTOR_KINDS: WheelSectorKind[] = ["amount", "multiplier"];

export const SECTOR_KIND_LABELS: Record<WheelSectorKind, string> = {
  amount: "Pays an amount",
  multiplier: "Multiplies the board, then respin",
};

/**
 * On this wheel `weight` is a slice count, not an arc width. Every slice is the
 * same size and a likelier sector simply occupies more of them — the Crazy Time
 * layout. Probability still works out to slices / totalSlices, so the picture
 * and the odds stay in step.
 */
export function sliceCount(outcome: Outcome): number {
  return Math.max(0, Math.round(outcome.weight));
}

export function totalSlices(outcomes: readonly Outcome[]): number {
  return outcomes.reduce((sum, outcome) => sum + sliceCount(outcome), 0);
}

export function isMultiplierSector(outcome: WheelOutcome): boolean {
  return outcome.kind === "multiplier";
}

export function amountSectors(outcomes: readonly WheelOutcome[]): WheelOutcome[] {
  return outcomes.filter((o) => o.kind === "amount");
}

export function multiplierSectors(outcomes: readonly WheelOutcome[]): WheelOutcome[] {
  return outcomes.filter((o) => o.kind === "multiplier");
}

export type WheelSlice = {
  outcome: WheelOutcome;
  outcomeIndex: number;
  sliceIndex: number;
  startDeg: number;
  endDeg: number;
  sweepDeg: number;
};

/**
 * Interleaves each sector's slices evenly around the ring instead of leaving
 * them in one block, so the wheel reads like a real one: 1, 2, 1, x2, 1, 5…
 *
 * Each slice claims an ideal position at (j + 0.5) / count of the way around;
 * sorting all of them by that position spreads every sector as evenly as its
 * count allows.
 */
export function sliceOrder(outcomes: readonly Outcome[]): number[] {
  const total = totalSlices(outcomes);
  if (total === 0) return outcomes.map((_, index) => index);

  const claims: { position: number; outcomeIndex: number }[] = [];
  outcomes.forEach((outcome, outcomeIndex) => {
    const count = sliceCount(outcome);
    for (let j = 0; j < count; j++) {
      claims.push({ position: ((j + 0.5) / count) * total, outcomeIndex });
    }
  });

  claims.sort((a, b) => a.position - b.position || a.outcomeIndex - b.outcomeIndex);
  return claims.map((claim) => claim.outcomeIndex);
}

/** Lays the slices out clockwise from 12 o'clock, all the same size. */
export function wheelSlices(outcomes: readonly WheelOutcome[]): WheelSlice[] {
  const order = sliceOrder(outcomes);
  if (order.length === 0) return [];

  const sweepDeg = 360 / order.length;
  return order.map((outcomeIndex, sliceIndex) => ({
    outcome: outcomes[outcomeIndex],
    outcomeIndex,
    sliceIndex,
    startDeg: sliceIndex * sweepDeg,
    endDeg: (sliceIndex + 1) * sweepDeg,
    sweepDeg,
  }));
}

/** Chance of each sector, for the admin table and the result breakdown. */
export function outcomeProbability(
  outcome: Outcome,
  outcomes: readonly Outcome[],
): number {
  const total = totalSlices(outcomes);
  if (total === 0) return probabilityOf(outcome, outcomes);
  return sliceCount(outcome) / total;
}

/** What a sector shows on the rim, with the running multiplier folded in. */
export function sectorLabel(outcome: WheelOutcome, multiplier: number): string {
  if (outcome.kind === "multiplier") return outcome.label;
  if (multiplier === 1 || outcome.amount <= 0) return outcome.label;

  const scaled = Math.round(outcome.amount * multiplier * 100) / 100;
  return `€${Number.isInteger(scaled) ? scaled : scaled.toFixed(2)}`;
}

/**
 * Scales every paying sector by the running multiplier. Odds are untouched — a
 * multiplier changes what a sector is worth, never how often it comes up.
 */
export function applyMultiplier(config: WheelConfig, multiplier: number): WheelConfig {
  if (multiplier === 1) return config;
  return {
    ...config,
    outcomes: config.outcomes.map((outcome) =>
      outcome.kind === "multiplier"
        ? outcome
        : {
            ...outcome,
            amount: Math.round(outcome.amount * multiplier * 100) / 100,
            label: sectorLabel(outcome, multiplier),
          },
    ),
  };
}

export type WheelSpin = {
  outcome: WheelOutcome;
  slice: WheelSlice;
  probability: number;
  /** Where the wheel comes to rest, normalised to 0..360. */
  targetRotationDeg: number;
  /** True when the round continues at a boosted board. */
  isMultiplier: boolean;
  /** The board multiplier after this spin resolves. */
  multiplierAfter: number;
  /** Set only on a paying sector: what the viewer sends. */
  amount: number;
};

/**
 * Resolves the spin first, then derives the rotation that parks the winning
 * slice under the pointer. The animation never decides anything.
 *
 * `chain` is how many multipliers have already landed this round; once it hits
 * the cap the draw is restricted to paying sectors so the round always ends.
 */
export function spinWheel(
  config: WheelConfig,
  multiplier = 1,
  chain = 0,
  rng: Rng = Math.random,
): WheelSpin {
  const slices = wheelSlices(config.outcomes);
  if (slices.length === 0) {
    throw new Error("spinWheel: wheel has no slices");
  }

  const paying = amountSectors(config.outcomes);
  const capped = chain >= MAX_MULTIPLIER_CHAIN && paying.length > 0;
  const pool = capped ? paying : config.outcomes;

  const outcome = pickWeighted(pool, rng);
  const candidates = slices.filter((slice) => slice.outcome.id === outcome.id);
  const slice =
    candidates.length > 0
      ? candidates[Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))]
      : slices[Math.min(slices.length - 1, Math.floor(rng() * slices.length))];

  // Land inside the slice, clear of both edges.
  const margin = slice.sweepDeg * 0.2;
  const landing = slice.startDeg + margin + rng() * (slice.sweepDeg - margin * 2);

  const landed = slice.outcome;
  const isMultiplier = landed.kind === "multiplier";
  const multiplierAfter = isMultiplier
    ? Math.min(MAX_MULTIPLIER, multiplier * landed.multiplier)
    : multiplier;

  return {
    outcome: landed,
    slice,
    probability: outcomeProbability(landed, config.outcomes),
    targetRotationDeg: (360 - landing) % 360,
    isMultiplier,
    multiplierAfter,
    amount: isMultiplier ? 0 : Math.round(landed.amount * multiplier * 100) / 100,
  };
}

export type WheelExpectation = {
  /** Average amount the viewer ends up sending, respins included. */
  expectedValue: number;
  /** Average amount if a paying sector is hit with the board at x1. */
  baseAmount: number;
  /** Chance any single spin lands on a multiplier. */
  multiplierChance: number;
  /** Average factor of a multiplier sector, given one is hit. */
  averageMultiplier: number;
  /** Average number of spins one play takes. */
  expectedSpins: number;
};

/**
 * EV has to account for the respin chain, not just the paying sectors.
 *
 * A play is a run of multiplier hits followed by one paying sector, so with
 * `pm` the chance of a multiplier, `M` its average factor and `A` the average
 * paying amount, the value of a play is A x sum over k of (pm x M)^k weighted
 * by the chance of exactly k multipliers. The sum is taken to the chain cap
 * rather than to infinity, which also keeps it finite when pm x M >= 1.
 */
export function wheelExpectation(config: WheelConfig): WheelExpectation {
  const total = totalSlices(config.outcomes);
  const paying = amountSectors(config.outcomes);
  const boosters = multiplierSectors(config.outcomes);

  const payingSlices = totalSlices(paying);
  const boosterSlices = totalSlices(boosters);

  if (total === 0 || payingSlices === 0) {
    return {
      expectedValue: 0,
      baseAmount: 0,
      multiplierChance: total > 0 ? boosterSlices / total : 0,
      averageMultiplier: 0,
      expectedSpins: 1,
    };
  }

  const baseAmount =
    paying.reduce((sum, o) => sum + o.amount * sliceCount(o), 0) / payingSlices;
  const averageMultiplier =
    boosterSlices > 0
      ? boosters.reduce((sum, o) => sum + o.multiplier * sliceCount(o), 0) / boosterSlices
      : 0;

  const pm = boosterSlices / total;
  const pa = 1 - pm;

  let expectedValue = 0;
  let expectedSpins = 0;
  for (let k = 0; k < MAX_MULTIPLIER_CHAIN; k++) {
    const reach = Math.pow(pm, k);
    expectedValue += reach * pa * Math.pow(averageMultiplier, k) * baseAmount;
    expectedSpins += reach * pa * (k + 1);
  }
  // Hitting the cap forces a paying sector on the very next spin.
  const atCap = Math.pow(pm, MAX_MULTIPLIER_CHAIN);
  expectedValue += atCap * Math.pow(averageMultiplier, MAX_MULTIPLIER_CHAIN) * baseAmount;
  expectedSpins += atCap * (MAX_MULTIPLIER_CHAIN + 1);

  return { expectedValue, baseAmount, multiplierChance: pm, averageMultiplier, expectedSpins };
}

export function canRemoveOutcome(outcomes: readonly Outcome[]): boolean {
  return outcomes.length > MIN_OUTCOMES;
}

export function canAddOutcome(outcomes: readonly Outcome[]): boolean {
  return outcomes.length < MAX_OUTCOMES;
}

/** Moves a sector one place up or down, for the admin reorder controls. */
export function reorderOutcomes(
  outcomes: readonly WheelOutcome[],
  from: number,
  to: number,
): WheelOutcome[] {
  if (to < 0 || to >= outcomes.length || from < 0 || from >= outcomes.length) {
    return [...outcomes];
  }
  const next = [...outcomes];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Ease-out curve for the spin. Driven from a timer rather than a CSS
 * transition, because the flapper has to know the wheel's angle on every frame
 * to ride over the pegs — and a CSS transition never tells anyone where it is.
 */
export function spinEase(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - clamped, 3.6);
}

/** Where the wheel sits partway through a spin. */
export function angleAt(fromDeg: number, toDeg: number, t: number): number {
  return fromDeg + (toDeg - fromDeg) * spinEase(t);
}

/** How fast it is turning, as a share of its opening speed. */
export function speedAt(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return Math.pow(1 - clamped, 2.6);
}

/**
 * A peg sits on every slice boundary, so the flapper clicks once per slice.
 * Which peg the flapper is on, and how far through it is, follows directly
 * from the rotation.
 */
export function pegPhase(angleDeg: number, pegSpacingDeg: number): number {
  if (pegSpacingDeg <= 0) return 0;
  return (((angleDeg / pegSpacingDeg) % 1) + 1) % 1;
}

export function pegIndexAt(angleDeg: number, pegSpacingDeg: number): number {
  if (pegSpacingDeg <= 0) return 0;
  return Math.floor(angleDeg / pegSpacingDeg);
}

/**
 * How far the flapper is pushed aside, 0..1. It rides up the back of a peg and
 * then snaps off the front, which is why the rise is long and the fall short.
 */
export function flapperLift(phase: number): number {
  const wrapped = ((phase % 1) + 1) % 1;
  return wrapped < 0.78 ? wrapped / 0.78 : (1 - wrapped) / 0.22;
}
