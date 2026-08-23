// Cave generation. Engine-free: the RNG is injected, so the same seed produces
// the same column everywhere, and the whole module is unit-testable.
//
// The grid is a class over a flat Uint8Array rather than Tile[][]. That is a
// type-safety decision, not a performance one: `get` is TOTAL -- out of bounds
// returns WALL, because the world genuinely is solid outside the map -- so it
// returns `Tile` and never `Tile | undefined`. That removed 20 non-null
// assertions from this file alone.

import type { Rng } from "./rng.js";

export const WALL = 1;
export const FLOOR = 0;
export type Tile = typeof WALL | typeof FLOOR;

export interface Point {
  readonly x: number;
  readonly y: number;
}

export class Grid {
  readonly w: number;
  readonly h: number;
  private readonly cells: Uint8Array;

  constructor(w: number, h: number, fill: Tile = WALL) {
    this.w = Math.max(Math.floor(w), 1);
    this.h = Math.max(Math.floor(h), 1);
    this.cells = new Uint8Array(this.w * this.h);
    if (fill === WALL) this.cells.fill(WALL);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  /** Total: anything outside the map reads as solid. */
  get(x: number, y: number): Tile {
    if (!this.inBounds(x, y)) return WALL;
    return this.cells[y * this.w + x] === FLOOR ? FLOOR : WALL;
  }

  set(x: number, y: number, t: Tile): void {
    if (this.inBounds(x, y)) this.cells[y * this.w + x] = t;
  }

  isFloor(x: number, y: number): boolean { return this.get(x, y) === FLOOR; }
  isWall(x: number, y: number): boolean { return this.get(x, y) === WALL; }

  countFloor(): number {
    let n = 0;
    for (const c of this.cells) if (c === FLOOR) n++;
    return n;
  }

  clone(): Grid {
    const g = new Grid(this.w, this.h);
    g.cells.set(this.cells);
    return g;
  }

  equals(other: Grid): boolean {
    if (other.w !== this.w || other.h !== this.h) return false;
    return this.cells.every((c, i) => c === other.cells[i]);
  }

  /** Row-major copy. For tests and debugging only. */
  rows(): Tile[][] {
    return Array.from({ length: this.h }, (_unusedRow, y) =>
      Array.from({ length: this.w }, (_unusedCell, x) => this.get(x, y)),
    );
  }

  static from(rows: readonly (readonly number[])[]): Grid {
    const h = rows.length;
    const w = rows[0]?.length ?? 0;
    const g = new Grid(w, h);
    for (let y = 0; y < h; y++) {
      const row = rows[y];
      if (!row) continue;
      for (let x = 0; x < w; x++) g.set(x, y, row[x] === FLOOR ? FLOOR : WALL);
    }
    return g;
  }
}

/** Cellular-automata cavern (the classic 4-5 rule). Organic chambers rather
 *  than rectangular rooms -- reads as biofilm. */
/**
 * Mask everything outside a disc to wall.
 *
 * The column is a graduated cylinder, so a level is a cross-section of one:
 * round, with the rim solid glass. A rectangular cave never looked like the
 * thing the game is set inside.
 */
export function maskToColumn(g: Grid, inset = 2): Grid {
  const cx = (g.w - 1) / 2, cy = (g.h - 1) / 2;
  const r = Math.min(cx, cy) - inset;
  const r2 = r * r;
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy > r2) g.set(x, y, WALL);
    }
  }
  return g;
}

/** Radius of the usable disc, for placing things against the glass. */
export function columnRadius(g: Grid, inset = 2): number {
  return Math.min((g.w - 1) / 2, (g.h - 1) / 2) - inset;
}

export function generate(
  w: number,
  h: number,
  rng: Rng,
  opts: { readonly density?: number; readonly passes?: number } = {},
): Grid {
  const width = Math.max(Math.floor(w), 3);
  const height = Math.max(Math.floor(h), 3);
  const density = Math.min(Math.max(opts.density ?? 0.45, 0), 1);
  const passes = Math.min(Math.max(Math.floor(opts.passes ?? 5), 0), 32);

  let g = new Grid(width, height);
  const edge = (x: number, y: number): boolean =>
    x === 0 || y === 0 || x === width - 1 || y === height - 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      g.set(x, y, edge(x, y) || rng.next() < density ? WALL : FLOOR);
    }
  }

  for (let pass = 0; pass < passes; pass++) {
    const next = new Grid(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (edge(x, y)) { next.set(x, y, WALL); continue; }
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if ((dx !== 0 || dy !== 0) && g.isWall(x + dx, y + dy)) n++;
          }
        }
        const threshold = g.isWall(x, y) ? 4 : 5;
        next.set(x, y, n >= threshold ? WALL : FLOOR);
      }
    }
    g = next;
  }
  return g;
}

/** Keep only the largest connected open region and seal the rest, so the
 *  pathfinder can never be handed an unreachable destination. */
export function keepLargestRegion(g: Grid): { seed: Point | null; cells: number } {
  const label = new Int32Array(g.w * g.h);
  const stack: number[] = [];
  let id = 0;
  let bestId = 0;
  let bestN = 0;
  let bestSeed: Point | null = null;

  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      if (g.isWall(x, y) || label[y * g.w + x] !== 0) continue;
      id++;
      let n = 0;
      stack.push(x, y);
      label[y * g.w + x] = id;
      for (;;) {
        const cy = stack.pop();
        const cx = stack.pop();
        if (cx === undefined || cy === undefined) break;
        n++;
        const nbrs: readonly [number, number][] =
          [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
        for (const [nx, ny] of nbrs) {
          if (g.isFloor(nx, ny) && label[ny * g.w + nx] === 0) {
            label[ny * g.w + nx] = id;
            stack.push(nx, ny);
          }
        }
      }
      if (n > bestN) { bestId = id; bestN = n; bestSeed = { x, y }; }
    }
  }
  if (bestId === 0) return { seed: null, cells: 0 };

  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      if (g.isFloor(x, y) && label[y * g.w + x] !== bestId) g.set(x, y, WALL);
    }
  }
  return { seed: bestSeed, cells: bestN };
}

/** Nearest walkable tile to a preference, single linear pass. */
export function findSpawn(g: Grid, px: number, py: number): Point | null {
  let best: Point | null = null;
  let bd = Infinity;
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      if (g.isWall(x, y)) continue;
      const d = (x - px) ** 2 + (y - py) ** 2;
      if (d < bd) { bd = d; best = { x, y }; }
    }
  }
  return best;
}

/** Farthest walkable tile from a point -- places the down-stairs so a level
 *  cannot be crossed in three steps. */
export function farthestFrom(g: Grid, from: Point): Point {
  let best: Point = from;
  let bd = -1;
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      if (g.isWall(x, y)) continue;
      const d = (x - from.x) ** 2 + (y - from.y) ** 2;
      if (d > bd) { bd = d; best = { x, y }; }
    }
  }
  return best;
}

/** Last resort: a map with no open tiles is unplayable, so open a chamber. */
export function carveSpawn(g: Grid, radius = 3): Point {
  const cx = Math.floor(g.w / 2);
  const cy = Math.floor(g.h / 2);
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) g.set(x, y, FLOOR);
  }
  return { x: cx, y: cy };
}
