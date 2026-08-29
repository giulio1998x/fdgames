import type { PlinkoConfig, PlinkoSlot } from "@/lib/types";
import { pickWeighted, weightedAverageMultiplier, type Rng } from "@/lib/odds";

export const BALL_COUNTS = [1, 3, 5] as const;
export type BallCount = (typeof BALL_COUNTS)[number];

export const MIN_PIN_ROWS = 6;
export const MAX_PIN_ROWS = 16;

export function isBallCount(value: number): value is BallCount {
  return (BALL_COUNTS as readonly number[]).includes(value);
}

export function parseBallCount(value: string | null | undefined): BallCount {
  const parsed = Number(value);
  return isBallCount(parsed) ? parsed : 1;
}

/**
 * Average amount the viewer sends per drop:
 *   entryAmount x weighted average multiplier.
 * It scales with whatever is staked, so the multiplier average is the number
 * the streamer actually tunes.
 */
export function plinkoExpectedValue(
  config: PlinkoConfig,
  entryAmount: number,
): number {
  return entryAmount * weightedAverageMultiplier(config.slots);
}

export type PlinkoDrop = {
  ballNumber: number;
  slot: PlinkoSlot;
  slotIndex: number;
  entryAmount: number;
  multiplier: number;
  amount: number;
  /**
   * Normalised x (0..1) at each pin row: a real lattice walk stepping left or
   * right off every pin, ending on the slot the weighted draw already chose.
   */
  path: number[];
};

export type PlinkoRound = {
  drops: PlinkoDrop[];
  totalEntryCost: number;
  totalAmount: number;
};

export function slotCenter(index: number, slotCount: number): number {
  return (index + 0.5) / slotCount;
}

/** x of a ball that has taken `rights` right-steps out of `step` steps so far. */
export function latticeX(rights: number, step: number, rows: number): number {
  return 0.5 + (rights - step / 2) / (rows + 1);
}

/**
 * Builds the fall as an actual pin-by-pin walk. The landing bin is fixed up
 * front from the weighted draw, then the left/right steps that reach it are
 * shuffled, so every drop looks different while the destination never moves.
 */
function buildPath(
  slotIndex: number,
  slotCount: number,
  pinRows: number,
  rng: Rng,
): number[] {
  const rows = Math.max(1, pinRows);
  const target = slotCenter(slotIndex, slotCount);

  // Closest lattice bin to the slot we have to land in.
  let bin = 0;
  let best = Infinity;
  for (let b = 0; b <= rows; b++) {
    const distance = Math.abs(latticeX(b, rows, rows) - target);
    if (distance < best) {
      best = distance;
      bin = b;
    }
  }

  // A random arrangement of the steps that reach that bin.
  const steps: number[] = Array.from({ length: rows }, (_, i) => (i < bin ? 1 : 0));
  for (let i = steps.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [steps[i], steps[j]] = [steps[j], steps[i]];
  }

  const path = [latticeX(0, 0, rows)];
  let rights = 0;
  steps.forEach((step, index) => {
    rights += step;
    path.push(latticeX(rights, index + 1, rows));
  });

  // Final nudge from the last pin into the slot mouth.
  path.push(target);
  return path;
}

export function dropBall(
  config: PlinkoConfig,
  entryAmount: number,
  rng: Rng = Math.random,
  ballNumber = 1,
): PlinkoDrop {
  if (config.slots.length === 0) {
    throw new Error("dropBall: plinko has no slots");
  }

  const slot = pickWeighted(config.slots, rng);
  const slotIndex = config.slots.indexOf(slot);

  return {
    ballNumber,
    slot,
    slotIndex,
    entryAmount,
    multiplier: slot.multiplier,
    amount: entryAmount * slot.multiplier,
    path: buildPath(slotIndex, config.slots.length, config.pinRows, rng),
  };
}

/** Each ball in a multi-ball round is resolved independently. */
export function dropBalls(
  config: PlinkoConfig,
  entryAmount: number,
  balls: number,
  rng: Rng = Math.random,
): PlinkoRound {
  const count = Math.max(1, Math.floor(balls));
  const drops: PlinkoDrop[] = [];
  for (let i = 0; i < count; i++) {
    drops.push(dropBall(config, entryAmount, rng, i + 1));
  }

  return {
    drops,
    totalEntryCost: entryAmount * count,
    totalAmount: drops.reduce((sum, d) => sum + d.amount, 0),
  };
}

