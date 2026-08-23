// Facing and movement feel. Pure, because the angle-wrap bug -- turning from
// 170 degrees to -170 by going the long way round -- is invisible in review and
// obvious in play.

/** How an organism responds to a heading. Driven by its actual morphology. */
export type Facing =
  | "rotate"   // elongate: rods, filaments, vibrios, spirilla align with motion
  | "flip"     // asymmetric but should not tumble; mirror horizontally only
  | "none";    // radially symmetric, or anchored, so it never turns

export const TAU = Math.PI * 2;

/** Finite or a fallback. A NaN heading never recovers: it feeds turnToward,
 *  which returns NaN, which is stored back as the heading. The body simply
 *  stops being drawn and nothing anywhere reports it. */
const fin = (v: number, fallback = 0): number => (Number.isFinite(v) ? v : fallback);

/** Heading for a step, or null when there is no movement. Screen space, so
 *  0 is east and angles increase clockwise. */
export function headingOf(dx: number, dy: number): number | null {
  const x = fin(dx), y = fin(dy);
  if (x === 0 && y === 0) return null;
  return Math.atan2(y, x);
}

/** Signed shortest angular difference from a to b, in (-PI, PI]. */
export function angleDelta(a: number, b: number): number {
  let d = (fin(b) - fin(a)) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

/** Ease `from` toward `to` by at most `maxStep` radians, the short way. */
export function turnToward(from: number, to: number, maxStep: number): number {
  const step = Math.max(fin(maxStep), 0);
  const d = angleDelta(from, to);
  if (Math.abs(d) <= step) return normalise(to);
  return normalise(fin(from) + Math.sign(d) * step);
}

export function normalise(a: number): number {
  let x = fin(a) % TAU;
  if (x > Math.PI) x -= TAU;
  if (x <= -Math.PI) x += TAU;
  return x;
}

/** Snap to the nearest of eight compass directions. */
export function snap8(a: number): number {
  const step = TAU / 8;
  return normalise(Math.round(fin(a) / step) * step);
}

export interface Squash { sx: number; sy: number; }

/** Squash and stretch along the heading. `v` is progress-normalised speed in
 *  [0,1]; a cell stretches as it launches and settles back to round. */
export function squashFor(v: number, amount = 0.22): Squash {
  // NaN survives min/max, and a NaN scale blanks the sprite silently -- the
  // body simply stops being drawn, with no error anywhere.
  const safe = Number.isFinite(v) ? v : 0;
  const k = Math.min(Math.max(safe, 0), 1) * amount;
  return { sx: 1 + k, sy: 1 - k * 0.8 };
}

/** How far a body is between two tiles, from its drawn and logical positions.
 *  1 at the moment of stepping, easing to 0 as it arrives. */
export function travel(ax: number, ay: number, x: number, y: number): number {
  const d = Math.hypot(x - ax, y - ay);
  return Number.isFinite(d) ? Math.min(d, 1) : 0;
}

/** Wake ghosts trailing a moving body: offsets behind it, with alphas. */
export function wake(
  heading: number | null, v: number, n = 3,
): { dx: number; dy: number; alpha: number }[] {
  if (heading === null || !Number.isFinite(heading)) return [];
  if (!Number.isFinite(v) || v <= 0.05) return [];
  const out: { dx: number; dy: number; alpha: number }[] = [];
  for (let i = 1; i <= n; i++) {
    const back = (i / n) * 0.55 * v;
    out.push({
      dx: -Math.cos(heading) * back,
      dy: -Math.sin(heading) * back,
      alpha: (1 - i / (n + 1)) * 0.32 * v,
    });
  }
  return out;
}
