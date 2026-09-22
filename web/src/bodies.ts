// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// A tile -> body-count index, so "is anything standing here?" is one array
// read instead of a scan of every mob on the floor.
//
// The scan was the whole cost of a mob turn. Every candidate step a mob
// considers asks the question once per tile of its footprint, and each ask
// walked the mob list: O(mobs^2) per turn at best, and the agenda and pursuit
// paths ask several times per step. 250 mobs cost 8.8 ms a turn -- a dropped
// frame on every keypress, from a predicate.
//
// COUNTS, not owners: two bodies can overlap (an invariant forbids it, and
// the index must not hide the violation by overwriting), and a caller that
// wants "anyone but me" subtracts its own coverage rather than the index
// tracking identity.
//
// Tiles outside the grid are not stored. Callers answer those with the slow
// scan, so the index is exact everywhere and not merely on the map.

import { tilesOf, type Footprint } from "./footprint.js";

export class BodyIndex {
  readonly w: number;
  readonly h: number;
  private readonly n: Uint16Array;

  constructor(w: number, h: number) {
    this.w = Math.max(Math.floor(w), 1);
    this.h = Math.max(Math.floor(h), 1);
    this.n = new Uint16Array(this.w * this.h);
  }

  inBounds(x: number, y: number): boolean {
    return Number.isInteger(x) && Number.isInteger(y)
      && x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  /** How many bodies cover this tile. Out of bounds reads 0; see above. */
  count(x: number, y: number): number {
    return this.inBounds(x, y) ? this.n[y * this.w + x] ?? 0 : 0;
  }

  add(fp: Footprint, x: number, y: number, heading: number | null): void {
    for (const t of tilesOf(fp, x, y, heading)) {
      if (!this.inBounds(t.x, t.y)) continue;
      const i = t.y * this.w + t.x;
      this.n[i] = (this.n[i] ?? 0) + 1;
    }
  }

  remove(fp: Footprint, x: number, y: number, heading: number | null): void {
    for (const t of tilesOf(fp, x, y, heading)) {
      if (!this.inBounds(t.x, t.y)) continue;
      const i = t.y * this.w + t.x;
      const c = this.n[i] ?? 0;
      if (c > 0) this.n[i] = c - 1;
    }
  }
}

/**
 * Things bucketed by the tile they stand on, for "who is within r of here?"
 *
 * Fission's crowding count and the swarm's ally list each walked the whole mob
 * list for every mob -- O(mobs^2) a turn, and the larger of the two costs
 * left once occupancy was indexed. This visits only the (2r+1)^2 tiles that
 * can hold an answer.
 *
 * `near` returns a SUPERSET: callers keep their exact distance test, so the
 * index decides only how many candidates are looked at, never which pass.
 * An anchor that is not an on-grid integer tile goes to `stray` and is
 * visited by every query, so no position, however broken, is ever missed.
 */
export class AnchorIndex<T> {
  private readonly w: number;
  private readonly h: number;
  private readonly cells: (T[] | undefined)[];
  private readonly stray: T[] = [];

  constructor(w: number, h: number) {
    this.w = Math.max(Math.floor(w), 1);
    this.h = Math.max(Math.floor(h), 1);
    this.cells = new Array<T[] | undefined>(this.w * this.h);
  }

  private slot(x: number, y: number): number {
    return Number.isInteger(x) && Number.isInteger(y)
      && x >= 0 && y >= 0 && x < this.w && y < this.h ? y * this.w + x : -1;
  }

  add(x: number, y: number, item: T): void {
    const i = this.slot(x, y);
    if (i < 0) { this.stray.push(item); return; }
    (this.cells[i] ??= []).push(item);
  }

  remove(x: number, y: number, item: T): void {
    const i = this.slot(x, y);
    const list = i < 0 ? this.stray : this.cells[i];
    const k = list ? list.indexOf(item) : -1;
    if (list && k >= 0) list.splice(k, 1);
  }

  /** Everything anchored within Chebyshev distance r of (x, y), and more. */
  near(x: number, y: number, r: number, visit: (item: T) => void): void {
    for (const s of this.stray) visit(s);
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      // A query from nowhere: the caller's own test will reject everything,
      // but it gets to make that call.
      for (const list of this.cells) if (list) for (const s of list) visit(s);
      return;
    }
    const x0 = Math.max(x - r, 0), x1 = Math.min(x + r, this.w - 1);
    const y0 = Math.max(y - r, 0), y1 = Math.min(y + r, this.h - 1);
    for (let yy = y0; yy <= y1; yy++) {
      for (let xx = x0; xx <= x1; xx++) {
        const list = this.cells[yy * this.w + xx];
        if (list) for (const s of list) visit(s);
      }
    }
  }
}
