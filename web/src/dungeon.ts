// Multi-level descent. One cave per stratum, generated from that stratum's
// parameters, cached so climbing back finds the same level.

import { MAX_DEPTH, microbesAt, stratum, type Microbe as Microbe0, type Stratum }
  from "./biology.js";
import type { Microbe } from "./entity.js";
import { SIZES, type Size } from "./behaviour.js";
import { covers, tilesOf } from "./footprint.js";
import { makeSight, type Sight } from "./fov.js";
import { carveRooms, planFor, ROOM_STYLE, type Room } from "./rooms.js";
import { barriersAt, type Barrier } from "./barrier.js";
import { findPath } from "./path.js";
import * as mg from "./mapgen.js";
import type { Grid, Point } from "./mapgen.js";
import { makeRng, type Rng } from "./rng.js";

/** The microbe entity, defined once in entity.ts so the union stays the
 *  single source of truth rather than a parallel declaration that drifts. */
export type Mob = Microbe;

export interface Level {
  depth: number; floor: number; grid: Grid; stratum: Stratum;
  /** The last floor of a stratum: a boss or a swarm waits here. */
  boss: boolean;
  rooms: Room[];
  /** Material that has to be digested through. */
  barriers: Barrier[];
  /** A boss floor stays sealed until whatever holds it is dead. */
  cleared: boolean;
  /** Set once a boss floor is populated, for the arrival message. */
  bossName?: string;
  up: Point; down: Point | null; mobs: Mob[]; visited: boolean;
  /** What has been lit, and what is remembered, for this level. */
  sight: Sight;
}

/** Floors per stratum. The column is deep; one room per layer made each
 *  biome a doorway rather than a place. */
export const FLOORS_PER_STRATUM = 3;
export const MAX_FLOOR = MAX_DEPTH * FLOORS_PER_STRATUM;

/** Stratum index (1..8) for a floor (1..24). */
export const strataOf = (floor: number): number =>
  Math.min(Math.max(Math.ceil(floor / FLOORS_PER_STRATUM), 1), MAX_DEPTH);

/** The last floor of a stratum is where its boss stands. */
export const isBossFloor = (floor: number): boolean =>
  floor % FLOORS_PER_STRATUM === 0;

/** Position within the stratum, 1..FLOORS_PER_STRATUM. */
export const floorWithin = (floor: number): number =>
  ((floor - 1) % FLOORS_PER_STRATUM) + 1;

export class Dungeon {
  readonly w: number; readonly h: number; readonly seed: number;
  private readonly cache = new Map<number, Level>();
  /** Floor within the whole column, 1..MAX_FLOOR. */
  floor = 1;

  /** Stratum index. Everything biological keys off this, so it stays named
   *  `depth` and keeps working unchanged as floors were added underneath. */
  get depth(): number { return strataOf(this.floor); }

  constructor(w = 110, h = 80, seed = 7) {
    this.w = w; this.h = h; this.seed = seed;
  }

  /** Below this the level has nowhere to fight. */
  private static readonly MIN_OPEN = 0.25;

  private build(floor: number): Level {
    const depth = strataOf(floor);
    const s = stratum(depth);
    const rng: Rng = makeRng(this.seed).fork(floor);

    // Openness is measured on the level that SHIPS -- after masking to the
    // disc and after the rooms are carved -- not on the raw cave. Checking it
    // early let a dense stratum pass the guard and then lose most of its floor
    // to the mask. The rooms and their corridors are what keep a dense cave
    // connected, so they must exist before the level is judged.
    const attempt = (density: number): { grid: Grid; rooms: Room[]; seed: Point | null } => {
      const g = mg.generate(this.w, this.h, rng, { density, passes: s.passes });
      mg.keepLargestRegion(g);
      mg.maskToColumn(g);
      const rs = carveRooms(g, rng, planFor(depth, isBossFloor(floor)));
      return { grid: g, rooms: rs, seed: mg.keepLargestRegion(g).seed };
    };

    let built = attempt(s.density);
    for (let i = 1; i <= 4; i++) {
      if (built.grid.countFloor() / (built.grid.w * built.grid.h) >= Dungeon.MIN_OPEN) break;
      built = attempt(Math.max(s.density - i * 0.05, 0.32));
    }
    const grid = built.grid;
    const rooms = built.rooms;
    const { seed } = built;
    const up = seed ?? mg.carveSpawn(grid, 4);
    const down = floor < MAX_FLOOR ? mg.farthestFrom(grid, up) : null;

    const lvl: Level = { depth, floor, grid, stratum: s, up, down, mobs: [],
                         visited: false, boss: isBossFloor(floor),
                         // Rooms sealed off by the connectivity sweep are gone.
                         rooms: rooms.filter((r) => grid.isFloor(r.cx, r.cy)),
                         barriers: [],
                         cleared: !isBossFloor(floor),
                         sight: makeSight(grid.w, grid.h) };
    this.sealRooms(lvl, rng);
    this.populate(lvl, rng);
    this.stockRooms(lvl, rng);
    if (lvl.boss) this.placeBoss(lvl, rng);
    return lvl;
  }

