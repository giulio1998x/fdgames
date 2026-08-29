"use client";

import { useState } from "react";

import { Button, EvPanel, Field, NumberInput, TextInput } from "@/components/admin/ui";
import {
  formatEuro,
  formatMultiplier,
  formatPercent,
  probabilityOf,
  weightedAverageMultiplier,
} from "@/lib/odds";
import {
  MAX_PIN_ROWS,
  MIN_PIN_ROWS,
  defaultPlinkoSlots,
  plinkoExpectedValue,
} from "@/lib/games/plinko";
import type { PlinkoConfig, PlinkoSlot } from "@/lib/types";

export function PlinkoEditor({
  config,
  onChange,
}: {
  config: PlinkoConfig;
  onChange: (next: PlinkoConfig) => void;
}) {
  const [edgeMultiplier, setEdgeMultiplier] = useState(100);
  const [centreMultiplier, setCentreMultiplier] = useState(1);
  const [slotCount, setSlotCount] = useState(config.slots.length);
  const [curve, setCurve] = useState(4);

  const avgMultiplier = weightedAverageMultiplier(config.slots);
  const ev = plinkoExpectedValue(config, config.entryPrice);

  function updateSlot(index: number, patch: Partial<PlinkoSlot>) {
    onChange({
      ...config,
      slots: config.slots.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)),
    });
  }

  function addSlot() {
    onChange({
      ...config,
      slots: [
        ...config.slots,
        { id: `slot-${Date.now()}`, label: "1x", multiplier: 1, weight: 100 },
      ],
    });
  }

  function removeSlot(index: number) {
    if (config.slots.length <= 3) return;
    onChange({ ...config, slots: config.slots.filter((_, i) => i !== index) });
  }

  function regenerate() {
    onChange({
      ...config,
      slots: defaultPlinkoSlots({
        slotCount,
        maxMultiplier: edgeMultiplier,
        minMultiplier: centreMultiplier,
        curve,
      }),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Default entry amount (€)"
          hint="Used when the overlay URL carries no ?entry= value. Either side can type a different amount at drop time."
        >
          <NumberInput
            value={config.entryPrice}
            onChange={(entryPrice) => onChange({ ...config, entryPrice })}
          />
        </Field>
        <Field
          label="Pin rows"
          hint={`${MIN_PIN_ROWS}–${MAX_PIN_ROWS}. Changes how far the ball falls and how much it scatters; the landing slot still comes from the weights below.`}
        >
          <NumberInput
            value={config.pinRows}
            step="1"
            min={MIN_PIN_ROWS}
            onChange={(pinRows) => onChange({ ...config, pinRows })}
          />
        </Field>
      </div>

      <EvPanel
        entryPrice={config.entryPrice}
        expectedValue={ev}
        extraRows={[
          { label: "Weighted average multiplier", value: formatMultiplier(avgMultiplier) },
          {
            label: "Formula",
            value: `${formatEuro(config.entryPrice)} × ${formatMultiplier(avgMultiplier)}`,
          },
        ]}
        note="The result scales with whatever entry amount is played, so the average multiplier is the number to tune — at 1.83x a viewer sends on average 1.83 times what they staked."
      />

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Landing slots ({config.slots.length})</h2>
          <Button onClick={addSlot}>Add slot</Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-300 text-left dark:border-neutral-700">
                <th className="py-2 pr-2 font-medium">#</th>
                <th className="py-2 pr-2 font-medium">Label</th>
                <th className="py-2 pr-2 font-medium">Multiplier</th>
                <th className="py-2 pr-2 font-medium">Weight</th>
                <th className="py-2 pr-2 font-medium">Chance</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {config.slots.map((slot, index) => (
                <tr key={slot.id} className="border-b border-neutral-200 dark:border-neutral-800">
                  <td className="py-2 pr-2 text-neutral-500">{index + 1}</td>
                  <td className="py-2 pr-2">
                    <TextInput
                      ariaLabel={`Slot ${index + 1} label`}
                      value={slot.label}
                      onChange={(label) => updateSlot(index, { label })}
                      className="w-28"
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <NumberInput
                      ariaLabel={`Slot ${index + 1} multiplier`}
                      value={slot.multiplier}
                      onChange={(multiplier) => updateSlot(index, { multiplier })}
                      className="w-24"
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <NumberInput
                      ariaLabel={`Slot ${index + 1} weight`}
                      value={slot.weight}
                      step="1"
                      onChange={(weight) => updateSlot(index, { weight })}
                      className="w-24"
                    />
                  </td>
                  <td className="py-2 pr-2 tabular-nums text-neutral-600 dark:text-neutral-400">
                    {formatPercent(probabilityOf(slot, config.slots))}
                  </td>
                  <td className="py-2">
                    <Button
                      variant="danger"
                      onClick={() => removeSlot(index)}
                      disabled={config.slots.length <= 3}
                    >
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-2 text-xs text-neutral-500">
          Weight controls how often the ball lands in a slot, independently of how wide the slot
          looks on the board.
        </p>
      </div>

      <div className="rounded-lg border border-neutral-300 p-4 dark:border-neutral-700">
        <h3 className="mb-1 font-medium">Regenerate a symmetrical board</h3>
        <p className="mb-3 text-xs text-neutral-500">
          Builds a board that runs from the centre multiplier out to the edge multiplier, weighted
          on the binomial curve a real pin board produces. A higher curve keeps the middle flat and
          saves the big numbers for the rim. This replaces every slot below.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Slots">
            <NumberInput value={slotCount} step="1" min={3} onChange={setSlotCount} />
          </Field>
          <Field label="Centre multiplier">
            <NumberInput value={centreMultiplier} step="0.1" onChange={setCentreMultiplier} />
          </Field>
          <Field label="Edge multiplier">
            <NumberInput value={edgeMultiplier} step="1" min={1} onChange={setEdgeMultiplier} />
          </Field>
          <Field label="Curve">
            <NumberInput value={curve} step="1" min={1} onChange={setCurve} />
          </Field>
          <Button onClick={regenerate}>Regenerate slots</Button>
        </div>
      </div>
    </div>
  );
}