export type TrajectoryPoint = {
  /** Normalised across the board, 0..1. */
  x: number;
  /** In pin rows from the top — fractional between rows. */
  y: number;
  /** Pin the ball is striking on this frame, if any. */
  pinRow?: number;
  pinIndex?: number;
};

const GRAVITY = 26;
/** Upward kick off each pin, as a share of the fall speed. */
const BOUNCE = 1.55;
const SUB_STEPS = 9;

/**
 * Turns the lattice walk into a bouncing fall.
 *
 * Between one pin and the next the ball is a projectile: it pops upward off the
 * pin it just struck, arcs over, and accelerates down under gravity into the
 * next one. Solving `dy = v0*t + g*t^2/2` for the arrival time gives a real
 * parabola rather than a straight glide, and because the lattice is fixed the
 * ball still cannot end up anywhere except the slot already drawn.
 */
export function ballTrajectory(path: readonly number[], pinRows: number): TrajectoryPoint[] {
  const points: TrajectoryPoint[] = [];
  const rows = Math.max(1, pinRows);

  for (let row = 0; row < path.length - 1; row++) {
    const fromX = path[row];
    const toX = path[row + 1];

    // Time to fall one row starting with an upward velocity of BOUNCE.
    const v0 = -BOUNCE;
    const flight = (-v0 + Math.sqrt(v0 * v0 + 2 * GRAVITY)) / GRAVITY;

    for (let step = 0; step < SUB_STEPS; step++) {
      const t = (step / SUB_STEPS) * flight;
      const dy = v0 * t + 0.5 * GRAVITY * t * t;

      points.push({
        x: fromX + (toX - fromX) * (t / flight),
        y: row + dy,
        // Frame 0 of each segment is the moment of contact.
        ...(step === 0 && row > 0
          ? { pinRow: row - 1, pinIndex: pinIndexAt(path, row, rows) }
          : {}),
      });
    }
  }

  points.push({ x: path[path.length - 1], y: path.length - 1 });
  return points;
}

/**
 * Which drawn pin the ball is sitting on at a given step. Row r is drawn with
 * r + 3 pins on the same lattice the walk uses, so the two line up exactly.
 */
function pinIndexAt(path: readonly number[], step: number, rows: number): number {
  const spacing = 1 / (rows + 1);
  const offset = Math.round((path[step] - 0.5) / spacing + step / 2);
  return offset + 1;
}

/** How long the whole fall should take on screen. */
export function trajectoryDurationMs(points: readonly TrajectoryPoint[]): number {
  return points.length * 17;
}

/** n choose k, for the bell-curve weighting a real pin board produces. */
function binomial(n: number, k: number): number {
  let result = 1;
  for (let i = 0; i < k; i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return Math.round(result);
}

export type BoardShape = {
  slotCount: number;
  /** Multiplier at the two outer edges. */
  maxMultiplier: number;
  /** Multiplier in the middle. */
  minMultiplier?: number;
  /** How sharply the multiplier climbs toward the edges. Higher is flatter in the middle. */
  curve?: number;
};

/**
 * Symmetrical board: `minMultiplier` in the middle escalating to
 * `maxMultiplier` at the edges, weighted on the binomial curve a real pin board
 * produces so the centre is hit far more often than the rim.
 */
export function defaultPlinkoSlots({
  slotCount,
  maxMultiplier,
  minMultiplier = 1,
  curve = 4,
}: BoardShape): PlinkoSlot[] {
  const count = Math.max(3, slotCount);
  const middle = (count - 1) / 2;
  const rows = count - 1;

  return Array.from({ length: count }, (_, i) => {
    const distance = Math.abs(i - middle) / middle;
    const multiplier =
      Math.round(
        (minMultiplier + (maxMultiplier - minMultiplier) * Math.pow(distance, curve)) * 100,
      ) / 100;

    return {
      id: `slot-${i + 1}`,
      label: `${multiplier}x`,
      multiplier,
      weight: Math.max(1, binomial(rows, i)),
    };
  });
}
