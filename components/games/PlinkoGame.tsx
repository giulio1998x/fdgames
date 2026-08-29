"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Breakdown } from "@/components/Breakdown";
import { OverlayStatus, TriggerButton } from "@/components/OverlayShell";
import { formatEuro, formatMultiplier, formatPercent, probabilityOf } from "@/lib/odds";
import {
  BALL_COUNTS,
  ballTrajectory,
  dropBall,
  trajectoryDurationMs,
  type BallCount,
  type PlinkoDrop,
  type TrajectoryPoint,
} from "@/lib/games/plinko";
import { initAudio, playDud, playPin, playWin } from "@/lib/sound";
import type { PlinkoConfig, PlinkoSlot } from "@/lib/types";

const BOARD_WIDTH = 560;
const ROW_HEIGHT = 34;
const TOP_PADDING = 34;
const SLOT_HEIGHT = 46;
const SIDE_PADDING = 26;
const FRAME_MS = 17;
const SETTLE_MS = 420;
const BETWEEN_BALLS_MS = 560;
const PIN_FLASH_MS = 220;

/** Warmer colours toward the big edge multipliers. */
function slotColor(slot: PlinkoSlot, max: number): string {
  const heat = max > 1 ? Math.min(1, Math.log10(slot.multiplier + 1) / Math.log10(max + 1)) : 0;
  const hue = Math.round(190 - heat * 190);
  return `hsl(${hue} 78% ${28 + heat * 20}%)`;
}

