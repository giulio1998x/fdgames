"use client";

import { Button, EvPanel, Field, NumberInput, TextInput } from "@/components/admin/ui";
import { formatEuro, formatPercent } from "@/lib/odds";
import {
  MAX_MULTIPLIER_CHAIN,
  MAX_OUTCOMES,
  MAX_TOTAL_SLICES,
  MIN_OUTCOMES,
  SECTOR_KINDS,
  SECTOR_KIND_LABELS,
  amountSectors,
  canAddOutcome,
  canRemoveOutcome,
  outcomeProbability,
  reorderOutcomes,
  sliceCount,
  totalSlices,
  wheelExpectation,
} from "@/lib/games/wheel";
import type { WheelConfig, WheelOutcome, WheelSectorKind } from "@/lib/types";

export function WheelEditor({
  config,
  onChange,
}: {
  config: WheelConfig;
  onChange: (next: WheelConfig) => void;
}) {
  const expectation = wheelExpectation(config);
  const slices = totalSlices(config.outcomes);
  const payingSectors = amountSectors(config.outcomes).length;

  function updateOutcome(index: number, patch: Partial<WheelOutcome>) {
    onChange({
      ...config,
      outcomes: config.outcomes.map((outcome, i) =>
        i === index ? { ...outcome, ...patch } : outcome,
      ),
    });
  }

  function setKind(index: number, kind: WheelSectorKind) {
    const outcome = config.outcomes[index];
    updateOutcome(index, {
      kind,
      // A multiplier sector pays nothing itself; it boosts the board and respins.
      amount: kind === "multiplier" ? 0 : outcome.amount,
      multiplier: kind === "multiplier" ? Math.max(1, outcome.multiplier || 2) : 1,
      label:
        kind === "multiplier"
          ? `×${Math.max(1, outcome.multiplier || 2)}`
          : outcome.label.startsWith("×")
            ? `€${outcome.amount}`
            : outcome.label,
    });
  }

  function setMultiplier(index: number, multiplier: number) {
    const outcome = config.outcomes[index];
    updateOutcome(index, {
      multiplier,
      // Keep the rim label in step unless the streamer renamed it themselves.
      label: outcome.label.startsWith("×") ? `×${multiplier}` : outcome.label,
    });
  }

  function addSector(kind: WheelSectorKind) {
    if (!canAddOutcome(config.outcomes)) return;
    onChange({
      ...config,
      outcomes: [
        ...config.outcomes,
        kind === "multiplier"
          ? {
              id: `sector-${Date.now()}`,
              label: "×2",
              amount: 0,
              weight: 1,
              kind: "multiplier",
              multiplier: 2,
            }
          : {
              id: `sector-${Date.now()}`,
              label: "New result",
              amount: 0,
              weight: 1,
              kind: "amount",
              multiplier: 1,
            },
      ],
    });
  }

  function removeOutcome(index: number) {
    if (!canRemoveOutcome(config.outcomes)) return;
    onChange({ ...config, outcomes: config.outcomes.filter((_, i) => i !== index) });
  }

  function move(index: number, direction: -1 | 1) {
    onChange({
      ...config,
      outcomes: reorderOutcomes(config.outcomes, index, index + direction),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Entry price (€)" hint="What a viewer pays for one play, respins included.">
          <NumberInput
            value={config.entryPrice}
            onChange={(entryPrice) => onChange({ ...config, entryPrice })}
          />
        </Field>
        <Field label="Spin duration (ms)" hint="How long the wheel takes to come to rest.">
          <NumberInput
            value={config.spinDurationMs}
            step="100"
            min={2000}
            onChange={(spinDurationMs) => onChange({ ...config, spinDurationMs })}
          />
        </Field>
      </div>

      <EvPanel
        entryPrice={config.entryPrice}
        expectedValue={expectation.expectedValue}
        extraRows={[
          { label: "Slices on the wheel", value: `${slices} / ${MAX_TOTAL_SLICES}` },
          {
            label: "Chance of a multiplier per spin",
            value: formatPercent(expectation.multiplierChance),
          },
          {
            label: "Average multiplier when one lands",
            value: expectation.averageMultiplier > 0 ? `×${expectation.averageMultiplier.toFixed(2)}` : "—",
          },
          {
            label: "Average paying sector at ×1",
            value: formatEuro(expectation.baseAmount),
          },
          { label: "Average spins per play", value: expectation.expectedSpins.toFixed(2) },
        ]}
        note={`Every slice is the same size — a result appears more often because it owns more slices. The average folds in respins: a multiplier sector scales the whole board and sends it round again, chaining up to ${MAX_MULTIPLIER_CHAIN} times before the next spin is forced to pay.`}
      />

      {payingSectors === 0 ? (
        <p className="rounded border border-red-500 bg-red-50 px-3 py-2 text-sm font-medium text-red-900 dark:bg-red-950/40 dark:text-red-200">
          There is no paying sector, so a round could never end. Add one before saving — the server
          will otherwise restore the default board.
        </p>
      ) : null}

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">
            Sectors ({config.outcomes.length}/{MAX_OUTCOMES})
          </h2>
          <div className="flex gap-2">
            <Button onClick={() => addSector("amount")} disabled={!canAddOutcome(config.outcomes)}>
              Add paying sector
            </Button>
            <Button
              onClick={() => addSector("multiplier")}
              disabled={!canAddOutcome(config.outcomes)}
            >
              Add multiplier
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-300 text-left dark:border-neutral-700">
                <th className="py-2 pr-2 font-medium">Type</th>
                <th className="py-2 pr-2 font-medium">Label</th>
                <th className="py-2 pr-2 font-medium">Value</th>
                <th className="py-2 pr-2 font-medium">Slices</th>
                <th className="py-2 pr-2 font-medium">Chance</th>
                <th className="py-2 font-medium">Order</th>
              </tr>
            </thead>
            <tbody>
              {config.outcomes.map((outcome, index) => (
                <tr
                  key={outcome.id}
                  className={[
                    "border-b border-neutral-200 dark:border-neutral-800",
                    outcome.kind === "multiplier" ? "bg-purple-50 dark:bg-purple-950/30" : "",
                  ].join(" ")}
                >
                  <td className="py-2 pr-2">
                    <select
                      aria-label={`Sector ${index + 1} type`}
                      value={outcome.kind}
                      onChange={(event) => setKind(index, event.target.value as WheelSectorKind)}
                      className="rounded border border-neutral-400 bg-white px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-900"
                    >
                      {SECTOR_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {SECTOR_KIND_LABELS[kind]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-2">
                    <TextInput
                      ariaLabel={`Sector ${index + 1} label`}
                      value={outcome.label}
                      onChange={(label) => updateOutcome(index, { label })}
                      className="w-32"
                    />
                  </td>
                  <td className="py-2 pr-2">
                    {outcome.kind === "multiplier" ? (
                      <div className="flex items-center gap-1">
                        <span className="text-neutral-500">×</span>
                        <NumberInput
                          ariaLabel={`Sector ${index + 1} multiplier`}
                          value={outcome.multiplier}
                          step="0.5"
                          min={1}
                          onChange={(multiplier) => setMultiplier(index, multiplier)}
                          className="w-20"
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <span className="text-neutral-500">€</span>
                        <NumberInput
                          ariaLabel={`Sector ${index + 1} amount`}
                          value={outcome.amount}
                          onChange={(amount) => updateOutcome(index, { amount })}
                          className="w-24"
                        />
                      </div>
                    )}
                  </td>
                  <td className="py-2 pr-2">
                    <NumberInput
                      ariaLabel={`Sector ${index + 1} slices`}
                      value={outcome.weight}
                      step="1"
                      onChange={(weight) => updateOutcome(index, { weight })}
                      className="w-20"
                    />
                  </td>
                  <td className="py-2 pr-2 tabular-nums text-neutral-600 dark:text-neutral-400">
                    {sliceCount(outcome) === 0
                      ? "never"
                      : formatPercent(outcomeProbability(outcome, config.outcomes))}
                  </td>
                  <td className="py-2">
                    <div className="flex gap-1">
                      <Button onClick={() => move(index, -1)} disabled={index === 0}>
                        ↑
                      </Button>
                      <Button
                        onClick={() => move(index, 1)}
                        disabled={index === config.outcomes.length - 1}
                      >
                        ↓
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => removeOutcome(index)}
                        disabled={!canRemoveOutcome(config.outcomes)}
                      >
                        Remove
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-2 text-xs text-neutral-500">
          {MIN_OUTCOMES}–{MAX_OUTCOMES} sectors, up to {MAX_TOTAL_SLICES} slices in total. Slices are
          spread around the ring rather than grouped. A multiplier sector pays nothing on its own:
          landing it scales every amount on the board and hands the streamer a respin, and
          multipliers chain — ×2 then ×3 leaves the board at ×6. A sector set to 0 slices stays in
          the table but never comes up.
        </p>
      </div>
    </div>
  );
}
