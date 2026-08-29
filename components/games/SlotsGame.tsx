"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Breakdown } from "@/components/Breakdown";
import { OverlayStatus, TriggerButton } from "@/components/OverlayShell";
import { formatEuro, formatPercent, probabilityOf } from "@/lib/odds";
import {
  SPIN_COUNTS,
  allSymbols,
  blurStrip,
  spinDurationFor,
  spinSlots,
  type SlotRound,
  type SlotSpinResult,
  type SpinCount,
} from "@/lib/games/slots";
import { initAudio, playDud, playReelStop, playWin } from "@/lib/sound";
import type { SlotsConfig } from "@/lib/types";

const CELL_PX = 78;
/** One symbol every this many ms while the reel is running — deliberately fast. */
const BLUR_STEP_MS = 42;
/** The mechanical stop: short, with a touch of overshoot. */
const SNAP_MS = 260;
const SNAP_EASE = "cubic-bezier(0.25, 1.7, 0.45, 1)";
/** When each reel slams to a halt, as a share of the spin. */
const REEL_STOP_SHARE = [0.46, 0.73, 1];
const REVEAL_PAUSE_SHARE = 0.42;

type ReelState = {
  strip: string[];
  /** Strip index resting on the top row of the window. */
  offset: number;
  durationMs: number;
  easing: string;
};

function restingReel(above: string, center: string, below: string): ReelState {
  return { strip: [above, center, below], offset: 0, durationMs: 0, easing: "linear" };
}

/**
 * One reel: a three-row window with the payline in the middle. The rows above
 * and below are visible but pay nothing — they are there so a near miss reads
 * as a near miss.
 */
