"use client";

import { useMemo, useState } from "react";

import { Button, EvPanel, Field, NumberInput, TextInput } from "@/components/admin/ui";
import { expectedValue, formatPercent, probabilityOf } from "@/lib/odds";
import {
  MAX_SPIN_MS,
  MIN_SPIN_MS,
  PATTERN_KINDS,
  PATTERN_LABELS,
  allSymbols,
  combinationCount,
  sampleCombinations,
  spinDurationFor,
  totalCombinations,
} from "@/lib/games/slots";
import type {
  SlotOutcome,
  SlotPattern,
  SlotPatternKind,
  SlotsConfig,
} from "@/lib/types";

export function SlotsEditor({
  config,
  onChange,
}: {
  config: SlotsConfig;
  onChange: (next: SlotsConfig) => void;
}) {
  const [newSymbol, setNewSymbol] = useState("");
  const ev = expectedValue(config.outcomes);
  const pool = useMemo(() => allSymbols(config), [config]);
  const combos = useMemo(() => totalCombinations(config), [config]);

  function updateRow(index: number, patch: Partial<SlotOutcome>) {
    onChange({
      ...config,
      outcomes: config.outcomes.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    });
  }

  function updatePattern(index: number, patch: Partial<SlotPattern>) {
    updateRow(index, { pattern: { ...config.outcomes[index].pattern, ...patch } });
  }

  function toggleSymbol(index: number, symbol: string) {
    const current = config.outcomes[index].pattern.symbols;
    updatePattern(index, {
      symbols: current.includes(symbol)
        ? current.filter((s) => s !== symbol)
        : [...current, symbol],
    });
  }

  function updateExact(index: number, reel: 0 | 1 | 2, symbol: string) {
    const exact: [string, string, string] = [...config.outcomes[index].pattern.exact];
    exact[reel] = symbol;
    updatePattern(index, { exact });
  }

  function addRow() {
    const first = config.symbolLibrary[0] ?? "🍒";
    onChange({
      ...config,
      outcomes: [
        ...config.outcomes,
        {
          id: `row-${Date.now()}`,
          label: "New result",
          amount: 0,
          weight: 10,
          pattern: { kind: "pair", symbols: [first], exact: [first, first, first] },
        },
      ],
    });
  }

  function removeRow(index: number) {
    if (config.outcomes.length <= 1) return;
    onChange({ ...config, outcomes: config.outcomes.filter((_, i) => i !== index) });
  }

  function addSymbol() {
    const symbol = newSymbol.trim();
    if (!symbol || config.symbolLibrary.includes(symbol)) return;
    onChange({ ...config, symbolLibrary: [...config.symbolLibrary, symbol] });
    setNewSymbol("");
  }

  function removeSymbol(symbol: string) {
    onChange({
      ...config,
      symbolLibrary: config.symbolLibrary.filter((entry) => entry !== symbol),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Entry price (€)" hint="Charged per spin. A 10-spin round costs 10x this.">
          <NumberInput
            value={config.entryPrice}
            onChange={(entryPrice) => onChange({ ...config, entryPrice })}
          />
        </Field>
        <Field
          label="Spin duration (ms)"
          hint={`One spin takes this long. A 25-spin round compresses to about ${
            Math.round(spinDurationFor(config, 25) / 100) / 10
          }s each so it stays watchable.`}
        >
          <NumberInput
            value={config.spinDurationMs}
            step="100"
            min={MIN_SPIN_MS}
            onChange={(spinDurationMs) =>
              onChange({ ...config, spinDurationMs: Math.min(MAX_SPIN_MS, spinDurationMs) })
            }
          />
        </Field>
      </div>

      <EvPanel
        entryPrice={config.entryPrice}
        expectedValue={ev}
        extraRows={[
          { label: "Distinct reel pictures", value: combos.toLocaleString() },
        ]}
        note="Per single spin. Multi-spin rounds resolve each spin independently against this same table, so a 10-spin round averages ten times this."
      />

      <div className="rounded-lg border border-neutral-300 p-4 dark:border-neutral-700">
        <h2 className="mb-1 text-lg font-semibold">Your symbols</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Anything short works — an emoji, a letter, a couple of characters. Every row below picks
          from this set, and the blur between stops is drawn from it too.
        </p>

        <div className="mb-3 flex flex-wrap gap-2">
          {config.symbolLibrary.map((symbol) => (
            <span
              key={symbol}
              className="inline-flex items-center gap-2 rounded border border-neutral-300 px-2 py-1 dark:border-neutral-600"
            >
              <span className="text-xl">{symbol}</span>
              <button
                type="button"
                onClick={() => removeSymbol(symbol)}
                aria-label={`Remove symbol ${symbol}`}
                className="text-xs text-red-600 hover:underline dark:text-red-400"
              >
                ✕
              </button>
            </span>
          ))}
          {config.symbolLibrary.length === 0 ? (
            <span className="text-sm text-neutral-500">No symbols yet — add one.</span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <Field label="Add a symbol">
            <TextInput
              value={newSymbol}
              onChange={setNewSymbol}
              ariaLabel="New symbol"
              className="w-32 text-xl"
            />
          </Field>
          <Button onClick={addSymbol} disabled={!newSymbol.trim()}>
            Add
          </Button>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Payout table ({config.outcomes.length} rows)</h2>
          <Button onClick={addRow}>Add row</Button>
        </div>

        <p className="mb-3 text-xs text-neutral-500">
          A row describes a <em>shape</em>, not one fixed picture. Every arrangement matching that
          shape is generated, so a cherry pair lands on reels 1+2, or 1+3, or 2+3, with any other
          symbol filling the gap. The row is still drawn from its weight first — the picture is
          chosen afterwards, and never changes what the spin pays.
        </p>

        <div className="flex flex-col gap-3">
          {config.outcomes.map((row, index) => (
            <PatternRow
              key={row.id}
              row={row}
              index={index}
              config={config}
              pool={pool}
              onUpdateRow={updateRow}
              onUpdatePattern={updatePattern}
              onToggleSymbol={toggleSymbol}
              onUpdateExact={updateExact}
              onRemove={removeRow}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function PatternRow({
  row,
  index,
  config,
  pool,
  onUpdateRow,
  onUpdatePattern,
  onToggleSymbol,
  onUpdateExact,
  onRemove,
}: {
  row: SlotOutcome;
  index: number;
  config: SlotsConfig;
  pool: string[];
  onUpdateRow: (index: number, patch: Partial<SlotOutcome>) => void;
  onUpdatePattern: (index: number, patch: Partial<SlotPattern>) => void;
  onToggleSymbol: (index: number, symbol: string) => void;
  onUpdateExact: (index: number, reel: 0 | 1 | 2, symbol: string) => void;
  onRemove: (index: number) => void;
}) {
  const count = combinationCount(row.pattern, pool);
  // Re-sampled on every edit so the streamer sees what changed.
  const samples = useMemo(
    () => sampleCombinations(row.pattern, pool, 4),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [row.pattern.kind, row.pattern.symbols.join(","), row.pattern.exact.join(","), pool.join(",")],
  );
  const usesSymbolSet = row.pattern.kind === "triple" || row.pattern.kind === "pair";

  return (
    <div className="rounded-lg border border-neutral-300 p-3 dark:border-neutral-700">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Label">
          <TextInput
            ariaLabel={`Row ${index + 1} label`}
            value={row.label}
            onChange={(label) => onUpdateRow(index, { label })}
            className="w-40"
          />
        </Field>
        <Field label="Viewer sends (€)">
          <NumberInput
            ariaLabel={`Row ${index + 1} amount`}
            value={row.amount}
            onChange={(amount) => onUpdateRow(index, { amount })}
            className="w-24"
          />
        </Field>
        <Field label="Weight">
          <NumberInput
            ariaLabel={`Row ${index + 1} weight`}
            value={row.weight}
            step="1"
            onChange={(weight) => onUpdateRow(index, { weight })}
            className="w-20"
          />
        </Field>
        <Field label="Chance">
          <span className="px-1 py-1 text-sm tabular-nums">
            {formatPercent(probabilityOf(row, config.outcomes))}
          </span>
        </Field>
        <Field label="Reels show">
          <select
            aria-label={`Row ${index + 1} pattern`}
            value={row.pattern.kind}
            onChange={(event) =>
              onUpdatePattern(index, { kind: event.target.value as SlotPatternKind })
            }
            className="rounded border border-neutral-400 bg-white px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-900"
          >
            {PATTERN_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {PATTERN_LABELS[kind]}
              </option>
            ))}
          </select>
        </Field>
        <div className="ml-auto">
          <Button
            variant="danger"
            onClick={() => onRemove(index)}
            disabled={config.outcomes.length <= 1}
          >
            Remove
          </Button>
        </div>
      </div>

      {usesSymbolSet ? (
        <div className="mt-3">
          <p className="mb-1 text-xs font-medium text-neutral-600 dark:text-neutral-400">
            {row.pattern.kind === "triple"
              ? "Which symbols can make the three of a kind"
              : "Which symbols can make the pair"}
          </p>
          <div className="flex flex-wrap gap-1">
            {config.symbolLibrary.map((symbol) => {
              const active = row.pattern.symbols.includes(symbol);
              return (
                <button
                  key={symbol}
                  type="button"
                  aria-pressed={active}
                  aria-label={`Row ${index + 1} use ${symbol}`}
                  onClick={() => onToggleSymbol(index, symbol)}
                  className={[
                    "rounded border px-2 py-1 text-xl transition",
                    active
                      ? "border-blue-600 bg-blue-100 dark:bg-blue-900/60"
                      : "border-neutral-300 opacity-45 hover:opacity-80 dark:border-neutral-600",
                  ].join(" ")}
                >
                  {symbol}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {row.pattern.kind === "exact" ? (
        <div className="mt-3 flex items-end gap-2">
          <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
            Fixed combination
          </span>
          {([0, 1, 2] as const).map((reel) => (
            <input
              key={reel}
              aria-label={`Row ${index + 1} reel ${reel + 1}`}
              value={row.pattern.exact[reel]}
              onChange={(event) => onUpdateExact(index, reel, event.target.value)}
              className="w-14 rounded border border-neutral-400 bg-white px-1 py-1 text-center text-xl dark:border-neutral-600 dark:bg-neutral-900"
            />
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <span
          className={
            count === 0
              ? "font-medium text-red-600 dark:text-red-400"
              : "text-neutral-600 dark:text-neutral-400"
          }
        >
          {count === 0
            ? "No arrangement possible — pick at least one symbol."
            : `${count.toLocaleString()} different reel picture${count === 1 ? "" : "s"}`}
        </span>
        {samples.map((triple, i) => (
          <span
            key={i}
            className="rounded border border-neutral-200 px-2 py-1 text-lg dark:border-neutral-700"
          >
            {triple.join(" ")}
          </span>
        ))}
      </div>
    </div>
  );
}