  /** This stratum's real organisms, never on a stair, never where you arrive. */
  private populate(lvl: Level, rng: Rng): void {
    const pool = microbesAt(lvl.depth);
    if (!pool.length) return;
    // Scaled to the floor area that actually exists, so a sparse level does
    // not end up with the same handful of microbes as a dense one. At 167 open
    // tiles per microbe the column read as empty; this targets about 55.
    const open = lvl.grid.countFloor();
    const want = Math.min(
      Math.round(open / 66) + lvl.depth * 2,
      Math.floor(open / 24));
    let tries = 0;

    while (lvl.mobs.length < want && tries < want * 200) {
      tries++;
      const x = rng.int(this.w), y = rng.int(this.h);
      const p0 = rng.pick(pool);
      if (!lvl.grid.isFloor(x, y)) continue;
      if (Math.abs(x - lvl.up.x) <= 4 && Math.abs(y - lvl.up.y) <= 4) continue;
      if (x === lvl.down?.x && y === lvl.down.y) continue;
      if (!this.canPlace(lvl, p0.size, x, y)) continue;

      // p0 is peeked before placement so the footprint can be validated.
      lvl.mobs.push(this.spawn(p0, x, y));
    }
  }

  /**
   * Can a body of this size stand here?
   *
   * Three places used to ask this and two of them only tested the ANCHOR
   * tile, so a filament whose anchor was free still overlapped a neighbour
   * through its other two tiles. One helper, used everywhere, is the only way
   * that stays true.
   */
  private canPlace(lvl: Level, size: Size, x: number, y: number): boolean {
    const fp = SIZES[size].footprint;
    const want = tilesOf(fp, x, y, null);
    for (const t of want) {
      if (!lvl.grid.isFloor(t.x, t.y)) return false;
    }
    for (const m of lvl.mobs) {
      if (!m.alive) continue;
      const mine = SIZES[m.size].footprint;
      for (const t of want) {
        if (covers(mine, m.x, m.y, m.heading, t.x, t.y)) return false;
      }
    }
    return true;
  }

  /** One microbe, built from its prototype. Factored out so boss placement
   *  cannot drift from ordinary spawning. */
  private nextUid = 1;

  private spawn(p: Microbe0, x: number, y: number): Mob {
    const hp = Math.round(p.hp * SIZES[p.size].hp);
    return {
      uid: this.nextUid++,
      id: p.id, name: p.name, glyph: p.glyph, x, y,
      hp, maxhp: hp, atk: p.atk, genes: p.genes, note: p.note,
      pigment: p.pigment, alive: true,
      facing: p.facing, heading: null, ax: x, ay: y,
      behaviour: p.behaviour, size: p.size,
      cooldown: 0, status: [], elite: false,
      weapon: p.weapon, reload: 0, charging: 0,
    };
  }

  /** Keyed by FLOOR, not stratum. Clamping this to MAX_DEPTH silently
   *  collapsed floors 9 to 24 onto floor 8. */
  level(floor: number): Level {
    const f = Math.min(Math.max(Math.round(floor), 1), MAX_FLOOR);
    let lvl = this.cache.get(f);
    if (!lvl) { lvl = this.build(f); this.cache.set(f, lvl); }
    return lvl;
  }

  current(): Level { return this.level(this.floor); }
  regenerate(): void { this.cache.delete(this.floor); }

  descend(): { level: Level; arrive: Point } | { err: string } {
    if (!this.current().down) return { err: "the column has no floor below this" };
    this.floor++;
    const level = this.current();
    return { level, arrive: level.up };
  }

  ascend(): { level: Level; arrive: Point } | { err: string } {
    if (this.floor <= 1) return { err: "already at the surface" };
    this.floor--;
    const level = this.current();
    return { level, arrive: level.down ?? level.up };
  }