function Reel({ state, settled }: { state: ReelState; settled: boolean }) {
  return (
    <div
      className="relative overflow-hidden rounded-lg border-2 border-white/50 bg-black/80 backdrop-blur-sm"
      style={{ width: CELL_PX, height: CELL_PX * 3 }}
    >
      <div
        style={{
          transform: `translateY(-${state.offset * CELL_PX}px)`,
          transition: state.durationMs
            ? `transform ${state.durationMs}ms ${state.easing}`
            : "none",
        }}
      >
        {state.strip.map((symbol, index) => (
          <div
            key={index}
            className="flex items-center justify-center text-4xl"
            style={{ height: CELL_PX }}
          >
            {symbol}
          </div>
        ))}
      </div>

      {/* Dim the two non-paying rows so the payline reads first. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 bg-black/55"
        style={{ height: CELL_PX }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/55"
        style={{ height: CELL_PX }}
      />
      <div
        className={[
          "pointer-events-none absolute inset-x-0 border-y-2 transition-colors",
          settled ? "border-yellow-300" : "border-white/25",
        ].join(" ")}
        style={{ top: CELL_PX, height: CELL_PX }}
      />
    </div>
  );
}

export function SlotsGame({
  config,
  entryAmount,
  spinCount,
  tone = "overlay",
}: {
  config: SlotsConfig;
  entryAmount: number | null;
  spinCount: SpinCount;
  tone?: "overlay" | "light";
}) {
  const [spins, setSpins] = useState<SpinCount>(spinCount);
  const [round, setRound] = useState<SlotRound | null>(null);
  const [log, setLog] = useState<SlotSpinResult[]>([]);
  const [reels, setReels] = useState<ReelState[]>([
    restingReel("🍋", "🍒", "⭐"),
    restingReel("🍊", "🍋", "🔔"),
    restingReel("💎", "⭐", "🍉"),
  ]);
  const [settled, setSettled] = useState<[boolean, boolean, boolean]>([true, true, true]);
  const [busy, setBusy] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const intervals = useRef<ReturnType<typeof setInterval>[]>([]);
  /**
   * Which reels have already slammed home. The blur ticker and the snap timers
   * start from different origins, so comparing elapsed times would let the
   * ticker overwrite a reel that has just landed. A flag cannot drift.
   */
  const stopped = useRef<[boolean, boolean, boolean]>([false, false, false]);

  const pool = useMemo(() => allSymbols(config), [config]);

  useEffect(() => setSpins(spinCount), [spinCount]);
  useEffect(() => () => stopAll(), []);

  function stopAll() {
    timers.current.forEach(clearTimeout);
    intervals.current.forEach(clearInterval);
    timers.current = [];
    intervals.current = [];
  }

  function schedule(fn: () => void, ms: number) {
    timers.current.push(setTimeout(fn, ms));
  }

  function handleSpin() {
    if (busy || config.outcomes.length === 0) return;
    initAudio();
    stopAll();

    // The whole round resolves up front, then plays back one spin at a time.
    const resolved = spinSlots(config, spins);
    const spinMs = spinDurationFor(config, spins);
    const perSpin = spinMs * (1 + REVEAL_PAUSE_SHARE);

    setRound(null);
    setLog([]);
    setBusy(true);

    resolved.results.forEach((result, index) => {
      const start = index * perSpin;
      const stopAt = REEL_STOP_SHARE.map((share) => spinMs * share);

      // Enough blur frames for the slowest reel, plus the three rows it lands on.
      const blurSteps = Math.ceil(Math.max(...stopAt) / BLUR_STEP_MS) + 2;
      const strips = result.symbols.map((symbol) =>
        blurStrip(symbol, result.symbols, pool, blurSteps),
      );

      schedule(() => {
        stopped.current = [false, false, false];
        setSettled([false, false, false]);
        setReels(strips.map(({ strip }) => ({ strip, offset: 0, durationMs: 0, easing: "linear" })));
      }, start);

      // Constant-speed blur: one symbol per frame, no easing at all. The reel
      // looks like it is free-running rather than gliding to a halt.
      schedule(() => {
        const runStart = performance.now();
        const ticker = setInterval(() => {
          const step = Math.floor((performance.now() - runStart) / BLUR_STEP_MS);
          setReels((prev) =>
            prev.map((reel, i) => {
              if (stopped.current[i]) return reel;
              return {
                ...reel,
                offset: Math.min(step, strips[i].blurLimit),
                durationMs: BLUR_STEP_MS,
                easing: "linear",
              };
            }),
          );
          if (stopped.current[2]) clearInterval(ticker);
        }, BLUR_STEP_MS);
        intervals.current.push(ticker);
      }, start + 30);

      // Each reel slams onto its payline in turn, left to right.
      stopAt.forEach((at, reel) => {
        schedule(() => {
          stopped.current[reel] = true;
          setReels((prev) =>
            prev.map((state, i) =>
              i === reel
                ? {
                    ...state,
                    offset: strips[i].centerIndex - 1,
                    durationMs: SNAP_MS,
                    easing: SNAP_EASE,
                  }
                : state,
            ),
          );
          setSettled((prev) => {
            const next = [...prev] as [boolean, boolean, boolean];
            next[reel] = true;
            return next;
          });
          playReelStop();
        }, start + at);
      });

      schedule(() => {
        setLog((prev) => [...prev, result]);
        if (result.amount > 0) {
          playWin(1 - Math.min(1, probabilityOf(result.outcome, config.outcomes) * 6));
        } else {
          playDud();
        }
      }, start + stopAt[2] + SNAP_MS + 60);
    });

    schedule(() => {
      setRound(resolved);
      setBusy(false);
    }, resolved.results.length * perSpin);
  }

  const stake = entryAmount ?? config.entryPrice;
  const runningTotal = log.reduce((sum, r) => sum + r.amount, 0);
  const stoppedCount = settled.filter(Boolean).length;

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-4">
      <div className="relative flex gap-3 rounded-xl border-2 border-white/30 bg-black/50 p-3 backdrop-blur-sm">
        {reels.map((state, index) => (
          <Reel key={index} state={state} settled={settled[index]} />
        ))}
        {/* Payline markers, so it is obvious which row counts. */}
        <span
          className="pointer-events-none absolute left-1 -translate-y-1/2 text-lg text-yellow-300"
          style={{ top: CELL_PX * 1.5 + 12 }}
          aria-hidden
        >
          ▶
        </span>
        <span
          className="pointer-events-none absolute right-1 -translate-y-1/2 text-lg text-yellow-300"
          style={{ top: CELL_PX * 1.5 + 12 }}
          aria-hidden
        >
          ◀
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className="text-sm text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
          Spins:
        </span>
        {SPIN_COUNTS.map((count) => (
          <button
            key={count}
            type="button"
            disabled={busy}
            onClick={() => setSpins(count)}
            className={[
              "rounded border px-3 py-1 text-sm backdrop-blur-sm transition disabled:opacity-40",
              spins === count
                ? "border-white bg-white font-semibold text-black"
                : "border-white/60 bg-black/70 text-white hover:bg-black/85",
            ].join(" ")}
          >
            {count}
          </button>
        ))}
      </div>

      <TriggerButton onClick={handleSpin} disabled={busy}>
        {busy ? `Spinning ${Math.min(log.length + 1, spins)}/${spins}…` : `Spin ${spins}x`}
      </TriggerButton>

      {busy ? (
        <OverlayStatus>
          {stoppedCount < 3
            ? `Reel ${stoppedCount + 1} of 3 still running…`
            : log.length > 0
              ? `Running total after ${log.length} spin${
                  log.length === 1 ? "" : "s"
                }: ${formatEuro(runningTotal)}`
              : "Rolling…"}
        </OverlayStatus>
      ) : null}

      {log.length > 0 ? (
        <div className="max-h-52 w-full overflow-y-auto rounded-lg border border-white/25 bg-black/70 text-sm text-white backdrop-blur-sm">
          {log.map((result) => (
            <div
              key={result.spinNumber}
              className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-1.5 last:border-b-0"
            >
              <span className="text-white/60">#{result.spinNumber}</span>
              <span className="text-lg">{result.symbols.join(" ")}</span>
              <span className="flex-1 truncate text-white/80">{result.outcome.label}</span>
              <span className="tabular-nums">{formatEuro(result.amount)}</span>
            </div>
          ))}
        </div>
      ) : null}

      {round && !busy ? (
        <Breakdown
          tone={tone}
          rows={[
            { label: "Entry per spin", value: formatEuro(stake) },
            { label: "Spins", value: `${round.results.length}` },
            {
              label: "Total entry paid",
              value: `${formatEuro(stake)} × ${round.results.length} = ${formatEuro(
                stake * round.results.length,
              )}`,
            },
            { label: "Best single spin", value: bestSpinLabel(round, config), emphasis: true },
          ]}
          totalLabel="Amount to send"
          totalValue={formatEuro(round.totalAmount)}
        />
      ) : null}
    </div>
  );
}

function bestSpinLabel(round: SlotRound, config: SlotsConfig): string {
  const best = round.results.reduce((top, r) => (r.amount > top.amount ? r : top));
  return `${best.outcome.label} — ${formatEuro(best.amount)} (${formatPercent(
    probabilityOf(best.outcome, config.outcomes),
  )})`;
}
