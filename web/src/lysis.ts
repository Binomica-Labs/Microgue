// The death sequence.
//
// A cell does not stop; it LYSES. The envelope fails, the contents go into the
// pore water, and what is left is a smear. That is worth showing for a moment
// before the ledger appears, because the run ending is the only moment in the
// game that is genuinely irreversible and it should land as one.
//
// Four beats, all timed from the moment of death:
//
//   0.00  the envelope holds, everything stops, the world goes still
//   0.35  rupture: the sprite bursts, contents spill outward
//   1.10  the column takes it: a wash over the whole screen
//   1.90  the lab, faded in
//
// Pure timing maths so it can be tested without a canvas.

export const LYSIS_MS = 1900;

export type Beat = "still" | "rupture" | "wash" | "done";

export interface Phase {
  readonly beat: Beat;
  /** 0..1 within the whole sequence. */
  readonly t: number;
  /** How far the contents have spilled, 0..1. */
  readonly spill: number;
  /** Screen-wide wash opacity, 0..1. */
  readonly wash: number;
  /** How far the lab has faded in, 0..1. */
  readonly reveal: number;
  /** Camera shake amplitude in tiles. */
  readonly shake: number;
}

const clamp01 = (v: number): number =>
  Number.isFinite(v) ? Math.min(Math.max(v, 0), 1) : 0;

/** Where the sequence is, `ms` after death. */
export function phaseAt(ms: number): Phase {
  const elapsed = Number.isFinite(ms) ? Math.max(ms, 0) : LYSIS_MS;
  const t = clamp01(elapsed / LYSIS_MS);

  if (elapsed >= LYSIS_MS) {
    return { beat: "done", t: 1, spill: 1, wash: 0, reveal: 1, shake: 0 };
  }
  if (elapsed < 350) {
    // Held breath. Nothing moves; that is the point.
    return { beat: "still", t, spill: 0, wash: 0, reveal: 0,
             shake: 0.06 * (elapsed / 350) };
  }
  if (elapsed < 1100) {
    const k = clamp01((elapsed - 350) / 750);
    return { beat: "rupture", t,
             // Fast out, then drift: cytoplasm does not decelerate linearly.
             spill: 1 - (1 - k) ** 3,
             wash: 0, reveal: 0,
             shake: 0.9 * (1 - k) ** 2 };
  }
  const k = clamp01((elapsed - 1100) / (LYSIS_MS - 1100));
  return { beat: "wash", t, spill: 1,
           wash: Math.sin(k * Math.PI) * 0.85,
           // The ledger arrives under the wash, not after it.
           reveal: clamp01((k - 0.45) / 0.55),
           shake: 0 };
}

/** Particles of the burst, as offsets in tiles. Deterministic from a seed. */
export function shards(seed: number, spill: number, n = 18): {
  x: number; y: number; a: number;
}[] {
  // Finiteness is not enough: 1e308 * 12.9898 overflows to Infinity and
  // Math.sin(Infinity) is NaN, so a shard lands at a NaN coordinate and is
  // simply never drawn. Wrapped into a range the trig can hold.
  const s = Number.isFinite(seed) ? seed % 100000 : 0;
  // Guard the spill too, not just the seed: a NaN here produced NaN
  // coordinates, and a shard at a NaN position is simply never drawn.
  const k = Number.isFinite(spill) ? Math.min(Math.max(spill, 0), 1) : 0;
  const out: { x: number; y: number; a: number }[] = [];
  for (let i = 0; i < n; i++) {
    const ang = ((Math.sin(s * 12.9898 + i * 78.233) + 1) / 2) * Math.PI * 2;
    const speed = 0.6 + ((Math.sin(s * 39.3468 + i * 11.135) + 1) / 2) * 1.9;
    const d = k * speed;
    out.push({
      x: Math.cos(ang) * d,
      // A little drift downward: this is sediment, not fireworks.
      y: Math.sin(ang) * d + k * k * 0.5,
      a: Math.max(1 - k * 1.15, 0),
    });
  }
  return out;
}
