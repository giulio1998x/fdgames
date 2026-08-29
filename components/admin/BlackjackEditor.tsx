"use client";

import { useEffect, useMemo, useState } from "react";

import { Button, EvPanel, Field, NumberInput } from "@/components/admin/ui";
import { formatEuro, formatMultiplier } from "@/lib/odds";
import { payoutFor, simulateExpectedValue } from "@/lib/games/blackjack";
import {
  DEALER_RESULTS,
  HAND_OUTCOMES,
  HAND_OUTCOME_LABELS,
  type BlackjackConfig,
  type DealerResult,
  type HandOutcome,
} from "@/lib/types";

const RESULT_LABELS: Record<DealerResult, string> = {
  win: "Win",
  tie: "Tie",
  loss: "Loss",
};

const SAMPLES: { hand: HandOutcome; result: DealerResult }[] = [
  { hand: "19", result: "loss" },
  { hand: "20", result: "win" },
  { hand: "blackjack", result: "win" },
  { hand: "bust", result: "loss" },
];

const SIM_ROUNDS = 8000;

export function BlackjackEditor({
  config,
  onChange,
}: {
  config: BlackjackConfig;
  onChange: (next: BlackjackConfig) => void;
}) {
  const [simulatedEv, setSimulatedEv] = useState(0);
  const [simulating, setSimulating] = useState(true);
  const [pickHand, setPickHand] = useState<HandOutcome>("19");
  const [pickResult, setPickResult] = useState<DealerResult>("loss");

  // Blackjack EV depends on how the hand is played, so it is simulated rather
  // than read off a weights table. Debounced so typing stays responsive.
  useEffect(() => {
    setSimulating(true);
    const timer = setTimeout(() => {
      setSimulatedEv(simulateExpectedValue(config, SIM_ROUNDS));
      setSimulating(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [config]);

  const pickPayout = useMemo(
    () => payoutFor(config, pickHand, pickResult),
    [config, pickHand, pickResult],
  );

  function setAmount(key: HandOutcome, amount: number) {
    onChange({ ...config, handAmounts: { ...config.handAmounts, [key]: amount } });
  }

  function setMultiplier(key: DealerResult, multiplier: number) {
    onChange({
      ...config,
      resultMultipliers: { ...config.resultMultipliers, [key]: multiplier },
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Field label="Entry price (€)" hint="What a viewer pays to play one hand.">
        <NumberInput
          value={config.entryPrice}
          onChange={(entryPrice) => onChange({ ...config, entryPrice })}
        />
      </Field>

      <EvPanel
        entryPrice={config.entryPrice}
        expectedValue={simulatedEv}
        pending={simulating}
        perPlayLabel="Average amount sent per hand"
        note={`Simulated over ${SIM_ROUNDS.toLocaleString()} hands with the player hitting below 17 and standing at 17+. Blackjack has no weights table to average, so this depends on how the hand is actually played — a ballpark, not an exact figure.`}
      />

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="mb-2 text-lg font-semibold">Base amount per hand outcome (€)</h2>
          <div className="flex flex-col gap-2">
            {HAND_OUTCOMES.map((key) => (
              <div key={key} className="flex items-center justify-between gap-3">
                <span className="text-sm">{HAND_OUTCOME_LABELS[key]}</span>
                <NumberInput
                  ariaLabel={`${HAND_OUTCOME_LABELS[key]} amount`}
                  value={config.handAmounts[key]}
                  onChange={(amount) => setAmount(key, amount)}
                  className="w-28"
                />
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            Standing on 16 or less and a three-card 21 are both reachable, so they get their own
            amounts rather than silently paying nothing.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold">Multiplier per result vs dealer</h2>
          <div className="flex flex-col gap-2">
            {DEALER_RESULTS.map((key) => (
              <div key={key} className="flex items-center justify-between gap-3">
                <span className="text-sm">{RESULT_LABELS[key]}</span>
                <NumberInput
                  ariaLabel={`${RESULT_LABELS[key]} multiplier`}
                  value={config.resultMultipliers[key]}
                  onChange={(multiplier) => setMultiplier(key, multiplier)}
                  className="w-28"
                />
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            A bust always counts as a loss. A natural blackjack can never be a loss — it ties a
            dealer natural and wins against everything else.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-neutral-300 p-4 dark:border-neutral-700">
        <h2 className="mb-3 text-lg font-semibold">Example amounts to send</h2>

        <div className="grid gap-2 sm:grid-cols-2">
          {SAMPLES.map((sample) => (
            <div
              key={`${sample.hand}-${sample.result}`}
              className="rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-700"
            >
              <div className="font-medium">
                {HAND_OUTCOME_LABELS[sample.hand]} + {RESULT_LABELS[sample.result].toLowerCase()}
              </div>
              <div className="text-neutral-600 dark:text-neutral-400">
                {formatEuro(config.handAmounts[sample.hand])} ×{" "}
                {formatMultiplier(config.resultMultipliers[sample.result])} ={" "}
                <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                  {formatEuro(payoutFor(config, sample.hand, sample.result))}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <Field label="Hand outcome">
            <select
              value={pickHand}
              onChange={(event) => setPickHand(event.target.value as HandOutcome)}
              className="rounded border border-neutral-400 bg-white px-2 py-1 dark:border-neutral-600 dark:bg-neutral-900"
            >
              {HAND_OUTCOMES.map((key) => (
                <option key={key} value={key}>
                  {HAND_OUTCOME_LABELS[key]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Result vs dealer">
            <select
              value={pickResult}
              onChange={(event) => setPickResult(event.target.value as DealerResult)}
              className="rounded border border-neutral-400 bg-white px-2 py-1 dark:border-neutral-600 dark:bg-neutral-900"
            >
              {DEALER_RESULTS.map((key) => (
                <option key={key} value={key}>
                  {RESULT_LABELS[key]}
                </option>
              ))}
            </select>
          </Field>

          <p className="text-sm">
            {formatEuro(config.handAmounts[pickHand])} ×{" "}
            {formatMultiplier(config.resultMultipliers[pickResult])} ={" "}
            <span className="text-lg font-semibold">{formatEuro(pickPayout)}</span>
          </p>
        </div>

        {pickHand === "blackjack" && pickResult === "loss" ? (
          <p className="mt-3 rounded border border-amber-500 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            A natural blackjack can never resolve as a loss, so this combination never occurs in
            play. It is shown here only as arithmetic.
          </p>
        ) : null}
      </div>

      <div>
        <Button
          onClick={() => setSimulatedEv(simulateExpectedValue(config, SIM_ROUNDS * 4))}
        >
          Re-run simulation with {(SIM_ROUNDS * 4).toLocaleString()} hands
        </Button>
      </div>
    </div>
  );
}
