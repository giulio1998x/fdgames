import {
  DEALER_RESULTS,
  HAND_OUTCOMES,
  type BlackjackConfig,
  type ConfigStore,
  type GameId,
  type Outcome,
  type PlinkoConfig,
  type PlinkoSlot,
  type SlotOutcome,
  type SlotPattern,
  type SlotPatternKind,
  type SlotsConfig,
  type WheelConfig,
  type WheelOutcome,
  type WheelSectorKind,
} from "@/lib/types";
import { defaultConfigFor } from "@/lib/games/registry";
import {
  MAX_MULTIPLIER,
  MAX_OUTCOMES,
  MAX_TOTAL_SLICES,
  MIN_OUTCOMES,
  sliceCount,
} from "@/lib/games/wheel";
import { MAX_PIN_ROWS, MIN_PIN_ROWS } from "@/lib/games/plinko";
import {
  DEFAULT_SYMBOL_LIBRARY,
  MAX_SPIN_MS,
  MIN_SPIN_MS,
  PATTERN_KINDS,
} from "@/lib/games/slots";

/**
 * Everything written to the store passes through here. Admin input arrives as
 * free-typed strings, so each field is coerced and clamped rather than trusted.
 */

type Unknown = Record<string, unknown>;

function asRecord(value: unknown): Unknown {
  return value && typeof value === "object" ? (value as Unknown) : {};
}

function num(value: unknown, fallback: number): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function money(value: unknown, fallback = 0): number {
  return Math.round(clamp(num(value, fallback), 0, 1_000_000) * 100) / 100;
}

function weight(value: unknown, fallback = 1): number {
  return Math.round(clamp(num(value, fallback), 0, 1_000_000) * 100) / 100;
}

function text(value: unknown, fallback: string): string {
  const str = typeof value === "string" ? value.trim() : "";
  return str.length > 0 ? str.slice(0, 60) : fallback;
}

