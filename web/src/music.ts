// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// Generative music: the column, as a mode ladder.
//
// A recorded loop is torture across a long run and there is no asset
// pipeline anyway, so the music is SYNTHESISED and never repeats exactly.
// The structure mirrors the chemistry: eight strata, eight modes, walking one
// step darker per stratum. Descending sounds like descending.
//
//   D1 Lydian      the oxic surface: a raised fourth, open and bright
//   D2 Ionian      still major, the brightness gone out of it
//   D3 Mixolydian  a flattened seventh; the first shadow
//   D4 Dorian      minor, but with a hopeful sixth
//   D5 Aeolian     plain minor
//   D6 Phrygian    a flattened second: the characteristic dread interval
//   D7 Locrian     a diminished fifth; no stable tonic left
//   D8 whole-tone  no tonic at all. Nothing resolves down here.
//
// Three layers, no percussion -- the game is turn-based and has no clock to
// keep:
//   drone    two or three detuned sines on the root. The slow beating
//            between them is what makes a drone feel alive.
//   voice    a struck tone every few seconds, from the mode, long decay.
//            Sparse; the silence is most of the effect.
//   (the ambient noise bed in audio.ts is the third, already there)
//
// It REACTS, which a recorded loop cannot: density rises with threat, the
// drone detunes as hp falls, the filter opens in daylight.

/** Semitone offsets from the root, per stratum. Index 0 is the lab. */
export const MODES: readonly (readonly number[])[] = [
  [0, 7],                          // lab: a bare fifth, almost nothing
  [0, 2, 4, 6, 7, 9, 11],          // D1 Lydian
  [0, 2, 4, 5, 7, 9, 11],          // D2 Ionian
  [0, 2, 4, 5, 7, 9, 10],          // D3 Mixolydian
  [0, 2, 3, 5, 7, 9, 10],          // D4 Dorian
  [0, 2, 3, 5, 7, 8, 10],          // D5 Aeolian
  [0, 1, 3, 5, 7, 8, 10],          // D6 Phrygian
  [0, 1, 3, 5, 6, 8, 10],          // D7 Locrian
  [0, 2, 4, 6, 8, 10],             // D8 whole-tone: nothing resolves
];

/** Root frequency per stratum: the column sinks about a fifth over its
 *  depth, so the deep is physically lower as well as darker. */
export function rootOf(depth: number): number {
  const d = Number.isFinite(depth) ? Math.min(Math.max(Math.round(depth), 0), 8) : 0;
  // A3 at the surface down to a bit below D3 at the bottom.
  return 220 * Math.pow(2, -d / 14);
}

export function modeOf(depth: number): readonly number[] {
  const d = Number.isFinite(depth) ? Math.min(Math.max(Math.round(depth), 0), 8) : 0;
  return MODES[d] ?? MODES[0] ?? [0, 7];
}

/** A semitone offset to a frequency ratio. */
export const semi = (n: number): number => Math.pow(2, n / 12);

/**
 * The chord the drone arpeggiates, per stratum: semitone offsets from the
 * root. Built from the mode's own degrees, so the harmony is the stratum's
 * -- a Phrygian floor gets its flat second, a whole-tone floor gets an
 * unresolvable stack.
 *
 * Root, third, fifth, seventh where the mode has them; the deep modes end up
 * with the sour intervals that make them sound like the deep.
 */
export function chordOf(depth: number): readonly number[] {
  const mode = modeOf(depth);
  if (mode.length <= 2) return [0, 7];                  // the lab: a bare fifth
  const at = (i: number): number => mode[Math.min(i, mode.length - 1)] ?? 0;
  // scale degrees 1, 3, 5, 7 -- indices 0, 2, 4, 6
  return [at(0), at(2), at(4), at(6)];
}

/**
 * Where drone voice `v` sits at step `n` of the arpeggio.
 *
 * Each voice walks the chord at its OWN rate and offset, so the three of
 * them re-voice against each other endlessly without ever restarting. That
 * is the difference between a drone that breathes and a held chord that
 * wears out: nothing is static, but nothing is fast enough to be a melody
 * either.
 *
 * Voice 0 is the bass and moves least -- an arpeggio whose bottom wanders is
 * a chord progression, which is more music than this wants to be.
 */
export function droneStep(chord: readonly number[], v: number, n: number): number {
  if (chord.length === 0) return 0;
  const k = Number.isFinite(n) ? Math.floor(n) : 0;
  // Rates chosen coprime-ish so the pattern takes a long time to repeat:
  // voice 0 every 4 steps, voice 1 every 3, voice 2 every 5.
  const rate = [4, 3, 5][v % 3] ?? 4;
  const idx = Math.floor(k / rate) + v * 2;
  // The bass stays low; the upper voices may take the octave.
  const pick = chord[((idx % chord.length) + chord.length) % chord.length] ?? 0;
  if (v === 0) return chord[0] ?? 0;                    // bass holds the root
  return pick + (v === 2 && (idx % 3 === 0) ? 12 : 0);
}

/**
 * How the music should sound right now, from the game state. Pure, so it is
 * testable without any audio at all -- which is the only way to test music.
 */
