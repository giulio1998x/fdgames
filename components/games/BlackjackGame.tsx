"use client";

import { useEffect, useRef, useState } from "react";

import { Breakdown } from "@/components/Breakdown";
import { OverlayStatus, TriggerButton } from "@/components/OverlayShell";
import { formatEuro, formatMultiplier } from "@/lib/odds";
import {
  handValue,
  hit,
  isRedSuit,
  payoutFor,
  resolveRound,
  stand,
  startRound,
  type BlackjackRound,
  type Card,
} from "@/lib/games/blackjack";
import { initAudio, playCard, playDud, playFlip, playWin } from "@/lib/sound";
import {
  DEALER_RESULTS,
  HAND_OUTCOMES,
  HAND_OUTCOME_LABELS,
  type BlackjackConfig,
  type DealerResult,
  type HandOutcome,
} from "@/lib/types";

// Paced for stream, not for speed — the viewer should see each card arrive.
const DEAL_MS = 950;
const FLIP_MS = 1500;
const DEALER_DRAW_MS = 1400;
const SETTLE_MS = 1200;
/** How long a card takes to turn over. */
const TURN_MS = 700;

const RESULT_LABELS: Record<DealerResult, string> = {
  win: "Win vs dealer",
  tie: "Tie with dealer",
  loss: "Loss vs dealer",
};

const SHORT_RESULT: Record<DealerResult, string> = {
  win: "Win",
  tie: "Tie",
  loss: "Loss",
};

type Phase = "idle" | "dealing" | "player" | "revealing" | "dealerDrawing" | "settled";

/**
 * What the viewer can currently see. The engine resolves the whole round up
 * front; this is only how much of it has been turned face up so far.
 */
type Presentation = {
  playerShown: number;
  dealerShown: number;
  holeFlipped: boolean;
};

/**
 * A card that turns over rather than popping in: the face and back are the two
 * sides of one element, and the whole thing rotates on its Y axis.
 */
function PlayingCard({ card, faceDown }: { card: Card; faceDown?: boolean }) {
  return (
    <div
      className="animate-[dealIn_420ms_ease-out]"
      style={{ perspective: "700px", width: 80, height: 112 }}
    >
      <div
        className="relative h-full w-full"
        style={{
          transformStyle: "preserve-3d",
          transform: faceDown ? "rotateY(180deg)" : "rotateY(0deg)",
          transition: `transform ${TURN_MS}ms cubic-bezier(0.4, 0.1, 0.2, 1)`,
        }}
      >
        <div
          className={[
            "absolute inset-0 flex flex-col items-center justify-center rounded-lg border-2 border-neutral-300 bg-white font-semibold shadow-xl",
            isRedSuit(card.suit) ? "text-red-600" : "text-neutral-900",
          ].join(" ")}
          style={{ backfaceVisibility: "hidden" }}
        >
          <span className="text-2xl">{card.rank}</span>
          <span className="text-3xl">{card.suit}</span>
        </div>

        <div
          className="absolute inset-0 flex items-center justify-center rounded-lg border-2 border-white/70 bg-gradient-to-br from-blue-700 to-blue-950 text-3xl text-white/40 shadow-xl"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          ★
        </div>
      </div>
    </div>
  );
}

function Hand({
  title,
  cards,
  shown,
  faceDownIndex,
  total,
}: {
  title: string;
  cards: Card[];
  shown: number;
  faceDownIndex?: number;
  total: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-sm text-white/90 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
        {title} — <span className="font-semibold tabular-nums">{total}</span>
      </div>
      <div className="flex min-h-28 items-center gap-2">
        {cards.slice(0, shown).map((card, index) => (
          <PlayingCard key={card.id} card={card} faceDown={index === faceDownIndex} />
        ))}
      </div>
    </div>
  );
}

/**
 * The payout table, kept beside the table so the player can see what each
 * total is worth before deciding whether to hit.
 */
