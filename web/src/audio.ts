// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// Sound, synthesised.
//
// There was none. Sound is the single biggest "alive" multiplier and it is
// cheaper than it looks: every sound here is an oscillator and an envelope,
// no files, no loading, no decoding. A wet knock on a hit, a rising tone on
// a level, a hiss for an enzyme, and an ambient bed of bubbling that deepens
// per stratum. That bed is what makes the water a PLACE.
//
// Web Audio needs a user gesture before it will play, so the context is
// created lazily on the first tap and every call before that is a no-op.
// Muted is a setting; reduce-motion does not touch sound.
//
// Nothing here throws. A phone with no AudioContext, a browser that refuses
// to resume, a call before the first gesture -- all silent, never a crash.

import { chordOf, droneStep, noteAt, octaveAt, semi,
  type MusicVoicing } from "./music.js";

export type Cue = "hit" | "hurt" | "kill" | "level" | "cast" | "pickup"
  | "descend" | "die" | "denied";

interface Drone {
  /** Three sines on the root, detuned against each other. Created once and
   *  retuned; rebuilding them per floor would click. */
  osc: OscillatorNode[];
  gain: GainNode;
  filter: BiquadFilterNode;
}

interface Voice {
  ctx: AudioContext;
  master: GainNode;
  /** The ambient bed: a filtered noise source and its gain, retuned per
   *  stratum rather than rebuilt. */
  bed: { gain: GainNode; filter: BiquadFilterNode } | null;
  drone: Drone | null;
  /** When the next struck note is due, in ctx time. */
  nextNote: number;
  /** Counter for the deterministic note walk. */
  noteN: number;
  /** When the drone next re-voices, and which step it is on. The arpeggio is
   *  SLOW -- about a move every three seconds -- so it reads as the chord
   *  breathing rather than as a second melody. */
  nextArp: number;
  arpN: number;
}

let voice: Voice | null = null;
let muted = false;
let bedDepth = -1;

/** Create the context. Must be called from a user gesture handler. */
export function unlockAudio(): void {
  if (voice) { voice.ctx.resume().catch(() => undefined); return; }
  try {
    const Ctx = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.35;
    master.connect(ctx.destination);
    voice = { ctx, master, bed: null, drone: null, nextNote: 0, noteN: 0,
              nextArp: 0, arpN: 0 };
    // A refused resume (autoplay policy) is a rejected promise. Unhandled,
    // that is a console error on every phone that refuses; handled, it is
    // just silence until the next gesture.
    ctx.resume().catch(() => undefined);
  } catch {
    voice = null;
  }
}

export function setMuted(m: boolean): void {
  muted = m;
  if (voice) voice.master.gain.value = m ? 0 : 0.35;
}
export function isMuted(): boolean { return muted; }

/** A short tone: frequency sweep, gain envelope, done. */
function tone(
  f0: number, f1: number, ms: number, type: OscillatorType, gain: number,
  attack = 0.005,
): void {
  if (!voice || muted) return;
  try {
    const { ctx, master } = voice;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + ms / 1000);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + ms / 1000 + 0.02);
  } catch { /* a refused context is silence, not a crash */ }
}

/** A burst of filtered noise: the "wet" in a wet hit. */
function noise(ms: number, gain: number, cutoff: number): void {
  if (!voice || muted) return;
  try {
    const { ctx, master } = voice;
    const n = Math.floor(ctx.sampleRate * ms / 1000);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(master);
    src.start();
  } catch { /* silence */ }
}

export function play(cue: Cue): void {
  switch (cue) {
    case "hit":     tone(220, 90, 90, "sine", 0.5); noise(60, 0.25, 1800); break;
    case "hurt":    tone(160, 60, 140, "triangle", 0.6); noise(90, 0.35, 900); break;
    case "kill":    tone(300, 40, 260, "sawtooth", 0.4); noise(180, 0.4, 700); break;
    case "level":   tone(330, 660, 220, "sine", 0.35, 0.02);
                    setTimeout(() => { tone(495, 990, 260, "sine", 0.3, 0.02); }, 120); break;
    case "cast":    tone(880, 1760, 120, "sine", 0.25); noise(140, 0.15, 4000); break;
    case "pickup":  tone(520, 780, 80, "triangle", 0.3); break;
    case "descend": tone(200, 70, 700, "sine", 0.4, 0.05); noise(500, 0.2, 400); break;
    case "die":     tone(180, 30, 1400, "sawtooth", 0.5, 0.1); noise(900, 0.5, 500); break;
    case "denied":  tone(140, 130, 110, "square", 0.15); break;
  }
}

/**
 * The ambient bed. Filtered noise, quiet, with the filter cutoff and level
 * tuned to the stratum: bright and thin at the oxic surface, low and thick
 * in the sulfidic and methanogenic deep. Retuned on depth change, not
 * rebuilt; a bed that restarts on every floor would click.
 */