export interface MusicState {
  /** 0..8 */
  readonly depth: number;
  /** 0..1; how much hostile attention is on the player. */
  readonly threat: number;
  /** 0..1 */
  readonly health: number;
  /** 0..1 daylight. */
  readonly light: number;
}

export interface MusicVoicing {
  /** Root, Hz. */
  root: number;
  /** Seconds between struck notes. Falls as threat rises. */
  interval: number;
  /** Detune of the drone's upper voices, in cents. Rises as health falls. */
  detune: number;
  /** Lowpass cutoff, Hz. Opens in daylight. */
  cutoff: number;
  /** Drone level, 0..1. */
  level: number;
}

export function voicing(s: MusicState): MusicVoicing {
  const num = (v: number, d: number): number => (Number.isFinite(v) ? v : d);
  const depth = Math.min(Math.max(Math.round(num(s.depth, 1)), 0), 8);
  const threat = Math.min(Math.max(num(s.threat, 0), 0), 1);
  const health = Math.min(Math.max(num(s.health, 1), 0), 1);
  const light = Math.min(Math.max(num(s.light, 1), 0), 1);

  return {
    root: rootOf(depth),
    // 11s when nothing is happening, down to ~3.5s with something on you.
    interval: 11 - threat * 7.5,
    // 4 cents at full health -- a slow beat -- widening to 28, which sours.
    detune: 4 + (1 - health) * 24,
    // Daylight opens the filter; the deep closes it regardless.
    cutoff: (300 + light * 900) * (1 - depth / 12),
    // The lab is nearly silent; the column settles at a steady level.
    level: depth === 0 ? 0.02 : 0.05 + Math.min(depth, 6) * 0.005,
  };
}

/**
 * Pick the next note's semitone offset. Deterministic in `n` so a given run
 * plays the same phrase -- and so the whole thing is testable.
 *
 * Weighted toward the tonic and fifth, which is what keeps a random walk
 * through a mode sounding like music rather than like a scale exercise.
 */
/**
 * The melodic scale: the mode's own major-pentatonic subset.
 *
 * A pentatonic has no semitone steps, so ANY two notes in it sound
 * consonant together and a random walk through it cannot produce a wrong
 * note. That is exactly what a procedural melody needs -- the walk can be
 * dumb because the scale is doing the work. Taken from the mode's degrees
 * 1-2-3-5-6, so a Phrygian floor's pentatonic is still Phrygian-coloured.
 */
export function pentatonicOf(depth: number): readonly number[] {
  const mode = modeOf(depth);
  if (mode.length <= 2) return mode;
  const at = (i: number): number => mode[Math.min(i, mode.length - 1)] ?? 0;
  // Degrees 1-2-3-5-6, then any that sit a semitone above their neighbour
  // are RAISED to the next scale degree rather than dropped. Dropping left
  // the darker modes with three notes -- Aeolian and Phrygian collapsed,
  // and a three-note melody is a bugle call. Raising keeps five notes and
  // keeps the no-semitone property, which is the whole point: any two notes
  // in the result are consonant, so the walk cannot play a wrong note.
  const wanted = [at(0), at(1), at(2), at(4), at(5)];
  const out: number[] = [];
  for (const n of wanted) {
    const prev = out[out.length - 1];
    if (prev === undefined) { out.push(n); continue; }
    if (n - prev >= 2) { out.push(n); continue; }
    // too close: take the next mode degree that is far enough
    const lift = mode.find((x) => x - prev >= 2 && !out.includes(x));
    if (lift !== undefined) out.push(lift);
  }
  return out.length >= 4 ? out : [at(0), at(2), at(4), at(4) + 3];
}

/**
 * The melody: a random WALK, not a random pick. Steps to a neighbour in the
 * scale most of the time, leaps occasionally, and turns around at the ends.
 * A walk sounds like a line; independent picks sound like a scale exercise,
 * which is what this used to be.
 */
export function noteAt(scale: readonly number[], n: number): number {
  if (scale.length === 0) return 0;
  const k = Number.isFinite(n) ? Math.floor(n) : 0;
  // Walk deterministically from a fixed start, so a given run plays the
  // same line and the whole thing stays testable.
  let i = 0;
  for (let s = 0; s <= k; s++) {
    const h = Math.abs(Math.sin(s * 12.9898) * 43758.5453) % 1;
    if (h < 0.42) i += 1;
    else if (h < 0.84) i -= 1;
    else i += h < 0.92 ? 2 : -2;              // an occasional leap
    // Reflect at the ends rather than wrapping: a wrap is an octave jump
    // every time the line reaches the top, which is a tell.
    if (i < 0) i = -i;
    if (i >= scale.length) i = scale.length - 1 - (i - scale.length + 1);
    if (i < 0) i = 0;
  }
  return scale[Math.min(Math.max(i, 0), scale.length - 1)] ?? 0;
}

/** Octave for the struck note: mostly the middle, sometimes an octave up. */
export function octaveAt(n: number): number {
  const h = Math.abs(Math.sin(n * 78.233) * 22578.1459) % 1;
  return h < 0.22 ? 2 : h < 0.75 ? 1 : 0.5;
}
