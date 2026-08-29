import type {
  BlackjackConfig,
  ConfigStore,
  GameId,
  PlinkoConfig,
  SlotOutcome,
  SlotPattern,
  SlotsConfig,
  WheelConfig,
  WheelOutcome,
} from "@/lib/types";

/** Terse builder so the default table reads as a table. */
function row(
  id: string,
  label: string,
  amount: number,
  weight: number,
  pattern: Partial<SlotPattern> & Pick<SlotPattern, "kind">,
): SlotOutcome {
  return {
    id,
    label,
    amount,
    weight,
    pattern: {
      kind: pattern.kind,
      symbols: pattern.symbols ?? [],
      exact: pattern.exact ?? ["🍒", "🍒", "🍒"],
    },
  };
}

export type GameMeta = {
  id: GameId;
  name: string;
  tagline: string;
  /** How the outcome is decided, stated plainly for the landing page. */
  resolution: string;
};

export const GAME_META: Record<GameId, GameMeta> = {
  wheel: {
    id: "wheel",
    name: "Wheel of Fortune",
    tagline: "Spin the wheel — the slice under the pointer sets the amount.",
    resolution: "Equal-size slices, Crazy Time style: a likelier result just gets more of them.",
  },
  slots: {
    id: "slots",
    name: "Slot Machine",
    tagline: "Three reels, one payline, 1 to 25 spins in a row.",
    resolution: "Weighted draw from the payout table, shown as one of hundreds of reel pictures.",
  },
  plinko: {
    id: "plinko",
    name: "Plinko",
    tagline: "Drop a ball down the pins onto a multiplier of the entry amount.",
    resolution: "The slot is drawn first; the ball then bounces its way there off every pin.",
  },
  blackjack: {
    id: "blackjack",
    name: "Blackjack",
    tagline: "Play a hand against the dealer — your total and the result both count.",
    resolution: "A real single-deck round; amount is hand value x result multiplier.",
  },
};

export const GAME_LIST: GameMeta[] = [
  GAME_META.wheel,
  GAME_META.slots,
  GAME_META.plinko,
  GAME_META.blackjack,
];

/** Terse builders so the wheel table reads as a table. */
function pays(id: string, label: string, amount: number, weight: number): WheelOutcome {
  return { id, label, amount, weight, kind: "amount", multiplier: 1 };
}

function boosts(id: string, multiplier: number, weight: number): WheelOutcome {
  return { id, label: `×${multiplier}`, amount: 0, weight, kind: "multiplier", multiplier };
}

/**
 * 60 equal slices: 50 that pay and 10 that multiply the board and send it back
 * for another spin. Average result €8.44 on a €5 entry, over about 1.2 spins.
 */
const DEFAULT_WHEEL: WheelConfig = {
  gameId: "wheel",
  entryPrice: 5,
  spinDurationMs: 6500,
  outcomes: [
    pays("w-1", "€1", 1, 18),
    pays("w-2", "€2", 2, 12),
    pays("w-3", "€3", 3, 7),
    pays("w-5", "€5", 5, 4),
    pays("w-8", "€8", 8, 3),
    pays("w-15", "€15", 15, 2),
    pays("w-25", "€25", 25, 2),
    pays("w-free", "Free", 0, 1),
    pays("w-jackpot", "€100", 100, 1),
    boosts("w-x2", 2, 6),
    boosts("w-x3", 3, 3),
    boosts("w-x5", 5, 1),
  ],
};

/**
 * Average result €3.55 on a €5 entry. Each row is a pattern rather than one
 * fixed picture, so the same payout shows a different arrangement every time.
 */
const DEFAULT_SLOTS: SlotsConfig = {
  gameId: "slots",
  entryPrice: 5,
  spinDurationMs: 4400,
  symbolLibrary: ["🍒", "🍋", "🍊", "🍉", "🔔", "⭐", "7️⃣", "🅱️", "💎", "👑"],
  outcomes: [
    row("s-blank", "No match", 0, 40, { kind: "none", symbols: [] }),
    row("s-cherry", "Cherry pair", 1, 25, { kind: "pair", symbols: ["🍒"] }),
    row("s-fruitpair", "Fruit pair", 2, 18, { kind: "pair", symbols: ["🍋", "🍊", "🍉"] }),
    row("s-lemon", "Triple fruit", 3, 15, { kind: "triple", symbols: ["🍋", "🍊", "🍉"] }),
    row("s-bellpair", "Bell pair", 5, 10, { kind: "pair", symbols: ["🔔"] }),
    row("s-bell", "Triple bell", 10, 6, { kind: "triple", symbols: ["🔔"] }),
    row("s-star", "Triple star", 25, 3, { kind: "triple", symbols: ["⭐", "💎", "👑"] }),
    row("s-seven", "Triple seven", 100, 1, { kind: "triple", symbols: ["7️⃣"] }),
  ],
};

/**
 * 1x in the middle escalating to 100x at the edges, binomial weights.
 * Average multiplier 1.83x, so a €1 entry averages €1.83.
 */
const DEFAULT_PLINKO: PlinkoConfig = {
  gameId: "plinko",
  entryPrice: 1,
  pinRows: 12,
  slots: [
    { id: "p-1", label: "100x", multiplier: 100, weight: 1 },
    { id: "p-2", label: "25x", multiplier: 25, weight: 12 },
    { id: "p-3", label: "8x", multiplier: 8, weight: 66 },
    { id: "p-4", label: "3x", multiplier: 3, weight: 220 },
    { id: "p-5", label: "1.5x", multiplier: 1.5, weight: 495 },
    { id: "p-6", label: "1.2x", multiplier: 1.2, weight: 792 },
    { id: "p-7", label: "1x", multiplier: 1, weight: 924 },
    { id: "p-8", label: "1.2x", multiplier: 1.2, weight: 792 },
    { id: "p-9", label: "1.5x", multiplier: 1.5, weight: 495 },
    { id: "p-10", label: "3x", multiplier: 3, weight: 220 },
    { id: "p-11", label: "8x", multiplier: 8, weight: 66 },
    { id: "p-12", label: "25x", multiplier: 25, weight: 12 },
    { id: "p-13", label: "100x", multiplier: 100, weight: 1 },
  ],
};

/**
 * The worked example from the brief: busting is the expensive result, and a
 * loss against the dealer triples it. Simulated average lands near €8.
 */
const DEFAULT_BLACKJACK: BlackjackConfig = {
  gameId: "blackjack",
  entryPrice: 5,
  handAmounts: {
    bust: 5,
    low: 1,
    "17": 1,
    "18": 2,
    "19": 3,
    "20": 4,
    "21": 5,
    blackjack: 10,
  },
  resultMultipliers: {
    win: 1,
    tie: 2,
    loss: 3,
  },
};

export const DEFAULT_CONFIG: ConfigStore = {
  wheel: DEFAULT_WHEEL,
  slots: DEFAULT_SLOTS,
  plinko: DEFAULT_PLINKO,
  blackjack: DEFAULT_BLACKJACK,
};

export function defaultConfigFor<T extends GameId>(gameId: T): ConfigStore[T] {
  return structuredClone(DEFAULT_CONFIG[gameId]);
}