export function PlinkoGame({
  config,
  entryAmount,
  ballCount,
  tone = "overlay",
}: {
  config: PlinkoConfig;
  entryAmount: number | null;
  ballCount: BallCount;
  tone?: "overlay" | "light";
}) {
  const [entryText, setEntryText] = useState(String(entryAmount ?? config.entryPrice));
  const [balls, setBalls] = useState<BallCount>(ballCount);
  const [ball, setBall] = useState<TrajectoryPoint | null>(null);
  const [struck, setStruck] = useState<string | null>(null);
  const [drops, setDrops] = useState<PlinkoDrop[]>([]);
  const [landed, setLanded] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const intervals = useRef<ReturnType<typeof setInterval>[]>([]);

  useEffect(() => setBalls(ballCount), [ballCount]);
  useEffect(() => {
    if (entryAmount !== null) setEntryText(String(entryAmount));
  }, [entryAmount]);
  useEffect(() => () => stopAll(), []);

  function stopAll() {
    timers.current.forEach(clearTimeout);
    intervals.current.forEach(clearInterval);
    timers.current = [];
    intervals.current = [];
  }

  const stake = useMemo(() => {
    const parsed = Number(entryText.replace(",", "."));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [entryText]);

  const maxMultiplier = useMemo(
    () => config.slots.reduce((max, slot) => Math.max(max, slot.multiplier), 0),
    [config.slots],
  );

  const boardHeight = TOP_PADDING + config.pinRows * ROW_HEIGHT + SLOT_HEIGHT + 46;
  const playWidth = BOARD_WIDTH - SIDE_PADDING * 2;
  const pinSpacing = playWidth / (config.pinRows + 1);
  const toPixels = (x: number) => SIDE_PADDING + x * playWidth;

  /**
   * Plays the precomputed trajectory frame by frame.
   *
   * The frame index comes from elapsed wall-clock time rather than a counter,
   * so a throttled timer drops frames instead of stretching the fall — and a
   * final timeout settles the drop even if the interval never fires at all.
   */
  function animate(drop: PlinkoDrop): Promise<void> {
    return new Promise((resolve) => {
      const points = ballTrajectory(drop.path, config.pinRows);
      const duration = trajectoryDurationMs(points);
      const start = performance.now();
      let finished = false;

      const settle = () => {
        if (finished) return;
        finished = true;
        clearInterval(ticker);
        setBall(points[points.length - 1]);
        setStruck(null);
        setLanded(drop.slotIndex);
        if (drop.multiplier >= 1) playWin(Math.min(1, Math.log10(drop.multiplier + 1)));
        else playDud();
        resolve();
      };

      const ticker = setInterval(() => {
        const progress = (performance.now() - start) / duration;
        if (progress >= 1) {
          settle();
          return;
        }

        const point = points[Math.min(points.length - 1, Math.floor(progress * points.length))];
        setBall(point);

        if (point.pinRow !== undefined) {
          const key = `${point.pinRow}-${point.pinIndex}`;
          setStruck(key);
          playPin();
          timers.current.push(
            setTimeout(() => setStruck((current) => (current === key ? null : current)), PIN_FLASH_MS),
          );
        }
      }, FRAME_MS);

      intervals.current.push(ticker);
      timers.current.push(setTimeout(settle, duration + SETTLE_MS));
    });
  }

  async function handleDrop() {
    if (busy || stake <= 0 || config.slots.length === 0) return;
    initAudio();

    stopAll();
    setBusy(true);
    setDrops([]);
    setLanded(null);

    const resolved: PlinkoDrop[] = [];
    for (let i = 0; i < balls; i++) {
      // Each ball is drawn independently, before its animation starts.
      const drop = dropBall(config, stake, Math.random, i + 1);
      await animate(drop);
      resolved.push(drop);
      setDrops([...resolved]);
      if (i < balls - 1) {
        await new Promise((r) => timers.current.push(setTimeout(r, BETWEEN_BALLS_MS)));
        setLanded(null);
      }
    }

    setBusy(false);
  }

  const complete = !busy && drops.length === balls && drops.length > 0;
  const totalAmount = drops.reduce((sum, d) => sum + d.amount, 0);
  const slotWidth = playWidth / config.slots.length;

  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-3">
      <svg
        viewBox={`0 0 ${BOARD_WIDTH} ${boardHeight}`}
        className="h-auto w-full max-w-[min(64vh,560px)]"
        role="img"
        aria-label={`Plinko board, ${config.pinRows} pin rows into ${config.slots.length} slots`}
      >
        <rect
          x={0}
          y={0}
          width={BOARD_WIDTH}
          height={boardHeight}
          rx={16}
          fill="rgba(0,0,0,0.55)"
          stroke="rgba(255,255,255,0.35)"
          strokeWidth={2}
        />

        {Array.from({ length: config.pinRows }, (_, row) => {
          const pins = row + 3;
          // Pins sit on the same lattice the ball walks, so it strikes them dead on.
          const rowWidth = (pins - 1) * pinSpacing;
          const startX = BOARD_WIDTH / 2 - rowWidth / 2;

          return Array.from({ length: pins }, (_, pin) => {
            const hit = struck === `${row}-${pin}`;
            return (
              <circle
                key={`${row}-${pin}`}
                cx={startX + pin * pinSpacing}
                cy={TOP_PADDING + row * ROW_HEIGHT}
                r={hit ? 7 : 4}
                fill={hit ? "#fde047" : "rgba(255,255,255,0.9)"}
                style={{ transition: `r ${PIN_FLASH_MS}ms ease-out, fill ${PIN_FLASH_MS}ms ease-out` }}
              />
            );
          });
        })}

        {config.slots.map((slot, index) => {
          const isLanded = landed === index;
          const x = SIDE_PADDING + index * slotWidth;
          return (
            <g key={slot.id}>
              <rect
                x={x + 1}
                y={boardHeight - SLOT_HEIGHT - 14}
                width={slotWidth - 2}
                height={SLOT_HEIGHT}
                rx={5}
                fill={isLanded ? "#fde047" : slotColor(slot, maxMultiplier)}
                stroke={isLanded ? "#fff" : "rgba(255,255,255,0.4)"}
                strokeWidth={isLanded ? 3 : 1}
              />
              <text
                x={x + slotWidth / 2}
                y={boardHeight - SLOT_HEIGHT / 2 - 14}
                fill={isLanded ? "#111" : "#fff"}
                fontSize={Math.min(15, (slotWidth * 1.5) / Math.max(slot.label.length, 2))}
                fontWeight={700}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {slot.label}
              </text>
            </g>
          );
        })}

        {ball ? (
          <g
            transform={`translate(${toPixels(ball.x)} ${TOP_PADDING + ball.y * ROW_HEIGHT})`}
          >
            <circle r={10} fill="#fde047" stroke="#7c2d12" strokeWidth={2} />
            <circle r={4} cx={-3} cy={-3} fill="rgba(255,255,255,0.7)" />
          </g>
        ) : null}
      </svg>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <label className="flex items-center gap-2 text-sm text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
          Entry €
          <input
            value={entryText}
            onChange={(event) => setEntryText(event.target.value)}
            disabled={busy}
            inputMode="decimal"
            className="w-24 rounded border border-white/60 bg-black/70 px-2 py-1 text-white backdrop-blur-sm disabled:opacity-40"
          />
        </label>

        {BALL_COUNTS.map((count) => (
          <button
            key={count}
            type="button"
            disabled={busy}
            onClick={() => setBalls(count)}
            className={[
              "rounded border px-3 py-1 text-sm backdrop-blur-sm transition disabled:opacity-40",
              balls === count
                ? "border-white bg-white font-semibold text-black"
                : "border-white/60 bg-black/70 text-white hover:bg-black/85",
            ].join(" ")}
          >
            {count} ball{count === 1 ? "" : "s"}
          </button>
        ))}
      </div>

      <TriggerButton onClick={handleDrop} disabled={busy || stake <= 0}>
        {busy
          ? `Dropping ${Math.min(drops.length + 1, balls)}/${balls}…`
          : `Drop ${balls} ball${balls === 1 ? "" : "s"}`}
      </TriggerButton>

      {stake <= 0 ? <OverlayStatus>Enter an entry amount above €0 to drop.</OverlayStatus> : null}

      {drops.length > 0 ? (
        <div className="w-full rounded-lg border border-white/25 bg-black/70 text-sm text-white backdrop-blur-sm">
          {drops.map((drop) => (
            <div
              key={drop.ballNumber}
              className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-1.5 last:border-b-0"
            >
              <span className="text-white/60">Ball {drop.ballNumber}</span>
              <span>
                {formatEuro(drop.entryAmount)} × {formatMultiplier(drop.multiplier)}
              </span>
              <span className="text-white/60">
                {formatPercent(probabilityOf(drop.slot, config.slots))}
              </span>
              <span className="font-medium tabular-nums">{formatEuro(drop.amount)}</span>
            </div>
          ))}
        </div>
      ) : null}

      {complete ? (
        <Breakdown
          tone={tone}
          rows={[
            { label: "Entry per ball", value: formatEuro(stake) },
            { label: "Balls dropped", value: `${drops.length}` },
            {
              label: "Multipliers hit",
              value: drops.map((d) => formatMultiplier(d.multiplier)).join(" + "),
              emphasis: true,
            },
            {
              label: "Result math",
              value: drops
                .map((d) => `${formatEuro(stake)}×${formatMultiplier(d.multiplier)}`)
                .join(" + "),
            },
          ]}
          totalLabel="Amount to send"
          totalValue={formatEuro(totalAmount)}
        />
      ) : null}
    </div>
  );
}
