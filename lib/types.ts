export type GameId = "wheel" | "slots" | "plinko" | "blackjack";

export const GAME_IDS: GameId[] = ["wheel", "slots", "plinko", "blackjack"];

export function isGameId(value: string): value is GameId {
  return (GAME_IDS as string[]).includes(value);
}

/**
 * A weighted result row. `amount` is what the viewer sends when this comes up —
 * the streamer never pays anything out, so a high amount is a good result for
 * the streamer, not a liability.
 */
export type Outcome = {
  id: string;
  label: string;
  /** € the viewer sends when this outcome lands. */
  amount: number;
  /**
   * Relative probability weight. On the wheel this is literally the number of
   * equal-size slices the outcome occupies, Crazy Time style.
   */
  weight: number;
};

type BaseGameConfig = {
  gameId: GameId;
  /** Entry cost to play once. */
  entryPrice: number;
};

export type WheelSectorKind = "amount" | "multiplier";

/**
 * A wheel sector. An "amount" sector ends the round; a "multiplier" sector
 * scales every amount on the board and sends it back for another spin, the way
 * a Crazy Time multiplier segment does.
 */
export type WheelOutcome = Outcome & {
  kind: WheelSectorKind;
  /** Factor applied to the whole board. Only read when kind is "multiplier". */
  multiplier: number;
};

export type WheelConfig = BaseGameConfig & {
  gameId: "wheel";
  /** Every slice is the same size; a likelier sector simply gets more of them. */
  outcomes: WheelOutcome[];
  spinDurationMs: number;
};

export type SlotPatternKind = "triple" | "pair" | "none" | "exact";

/**
 * How the reels should *look* when this row comes up. One row expands into
 * every arrangement that matches, so the same payout shows a different picture
 * each time: a cherry pair lands on reels 1+2, or 1+3, or 2+3, with any other
 * symbol filling the gap.
 */
export type SlotPattern = {
  kind: SlotPatternKind;
  /** Candidate symbols for "triple" and "pair". */
  symbols: string[];
  /** Fixed reel triple, used only when kind is "exact". */
  exact: [string, string, string];
};

export type SlotOutcome = Outcome & {
  pattern: SlotPattern;
};

export type SlotsConfig = BaseGameConfig & {
  gameId: "slots";
  outcomes: SlotOutcome[];
  /** How long one spin takes. Multi-spin rounds compress this automatically. */
  spinDurationMs: number;
  /** Streamer's own symbol set, offered as suggestions in the editor. */
  symbolLibrary: string[];
};

export type PlinkoSlot = {
  id: string;
  label: string;
  /** Plinko results are a multiple of the entry amount, not a flat €. */
  multiplier: number;
  /** How often the ball lands here, independent of visual width. */
  weight: number;
};

export type PlinkoConfig = BaseGameConfig & {
  gameId: "plinko";
  pinRows: number;
  slots: PlinkoSlot[];
};

/**
 * Every total the player can actually finish on. The spec names bust / 17-20 /
 * blackjack; `low` (stood on 16 or less) and `21` (three-card 21) are real
 * reachable states too, so they get their own configurable amount.
 */
export type HandOutcome =
  | "bust"
  | "low"
  | "17"
  | "18"
  | "19"
  | "20"
  | "21"
  | "blackjack";

export const HAND_OUTCOMES: HandOutcome[] = [
  "bust",
  "low",
  "17",
  "18",
  "19",
  "20",
  "21",
  "blackjack",
];

export const HAND_OUTCOME_LABELS: Record<HandOutcome, string> = {
  bust: "Bust (over 21)",
  low: "Stood on 16 or less",
  "17": "17",
  "18": "18",
  "19": "19",
  "20": "20",
  "21": "21 (three or more cards)",
  blackjack: "Blackjack (natural 21)",
};

export type DealerResult = "win" | "tie" | "loss";

export const DEALER_RESULTS: DealerResult[] = ["win", "tie", "loss"];

export type BlackjackConfig = BaseGameConfig & {
  gameId: "blackjack";
  /** € base amount for each possible player hand outcome. */
  handAmounts: Record<HandOutcome, number>;
  /** Multiplier applied on top, based on the result vs the dealer. */
  resultMultipliers: Record<DealerResult, number>;
};

export type GameConfig =
  | WheelConfig
  | SlotsConfig
  | PlinkoConfig
  | BlackjackConfig;

export type ConfigStore = {
  wheel: WheelConfig;
  slots: SlotsConfig;
  plinko: PlinkoConfig;
  blackjack: BlackjackConfig;
};

export type ConfigFor<T extends GameId> = ConfigStore[T];
