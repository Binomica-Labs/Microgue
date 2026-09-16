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
 * The drone's two fixed voices: root and fifth, an octave down.
 *
 * They NEVER change pitch. The previous version swept all three voices
 * between chord tones with a ~2s glide, which is precisely how a siren
 * works -- it sounded like an ambulance, because it was one. A drone that
 * slides is not a drone.
 *
 * Movement comes from `swellAt` instead: a separate voice that FADES a chord
 * tone in and out at a fixed pitch. A note that appears and disappears is
 * musical; a note that slides between pitches is a portamento, and two of
 * them at once is an emergency vehicle.
 */
export const DRONE_VOICES: readonly number[] = [-12, -5];   // root, fifth below

/**
 * The swell voice: which chord tone is sounding at step `n`, and how loud.
 *
 * It holds a tone for a few steps, fades out, and comes back on a different
 * one -- so the harmony moves without anything gliding. The gain envelope is
 * a raised cosine, which has no corners and so no click.
 *
 * Returns the semitone offset and a 0..1 level.
 */
export function swellAt(
  chord: readonly number[], n: number,
): { semitone: number; level: number } {
  if (chord.length === 0) return { semitone: 0, level: 0 };
  const k = Number.isFinite(n) ? n : 0;
  // One swell every 8 steps, of which it sounds for about 5.
  const period = 8;
  const phase = ((k % period) + period) % period;
  const which = Math.floor(k / period);
  // Pick from the chord's upper tones -- never the root, which the drone
  // already holds. Third, fifth, seventh.
  const upper = chord.slice(1);
  const semitone = (upper[((which % upper.length) + upper.length) % upper.length] ?? 7);
  // Raised cosine over the first 5 of 8 steps, silent for the rest.
  const level = phase < 5 ? (1 - Math.cos((phase / 5) * Math.PI * 2)) / 2 : 0;
  return { semitone, level };
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
 * A walk sounds like a line; independent picks sound like a scale exercise.
 *
 * STATEFUL by design. An earlier version replayed the walk from step 0 on
 * every call so it could stay pure -- which made it O(n) in the step number
 * and 135 us per call by step 5000, climbing without bound for as long as
 * the session lasted. A walk is a walk: it has a position. `melodyStep`
 * advances it one step and returns the note.
 *
 * `toward` is the semitone the swell is holding; the line drifts to the
 * nearest scale degree to it. That is the relationship between the two
 * layers -- the melody hears the chord. Not always, though: a line that only
 * approaches the harmony is an arpeggio, and pulling away and resolving back
 * is the point.
 */
export interface Walk { i: number; n: number }

export function newWalk(): Walk { return { i: 0, n: 0 }; }

export function melodyStep(
  w: Walk, scale: readonly number[], toward?: number,
): number {
  if (scale.length === 0) return 0;
  let target = -1;
  if (toward !== undefined && Number.isFinite(toward)) {
    let best = Infinity;
    scale.forEach((v, idx) => {
      const gap = Math.min(Math.abs(v - toward), Math.abs(v - toward + 12),
                           Math.abs(v - toward - 12));
      if (gap < best) { best = gap; target = idx; }
    });
  }
  const s = w.n++;
  const h = Math.abs(Math.sin(s * 12.9898) * 43758.5453) % 1;
  let i = Number.isFinite(w.i) ? w.i : 0;
  if (target >= 0 && h < 0.62 && i !== target) {
    i += i < target ? 1 : -1;
  } else if (h < 0.55) i += 1;
  else if (h < 0.88) i -= 1;
  else i += h < 0.94 ? 2 : -2;
  // Reflect at the ends rather than wrapping: a wrap is an octave jump every
  // time the line tops out, which is a tell.
  if (i < 0) i = -i;
  if (i >= scale.length) i = scale.length - 1 - (i - scale.length + 1);
  if (i < 0) i = 0;
  w.i = Math.min(Math.max(i, 0), scale.length - 1);
  return scale[w.i] ?? 0;
}

/**
 * The pure form, for tests and anything needing a note at an arbitrary step
 * without carrying state. O(n) in `n`, so it is CAPPED: a walk is ergodic --
 * after a few hundred steps its position says nothing about the step number
 * -- and replaying a billion steps to learn that is a hang, not an answer.
 * The engine uses `melodyStep`, which is O(1); this exists for callers that
 * have no walk to carry.
 */
const REPLAY_CAP = 512;

export function noteAt(
  scale: readonly number[], n: number, toward?: number,
): number {
  const w = newWalk();
  const raw = Number.isFinite(n) ? Math.max(Math.floor(n), 0) : 0;
  const k = Math.min(raw, REPLAY_CAP);
  let v = scale[0] ?? 0;
  for (let s = 0; s <= k; s++) v = melodyStep(w, scale, toward);
  return v;
}


/**
 * Whether a note should sound at all on step `n`.
 *
 * A melody that plays on every beat is a sequence; one that RESTS is a
 * phrase. This gives the line a shape: bursts of three to five notes with
 * silence between, the length of each phrase varying so the pattern never
 * settles. The rests are also where the drone gets to be heard alone, which
 * is what makes the two layers feel like one piece rather than two.
 *
 * `density` 0..1 raises the note count under threat -- the line gets busier
 * when something is hunting you, and sparse again when it is not.
 */
export function sounds(n: number, density: number): boolean {
  const k = Number.isFinite(n) ? Math.floor(n) : 0;
  const d = Math.min(Math.max(Number.isFinite(density) ? density : 0.5, 0), 1);
  // Phrases of 3-5 notes, then a rest of 2-4. The cycle length itself varies
  // with the phrase index, so the pattern does not repeat on a fixed period.
  const phrase = 3 + (Math.abs(Math.floor(Math.sin(Math.floor(k / 9) * 7.3) * 3)) % 3);
  const cycle = phrase + 2 + (Math.abs(Math.floor(Math.sin(Math.floor(k / 9) * 2.1) * 3)) % 3);
  const at = ((k % cycle) + cycle) % cycle;
  // Under pressure the rests shorten: at density 1 almost everything sounds.
  return at < phrase + Math.round(d * (cycle - phrase));
}

/**
 * The octave a phrase sits in, drifting slowly so successive phrases are not
 * all in the same register. Returns a multiplier.
 */
export function phraseOctave(n: number): number {
  const k = Number.isFinite(n) ? Math.floor(n / 9) : 0;
  const h = Math.abs(Math.sin(k * 41.7) * 9371.3) % 1;
  return h < 0.18 ? 2 : h < 0.78 ? 1 : 0.5;
}
