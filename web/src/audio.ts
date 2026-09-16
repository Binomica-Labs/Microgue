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

import { chordOf, DRONE_VOICES, harmonyAt, melodyStep, newWalk, phraseOctave,
  rhythmAt, semi, sounds, swellAt, type MusicVoicing, type Walk } from "./music.js";

export type Cue = "hit" | "hurt" | "kill" | "level" | "cast" | "pickup"
  | "descend" | "die" | "denied";

interface Drone {
  /** Two fixed bass sines plus one swell voice. Created once; the bass
   *  never changes pitch, which is what stops it sounding like a siren. */
  osc: OscillatorNode[];
  /** Per-voice gain, so the swell fades without touching the drone. */
  gains: GainNode[];
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
  /** The melody's position. Stateful: see melodyStep. */
  walk: Walk;
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
              nextArp: 0, arpN: 0, walk: newWalk() };
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

/**
 * One struck note: an oscillator and an envelope, auto-stopped.
 *
 * Shared by the melody and its harmony voice so both have identical shape --
 * and so there is exactly ONE place that decides a note's attack and decay.
 * A frequency outside the audible band plays nothing rather than a click.
 */
function strike(
  ctx: AudioContext, out: GainNode, f: number, at: number, dur: number,
  peak: number,
): void {
  if (!Number.isFinite(f) || f <= 20 || f >= 8000) return;
  if (!Number.isFinite(dur) || dur <= 0.05) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "triangle";
  o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + 0.04);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + dur + 0.05);
}

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
      const gains: GainNode[] = [];
      // Two FIXED bass voices -- root and fifth, an octave down -- and one
      // swell voice above them. The bass never changes pitch; see
      // DRONE_VOICES. Each voice gets its own gain so the swell can fade
      // without touching the drone.
      for (const off of DRONE_VOICES) {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = v.root * semi(off);
        const vg = ctx.createGain();
        vg.gain.value = 1;
        o.connect(vg).connect(filter);
        o.start(t);
        osc.push(o);
        gains.push(vg);
      }
      const sw = ctx.createOscillator();
      sw.type = "sine";
      sw.frequency.value = v.root;
      const swg = ctx.createGain();
      swg.gain.value = 0;
      sw.connect(swg).connect(filter);
      sw.start(t);
      osc.push(sw);
      gains.push(swg);
      voice.drone = { osc, gains, gain, filter };
      voice.nextNote = t + 2;
    }
    const d = voice.drone;
    // The bass HOLDS. It only moves when the stratum's root moves, and then
    // slowly, because that is a real harmonic change and not a sweep.
    const chord = chordOf(depth);
    DRONE_VOICES.forEach((off, i) => {
      const o = d.osc[i];
      if (!o) return;
      const f = v.root * semi(off);
      if (Number.isFinite(f) && f > 20 && f < 4000) o.frequency.setTargetAtTime(f, t, 3);
      // Only the fifth is detuned, and gently: the beating between a pure
      // root and a slightly-off fifth is the whole texture.
      o.detune.setTargetAtTime(i === 1 ? v.detune : 0, t, 1.2);
    });

    // The swell: a chord tone fading in and out at a FIXED pitch. Its step
    // advances on a slow clock; within a step the level is ramped, and the
    // pitch is only set while it is silent, so it never glides.
    if (t >= voice.nextArp) {
      voice.arpN++;
      voice.nextArp = t + 2.2;
    }
    const sw = swellAt(chord, voice.arpN);
    const swOsc = d.osc[2], swGain = d.gains[2];
    if (swOsc && swGain) {
      const f = v.root * semi(sw.semitone);
      // Retune ONLY while inaudible: a pitch change under a live gain is a
      // portamento, which is exactly what made this sound like an ambulance.
      if (sw.level < 0.02 && Number.isFinite(f) && f > 20 && f < 4000) {
        swOsc.frequency.setValueAtTime(f, t);
      }
      swGain.gain.setTargetAtTime(sw.level * 0.55, t, 0.8);
    }
    d.filter.frequency.setTargetAtTime(Math.max(v.cutoff, 80), t, 1.5);
    d.gain.gain.setTargetAtTime(v.level, t, 2);

    // A struck note, when one is due -- and when the phrase is sounding
    // rather than resting. The melody is pulled toward whatever chord tone
    // the swell is holding, so the two layers are one piece; see noteAt.
    if (t >= voice.nextNote) {
      const n = voice.noteN++;
      const density = Math.min(Math.max(1 - (v.interval - 3.5) / 7.5, 0), 1);
      // The walk advances every step, sounding or resting, so a rest is a
      // silence in a continuing line rather than a pause that freezes it.
      const note = melodyStep(voice.walk, scale,
                              sw.level > 0.15 ? sw.semitone : undefined);
      const oct = phraseOctave(n);
      const f = sounds(n, density) ? v.root * semi(note) * oct : 0;
      // The note's own length sets its decay, so a quick note is short and a
      // phrase-ending one rings. A fixed 4.5s tail on every note smears the
      // line into a chord, which is what a slow pulse was hiding.
      const beat = rhythmAt(n);
      strike(ctx, master, f, t, Math.min(beat * v.interval * 0.9, 5), 0.07);
      // A second voice a sixth up, only when the strain is thriving. Quieter
      // and shorter, so it reads as a shimmer on the line rather than a
      // second melody.
      const h = harmonyAt(scale, note, v.wellbeing, n);
      if (h !== null && f > 0) {
        strike(ctx, master, v.root * semi(h) * oct, t + 0.06,
               Math.min(beat * v.interval * 0.6, 3.5), 0.03);
      }
      // Jitter, so the pulse is never a metronome even at a fixed rhythm.
      const jitter = 0.86 + (Math.abs(Math.sin(n * 3.7)) % 1) * 0.28;
      voice.nextNote = t + Math.max(v.interval * beat * jitter, 0.9);
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
