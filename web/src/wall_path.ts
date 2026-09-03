// The wall silhouette, built from a contour rather than from tiles.
//
// `traceWalls` drew each wall SQUARE with its corners rounded, which is why a
// diagonal edge came out as a staircase: every cut was bounded by the tile it
// belonged to, so two neighbouring cuts could never join into one line. 54% of
// boundary tiles are outside corners, and each was a separate bump.
//
// `contour.ts` gives closed loops that already run diagonally where the wall
// does. This turns those into a smooth path.
//
// The smoothing is quadratic curves through EDGE MIDPOINTS, with each loop
// vertex as the control point. That has the property this needs: three
// collinear points produce a straight line, because the control point lies on
// it -- so a long wall stays flat and a 45-degree run stays a clean 45, while
// every corner rounds by half its adjacent edges. No corner cases, no radius
// clamping, and nothing to tune per shape.

import { contour, type Loop, type Solid } from "./contour.js";

export interface PathTarget {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  closePath(): void;
}

const mid = (a: { x: number; y: number }, b: { x: number; y: number }):
{ x: number; y: number } => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * Nudge a vertex outward from the loop's own centre.
 *
 * A pure marching-squares contour cuts exactly through tile midpoints, which
 * makes the wall read as slightly THINNER than the tiles it represents and
 * leaves a hairline where it meets the floor. A fraction of a tile outward
 * fixes both, and varying it per vertex keeps the layers from all weathering
 * alike -- the same reason `traceWalls` varied its radius.
 */
function bulge(
  p: { x: number; y: number }, cx: number, cy: number, amount: number,
): { x: number; y: number } {
  if (amount === 0) return p;
  const dx = p.x - cx, dy = p.y - cy;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return p;
  return { x: p.x + (dx / len) * amount, y: p.y + (dy / len) * amount };
}

/** Deterministic per-vertex jitter, so the silhouette never shimmers. */
function hash(a: number, b: number, seed: number): number {
  let h = Math.imul(Math.round(a * 4) * 374761393 + Math.round(b * 4) * 668265263
    + seed, 1274126177);
  h = (h ^ (h >>> 15)) >>> 0;
  return h / 4294967296;
}

/** Add one smoothed loop to the path. */
export function addLoop(
  path: PathTarget, loop: Loop, seed: number, spread: number, grow: number,
): void {
  const n = loop.length;
  if (n < 3) return;

  let cx = 0, cy = 0;
  for (const p of loop) { cx += p.x; cy += p.y; }
  cx /= n; cy /= n;

  const pt = (i: number): { x: number; y: number } => {
    const p = loop[((i % n) + n) % n];
    if (!p) return { x: cx, y: cy };
    const amount = grow + (hash(p.x, p.y, seed) - 0.5) * spread;
    return bulge(p, cx, cy, amount);
  };

  const first = mid(pt(n - 1), pt(0));
  path.moveTo(first.x, first.y);
  for (let i = 0; i < n; i++) {
    const v = pt(i);
    const to = mid(v, pt(i + 1));
    path.quadraticCurveTo(v.x, v.y, to.x, to.y);
  }
  path.closePath();
}

/**
 * The whole wall silhouette for a window of the grid.
 *
 * `grow` and `spread` are zero in high contrast, where the point is a hard
 * legible edge rather than an organic one.
 */
export function traceContour(
  path: PathTarget, solid: Solid,
  x0: number, y0: number, x1: number, y1: number,
  seed: number, spread: number, grow: number,
): number {
  const loops = contour(solid, x0, y0, x1, y1);
  for (const l of loops) addLoop(path, l, seed, spread, grow);
  return loops.length;
}

// ------------------------------------------------------------------ cache
//
// The contour costs about 3.6ms over a whole floor -- fine once, impossible
// sixty times a second. It only changes when the GRID changes, which is when
// a barrier is dissolved, so it is cached per floor and rebuilt on demand.
//
// Whole-floor rather than per-window: the window moves every frame and a
// window-keyed cache would miss constantly, while one Path2D of about a
// thousand points fills as fast as any other.

interface Cached { path: Path2D; floor: number; seed: number; hc: boolean }
let cache: Cached | null = null;

/**
 * The silhouette for a floor.
 *
 * Keyed on floor and seed alone, because the GRID IS IMMUTABLE once generated
 * -- it is written during `carve` and never again. Barriers are a separate
 * list and dissolving one does not touch a tile.
 *
 * The first version keyed on a count of solid tiles, which meant scanning
 * 9216 tiles every frame to discover, always, that nothing had changed. That
 * is exactly the mistake the minimap's `seenCount` made, and making it twice
 * in one project is what this comment is for.
 */
export function wallSilhouette(
  solid: Solid, w: number, h: number,
  floor: number, seed: number, spread: number, grow: number,
  hc: boolean,
  make: () => Path2D | null,
): Path2D | null {
  if (cache?.floor === floor && cache.seed === seed && cache.hc === hc) {
    return cache.path;
  }
  const path = make();
  if (!path) return null;
  traceContour(path, solid, 0, 0, w - 1, h - 1, seed, spread, grow);
  cache = { path, floor, seed, hc };
  return path;
}

/** Forget the cached silhouette. For tests, and for a floor regenerated in
 *  place. */
export function forgetSilhouette(): void {
  cache = null;
}

