"use client";

import type { ReactNode } from "react";

import { formatEuro } from "@/lib/odds";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-neutral-700 dark:text-neutral-300">{label}</span>
      {children}
      {hint ? <span className="text-xs text-neutral-500">{hint}</span> : null}
    </label>
  );
}

const INPUT_CLASS =
  "rounded border border-neutral-400 bg-white px-2 py-1 text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100";

export function NumberInput({
  value,
  onChange,
  step = "0.01",
  min = 0,
  className = "",
  ariaLabel,
}: {
  value: number;
  onChange: (next: number) => void;
  step?: string;
  min?: number;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      step={step}
      min={min}
      aria-label={ariaLabel}
      value={Number.isFinite(value) ? value : 0}
      onChange={(event) => {
        const parsed = Number(event.target.value);
        onChange(Number.isFinite(parsed) ? parsed : 0);
      }}
      className={`${INPUT_CLASS} ${className}`}
    />
  );
}

export function TextInput({
  value,
  onChange,
  className = "",
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <input
      type="text"
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`${INPUT_CLASS} ${className}`}
    />
  );
}

export function Button({
  onClick,
  children,
  variant = "default",
  disabled,
  type = "button",
}: {
  onClick?: () => void;
  children: ReactNode;
  variant?: "default" | "primary" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const styles = {
    default:
      "border-neutral-400 bg-white text-neutral-900 hover:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700",
    primary: "border-blue-700 bg-blue-600 text-white hover:bg-blue-700",
    danger:
      "border-red-500 bg-white text-red-700 hover:bg-red-50 dark:bg-neutral-800 dark:text-red-400",
  }[variant];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded border px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles}`}
    >
      {children}
    </button>
  );
}

/**
 * Live EV readout, shown while the streamer tweaks the odds.
 *
 * The result is money the viewer sends, not money the streamer pays out, so
 * there is no losing config to warn about — a bigger number is simply a bigger
 * average tribute.
 */
export function EvPanel({
  entryPrice,
  expectedValue,
  extraRows = [],
  note,
  pending,
  perPlayLabel = "Average result per play",
}: {
  entryPrice: number;
  expectedValue: number;
  extraRows?: { label: string; value: ReactNode }[];
  note?: string;
  pending?: boolean;
  perPlayLabel?: string;
}) {
  const multipleOfEntry = entryPrice > 0 ? expectedValue / entryPrice : 0;
  const nothingToSend = expectedValue <= 0;

  return (
    <div className="rounded-lg border border-neutral-300 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-900">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
          {perPlayLabel} {pending ? "(calculating…)" : ""}
        </span>
        <span className="text-2xl font-semibold tabular-nums">{formatEuro(expectedValue)}</span>
      </div>

      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-neutral-600 dark:text-neutral-400">Entry price</dt>
          <dd className="tabular-nums">{formatEuro(entryPrice)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-neutral-600 dark:text-neutral-400">Result vs entry</dt>
          <dd className="tabular-nums">{multipleOfEntry.toFixed(2)}× the entry price</dd>
        </div>
        {extraRows.map((row) => (
          <div key={row.label} className="flex justify-between gap-4">
            <dt className="text-neutral-600 dark:text-neutral-400">{row.label}</dt>
            <dd className="tabular-nums">{row.value}</dd>
          </div>
        ))}
      </dl>

      {nothingToSend ? (
        <p className="mt-3 rounded border border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Every reachable result is €0, so this config never asks the viewer for anything beyond
          the entry.
        </p>
      ) : null}

      {note ? <p className="mt-3 text-xs text-neutral-500">{note}</p> : null}
    </div>
  );
}

export function SectionHeading({ children }: { children: ReactNode }) {
  return <h2 className="text-lg font-semibold">{children}</h2>;
}