  /**
   * The floor that closes a stratum. Half the time a single overgrown
   * individual -- real filaments do reach millimetres -- and half the time a
   * bloom of one species, which is what a column actually produces when a
   * layer's chemistry runs away with it.
   */
  /**
   * Seal the good rooms behind something you have to digest.
   *
   * Only ports and enrichments -- the rooms actually worth crossing a level
   * for. A barrier on a plain chamber is an obstacle; a barrier on a cache is
   * a decision about what your plasmid is for.
   */
  private sealRooms(lvl: Level, rng: Rng): void {
    const kinds = barriersAt(lvl.depth);
    if (kinds.length === 0) return;
    for (const room of lvl.rooms) {
      if (room.kind !== "port" && room.kind !== "enrichment") continue;
      const def = kinds[rng.int(kinds.length)];
      if (!def) continue;
      // Plug the ring one tile outside the room, which is where its corridor
      // has to pass through.
      const r = room.r + 1;
      const ring: Point[] = [];
      for (let a = 0; a < 64; a++) {
        const th = (a / 64) * Math.PI * 2;
        const x = Math.round(room.cx + Math.cos(th) * r);
        const y = Math.round(room.cy + Math.sin(th) * r);
        if (!lvl.grid.isFloor(x, y)) continue;
        // Never on a stair. A barrier standing on the way down is not a gate,
        // it is a locked exit.
        if (x === lvl.up.x && y === lvl.up.y) continue;
        if (lvl.down?.x === x && lvl.down.y === y) continue;
        if (ring.some((p) => p.x === x && p.y === y)) continue;
        ring.push({ x, y });
      }
      const added: Barrier[] = ring.map((p) => ({ x: p.x, y: p.y, id: def.id, work: 0 }));
      lvl.barriers.push(...added);

      // A barrier gates a CACHE, never progress. If sealing this room happens
      // to cut the only route between the stairs -- because its corridor was
      // that route -- unseal it rather than shipping a floor you cannot leave.
      if (!this.exitReachable(lvl)) {
        lvl.barriers = lvl.barriers.filter((b) => !added.includes(b));
      }
    }
    // Belt and braces. Nothing above should be able to leave the exit sealed,
    // but a floor you cannot leave is unrecoverable, so verify once more and
    // drop every barrier rather than ship one.
    if (!this.exitReachable(lvl)) lvl.barriers = [];
  }

  /** Is the way down still reachable with every barrier treated as solid? */
  private exitReachable(lvl: Level): boolean {
    if (!lvl.down) return true;
    const blocked = new Set(lvl.barriers.map((b) => `${String(b.x)},${String(b.y)}`));
    const open = new mg.Grid(lvl.grid.w, lvl.grid.h, mg.WALL);
    for (let y = 0; y < lvl.grid.h; y++) {
      for (let x = 0; x < lvl.grid.w; x++) {
        if (lvl.grid.isFloor(x, y) && !blocked.has(`${String(x)},${String(y)}`)) {
          open.set(x, y, mg.FLOOR);
        }
      }
    }
    return findPath(open, lvl.up, lvl.down) !== null;
  }

  /** Extra microbes in the rooms that warrant them. */
  private stockRooms(lvl: Level, rng: Rng): void {
    const pool = microbesAt(lvl.depth);
    if (pool.length === 0) return;
    for (const room of lvl.rooms) {
      const style = ROOM_STYLE[room.kind];
      for (let i = 0; i < style.guard; i++) {
        const t = room.tiles[rng.int(room.tiles.length)];
        if (!t) continue;
        const p = room.kind === "bloom"
          ? pool[rng.int(pool.length)]        // one species, chosen per room
          : pool[rng.int(pool.length)];
        if (!p) continue;
        if (!this.canPlace(lvl, p.size, t.x, t.y)) continue;
        lvl.mobs.push(this.spawn(p, t.x, t.y));
      }
      room.stocked = true;
    }
  }

  private placeBoss(lvl: Level, rng: Rng): void {
    const pool = microbesAt(lvl.depth);
    const proto = pool[rng.int(pool.length)];
    if (!proto) return;
    const at = lvl.down ?? lvl.up;

    // The footprint checked must be the one the boss will ACTUALLY have. A
    // promoted pico validated as a single tile and then occupied a 2x2 block,
    // half of it inside the glass.
    const spot = (r: number, size: Size): Point | null => {
      for (let i = 0; i < 300; i++) {
        const a = rng.next() * Math.PI * 2;
        const d2 = rng.next() * r;
        const x = Math.round(at.x + Math.cos(a) * d2);
        const y = Math.round(at.y + Math.sin(a) * d2);
        if (this.canPlace(lvl, size, x, y)) return { x, y };
      }
      return null;
    };

    if (rng.next() < 0.5) {
      // An overgrown individual.
      const grown: Size =
        proto.size === "pico" || proto.size === "small" ? "large" : "filament";
      const p = spot(9, grown);
      if (!p) return;
      lvl.mobs.push({
        ...this.spawn(proto, p.x, p.y),
        name: `${proto.name} (overgrown)`,
        hp: Math.round(proto.hp * 6), maxhp: Math.round(proto.hp * 6),
        atk: Math.round(proto.atk * 1.8), elite: true, size: grown,
      });
      lvl.bossName = `an overgrown ${proto.name}`;
    } else {
      // A bloom.
      let placed = 0;
      for (let i = 0; i < 14; i++) {
        const p = spot(12, proto.size);
        if (!p) continue;
        lvl.mobs.push({
          ...this.spawn(proto, p.x, p.y),
          hp: Math.round(proto.hp * 1.3), maxhp: Math.round(proto.hp * 1.3),
          elite: true,
        });
        placed++;
      }
      if (placed > 0) lvl.bossName = `a bloom of ${proto.name}`;
    }
  }

  /** A boss floor is cleared when nothing elite is left standing. */
  static isCleared(lvl: Level): boolean {
    return !lvl.boss || !lvl.mobs.some((m) => m.alive && m.elite);
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
