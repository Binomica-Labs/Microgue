// The boundary between wall and floor, as closed loops.
//
// The walls were drawn PER TILE: each wall square with its corners rounded.
// That is why a diagonal edge came out as a staircase -- every cut was bounded
// by the tile it belonged to, so two neighbouring cuts could never join into
// one line. Cutting corners harder did not help and could not: 54% of boundary
// tiles are outside corners, and each was still a separate bump.
//
// Marching squares works on the LATTICE between tiles instead. Each lattice
// point samples the four tiles around it, and the sixteen possible
// arrangements each emit a fixed set of segments. A diagonal run of tiles
// emits collinear segments that chain into a single straight edge, which is
// exactly the thing per-tile drawing cannot express.
//
// The two saddle cases -- two diagonal walls meeting two diagonal floors --
// are resolved as SEPARATED: each wall corner gets its own cut, so a diagonal
// chain of single tiles draws as a row of diamonds rather than one ridge.
//
// That is not what I first wrote here. The comment claimed the opposite for a
// version, and connecting them turned out to break the chaining outright: the
// boundary of a one-tile-wide diagonal thread passes through each saddle point
// TWICE, once on the way out and once on the way back, and the walk marks a
// point used the first time it sees it. Connected saddles produced zero loops
// on a thread and would have erased it from the screen.
//
// It does not arise in practice -- a generated floor has no diagonal-only
// pinches, measured -- but separated is what the code does and this is what it
// says now. Reconnecting them means a chaining walk that can revisit a vertex,
// which is a real change and not a table edit.

export interface Pt { readonly x: number; readonly y: number }
export type Loop = readonly Pt[];

/** Is this cell solid? Out of bounds counts as solid, so the map is closed. */
export type Solid = (x: number, y: number) => boolean;

/**
 * Segments for one lattice point.
 *
 * The point sits at the shared corner of tiles (x-1,y-1), (x,y-1), (x-1,y) and
 * (x,y). Coordinates are in tile units, with the lattice point at the origin,
 * so a segment from (-0.5, 0) to (0, -0.5) cuts the corner diagonally.
 */
// Hoisted. Building these four objects and a fresh array inside the function
// meant about forty thousand allocations over one floor, which was almost all
// of the 19ms it took.
const W: Pt = { x: -0.5, y: 0 };
const E: Pt = { x: 0.5, y: 0 };
const N: Pt = { x: 0, y: -0.5 };
const S: Pt = { x: 0, y: 0.5 };
const NONE: readonly [Pt, Pt][] = [];

const TABLE: readonly (readonly [Pt, Pt][])[] = [
  NONE,
  [[E, S]],
  [[S, W]],
  [[E, W]],
  [[N, E]],
  [[N, S]],
  [[N, E], [S, W]],
  [[N, W]],
  [[W, N]],
  [[W, N], [E, S]],
  [[S, N]],
  [[E, N]],
  [[W, E]],
  [[W, S]],
  [[S, E]],
  NONE,
];

function segmentsAt(nw: boolean, ne: boolean, sw: boolean, se: boolean):
readonly [Pt, Pt][] {
  return TABLE[(nw ? 8 : 0) | (ne ? 4 : 0) | (sw ? 2 : 0) | (se ? 1 : 0)] ?? NONE;
}

/**
 * A lattice point as one integer.
 *
 * Every coordinate is a whole or half tile, so doubling makes it an integer,
 * and a grid is never wider than a few hundred. String keys with `toFixed`
 * cost 25ms over a 96x96 floor -- almost entirely in formatting -- against
 * about a millisecond this way.
 */
const key = (p: Pt): number =>
  (Math.round(p.y * 2) + 1) * 4096 + Math.round(p.x * 2) + 1;

/**
 * Trace the wall/floor boundary over a rectangle of the grid.
 *
 * Returns closed loops in TILE coordinates. Each is walked in order, so a
 * renderer can smooth it; nothing here knows about pixels or curves.
 */
export function contour(
  solid: Solid, x0: number, y0: number, x1: number, y1: number,
): Loop[] {
  // Every segment, indexed by its endpoints, so loops can be chained.
  const next = new Map<number, Pt[]>();
  const push = (a: Pt, b: Pt): void => {
    const list = next.get(key(a));
    if (list) list.push(b);
    else next.set(key(a), [b]);
  };

  // One row of `solid` lookups is reused as the next row's top edge: the
  // naive form calls `solid` four times per lattice point, so every tile is
  // sampled four times over.
  let above = new Uint8Array(x1 - x0 + 3);
  let below = new Uint8Array(x1 - x0 + 3);
  for (let x = x0 - 1; x <= x1 + 1; x++) {
    above[x - x0 + 1] = solid(x, y0 - 1) ? 1 : 0;
  }
  for (let y = y0; y <= y1 + 1; y++) {
    for (let x = x0 - 1; x <= x1 + 1; x++) {
      below[x - x0 + 1] = solid(x, y) ? 1 : 0;
    }
    for (let x = x0; x <= x1 + 1; x++) {
      const i = x - x0 + 1;
      const segs = segmentsAt(above[i - 1] === 1, above[i] === 1,
                              below[i - 1] === 1, below[i] === 1);
      for (const [a, b] of segs) {
        push({ x: x + a.x, y: y + a.y }, { x: x + b.x, y: y + b.y });
      }
    }
    const swap = above; above = below; below = swap;
  }

  const loops: Loop[] = [];
  const used = new Set<number>();
  for (const [start] of next) {
    if (used.has(start)) continue;
    const loop: Pt[] = [];
    let here = start;
    // Bounded: a malformed table could otherwise walk for ever, and a hang is
    // a far worse failure than a missing wall.
    for (let step = 0; step < 20000; step++) {
      if (used.has(here)) break;
      used.add(here);
      const outs = next.get(here);
      const to = outs?.[0];
      if (!to) break;
      loop.push(to);
      here = key(to);
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}