function id(value: unknown, fallback: string): string {
  const str = typeof value === "string" ? value.trim() : "";
  return str.length > 0 ? str.slice(0, 60) : fallback;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeOutcome(raw: unknown, index: number): Outcome {
  const row = asRecord(raw);
  return {
    id: id(row.id, `outcome-${index + 1}`),
    label: text(row.label, `Outcome ${index + 1}`),
    amount: money(row.amount),
    weight: weight(row.weight),
  };
}

/** Symbols are free text now — anything short the streamer wants to show. */
function symbol(value: unknown, fallback: string): string {
  const str = typeof value === "string" ? value.trim() : "";
  return str.length > 0 ? [...str].slice(0, 3).join("") : fallback;
}

function normalizeExact(raw: unknown): [string, string, string] {
  const symbols = list(raw);
  const fallback = DEFAULT_SYMBOL_LIBRARY[0];
  return [
    symbol(symbols[0], fallback),
    symbol(symbols[1], fallback),
    symbol(symbols[2], fallback),
  ];
}

function normalizePattern(raw: unknown): SlotPattern {
  const source = asRecord(raw);
  const kind = PATTERN_KINDS.includes(source.kind as SlotPatternKind)
    ? (source.kind as SlotPatternKind)
    : "exact";

  return {
    kind,
    symbols: list(source.symbols)
      .map((entry) => symbol(entry, ""))
      .filter((entry) => entry.length > 0)
      .slice(0, 20),
    exact: normalizeExact(source.exact),
  };
}

export function normalizeWheel(raw: unknown): WheelConfig {
  const source = asRecord(raw);
  const fallback = defaultConfigFor("wheel");

  let outcomes = list(source.outcomes).map((row, index): WheelOutcome => {
    const record = asRecord(row);
    const outcome = normalizeOutcome(row, index);
    const kind: WheelSectorKind = record.kind === "multiplier" ? "multiplier" : "amount";

    return {
      ...outcome,
      // On the wheel a weight is a slice count, so it must be a whole number.
      weight: Math.round(outcome.weight),
      kind,
      // A multiplier below 1 would shrink the board, which no sector should do.
      multiplier:
        kind === "multiplier"
          ? Math.round(clamp(num(record.multiplier, 2), 1, MAX_MULTIPLIER) * 100) / 100
          : 1,
      // A multiplier sector pays nothing itself; it boosts and respins.
      amount: kind === "multiplier" ? 0 : outcome.amount,
    };
  });

  if (outcomes.length < MIN_OUTCOMES) outcomes = fallback.outcomes;
  if (outcomes.length > MAX_OUTCOMES) outcomes = outcomes.slice(0, MAX_OUTCOMES);
  // Without a paying sector the round could never end, so fall back wholesale.
  if (!outcomes.some((o) => o.kind === "amount" && sliceCount(o) > 0)) {
    outcomes = fallback.outcomes;
  }
  outcomes = capTotalSlices(outcomes);

  return {
    gameId: "wheel",
    entryPrice: money(source.entryPrice, fallback.entryPrice),
    spinDurationMs: clamp(num(source.spinDurationMs, fallback.spinDurationMs), 2000, 20000),
    outcomes: dedupeIds(outcomes),
  };
}

/** Too many slices and the wheel stops being readable, so scale them down. */
function capTotalSlices(outcomes: WheelOutcome[]): WheelOutcome[] {
  const total = outcomes.reduce((sum, outcome) => sum + outcome.weight, 0);
  if (total <= MAX_TOTAL_SLICES) return outcomes;

  const scale = MAX_TOTAL_SLICES / total;
  return outcomes.map((outcome) => ({
    ...outcome,
    weight: Math.max(outcome.weight > 0 ? 1 : 0, Math.round(outcome.weight * scale)),
  }));
}

export function normalizeSlots(raw: unknown): SlotsConfig {
  const source = asRecord(raw);
  const fallback = defaultConfigFor("slots");

  const rows = list(source.outcomes).map((row, index): SlotOutcome => {
    const record = asRecord(row);
    return {
      ...normalizeOutcome(row, index),
      pattern: normalizePattern(record.pattern),
    };
  });

  const library = list(source.symbolLibrary)
    .map((entry) => symbol(entry, ""))
    .filter((entry) => entry.length > 0)
    .slice(0, 40);

  return {
    gameId: "slots",
    entryPrice: money(source.entryPrice, fallback.entryPrice),
    spinDurationMs: clamp(
      num(source.spinDurationMs, fallback.spinDurationMs),
      MIN_SPIN_MS,
      MAX_SPIN_MS,
    ),
    symbolLibrary: [...new Set(library.length > 0 ? library : fallback.symbolLibrary)],
    outcomes: dedupeIds(rows.length > 0 ? rows : fallback.outcomes),
  };
}

function normalizePlinkoSlot(raw: unknown, index: number): PlinkoSlot {
  const row = asRecord(raw);
  const multiplier = Math.round(clamp(num(row.multiplier, 1), 0, 100_000) * 100) / 100;
  return {
    id: id(row.id, `slot-${index + 1}`),
    label: text(row.label, `${multiplier}x`),
    multiplier,
    weight: weight(row.weight),
  };
}

export function normalizePlinko(raw: unknown): PlinkoConfig {
  const source = asRecord(raw);
  const fallback = defaultConfigFor("plinko");

  const slots = list(source.slots).map(normalizePlinkoSlot);

  return {
    gameId: "plinko",
    entryPrice: money(source.entryPrice, fallback.entryPrice),
    pinRows: Math.round(
      clamp(num(source.pinRows, fallback.pinRows), MIN_PIN_ROWS, MAX_PIN_ROWS),
    ),
    slots: dedupeIds(slots.length >= 3 ? slots : fallback.slots),
  };
}

export function normalizeBlackjack(raw: unknown): BlackjackConfig {
  const source = asRecord(raw);
  const fallback = defaultConfigFor("blackjack");
  const amounts = asRecord(source.handAmounts);
  const multipliers = asRecord(source.resultMultipliers);

  return {
    gameId: "blackjack",
    entryPrice: money(source.entryPrice, fallback.entryPrice),
    handAmounts: Object.fromEntries(
      HAND_OUTCOMES.map((key) => [key, money(amounts[key], fallback.handAmounts[key])]),
    ) as BlackjackConfig["handAmounts"],
    resultMultipliers: Object.fromEntries(
      DEALER_RESULTS.map((key) => [
        key,
        Math.round(clamp(num(multipliers[key], fallback.resultMultipliers[key]), 0, 1000) * 100) /
          100,
      ]),
    ) as BlackjackConfig["resultMultipliers"],
  };
}

/** Duplicate ids break React keys and the reorder controls, so re-suffix them. */
function dedupeIds<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.map((row, index) => {
    if (!seen.has(row.id)) {
      seen.add(row.id);
      return row;
    }
    const unique = `${row.id}-${index}`;
    seen.add(unique);
    return { ...row, id: unique };
  });
}

export function normalizeConfig<T extends GameId>(gameId: T, raw: unknown): ConfigStore[T] {
  switch (gameId) {
    case "wheel":
      return normalizeWheel(raw) as ConfigStore[T];
    case "slots":
      return normalizeSlots(raw) as ConfigStore[T];
    case "plinko":
      return normalizePlinko(raw) as ConfigStore[T];
    case "blackjack":
      return normalizeBlackjack(raw) as ConfigStore[T];
    default:
      return defaultConfigFor(gameId);
  }
}

export function normalizeStore(raw: unknown): ConfigStore {
  const source = asRecord(raw);
  return {
    wheel: normalizeWheel(source.wheel),
    slots: normalizeSlots(source.slots),
    plinko: normalizePlinko(source.plinko),
    blackjack: normalizeBlackjack(source.blackjack),
  };
}
