import type {
  BlackjackConfig,
  DealerResult,
  HandOutcome,
} from "@/lib/types";
import type { Rng } from "@/lib/odds";

export const SUITS = ["♠", "♥", "♦", "♣"] as const;
export const RANKS = [
  "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K",
] as const;

export type Suit = (typeof SUITS)[number];
export type Rank = (typeof RANKS)[number];
export type Card = { rank: Rank; suit: Suit; id: string };

export function isRedSuit(suit: Suit): boolean {
  return suit === "♥" || suit === "♦";
}

export function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit, id: `${rank}${suit}` });
    }
  }
  return deck;
}

export function shuffle(deck: readonly Card[], rng: Rng = Math.random): Card[] {
  const next = [...deck];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export type HandValue = { total: number; soft: boolean };

/** Aces count 11 while that keeps the hand at 21 or under, otherwise 1. */
export function handValue(cards: readonly Card[]): HandValue {
  let total = 0;
  let aces = 0;

  for (const card of cards) {
    if (card.rank === "A") {
      aces++;
      total += 11;
    } else if (card.rank === "K" || card.rank === "Q" || card.rank === "J") {
      total += 10;
    } else {
      total += Number(card.rank);
    }
  }

  let softAces = aces;
  while (total > 21 && softAces > 0) {
    total -= 10;
    softAces--;
  }

  return { total, soft: softAces > 0 };
}

export function isNaturalBlackjack(cards: readonly Card[]): boolean {
  return cards.length === 2 && handValue(cards).total === 21;
}

export function isBust(cards: readonly Card[]): boolean {
  return handValue(cards).total > 21;
}

export type RoundPhase = "player" | "dealer" | "settled";

export type BlackjackRound = {
  deck: Card[];
  player: Card[];
  dealer: Card[];
  phase: RoundPhase;
  /** True while the dealer's second card is still face down. */
  dealerHoleHidden: boolean;
};

function draw(round: BlackjackRound): Card {
  const card = round.deck.shift();
  if (!card) throw new Error("blackjack: deck exhausted");
  return card;
}

export function startRound(rng: Rng = Math.random): BlackjackRound {
  const round: BlackjackRound = {
    deck: shuffle(buildDeck(), rng),
    player: [],
    dealer: [],
    phase: "player",
    dealerHoleHidden: true,
  };

  round.player.push(draw(round));
  round.dealer.push(draw(round));
  round.player.push(draw(round));
  round.dealer.push(draw(round));

  // A natural ends the round immediately — the dealer only reveals.
  if (isNaturalBlackjack(round.player)) {
    round.phase = "settled";
    round.dealerHoleHidden = false;
  }

  return round;
}

export function hit(round: BlackjackRound, rng: Rng = Math.random): BlackjackRound {
  if (round.phase !== "player") return round;

  const next: BlackjackRound = {
    ...round,
    deck: [...round.deck],
    player: [...round.player],
    dealer: [...round.dealer],
  };
  next.player.push(draw(next));

  if (isBust(next.player)) {
    // A bust settles without the dealer drawing — it is a loss either way.
    next.phase = "settled";
    next.dealerHoleHidden = false;
  }

  return next;
}

/** The dealer draws to 17 and stands on all 17s, soft included. */
export function playDealer(
  round: BlackjackRound,
  rng: Rng = Math.random,
): BlackjackRound {
  const next: BlackjackRound = {
    ...round,
    deck: [...round.deck],
    player: [...round.player],
    dealer: [...round.dealer],
    dealerHoleHidden: false,
  };

  while (handValue(next.dealer).total < 17) {
    next.dealer.push(draw(next));
  }

  next.phase = "settled";
  return next;
}

export function stand(
  round: BlackjackRound,
  rng: Rng = Math.random,
): BlackjackRound {
  if (round.phase !== "player") return round;
  return playDealer({ ...round, phase: "dealer" }, rng);
}

export function classifyHand(cards: readonly Card[]): HandOutcome {
  const { total } = handValue(cards);
  if (total > 21) return "bust";
  if (isNaturalBlackjack(cards)) return "blackjack";
  if (total === 21) return "21";
  if (total >= 17) return String(total) as HandOutcome;
  return "low";
}

/**
 * Bust is always a loss, whatever the dealer does. A natural can never lose:
 * it ties a dealer natural and beats everything else.
 */
export function compareToDealer(
  player: readonly Card[],
  dealer: readonly Card[],
): DealerResult {
  if (isBust(player)) return "loss";

  const playerNatural = isNaturalBlackjack(player);
  const dealerNatural = isNaturalBlackjack(dealer);
  if (playerNatural) return dealerNatural ? "tie" : "win";
  if (dealerNatural) return "loss";

  const playerTotal = handValue(player).total;
  const dealerTotal = handValue(dealer).total;
  if (dealerTotal > 21) return "win";
  if (playerTotal > dealerTotal) return "win";
  if (playerTotal < dealerTotal) return "loss";
  return "tie";
}

export type BlackjackResolution = {
  handOutcome: HandOutcome;
  result: DealerResult;
  playerTotal: number;
  dealerTotal: number;
  playerBust: boolean;
  dealerBust: boolean;
  playerNatural: boolean;
  dealerNatural: boolean;
  baseAmount: number;
  multiplier: number;
  payout: number;
};

/** Final payout = base amount for the hand outcome x multiplier for the result. */
export function resolveRound(
  round: BlackjackRound,
  config: BlackjackConfig,
): BlackjackResolution {
  const handOutcome = classifyHand(round.player);
  const result = compareToDealer(round.player, round.dealer);
  const baseAmount = config.handAmounts[handOutcome] ?? 0;
  const multiplier = config.resultMultipliers[result] ?? 0;

  return {
    handOutcome,
    result,
    playerTotal: handValue(round.player).total,
    dealerTotal: handValue(round.dealer).total,
    playerBust: isBust(round.player),
    dealerBust: isBust(round.dealer),
    playerNatural: isNaturalBlackjack(round.player),
    dealerNatural: isNaturalBlackjack(round.dealer),
    baseAmount,
    multiplier,
    payout: baseAmount * multiplier,
  };
}

export function payoutFor(
  config: BlackjackConfig,
  handOutcome: HandOutcome,
  result: DealerResult,
): number {
  return (config.handAmounts[handOutcome] ?? 0) * (config.resultMultipliers[result] ?? 0);
}

/**
 * Blackjack's EV can't be read off a weights table — it depends on how the
 * player plays. This runs the round to completion under a dealer-mimic policy
 * (hit below 17, stand at 17+) to give the streamer a ballpark figure.
 */
export function simulateExpectedValue(
  config: BlackjackConfig,
  rounds = 20000,
  rng: Rng = Math.random,
): number {
  let total = 0;

  for (let i = 0; i < rounds; i++) {
    let round = startRound(rng);
    while (round.phase === "player" && handValue(round.player).total < 17) {
      round = hit(round, rng);
    }
    if (round.phase === "player") {
      round = stand(round, rng);
    }
    total += resolveRound(round, config).payout;
  }

  return total / rounds;
}