export function ambient(depth: number): void {
  if (!voice) return;
  try {
    const { ctx, master } = voice;
    if (!voice.bed) {
      const n = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = buf.getChannelData(0);
      // brown-ish noise: integrate white, so it rumbles rather than hisses
      let last = 0;
      for (let i = 0; i < n; i++) {
        last = (last + (Math.random() * 2 - 1) * 0.02) * 0.998;
        d[i] = last * 3;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(master);
      src.start();
      voice.bed = { gain, filter };
    }
    // NaN survives min/max. A NaN ramp target throws in real Web Audio and
    // the catch below would swallow it -- leaving the bed stuck at the last
    // depth forever, silently. Coerce first.
    const d = Number.isFinite(depth) ? Math.min(Math.max(Math.round(depth), 0), 8) : 0;
    if (d === bedDepth) return;
    bedDepth = d;
    const t = ctx.currentTime;
    // depth 0 (the lab) is silent; surface is bright; deep is a low rumble
    const cutoff = d === 0 ? 200 : 1400 - d * 140;
    const level = d === 0 ? 0 : 0.10 + d * 0.025;
    voice.bed.filter.frequency.linearRampToValueAtTime(cutoff, t + 1.5);
    voice.bed.gain.gain.linearRampToValueAtTime(muted ? 0 : level, t + 1.5);
  } catch { /* silence */ }
}

/** For tests: is there a live context? */
export function audioReady(): boolean { return voice !== null; }

/**
 * Drop the context entirely, so the next `unlockAudio` builds a fresh one.
 *
 * For tests only. The context is a module global -- there is one sound card
 * -- which means one test's stubbed AudioContext outlives it and the next
 * test gets whatever the last one left. That is exactly how "a steady frame
 * creates no nodes" passed alone and failed in the suite: an earlier test
 * left a HOSTILE context whose nodes throw, so `music` caught and did
 * nothing, and "no nodes created" was true for the wrong reason.
 */
export function resetAudioForTests(): void {
  voice = null;
  bedDepth = -1;
}

/**
 * The music. Called once per frame with the current voicing; it builds the
 * drone on first use, retunes it, and schedules a struck note when one is
 * due. Everything is a ramp -- no node is created per note except the brief
 * oscillator that IS the note, which is unavoidable and cheap.
 *
 * Cost per frame with nothing due: four `setTargetAtTime` calls. Per note:
 * one oscillator and one gain, both auto-stopped.
 */
export function music(
  v: MusicVoicing, scale: readonly number[], depth: number,
): void {
  if (!voice || muted) return;
  try {
    const { ctx, master } = voice;
    const t = ctx.currentTime;
    if (!Number.isFinite(v.root) || v.root <= 0) return;

    if (!voice.drone) {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 600;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      filter.connect(gain).connect(master);
      const osc: OscillatorNode[] = [];
      // Three voices on the stratum's chord. They re-voice independently
      // from here; see droneStep.
      const c0 = chordOf(depth);
      for (let i = 0; i < 3; i++) {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = v.root * semi(droneStep(c0, i, 0));
        o.connect(filter);
        o.start(t);
        osc.push(o);
      }
      voice.drone = { osc, gain, filter };
      voice.nextNote = t + 2;
    }
    const d = voice.drone;
    // The arpeggio: each voice walks the chord at its own rate, slowly. The
    // step only advances on its own clock -- the frequencies are ramped
    // toward the current step every frame, so a re-voice is a glide, never a
    // click.
    if (t >= voice.nextArp) {
      voice.arpN++;
      voice.nextArp = t + 2.6 + (Math.abs(Math.sin(voice.arpN * 5.1)) % 1) * 1.6;
    }
    const chord = chordOf(depth);
    d.osc.forEach((o, i) => {
      const cents = i === 1 ? v.detune : i === 2 ? -v.detune * 0.5 : 0;
      const f = v.root * semi(droneStep(chord, i, voice?.arpN ?? 0));
      if (Number.isFinite(f) && f > 20 && f < 4000) {
        // A long time-constant: a voice takes about two seconds to arrive,
        // which is what makes it a swell rather than a note.
        o.frequency.setTargetAtTime(f, t, 1.8);
      }
      o.detune.setTargetAtTime(cents, t, 1.2);
    });
    d.filter.frequency.setTargetAtTime(Math.max(v.cutoff, 80), t, 1.5);
    d.gain.gain.setTargetAtTime(v.level, t, 2);

    // A struck note, when one is due.
    if (t >= voice.nextNote) {
      const n = voice.noteN++;
      const f = v.root * semi(noteAt(scale, n)) * octaveAt(n);
      if (Number.isFinite(f) && f > 20 && f < 8000) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "triangle";
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.07, t + 0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);
        o.connect(g).connect(master);
        o.start(t);
        o.stop(t + 4.6);
      }
      // Jitter the interval so the pulse never becomes a metronome.
      const jitter = 0.7 + (Math.abs(Math.sin(n * 3.7)) % 1) * 0.6;
      voice.nextNote = t + Math.max(v.interval * jitter, 1.5);
    }
  } catch { /* silence */ }
}

/** Stop the music and free its nodes. For leaving a run. */
export function stopMusic(): void {
  if (!voice?.drone) return;
  try {
    const { ctx } = voice;
    const t = ctx.currentTime;
    voice.drone.gain.gain.setTargetAtTime(0, t, 0.4);
    for (const o of voice.drone.osc) o.stop(t + 2);
    voice.drone = null;
  } catch { voice.drone = null; }
}
