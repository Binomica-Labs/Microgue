// Multi-level descent. One cave per stratum, generated from that stratum's
// parameters, cached so climbing back finds the same level.

import { MAX_DEPTH, microbesAt, stratum, type Stratum } from "./biology.js";
import type { Microbe } from "./entity.js";
import { SIZES } from "./behaviour.js";
import { covers, tilesOf } from "./footprint.js";
import * as mg from "./mapgen.js";
import type { Grid, Point } from "./mapgen.js";
import { makeRng, type Rng } from "./rng.js";

/** The microbe entity, defined once in entity.ts so the union stays the
 *  single source of truth rather than a parallel declaration that drifts. */
export type Mob = Microbe;

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

  /** Below this the level has nowhere to fight. */
  private static readonly MIN_OPEN = 0.25;

  private build(depth: number): Level {
    const s = stratum(depth);
    const rng: Rng = makeRng(this.seed).fork(depth);

    // Cellular automata fragment above roughly 0.48 initial density: the open
    // space breaks into pockets and keepLargestRegion seals almost all of it.
    // Densities are tuned below that, but a bad seed can still land short, so
    // back off and retry rather than hand out a solid level.
    let grid = mg.generate(this.w, this.h, rng, { density: s.density, passes: s.passes });
    let region = mg.keepLargestRegion(grid);
    for (let attempt = 1; attempt <= 4; attempt++) {
      if (grid.countFloor() / (grid.w * grid.h) >= Dungeon.MIN_OPEN) break;
      const relaxed = Math.max(s.density - attempt * 0.03, 0.3);
      grid = mg.generate(this.w, this.h, rng, { density: relaxed, passes: s.passes });
      region = mg.keepLargestRegion(grid);
    }
    const { seed } = region;
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
      const p0 = rng.pick(pool);
      if (!lvl.grid.isFloor(x, y)) continue;
      if (Math.abs(x - lvl.up.x) <= 4 && Math.abs(y - lvl.up.y) <= 4) continue;
      if (x === lvl.down?.x && y === lvl.down.y) continue;
      const fp = SIZES[p0.size].footprint;
      if (tilesOf(fp, x, y, null).some((t) => !lvl.grid.isFloor(t.x, t.y))) continue;
      if (lvl.mobs.some((m) =>
        tilesOf(SIZES[m.size].footprint, m.x, m.y, m.heading)
          .some((a) => tilesOf(fp, x, y, null).some((b2) => a.x === b2.x && a.y === b2.y)))) continue;

      // p0 is peeked before placement so the footprint can be validated.
      const p = p0;
      lvl.mobs.push({
        id: p.id, name: p.name, glyph: p.glyph, x, y,
        hp: Math.round(p.hp * SIZES[p.size].hp),
        maxhp: Math.round(p.hp * SIZES[p.size].hp), atk: p.atk, genes: p.genes, note: p.note,
        pigment: p.pigment, alive: true,
        facing: p.facing, heading: null, ax: x, ay: y,
        behaviour: p.behaviour, size: p.size,
        cooldown: 0, status: [],
        weapon: p.weapon, reload: 0, charging: 0,
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

  /** Any mob whose FOOTPRINT covers this tile, not merely its anchor. */
  mobAt(x: number, y: number): Mob | undefined {
    return this.current().mobs.find(
      (m) => m.alive && covers(SIZES[m.size].footprint, m.x, m.y, m.heading, x, y));
  }

  aliveCount(): number {
    return this.current().mobs.filter((m) => m.alive).length;
  }
}
