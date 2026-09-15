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

export type Cue = "hit" | "hurt" | "kill" | "level" | "cast" | "pickup"
  | "descend" | "die" | "denied";

interface Voice {
  ctx: AudioContext;
  master: GainNode;
  /** The ambient bed: a filtered noise source and its gain, retuned per
   *  stratum rather than rebuilt. */
  bed: { gain: GainNode; filter: BiquadFilterNode } | null;
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
    voice = { ctx, master, bed: null };
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
