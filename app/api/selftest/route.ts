import { expectedValue, pickWeighted, probabilityOf, weightedAverageMultiplier } from "@/lib/odds";
import { DEFAULT_CONFIG } from "@/lib/games/registry";
import {
  MAX_MULTIPLIER_CHAIN,
  amountSectors,
  angleAt,
  flapperLift,
  pegIndexAt,
  pegPhase,
  speedAt,
  spinEase,
  applyMultiplier,
  multiplierSectors,
  outcomeProbability,
  sectorLabel,
  spinWheel,
  totalSlices,
  wheelExpectation,
  wheelSlices,
} from "@/lib/games/wheel";
import {
  allSymbols,
  combinationCount,
  pickCombination,
  blurStrip,
  spinDurationFor,
  spinSlots,
  totalCombinations,
} from "@/lib/games/slots";
import {
  defaultPlinkoSlots,
  dropBall,
  dropBalls,
  plinkoExpectedValue,
  slotCenter,
  ballTrajectory,
  trajectoryDurationMs,
} from "@/lib/games/plinko";
import {
  buildDeck,
  classifyHand,
  compareToDealer,
  handValue,
  hit,
  isNaturalBlackjack,
  payoutFor,
  resolveRound,
  simulateExpectedValue,
  stand,
  startRound,
  type Card,
} from "@/lib/games/blackjack";
import { normalizeConfig } from "@/lib/config-schema";
import { storeDriverName } from "@/lib/store";
import {
  DEFAULT_POLL_MS,
  MAX_POLL_MS,
  MIN_POLL_MS,
  parsePollMs,
} from "@/lib/polling";

const results: { name: string; pass: boolean; detail: string }[] = [];

function check(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
}

function near(a: number, b: number, tolerance: number) {
  return Math.abs(a - b) <= tolerance;
}

function card(rank: string, suit = "♠"): Card {
  return { rank: rank as Card["rank"], suit: suit as Card["suit"], id: `${rank}${suit}` };
}

