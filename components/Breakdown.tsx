import type { ReactNode } from "react";

export type BreakdownRow = {
  label: string;
  value: ReactNode;
  /** Renders as a subtotal-style row rather than a plain lookup. */
  emphasis?: boolean;
};

/**
 * The math trail behind a result. Viewers are watching this on stream, so every
 * lookup and multiplication that produced the final number is shown.
 */
export function Breakdown({
  rows,
  totalLabel,
  totalValue,
  secondary,
  tone = "light",
}: {
  rows: BreakdownRow[];
  totalLabel: string;
  totalValue: ReactNode;
  /** Quieter line under the headline figure, e.g. the entry + result total. */
  secondary?: ReactNode;
  tone?: "light" | "overlay";
}) {
  const overlay = tone === "overlay";

  return (
    <dl
      className={[
        "w-full rounded-lg border text-sm",
        overlay
          ? "border-white/25 bg-black/70 text-white backdrop-blur-sm"
          : "border-neutral-300 bg-white text-neutral-900",
      ].join(" ")}
    >
      {rows.map((row, index) => (
        <div
          key={`${row.label}-${index}`}
          className={[
            "flex items-baseline justify-between gap-4 px-4 py-2",
            index > 0 ? (overlay ? "border-t border-white/15" : "border-t border-neutral-200") : "",
            row.emphasis ? "font-medium" : "",
          ].join(" ")}
        >
          <dt className={overlay ? "text-white/70" : "text-neutral-600"}>{row.label}</dt>
          <dd className="text-right tabular-nums">{row.value}</dd>
        </div>
      ))}

      <div
        className={[
          "flex items-baseline justify-between gap-4 px-4 pt-3 text-lg font-semibold",
          secondary ? "pb-1" : "pb-3",
          overlay ? "border-t-2 border-white/40" : "border-t-2 border-neutral-400",
        ].join(" ")}
      >
        <dt>{totalLabel}</dt>
        <dd className="text-right tabular-nums">{totalValue}</dd>
      </div>

      {secondary ? (
        <div
          className={[
            "px-4 pb-3 text-right text-xs",
            overlay ? "text-white/60" : "text-neutral-500",
          ].join(" ")}
        >
          {secondary}
        </div>
      ) : null}
    </dl>
  );
}
