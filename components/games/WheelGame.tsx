"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Breakdown } from "@/components/Breakdown";
import { OverlayStatus, TriggerButton } from "@/components/OverlayShell";
import { formatEuro, formatPercent } from "@/lib/odds";
import {
  MAX_MULTIPLIER_CHAIN,
  angleAt,
  applyMultiplier,
  flapperLift,
  pegIndexAt,
  pegPhase,
  sectorLabel,
  sliceCount,
  speedAt,
  spinWheel,
  wheelSlices,
  type WheelSpin,
} from "@/lib/games/wheel";
import { initAudio, playDud, playMultiplier, playPeg, playWin } from "@/lib/sound";
import type { WheelConfig } from "@/lib/types";

const CENTER = 300;
const RADIUS = 272;
const PEG_RING = 284;
const HUB = 34;
const FULL_TURNS = 6;
const FRAME_MS = 16;
/** How far the flapper is pushed aside at full speed. */
const MAX_FLAP_DEG = 26;

function polar(angleDeg: number, radius: number): [number, number] {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [CENTER + radius * Math.cos(rad), CENTER + radius * Math.sin(rad)];
}

function wedgePath(startDeg: number, endDeg: number): string {
  if (endDeg - startDeg >= 359.999) {
    return `M ${CENTER} ${CENTER - RADIUS} A ${RADIUS} ${RADIUS} 0 1 1 ${CENTER - 0.01} ${
      CENTER - RADIUS
    } Z`;
  }
  const [x1, y1] = polar(startDeg, RADIUS);
  const [x2, y2] = polar(endDeg, RADIUS);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${CENTER} ${CENTER} L ${x1} ${y1} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

/**
 * Colour follows the sector, not the slice, so every "€1" wedge matches
 * wherever it sits. Multiplier sectors break out of the palette entirely.
 */
function sectorColor(index: number, count: number, isMultiplier: boolean): string {
  if (isMultiplier) return "#7c1d6f";
  const hue = Math.round((index / Math.max(count, 1)) * 320);
  return `hsl(${hue} 64% ${index % 2 === 0 ? 44 : 33}%)`;
}

type Round = {
  /** Board multiplier carried into the next spin. */
  multiplier: number;
  /** Multiplier sectors hit so far this round. */
  chain: number;
  /** The multiplier sectors landed on, for the result breakdown. */
  hits: number[];
};

const FRESH: Round = { multiplier: 1, chain: 0, hits: [] };

export function WheelGame({
  config,
  entryAmount,
  tone = "overlay",
}: {
  config: WheelConfig;
  entryAmount: number | null;
  tone?: "overlay" | "light";
}) {
  const [rotation, setRotation] = useState(0);
  const [flap, setFlap] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [round, setRound] = useState<Round>(FRESH);
  const [spin, setSpin] = useState<WheelSpin | null>(null);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => stopTicking(), []);

  function stopTicking() {
    if (ticker.current) clearInterval(ticker.current);
    if (timer.current) clearTimeout(timer.current);
    ticker.current = null;
    timer.current = null;
  }

  // The board as it currently stands: same odds, amounts scaled by the chain.
  const board = useMemo(
    () => applyMultiplier(config, round.multiplier),
    [config, round.multiplier],
  );
  const slices = useMemo(() => wheelSlices(board.outcomes), [board.outcomes]);
  const pegSpacing = slices.length > 0 ? 360 / slices.length : 360;

  const boosted = round.multiplier > 1;
  const awaitingRespin = spin?.isMultiplier === true && !spinning;
  const stake = entryAmount ?? config.entryPrice;
  const labelSize = slices.length > 40 ? 15 : slices.length > 24 ? 18 : 22;

  /**
   * The spin runs on a timer rather than a CSS transition, because the flapper
   * has to know the wheel's angle on every frame to ride the pegs and click.
   * The frame is taken from elapsed wall-clock time, so a throttled timer drops
   * frames instead of slowing the wheel down.
   */
  function animate(from: number, to: number, durationMs: number, onDone: () => void) {
    const start = performance.now();
    let lastPeg = pegIndexAt(from, pegSpacing);
    let finished = false;

    const settle = () => {
      if (finished) return;
      finished = true;
      stopTicking();
      setRotation(to);
      setFlap(0);
      onDone();
    };

    ticker.current = setInterval(() => {
      const t = (performance.now() - start) / durationMs;
      if (t >= 1) {
        settle();
        return;
      }

      const angle = angleAt(from, to, t);
      const speed = speedAt(t);
      setRotation(angle);
      setFlap(flapperLift(pegPhase(angle, pegSpacing)) * MAX_FLAP_DEG * Math.max(0.25, speed));

      // One click per peg the flapper rides over.
      const peg = pegIndexAt(angle, pegSpacing);
      if (peg !== lastPeg) {
        lastPeg = peg;
        playPeg(speed);
      }
    }, FRAME_MS);

    timer.current = setTimeout(settle, durationMs + 400);
  }

  function handleSpin() {
    if (spinning || slices.length === 0) return;
    initAudio();

    // A finished round resets the board before the next play begins.
    const active = spin && !spin.isMultiplier ? FRESH : round;

    // Always the raw config: spinWheel applies the multiplier itself, so
    // handing it the already-scaled board would square the factor.
    const result = spinWheel(config, active.multiplier, active.chain);
    setRound(active);
    setSpin(null);
    setSpinning(true);

    // Always turn forward: close the gap to the target, then add full turns.
    const current = ((rotation % 360) + 360) % 360;
    const delta = ((result.targetRotationDeg - current + 360) % 360) + FULL_TURNS * 360;

    stopTicking();
    animate(rotation, rotation + delta, config.spinDurationMs, () => {
      setSpin(result);
      setSpinning(false);

      if (result.isMultiplier) {
        playMultiplier();
        setRound({
          multiplier: result.multiplierAfter,
          chain: active.chain + 1,
          hits: [...active.hits, result.outcome.multiplier],
        });
      } else if (result.amount <= 0) {
        playDud();
      } else {
        // Louder the rarer it was.
        playWin(1 - Math.min(1, result.probability * 6));
      }
    });
  }

  const settled = spin && !spin.isMultiplier && !spinning;
  const cappedOut = round.chain >= MAX_MULTIPLIER_CHAIN;

  return (
    <div className="flex w-full max-w-3xl flex-col items-center gap-4">
      <svg
        viewBox="0 0 600 600"
        className="h-auto w-full max-w-[min(72vh,600px)]"
        role="img"
        aria-label={`Prize wheel, ${slices.length} slices across ${config.outcomes.length} sectors`}
      >
        <circle
          cx={CENTER}
          cy={CENTER}
          r={PEG_RING + 8}
          fill="rgba(0,0,0,0.55)"
          stroke={boosted ? "#fde047" : "rgba(255,255,255,0.9)"}
          strokeWidth={boosted ? 8 : 5}
        />

        <g
          style={{
            transform: `rotate(${rotation}deg)`,
            transformOrigin: `${CENTER}px ${CENTER}px`,
          }}
        >
          {slices.map((slice) => {
            const midAngle = slice.startDeg + slice.sweepDeg / 2;
            const [textX, textY] = polar(midAngle, RADIUS * 0.7);
            // Labels run along the radius; the right half needs a half turn or
            // it comes out upside down.
            const labelRotation = midAngle < 180 ? midAngle + 270 : midAngle + 90;
            const isMultiplier = slice.outcome.kind === "multiplier";

            return (
              <g key={slice.sliceIndex}>
                <path
                  d={wedgePath(slice.startDeg, slice.endDeg)}
                  fill={sectorColor(slice.outcomeIndex, board.outcomes.length, isMultiplier)}
                  stroke={isMultiplier ? "#fde047" : "rgba(255,255,255,0.9)"}
                  strokeWidth={isMultiplier ? 2.5 : 1.5}
                />
                <text
                  x={textX}
                  y={textY}
                  fill={isMultiplier ? "#fde047" : "#fff"}
                  fontSize={isMultiplier ? labelSize + 3 : labelSize}
                  fontWeight={isMultiplier ? 800 : 700}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform={`rotate(${labelRotation} ${textX} ${textY})`}
                  style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.55)", strokeWidth: 3 }}
                >
                  {slice.outcome.label}
                </text>
              </g>
            );
          })}

          {/* A peg on every slice boundary — the flapper clicks once per slice. */}
          {slices.map((slice) => {
            const [px, py] = polar(slice.startDeg, PEG_RING);
            return (
              <circle
                key={`peg-${slice.sliceIndex}`}
                cx={px}
                cy={py}
                r={5}
                fill="#e5e7eb"
                stroke="#4b5563"
                strokeWidth={1.5}
              />
            );
          })}
        </g>

        <circle
          cx={CENTER}
          cy={CENTER}
          r={HUB}
          fill="#111"
          stroke={boosted ? "#fde047" : "#fff"}
          strokeWidth={4}
        />
        {boosted ? (
          <text
            x={CENTER}
            y={CENTER}
            fill="#fde047"
            fontSize={26}
            fontWeight={800}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            ×{round.multiplier}
          </text>
        ) : null}

        {/*
          The flapper hangs from a pivot above the rim and is knocked aside by
          each peg. Its deflection comes from the wheel angle, so the two are
          always in step.
        */}
        <g transform={`translate(${CENTER} ${CENTER - PEG_RING - 26})`}>
          <g style={{ transform: `rotate(${flap}deg)`, transformOrigin: "0px 0px" }}>
            <path
              d="M 0 0 L -11 6 L -5 44 L 5 44 L 11 6 Z"
              fill="#f8fafc"
              stroke="#111"
              strokeWidth={2.5}
              strokeLinejoin="round"
            />
          </g>
          <circle r={7} fill="#111" stroke="#f8fafc" strokeWidth={2.5} />
        </g>
      </svg>

      <TriggerButton onClick={handleSpin} disabled={spinning}>
        {spinning
          ? "Spinning…"
          : awaitingRespin
            ? `Respin at ×${round.multiplier}`
            : settled
              ? "Spin again"
              : "Spin the wheel"}
      </TriggerButton>

      {spinning ? <OverlayStatus>Rolling…</OverlayStatus> : null}

      {awaitingRespin ? (
        <OverlayStatus>
          {spin.outcome.label} — every amount on the board is now ×{round.multiplier}.
          {cappedOut ? " Next spin is guaranteed to pay." : " Respin to play it."}
        </OverlayStatus>
      ) : null}

      {settled ? (
        <Breakdown
          tone={tone}
          rows={[
            { label: "Entry amount paid", value: formatEuro(stake) },
            ...(round.hits.length > 0
              ? [
                  {
                    label: "Multipliers landed",
                    value: round.hits.map((m) => `×${m}`).join(" then "),
                    emphasis: true,
                  },
                  { label: "Board multiplier", value: `×${round.multiplier}` },
                ]
              : []),
            {
              label: "Landed on",
              value: sectorLabel(spin.outcome, round.multiplier),
              emphasis: true,
            },
            {
              label: "Slices for this sector",
              value: `${sliceCount(spin.outcome)} of ${slices.length}`,
            },
            { label: "Chance", value: formatPercent(spin.probability) },
            ...(round.multiplier > 1
              ? [
                  {
                    label: "Result math",
                    value: `${formatEuro(spin.outcome.amount)} × ${round.multiplier}`,
                  },
                ]
              : []),
          ]}
          totalLabel="Amount to send"
          totalValue={formatEuro(spin.amount)}
        />
      ) : null}
    </div>
  );
}
