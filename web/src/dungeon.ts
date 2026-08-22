// Multi-level descent. One cave per stratum, generated from that stratum's
// parameters, cached so climbing back finds the same level.

import { MAX_DEPTH, microbesAt, stratum, type GeneId, type Stratum } from "./biology.js";
import * as mg from "./mapgen.js";
import type { Grid, Point } from "./mapgen.js";
import { makeRng, type Rng } from "./rng.js";

export interface Mob {
  id: string; name: string; glyph: string;
  x: number; y: number; hp: number; maxhp: number; atk: number;
  genes: readonly GeneId[]; note: string; alive: boolean;
}

export interface Level {
  depth: number; grid: Grid; stratum: Stratum;
  up: Point; down: Point | null; mobs: Mob[]; visited: boolean;
}

export class Dungeon {
  readonly w: number; readonly h: number; readonly seed: number;
  private readonly cache = new Map<number, Level>();
  depth = 1;

  constructor(w = 110, h = 80, seed = 7) {
    this.w = w; this.h = h; this.seed = seed;
  }

  private build(depth: number): Level {
    const s = stratum(depth);
    const rng: Rng = makeRng(this.seed).fork(depth);
    const grid = mg.generate(this.w, this.h, rng, { density: s.density, passes: s.passes });
    const { seed } = mg.keepLargestRegion(grid);
    const up = seed ?? mg.carveSpawn(grid, 4);
    const down = depth < MAX_DEPTH ? mg.farthestFrom(grid, up) : null;

    const lvl: Level = { depth, grid, stratum: s, up, down, mobs: [], visited: false };
    this.populate(lvl, rng);
    return lvl;
  }

  /** This stratum's real organisms, never on a stair, never where you arrive. */
  private populate(lvl: Level, rng: Rng): void {
    const pool = microbesAt(lvl.depth);
    if (!pool.length) return;
    const want = 6 + lvl.depth * 2;
    let tries = 0;

    while (lvl.mobs.length < want && tries < want * 200) {
      tries++;
      const x = rng.int(this.w), y = rng.int(this.h);
      if (!lvl.grid.isFloor(x, y)) continue;
      if (Math.abs(x - lvl.up.x) <= 4 && Math.abs(y - lvl.up.y) <= 4) continue;
      if (x === lvl.down?.x && y === lvl.down.y) continue;
      if (lvl.mobs.some((m) => m.x === x && m.y === y)) continue;

      const p = rng.pick(pool);
      lvl.mobs.push({
        id: p.id, name: p.name, glyph: p.glyph, x, y,
        hp: p.hp, maxhp: p.hp, atk: p.atk, genes: p.genes, note: p.note,
        alive: true,
      });
    }
  }

  level(depth: number): Level {
    const d = Math.min(Math.max(depth, 1), MAX_DEPTH);
    let lvl = this.cache.get(d);
    if (!lvl) { lvl = this.build(d); this.cache.set(d, lvl); }
    return lvl;
  }

  current(): Level { return this.level(this.depth); }
  regenerate(): void { this.cache.delete(this.depth); }

  descend(): { level: Level; arrive: Point } | { err: string } {
    if (!this.current().down) return { err: "the column has no floor below this" };
    this.depth++;
    const level = this.current();
    return { level, arrive: level.up };
  }

  ascend(): { level: Level; arrive: Point } | { err: string } {
    if (this.depth <= 1) return { err: "already at the surface" };
    this.depth--;
    const level = this.current();
    return { level, arrive: level.down ?? level.up };
  }

  mobAt(x: number, y: number): Mob | undefined {
    return this.current().mobs.find((m) => m.alive && m.x === x && m.y === y);
  }

  aliveCount(): number {
    return this.current().mobs.filter((m) => m.alive).length;
  }
}
