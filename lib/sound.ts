"use client";

/**
 * Synthesised sound effects.
 *
 * Everything is generated with the Web Audio API rather than shipped as audio
 * files, so the overlay stays self-contained and an OBS Browser Source has
 * nothing extra to fetch. Browsers block audio until a user gesture, so the
 * context is created lazily on the first trigger press.
 */

const STORAGE_KEY = "stream-prize-games:muted";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let loaded = false;

type WindowWithLegacyAudio = Window & { webkitAudioContext?: typeof AudioContext };

function loadPreference() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    muted = window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    // Private mode and blocked site data both throw; unmuted is the sane default.
  }
}

/** Call from a click handler — audio cannot start without a user gesture. */
export function initAudio(): void {
  loadPreference();
  if (typeof window === "undefined") return;

  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as WindowWithLegacyAudio).webkitAudioContext;
      if (!Ctor) return;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null;
  }
}

export function isMuted(): boolean {
  loadPreference();
  return muted;
}

export function setMuted(next: boolean): void {
  loadPreference();
  muted = next;
  if (master) master.gain.value = next ? 0 : 0.5;
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    // Not being able to remember the choice is not worth failing over.
  }
}

function ready(): { ctx: AudioContext; master: GainNode } | null {
  if (!ctx || !master || muted || ctx.state === "closed") return null;
  return { ctx, master };
}

/** A short pitched blip. The building block for most of these. */
function blip(
  frequency: number,
  durationMs: number,
  gain: number,
  type: OscillatorType = "square",
  bendTo?: number,
) {
  const audio = ready();
  if (!audio) return;

  try {
    const now = audio.ctx.currentTime;
    const osc = audio.ctx.createOscillator();
    const env = audio.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    if (bendTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, bendTo), now + durationMs / 1000);
    }

    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), now + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);

    osc.connect(env).connect(audio.master);
    osc.start(now);
    osc.stop(now + durationMs / 1000 + 0.02);
  } catch {
    // A dropped sound must never break a round.
  }
}

/** Filtered noise — used for anything percussive. */
function noise(durationMs: number, gain: number, frequency: number, q = 1) {
  const audio = ready();
  if (!audio) return;

  try {
    const now = audio.ctx.currentTime;
    const frames = Math.max(1, Math.floor((audio.ctx.sampleRate * durationMs) / 1000));
    const buffer = audio.ctx.createBuffer(1, frames, audio.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    }

    const source = audio.ctx.createBufferSource();
    source.buffer = buffer;

    const filter = audio.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = frequency;
    filter.Q.value = q;

    const env = audio.ctx.createGain();
    env.gain.value = gain;

    source.connect(filter).connect(env).connect(audio.master);
    source.start(now);
  } catch {
    // As above.
  }
}

/** The flapper riding over a peg. Intensity tracks the wheel's speed. */
export function playPeg(intensity: number): void {
  const strength = Math.min(1, Math.max(0.15, intensity));
  noise(38, 0.16 * strength, 1600 + 900 * strength, 6);
}

/** A reel coming to a stop. */
export function playReelStop(): void {
  noise(70, 0.3, 320, 2);
  blip(150, 90, 0.12, "triangle", 90);
}

/** A card leaving the deck. */
export function playCard(): void {
  noise(90, 0.13, 2400, 1.2);
}

/** The hole card turning over. */
export function playFlip(): void {
  noise(140, 0.16, 1400, 1.5);
  blip(420, 120, 0.05, "triangle", 300);
}

/** A ball striking a pin. */
export function playPin(): void {
  blip(880 + Math.random() * 500, 45, 0.07, "sine");
}

/** Landing on a result. `tier` 0..1 scales how triumphant it sounds. */
export function playWin(tier = 0): void {
  const steps = tier > 0.66 ? [523, 659, 784, 1047] : tier > 0.33 ? [523, 659, 784] : [523, 659];
  steps.forEach((frequency, index) => {
    window.setTimeout(() => blip(frequency, 220, 0.16, "triangle"), index * 90);
  });
}

/** Landing on a multiplier — rising, because the round is not over. */
export function playMultiplier(): void {
  [392, 523, 659, 880].forEach((frequency, index) => {
    window.setTimeout(() => blip(frequency, 200, 0.17, "sawtooth"), index * 80);
  });
}

/** A result that pays nothing. */
export function playDud(): void {
  blip(220, 260, 0.1, "triangle", 110);
}