function PayoutChart({
  config,
  activeHand,
  activeResult,
}: {
  config: BlackjackConfig;
  activeHand?: HandOutcome;
  activeResult?: DealerResult;
}) {
  return (
    <div className="w-full max-w-xs rounded-lg border border-white/25 bg-black/75 p-3 text-sm text-white backdrop-blur-sm lg:w-64">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">
        What each hand is worth
      </h2>

      <table className="w-full border-collapse">
        <thead>
          <tr className="text-left text-xs text-white/50">
            <th className="pb-1 font-medium">Your hand</th>
            <th className="pb-1 text-right font-medium">Base</th>
          </tr>
        </thead>
        <tbody>
          {HAND_OUTCOMES.map((key) => (
            <tr
              key={key}
              className={[
                "border-t border-white/10",
                activeHand === key ? "bg-yellow-300/20 font-semibold text-yellow-200" : "",
              ].join(" ")}
            >
              <td className="py-1 pr-2">{HAND_OUTCOME_LABELS[key]}</td>
              <td className="py-1 text-right tabular-nums">
                {formatEuro(config.handAmounts[key])}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mt-4 mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">
        Then × the result
      </h2>
      <div className="flex gap-2">
        {DEALER_RESULTS.map((key) => (
          <div
            key={key}
            className={[
              "flex-1 rounded border px-2 py-1 text-center",
              activeResult === key
                ? "border-yellow-300 bg-yellow-300/20 text-yellow-200"
                : "border-white/20 text-white/80",
            ].join(" ")}
          >
            <div className="text-xs">{SHORT_RESULT[key]}</div>
            <div className="font-semibold tabular-nums">
              {formatMultiplier(config.resultMultipliers[key])}
            </div>
          </div>
        ))}
      </div>

      {activeHand && activeResult ? (
        <p className="mt-3 rounded bg-white/10 px-2 py-1.5 text-center">
          {formatEuro(config.handAmounts[activeHand])} ×{" "}
          {formatMultiplier(config.resultMultipliers[activeResult])} ={" "}
          <span className="font-semibold text-yellow-200">
            {formatEuro(payoutFor(config, activeHand, activeResult))}
          </span>
        </p>
      ) : (
        <p className="mt-3 text-xs text-white/50">
          Busting still counts as a loss, and a natural blackjack can never lose.
        </p>
      )}
    </div>
  );
}

export function BlackjackGame({
  config,
  entryAmount,
  tone = "overlay",
}: {
  config: BlackjackConfig;
  entryAmount: number | null;
  tone?: "overlay" | "light";
}) {
  const [round, setRound] = useState<BlackjackRound | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [shown, setShown] = useState<Presentation>({
    playerShown: 0,
    dealerShown: 0,
    holeFlipped: false,
  });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  function schedule(fn: () => void, ms: number) {
    timers.current.push(setTimeout(fn, ms));
  }

  function clearTimers() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }

  /** Flips the hole card, then walks out the dealer's draws one at a time. */
  function revealDealer(next: BlackjackRound, fromCard: number) {
    setPhase("revealing");
    schedule(() => {
      playFlip();
      setShown((prev) => ({ ...prev, holeFlipped: true, dealerShown: 2 }));

      const extras = next.dealer.length - 2;
      if (extras > 0) setPhase("dealerDrawing");

      for (let i = 0; i < extras; i++) {
        schedule(() => {
          playCard();
          setShown((prev) => ({ ...prev, dealerShown: 3 + i }));
        }, TURN_MS + (i + 1) * DEALER_DRAW_MS);
      }

      schedule(() => setPhase("settled"), TURN_MS + extras * DEALER_DRAW_MS + SETTLE_MS);
    }, fromCard);
  }

  function deal() {
    clearTimers();
    initAudio();
    const next = startRound();
    setRound(next);
    setPhase("dealing");
    setShown({ playerShown: 0, dealerShown: 0, holeFlipped: false });

    // Real dealing order: player, dealer up, player, dealer hole.
    const steps: (() => void)[] = [
      () => setShown((s) => ({ ...s, playerShown: 1 })),
      () => setShown((s) => ({ ...s, dealerShown: 1 })),
      () => setShown((s) => ({ ...s, playerShown: 2 })),
      () => setShown((s) => ({ ...s, dealerShown: 2 })),
    ];
    steps.forEach((step, index) =>
      schedule(() => {
        playCard();
        step();
      }, DEAL_MS * (index + 0.4)),
    );

    schedule(() => {
      // A natural ends it immediately — the dealer only reveals.
      if (next.phase === "settled") revealDealer(next, FLIP_MS);
      else setPhase("player");
    }, DEAL_MS * 3.4);
  }

  function handleHit() {
    if (!round || phase !== "player") return;
    const next = hit(round);
    setRound(next);
    setPhase("dealing");

    schedule(() => {
      playCard();
      setShown((s) => ({ ...s, playerShown: next.player.length }));
      // A bust settles without the dealer drawing, but the hole still turns up.
      if (next.phase === "settled") revealDealer(next, DEAL_MS);
      else setPhase("player");
    }, DEAL_MS * 0.4);
  }

  function handleStand() {
    if (!round || phase !== "player") return;
    const next = stand(round);
    setRound(next);
    revealDealer(next, 400);
  }

  const stake = entryAmount ?? config.entryPrice;
  const settled = phase === "settled";
  const resolution = round && settled ? resolveRound(round, config) : null;

  useEffect(() => {
    if (!resolution) return;
    if (resolution.payout > 0) playWin(resolution.result === "win" ? 0.8 : 0.4);
    else playDud();
  }, [resolution?.payout, resolution?.result]);

  const playerCards = round?.player ?? [];
  const dealerCards = round?.dealer ?? [];
  const visiblePlayer = playerCards.slice(0, shown.playerShown);
  const visibleDealer = dealerCards.slice(0, shown.dealerShown);

  const playerTotal = visiblePlayer.length > 0 ? handValue(visiblePlayer) : null;
  const dealerTotalText = !round
    ? "—"
    : shown.holeFlipped
      ? String(handValue(visibleDealer).total)
      : shown.dealerShown >= 1
        ? `${handValue(dealerCards.slice(0, 1)).total} + ?`
        : "—";

  return (
    <div className="flex w-full max-w-4xl flex-col items-center gap-4 lg:flex-row lg:items-start lg:justify-center">
      <div className="flex w-full max-w-lg flex-col items-center gap-4">
        {/*
          A felt table behind the cards only. The page itself stays transparent
          so the OBS source still shows the scene behind it.
        */}
        <div
          className="flex w-full flex-col items-center gap-5 rounded-[2rem] border-4 border-amber-900/70 px-4 py-6 shadow-2xl"
          style={{
            background:
              "radial-gradient(ellipse at 50% 35%, #1c7a4a 0%, #14603a 45%, #0b3d24 100%)",
          }}
        >
          {round ? (
            <>
              <Hand
                title="Dealer"
                cards={dealerCards}
                shown={shown.dealerShown}
                faceDownIndex={shown.holeFlipped ? undefined : 1}
                total={dealerTotalText}
              />

              <div className="h-px w-2/3 bg-white/15" />

              <Hand
                title="Player"
                cards={playerCards}
                shown={shown.playerShown}
                total={
                  playerTotal ? `${playerTotal.total}${playerTotal.soft ? " (soft)" : ""}` : "—"
                }
              />
            </>
          ) : (
            <p className="py-10 text-sm text-white/80">Deal a hand to start the round.</p>
          )}
        </div>

        {phase === "dealing" && shown.playerShown < 2 ? (
          <OverlayStatus>Dealing…</OverlayStatus>
        ) : null}
        {phase === "revealing" ? <OverlayStatus>Dealer turns the hole card…</OverlayStatus> : null}
        {phase === "dealerDrawing" ? <OverlayStatus>Dealer draws to 17…</OverlayStatus> : null}

        <div className="flex flex-wrap justify-center gap-2">
          {phase === "idle" || settled ? (
            <TriggerButton onClick={deal}>{round ? "Deal next hand" : "Deal"}</TriggerButton>
          ) : (
            <>
              <TriggerButton onClick={handleHit} disabled={phase !== "player"}>
                Hit
              </TriggerButton>
              <TriggerButton onClick={handleStand} disabled={phase !== "player"}>
                Stand
              </TriggerButton>
            </>
          )}
        </div>

        {resolution ? (
          <Breakdown
            tone={tone}
            rows={[
              { label: "Entry amount paid", value: formatEuro(stake) },
              {
                label: "Player hand",
                value: `${resolution.playerTotal}${resolution.playerBust ? " — bust" : ""}`,
              },
              {
                label: "Dealer hand",
                value: `${resolution.dealerTotal}${resolution.dealerBust ? " — bust" : ""}`,
              },
              {
                label: "Hand outcome",
                value: HAND_OUTCOME_LABELS[resolution.handOutcome],
                emphasis: true,
              },
              { label: "Base amount for hand", value: formatEuro(resolution.baseAmount) },
              {
                label: "Result vs dealer",
                value: RESULT_LABELS[resolution.result],
                emphasis: true,
              },
              { label: "Result multiplier", value: formatMultiplier(resolution.multiplier) },
              {
                label: "Result math",
                value: `${formatEuro(resolution.baseAmount)} × ${formatMultiplier(
                  resolution.multiplier,
                )}`,
              },
            ]}
            totalLabel="Amount to send"
            totalValue={formatEuro(resolution.payout)}
          />
        ) : null}
      </div>

      <PayoutChart
        config={config}
        activeHand={resolution?.handOutcome}
        activeResult={resolution?.result}
      />
    </div>
  );
}
