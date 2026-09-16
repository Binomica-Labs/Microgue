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
export function noteAt(mode: readonly number[], n: number): number {
  if (mode.length === 0) return 0;
  const h = Math.abs(Math.sin(n * 12.9898) * 43758.5453) % 1;
  // 45% tonic or fifth, 55% anywhere in the mode.
  if (h < 0.28) return mode[0] ?? 0;
  if (h < 0.45) return mode[Math.min(4, mode.length - 1)] ?? 0;
  const i = Math.floor(((h - 0.45) / 0.55) * mode.length);
  return mode[Math.min(i, mode.length - 1)] ?? 0;
}

/** Octave for the struck note: mostly the middle, sometimes an octave up. */
export function octaveAt(n: number): number {
  const h = Math.abs(Math.sin(n * 78.233) * 22578.1459) % 1;
  return h < 0.22 ? 2 : h < 0.75 ? 1 : 0.5;
}