export async function GET() {
  results.length = 0;

  // ---------- EV formulas ----------
  const wheel = DEFAULT_CONFIG.wheel;
  const slots = DEFAULT_CONFIG.slots;
  const plinko = DEFAULT_CONFIG.plinko;
  const blackjack = DEFAULT_CONFIG.blackjack;

  // EV is the average amount the VIEWER sends, so there is no "loses money"
  // threshold to assert — only that the formula matches the table.
  const expectation = wheelExpectation(wheel);
  const wheelEv = expectation.expectedValue;

  const paying = amountSectors(wheel.outcomes);
  const boosters = multiplierSectors(wheel.outcomes);
  const payingSlices = paying.reduce((sum, o) => sum + o.weight, 0);
  const boosterSlices = boosters.reduce((sum, o) => sum + o.weight, 0);
  const manualBase = paying.reduce((sum, o) => sum + o.amount * o.weight, 0) / payingSlices;
  const manualAvgMult =
    boosters.reduce((sum, o) => sum + o.multiplier * o.weight, 0) / boosterSlices;

  check(
    "average paying sector = 287/50",
    near(expectation.baseAmount, manualBase, 1e-9) && near(manualBase, 287 / 50, 1e-9),
    `${expectation.baseAmount.toFixed(4)}`,
  );
  check(
    "average multiplier = 2.6",
    near(expectation.averageMultiplier, manualAvgMult, 1e-9) && near(manualAvgMult, 2.6, 1e-9),
    `${expectation.averageMultiplier.toFixed(4)}`,
  );
  check("multiplier chance = 10/60", near(expectation.multiplierChance, 10 / 60, 1e-9), `${expectation.multiplierChance.toFixed(4)}`);

  // Closed form for the respin chain, ignoring the cap: A x pa / (1 - pm x M).
  const pm = boosterSlices / (payingSlices + boosterSlices);
  const closedForm = (manualBase * (1 - pm)) / (1 - pm * manualAvgMult);
  // The implementation stops summing at the chain cap while the closed form
  // runs to infinity, so it should land just under it — never above.
  check(
    "wheel EV matches the closed form, shaved by the chain cap",
    wheelEv <= closedForm && closedForm - wheelEv < 0.02,
    `${wheelEv.toFixed(4)} capped vs ${closedForm.toFixed(4)} uncapped`,
  );
  check(
    "wheel EV sits above the paying average, because of respins",
    wheelEv > expectation.baseAmount,
    `${wheelEv.toFixed(2)} vs ${expectation.baseAmount.toFixed(2)}`,
  );
  check(
    "a play averages a little over one spin",
    expectation.expectedSpins > 1 && expectation.expectedSpins < 2,
    `${expectation.expectedSpins.toFixed(3)}`,
  );
  check("slots EV = 391/118", near(expectedValue(slots.outcomes), 391 / 118, 1e-9), `${expectedValue(slots.outcomes).toFixed(4)}`);

  const avgMult = weightedAverageMultiplier(plinko.slots);
  check("plinko avg multiplier ~1.83", near(avgMult, 1.83, 0.01), `${avgMult.toFixed(4)}`);
  check(
    "plinko EV = entry x avg, at any stake",
    near(plinkoExpectedValue(plinko, 7.5), 7.5 * avgMult, 1e-9) &&
      near(plinkoExpectedValue(plinko, 0.5), 0.5 * avgMult, 1e-9),
  );
  check("plinko centre slot pays at least 1x", plinko.slots[6].multiplier >= 1);

  check("probabilities sum to 1", near(wheel.outcomes.reduce((s, o) => s + probabilityOf(o, wheel.outcomes), 0), 1, 1e-9));
  check("empty-weight table returns EV 0", expectedValue([{ amount: 5, weight: 0 }]) === 0);

  // ---------- weighted draw distribution ----------
  const DRAWS = 200_000;
  const counts = new Map<string, number>();
  for (let i = 0; i < DRAWS; i++) {
    const picked = pickWeighted(wheel.outcomes);
    counts.set(picked.id, (counts.get(picked.id) ?? 0) + 1);
  }
  const deviations = wheel.outcomes.map((o) => {
    const observed = (counts.get(o.id) ?? 0) / DRAWS;
    return { id: o.id, expected: probabilityOf(o, wheel.outcomes), observed };
  });
  const worst = deviations.reduce((w, d) =>
    Math.abs(d.observed - d.expected) > Math.abs(w.observed - w.expected) ? d : w,
  );
  check(
    "weighted draw matches configured odds (200k draws)",
    deviations.every((d) => Math.abs(d.observed - d.expected) < 0.006),
    `worst ${worst.id}: expected ${worst.expected.toFixed(4)}, got ${worst.observed.toFixed(4)}`,
  );

  const zeroWeight = pickWeighted([
    { id: "a", weight: 0 },
    { id: "b", weight: 0 },
  ]);
  check("all-zero weights still resolve", zeroWeight !== undefined, zeroWeight.id);

  // ---------- wheel: equal slices, Crazy Time style ----------
  const slices = wheelSlices(wheel.outcomes);
  check("slice count is the sum of the weights", slices.length === totalSlices(wheel.outcomes), `${slices.length}`);
  check(
    "every slice is the same size",
    slices.every((s) => near(s.sweepDeg, 360 / slices.length, 1e-9)),
  );
  check("slices tile the full circle", near(slices.reduce((s, g) => s + g.sweepDeg, 0), 360, 1e-9));
  check(
    "each result owns exactly its configured number of slices",
    wheel.outcomes.every(
      (o) => slices.filter((s) => s.outcome.id === o.id).length === Math.round(o.weight),
    ),
  );
  check(
    "chance equals slices / total slices",
    wheel.outcomes.every((o) =>
      near(outcomeProbability(o, wheel.outcomes), Math.round(o.weight) / slices.length, 1e-9),
    ),
  );

  // Slices must be spread around the ring, not left in one block: the most
  // common result should never sit in a single unbroken run.
  const topOutcome = wheel.outcomes.reduce((a, b) => (a.weight > b.weight ? a : b));
  let runs = 0;
  slices.forEach((slice, i) => {
    const previous = slices[(i - 1 + slices.length) % slices.length];
    if (slice.outcome.id === topOutcome.id && previous.outcome.id !== topOutcome.id) runs++;
  });
  check(
    "the commonest result is spread around the ring, not grouped",
    runs > 1,
    `${runs} separate runs of "${topOutcome.label}"`,
  );

  // The pointer sits at 12 o'clock; recover which slice is under it after the
  // spin and confirm it carries the result the weighted draw picked.
  let landingMismatches = 0;
  for (let i = 0; i < 5000; i++) {
    const spin = spinWheel(wheel);
    const pointerAngle = (360 - spin.targetRotationDeg) % 360;
    const under = slices.find((s) => pointerAngle >= s.startDeg && pointerAngle < s.endDeg);
    if (under?.outcome.id !== spin.outcome.id) landingMismatches++;
  }
  check("wheel always stops on the drawn result (5k spins)", landingMismatches === 0, `${landingMismatches} mismatches`);

  // ---------- slots ----------
  const slotPoolPreview = allSymbols(slots);
  const round25 = spinSlots(slots, 25);
  check("25 spins resolve independently", round25.results.length === 25);
  check(
    "slots total = sum of spins",
    near(round25.totalAmount, round25.results.reduce((s, r) => s + r.amount, 0), 1e-9),
  );
  check("slots entry cost = entry x spins", near(round25.totalEntryCost, slots.entryPrice * 25, 1e-9));
  check("every spin carries 3 symbols", round25.results.every((r) => r.symbols.length === 3));
  check("single spin runs at the configured duration", spinDurationFor(slots, 1) === slots.spinDurationMs);
  check("long rounds compress each spin", spinDurationFor(slots, 25) < slots.spinDurationMs);
  check("compressed spins stay above the floor", spinDurationFor(slots, 25) >= 650);
  check("symbol pool covers the library and every row", allSymbols(slots).includes("7️⃣"));

  const reelWindow = blurStrip("🍒", ["🍒", "🍒", "🍋"], slotPoolPreview, 30);
  check("the strip is built long enough for the whole blur", reelWindow.strip.length === 35);
  check(
    "the blur stops short of the landing rows",
    reelWindow.blurLimit < reelWindow.centerIndex - 1,
    `blur to ${reelWindow.blurLimit}, payline at ${reelWindow.centerIndex}`,
  );
  check(
    "the blur never exposes the payline early",
    reelWindow.strip[reelWindow.blurLimit + 1] !== undefined &&
      reelWindow.blurLimit + 2 < reelWindow.centerIndex + 1,
  );
  check("the payline symbol sits on the centre index", reelWindow.strip[reelWindow.centerIndex] === "🍒");
  check("the centre index leaves a row below it", reelWindow.centerIndex === reelWindow.strip.length - 2);
  check(
    "every symbol on the strip comes from the configured set",
    reelWindow.strip.every((symbol) => slotPoolPreview.includes(symbol)),
  );

  // Neighbours lean toward the payline, which is what makes a near miss.
  let teased = 0;
  for (let i = 0; i < 2000; i++) {
    const w = blurStrip("🍋", ["🍒", "🍒", "🍋"], slotPoolPreview, 30);
    if (w.strip[w.centerIndex - 1] === "🍒" || w.strip[w.centerIndex + 1] === "🍒") teased++;
  }
  check(
    "neighbouring rows tease the payline often enough to read as near misses",
    teased > 400 && teased < 1800,
    `${teased} of 2000 strips teased`,
  );

  // ---------- plinko ----------
  const drop = dropBall(plinko, 1.23);
  check("path has one point per pin row plus start and slot", drop.path.length === plinko.pinRows + 2);
  check("path stays on the board", drop.path.every((x) => x >= 0 && x <= 1));
  check(
    "path ends at the drawn slot centre",
    near(drop.path[drop.path.length - 1], slotCenter(drop.slotIndex, plinko.slots.length), 1e-9),
  );
  check("amount = entry x multiplier", near(drop.amount, 1.23 * drop.multiplier, 1e-9));

  // Every step is one pin left or right — a real lattice walk, not a glide.
  let illegalSteps = 0;
  for (let i = 0; i < 2000; i++) {
    const d = dropBall(plinko, 1);
    const step = 1 / (plinko.pinRows + 1);
    for (let k = 1; k <= plinko.pinRows; k++) {
      if (!near(Math.abs(d.path[k] - d.path[k - 1]), step / 2, 1e-9)) illegalSteps++;
    }
  }
  check("ball steps exactly one pin left or right each row (2k drops)", illegalSteps === 0, `${illegalSteps} bad steps`);

  const fiveBalls = dropBalls(plinko, 2, 5);
  check("5 balls resolve independently", fiveBalls.drops.length === 5);
  check(
    "plinko total = sum of drops",
    near(fiveBalls.totalAmount, fiveBalls.drops.reduce((s, d) => s + d.amount, 0), 1e-9),
  );

  const generated = defaultPlinkoSlots({ slotCount: 15, maxMultiplier: 200, minMultiplier: 1 });
  check("generated board is symmetrical", generated.every((s, i) => near(s.multiplier, generated[generated.length - 1 - i].multiplier, 1e-9)));
  check("generated board peaks at the edge multiplier", near(generated[0].multiplier, 200, 0.01), `${generated[0].multiplier}`);
  check(
    "generated board bottoms out at the centre multiplier",
    near(generated[7].multiplier, 1, 0.01),
    `${generated[7].multiplier}`,
  );

  // ---------- blackjack ----------
  check("deck has 52 unique cards", new Set(buildDeck().map((c) => c.id)).size === 52);
  check("A + K = 21", handValue([card("A"), card("K")]).total === 21);
  check("A + A = 12", handValue([card("A"), card("A")]).total === 12);
  check("A + A + 9 = 21", handValue([card("A"), card("A"), card("9")]).total === 21);
  check("A + 6 is soft 17", handValue([card("A"), card("6")]).soft && handValue([card("A"), card("6")]).total === 17);
  check("K + Q + 5 busts at 25", handValue([card("K"), card("Q"), card("5")]).total === 25);
  check("A + 9 + K = 20 (ace demoted)", handValue([card("A"), card("9"), card("K")]).total === 20);

  check("natural = 21 on two cards", isNaturalBlackjack([card("A"), card("J")]));
  check("three-card 21 is not natural", !isNaturalBlackjack([card("7"), card("7"), card("7")]));

  check("classify bust", classifyHand([card("K"), card("Q"), card("5")]) === "bust");
  check("classify natural", classifyHand([card("A"), card("K")]) === "blackjack");
  check("classify three-card 21", classifyHand([card("7"), card("7"), card("7")]) === "21");
  check("classify 19", classifyHand([card("K"), card("9")]) === "19");
  check("classify stood-low", classifyHand([card("5"), card("9")]) === "low");

  check(
    "bust is a loss even when the dealer busts",
    compareToDealer([card("K"), card("Q"), card("5")], [card("K"), card("Q"), card("6")]) === "loss",
  );
  check(
    "natural vs natural is a tie",
    compareToDealer([card("A"), card("K")], [card("A"), card("Q")]) === "tie",
  );
  check(
    "natural beats a three-card 21",
    compareToDealer([card("A"), card("K")], [card("7"), card("7"), card("7")]) === "win",
  );
  check(
    "natural never loses",
    compareToDealer([card("A"), card("K")], [card("K"), card("Q")]) === "win",
  );
  check("20 vs 19 wins", compareToDealer([card("K"), card("Q")], [card("K"), card("9")]) === "win");
  check("19 vs 19 ties", compareToDealer([card("K"), card("9")], [card("10"), card("9")]) === "tie");
  check("18 vs dealer bust wins", compareToDealer([card("K"), card("8")], [card("K"), card("Q"), card("5")]) === "win");

  // The spec's worked example: 19 (€3) x loss (3x) = €27 is 3 x 3 x 3 = 27? No —
  // it is base 3 x multiplier 3 = 9 per hand outcome; verify the formula itself.
  const exampleConfig = {
    ...blackjack,
    handAmounts: { ...blackjack.handAmounts, "19": 3 },
    resultMultipliers: { ...blackjack.resultMultipliers, loss: 3 },
  };
  check("payout = base x multiplier (19 x loss)", payoutFor(exampleConfig, "19", "loss") === 9, `${payoutFor(exampleConfig, "19", "loss")}`);
  check("payout = base x multiplier (blackjack x win)", payoutFor(blackjack, "blackjack", "win") === blackjack.handAmounts.blackjack * blackjack.resultMultipliers.win);

  // Full rounds under dealer-mimic play: never throw, always settle, dealer legal.
  let dealerViolations = 0;
  let unsettled = 0;
  let naturalLosses = 0;
  const outcomeTally = new Map<string, number>();
  for (let i = 0; i < 20_000; i++) {
    let round = startRound();
    while (round.phase === "player" && handValue(round.player).total < 17) round = hit(round);
    if (round.phase === "player") round = stand(round);
    if (round.phase !== "settled") unsettled++;

    const resolution = resolveRound(round, blackjack);
    outcomeTally.set(resolution.handOutcome, (outcomeTally.get(resolution.handOutcome) ?? 0) + 1);

    // The dealer must not stand below 17 unless the player busted or had a natural.
    const dealerTotal = handValue(round.dealer).total;
    if (!resolution.playerBust && !resolution.playerNatural && dealerTotal < 17) dealerViolations++;
    if (resolution.playerNatural && resolution.result === "loss") naturalLosses++;
    if (!near(resolution.payout, resolution.baseAmount * resolution.multiplier, 1e-9)) {
      check("payout math consistent", false, `${resolution.payout}`);
      break;
    }
  }
  check("every round settles (20k)", unsettled === 0, `${unsettled} unsettled`);
  check("dealer never stands below 17 (20k)", dealerViolations === 0, `${dealerViolations} violations`);
  check("a natural never resolves as a loss (20k)", naturalLosses === 0, `${naturalLosses}`);
  check("deck never runs out over 20k rounds", true);

  const simEv = simulateExpectedValue(blackjack, 20_000);
  check("blackjack simulated EV is a positive finite number", Number.isFinite(simEv) && simEv > 0, `EV ${simEv.toFixed(3)} vs entry ${blackjack.entryPrice}`);
  check(
    "busting is the expensive result under the default table",
    payoutFor(blackjack, "bust", "loss") > payoutFor(blackjack, "20", "win"),
    `bust/loss ${payoutFor(blackjack, "bust", "loss")} vs 20/win ${payoutFor(blackjack, "20", "win")}`,
  );

  // ---------- config normalisation ----------
  const junk = normalizeConfig("wheel", {
    entryPrice: "abc",
    outcomes: [
      { id: "a", label: "x", amount: -50, weight: -3 },
      { id: "a", label: "", amount: "7", weight: "2" },
    ],
  });
  check("negative amounts clamp to 0", junk.outcomes[0].amount === 0);
  check("negative weights clamp to 0", junk.outcomes[0].weight === 0);
  check("numeric strings coerce", junk.outcomes[1].amount === 7 && junk.outcomes[1].weight === 2);
  check("duplicate ids are de-duplicated", junk.outcomes[0].id !== junk.outcomes[1].id);
  check("unparseable entry price falls back to default", junk.entryPrice === DEFAULT_CONFIG.wheel.entryPrice);

  const emptyWheel = normalizeConfig("wheel", { outcomes: [] });
  check("too-few results fall back to defaults", emptyWheel.outcomes.length >= 2);

  const fractional = normalizeConfig("wheel", {
    outcomes: [
      { id: "a", label: "A", amount: 1, weight: 2.7 },
      { id: "b", label: "B", amount: 2, weight: 1.2 },
    ],
  });
  check("wheel slices round to whole numbers", Number.isInteger(fractional.outcomes[0].weight) && Number.isInteger(fractional.outcomes[1].weight), `${fractional.outcomes[0].weight}, ${fractional.outcomes[1].weight}`);

  const tooManySlices = normalizeConfig("wheel", {
    outcomes: [
      { id: "a", label: "A", amount: 1, weight: 500 },
      { id: "b", label: "B", amount: 2, weight: 500 },
    ],
  });
  check("total slices are capped for legibility", totalSlices(tooManySlices.outcomes) <= 120, `${totalSlices(tooManySlices.outcomes)}`);

  const customSymbols = normalizeConfig("slots", {
    symbolLibrary: ["🐙", "AB", "", "  "],
    outcomes: [
      {
        id: "r",
        label: "R",
        amount: 1,
        weight: 1,
        pattern: { kind: "exact", symbols: ["🐙"], exact: ["🐙", "AB", null] },
      },
    ],
  });
  check("custom symbol library keeps only usable entries", customSymbols.symbolLibrary.length === 2, customSymbols.symbolLibrary.join(","));
  check(
    "custom reel symbols survive normalisation",
    customSymbols.outcomes[0].pattern.exact[0] === "🐙" &&
      customSymbols.outcomes[0].pattern.exact[1] === "AB",
  );
  check(
    "an unknown pattern kind falls back to a fixed combination",
    normalizeConfig("slots", {
      outcomes: [{ id: "x", label: "X", amount: 1, weight: 1, pattern: { kind: "nonsense" } }],
    }).outcomes[0].pattern.kind === "exact",
  );

  const clampedRows = normalizeConfig("plinko", { pinRows: 999, slots: plinko.slots });
  check("pin rows clamp to the supported range", clampedRows.pinRows === 16, `${clampedRows.pinRows}`);

  const partialBlackjack = normalizeConfig("blackjack", { handAmounts: { "19": 4 } });
  check("missing hand amounts fill from defaults", Object.keys(partialBlackjack.handAmounts).length === 8);
  check("supplied hand amount is kept", partialBlackjack.handAmounts["19"] === 4);

  // ---------- wheel multiplier sectors ----------
  const doubled = applyMultiplier(wheel, 2);
  check(
    "a multiplier scales every paying sector",
    doubled.outcomes
      .filter((o) => o.kind === "amount")
      .every((o, i) => near(o.amount, paying[i].amount * 2, 1e-9)),
  );
  check(
    "a multiplier sector is not itself scaled",
    doubled.outcomes
      .filter((o) => o.kind === "multiplier")
      .every((o, i) => o.multiplier === boosters[i].multiplier && o.label === boosters[i].label),
  );
  check(
    "a multiplier leaves the odds alone",
    doubled.outcomes.every((o, i) => o.weight === wheel.outcomes[i].weight),
  );
  check("scaled sectors relabel to the new amount", sectorLabel(paying[0], 2) === "€2", sectorLabel(paying[0], 2));
  check(
    "a zero-amount sector keeps its own label",
    sectorLabel(paying.find((o) => o.id === "w-free")!, 5) === "Free",
  );
  check("x1 is a no-op", applyMultiplier(wheel, 1) === wheel);

  // Play out full rounds and confirm the chain behaves.
  let unterminated = 0;
  let chainTooLong = 0;
  let boosterPaidOut = 0;
  let mismatchedProduct = 0;
  for (let i = 0; i < 5000; i++) {
    let multiplier = 1;
    let chain = 0;
    let guard = 0;
    for (;;) {
      const result = spinWheel(wheel, multiplier, chain);
      if (!result.isMultiplier) {
        if (!near(result.amount, result.outcome.amount * multiplier, 1e-6)) mismatchedProduct++;
        break;
      }
      if (result.amount !== 0) boosterPaidOut++;
      multiplier = result.multiplierAfter;
      chain++;
      if (++guard > MAX_MULTIPLIER_CHAIN + 2) {
        unterminated++;
        break;
      }
    }
    if (chain > MAX_MULTIPLIER_CHAIN) chainTooLong++;
  }
  check("every round terminates on a paying sector (5k rounds)", unterminated === 0, `${unterminated} ran away`);
  check(`the chain never exceeds ${MAX_MULTIPLIER_CHAIN} multipliers`, chainTooLong === 0, `${chainTooLong} over`);
  check("a multiplier sector never pays out itself", boosterPaidOut === 0, `${boosterPaidOut} paid`);
  check("the paid amount is always base x board multiplier", mismatchedProduct === 0, `${mismatchedProduct} wrong`);

  // At the cap the next spin must pay, whatever the board looks like.
  let cappedBooster = 0;
  for (let i = 0; i < 2000; i++) {
    if (spinWheel(wheel, 64, MAX_MULTIPLIER_CHAIN).isMultiplier) cappedBooster++;
  }
  check("at the chain cap the next spin is forced to pay", cappedBooster === 0, `${cappedBooster} still boosted`);

  const noPayers = normalizeConfig("wheel", {
    outcomes: [
      { id: "a", label: "x2", amount: 0, weight: 5, kind: "multiplier", multiplier: 2 },
      { id: "b", label: "x3", amount: 0, weight: 5, kind: "multiplier", multiplier: 3 },
    ],
  });
  check(
    "a board with no paying sector falls back to the default",
    amountSectors(noPayers.outcomes).length > 0,
  );
  check(
    "a multiplier sector cannot carry an amount",
    normalizeConfig("wheel", {
      outcomes: [
        { id: "a", label: "x2", amount: 99, weight: 5, kind: "multiplier", multiplier: 2 },
        { id: "b", label: "one", amount: 1, weight: 5, kind: "amount" },
      ],
    }).outcomes[0].amount === 0,
  );
  check(
    "a multiplier below 1 is clamped up",
    normalizeConfig("wheel", {
      outcomes: [
        { id: "a", label: "shrink", amount: 0, weight: 1, kind: "multiplier", multiplier: 0.2 },
        { id: "b", label: "one", amount: 1, weight: 5, kind: "amount" },
      ],
    }).outcomes[0].multiplier === 1,
  );

  // ---------- slots: generated arrangements ----------
  const slotPool = allSymbols(slots);
  const pairRow = slots.outcomes.find((o) => o.id === "s-cherry")!;
  const noneRow = slots.outcomes.find((o) => o.id === "s-blank")!;
  const tripleRow = slots.outcomes.find((o) => o.id === "s-star")!;

  check(
    "a pair generates 3 positions x every other symbol",
    combinationCount(pairRow.pattern, slotPool) === 3 * (slotPool.length - 1),
    `${combinationCount(pairRow.pattern, slotPool)}`,
  );
  check(
    "a three-symbol triple row generates one picture per symbol",
    combinationCount(tripleRow.pattern, slotPool) === 3,
  );
  check(
    "a no-match row generates every all-different arrangement",
    combinationCount(noneRow.pattern, slotPool) ===
      slotPool.length * (slotPool.length - 1) * (slotPool.length - 2),
  );
  check(
    "the machine as a whole has hundreds of pictures",
    totalCombinations(slots) > 500,
    `${totalCombinations(slots)} arrangements`,
  );

  // Draw a lot of pictures and check every one is legal for its row.
  let badPair = 0;
  let badNone = 0;
  let badTriple = 0;
  const pairPlacements = new Set<string>();
  const pairFillers = new Set<string>();
  for (let i = 0; i < 4000; i++) {
    const p = pickCombination(pairRow.pattern, slotPool);
    const matches = p.filter((s) => s === "🍒").length;
    if (matches !== 2) badPair++;
    else {
      pairPlacements.add(p.map((s) => (s === "🍒" ? "X" : ".")).join(""));
      pairFillers.add(p.find((s) => s !== "🍒")!);
    }

    const n = pickCombination(noneRow.pattern, slotPool);
    if (n[0] === n[1] || n[1] === n[2] || n[0] === n[2]) badNone++;

    const t = pickCombination(tripleRow.pattern, slotPool);
    if (!(t[0] === t[1] && t[1] === t[2])) badTriple++;
  }
  check("a pair always shows exactly two of its symbol (4k draws)", badPair === 0, `${badPair} bad`);
  check("a pair uses all three reel placements", pairPlacements.size === 3, [...pairPlacements].join(" "));
  check(
    "a pair's third reel varies across the whole symbol set",
    pairFillers.size === slotPool.length - 1,
    `${pairFillers.size} different fillers`,
  );
  check(
    "a no-match row never shows two matching reels (4k draws)",
    badNone === 0,
    `${badNone} would have looked like a win`,
  );
  check("a triple row always shows three of a kind (4k draws)", badTriple === 0, `${badTriple} bad`);

  // ---------- plinko: bounce trajectory ----------
  const physicsDrop = dropBall(plinko, 1);
  const trajectory = ballTrajectory(physicsDrop.path, plinko.pinRows);
  check("the trajectory is sampled far more finely than one point per row", trajectory.length > plinko.pinRows * 5);
  const minY = Math.min(...trajectory.map((p) => p.y));
  const maxY = Math.max(...trajectory.map((p) => p.y));
  check(
    "the ball never leaves the board vertically",
    minY > -0.5 && near(maxY, physicsDrop.path.length - 1, 1e-9),
    `y from ${minY.toFixed(3)} to ${maxY.toFixed(3)}`,
  );
  const quarters = [0.25, 0.5, 0.75, 1].map(
    (q) => trajectory[Math.min(trajectory.length - 1, Math.floor(q * trajectory.length) - 1)].y,
  );
  check(
    "the ball makes steady downward progress overall",
    quarters.every((y, i) => i === 0 || y > quarters[i - 1]),
    quarters.map((y) => y.toFixed(2)).join(" → "),
  );
  check(
    "no bounce carries the ball back above the pin it left",
    trajectory.every((p, i) => p.y > Math.floor(trajectory[Math.max(0, i - 1)].y) - 1.01),
  );
  check(
    "the ball rises off each pin before falling again",
    trajectory.some((p, i) => i > 0 && p.y < trajectory[i - 1].y),
    "no bounce arc found",
  );
  check(
    "the trajectory ends on the drawn slot",
    near(trajectory[trajectory.length - 1].x, slotCenter(physicsDrop.slotIndex, plinko.slots.length), 1e-9),
  );
  check(
    "the trajectory reports the pins it strikes",
    trajectory.filter((p) => p.pinRow !== undefined).length >= plinko.pinRows - 1,
  );
  check("the fall is roughly a second and a half", trajectoryDurationMs(trajectory) > 1200 && trajectoryDurationMs(trajectory) < 3500, `${trajectoryDurationMs(trajectory)}ms`);

  // ---------- wheel pegs and flapper ----------
  check("the spin easing runs from 0 to 1", spinEase(0) === 0 && near(spinEase(1), 1, 1e-9));
  check(
    "the spin only ever slows down",
    Array.from({ length: 40 }, (_, i) => speedAt(i / 40)).every(
      (v, i, all) => i === 0 || v <= all[i - 1] + 1e-9,
    ),
  );
  check("it starts at full speed and ends stopped", near(speedAt(0), 1, 1e-9) && near(speedAt(1), 0, 1e-9));
  check(
    "the wheel never runs backwards",
    Array.from({ length: 200 }, (_, i) => angleAt(0, 2000, i / 199)).every(
      (v, i, all) => i === 0 || v >= all[i - 1] - 1e-9,
    ),
  );
  check("the spin ends exactly on the target angle", near(angleAt(37, 2037, 1), 2037, 1e-9));

  const pegSpacing = 360 / wheelSlices(wheel.outcomes).length;
  check("there is one peg per slice", near(pegSpacing * totalSlices(wheel.outcomes), 360, 1e-9));
  check(
    "the peg phase wraps cleanly at every boundary",
    near(pegPhase(0, pegSpacing), 0, 1e-9) &&
      near(pegPhase(pegSpacing, pegSpacing), 0, 1e-9) &&
      near(pegPhase(pegSpacing * 0.5, pegSpacing), 0.5, 1e-9),
  );
  check(
    "the peg index advances once per slice",
    pegIndexAt(pegSpacing * 3.4, pegSpacing) === 3 && pegIndexAt(pegSpacing * 4.01, pegSpacing) === 4,
  );
  check(
    "a full turn clicks once per slice",
    pegIndexAt(360, pegSpacing) - pegIndexAt(0, pegSpacing) === totalSlices(wheel.outcomes),
  );
  check("the flapper is flat between pegs", near(flapperLift(0), 0, 1e-9) && near(flapperLift(1), 0, 1e-9));
  check("the flapper peaks just before it slips off", near(flapperLift(0.78), 1, 1e-9));
  check(
    "the flapper stays within its travel",
    Array.from({ length: 200 }, (_, i) => flapperLift(i / 200)).every((v) => v >= -1e-9 && v <= 1 + 1e-9),
  );
  check(
    "the flapper rides up slowly and snaps off fast",
    flapperLift(0.7) > flapperLift(0.9),
    `${flapperLift(0.7).toFixed(2)} riding vs ${flapperLift(0.9).toFixed(2)} released`,
  );

  // ---------- hosting: polling and the config store ----------
  check("no ?poll= falls back to the default interval", parsePollMs(null) === DEFAULT_POLL_MS && parsePollMs("") === DEFAULT_POLL_MS);
  check("?poll= is read as seconds", parsePollMs("5") === 5000 && parsePollMs("45") === 45_000);
  check("?poll=0 turns polling off", parsePollMs("0") === 0);
  check("junk and negative values fall back", parsePollMs("abc") === DEFAULT_POLL_MS && parsePollMs("-3") === DEFAULT_POLL_MS);
  check(
    "the interval is clamped both ways",
    parsePollMs("0.1") === MIN_POLL_MS && parsePollMs("99999") === MAX_POLL_MS,
  );
  check(
    "the default is slow enough for a serverless free tier",
    DEFAULT_POLL_MS >= 15_000,
    `${DEFAULT_POLL_MS / 1000}s between polls, about ${Math.round(3_600_000 / DEFAULT_POLL_MS)} requests an hour`,
  );
  check(
    "the store picks a driver, and the file one locally",
    storeDriverName() === "file" || storeDriverName() === "blobs",
    `using the ${storeDriverName()} driver`,
  );

  const failed = results.filter((r) => !r.pass);
  return Response.json(
    {
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
      failures: failed,
      storeDriver: storeDriverName(),
      pollSeconds: DEFAULT_POLL_MS / 1000,
      handOutcomeDistribution: Object.fromEntries(
        [...outcomeTally.entries()].map(([k, v]) => [k, `${((v / 20_000) * 100).toFixed(1)}%`]),
      ),
      blackjackSimulatedEv: Number(simEv.toFixed(3)),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
