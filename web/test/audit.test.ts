import { describe, expect, it } from "vitest";
import * as bio from "../src/biology.js";
import { Plasmid } from "../src/plasmid.js";
import * as motion from "../src/motion.js";
import * as fov from "../src/fov.js";
import * as cycle from "../src/cycle.js";
import * as fp from "../src/footprint.js";
import * as items from "../src/items.js";
import * as fx from "../src/fx.js";
import * as mg from "../src/mapgen.js";
import { makeRng } from "../src/rng.js";
import { findPath } from "../src/path.js";
import { parseSave } from "../src/save.js";
import { Dungeon, MAX_FLOOR, isBossFloor, strataOf } from "../src/dungeon.js";
import { SIZES, canStrike, senseRange } from "../src/behaviour.js";
import { covers, tilesOf } from "../src/footprint.js";
import { WEAPONS } from "../src/weapons.js";
import { SOURCES } from "../src/ncbi.js";
import { MODULES } from "../src/kegg.js";
import { PIXELS, validate } from "../src/pixels.js";
import { MORPHOLOGY } from "../src/shapes.js";
import { ROOM_STYLE, planFor } from "../src/rooms.js";

// Everything here came out of an adversarial pass. Each assertion failed at
// least once before it was written.

const NASTY = [NaN, Infinity, -Infinity, 0, -1, 1e308, -1e308, 1e-320];

describe("no pure function returns a non-finite number", () => {
  // A single NaN propagates silently: the value is used as a coordinate or a
  // scale, the thing stops being drawn, and nothing is logged anywhere.
  const finite = (label: string, v: unknown): void => {
    if (typeof v === "number") {
      expect(Number.isFinite(v), `${label} = ${String(v)}`).toBe(true);
    } else if (typeof v === "object" && v !== null) {
      for (const [k, x] of Object.entries(v)) {
        if (typeof x === "number") {
          expect(Number.isFinite(x), `${label}.${k} = ${String(x)}`).toBe(true);
        }
      }
    }
  };

  it("angles survive any input", () => {
    for (const n of NASTY) {
      const s = String(n);
      finite(`angleDelta(${s})`, motion.angleDelta(n, 1));
      finite(`normalise(${s})`, motion.normalise(n));
      finite(`snap8(${s})`, motion.snap8(n));
      finite(`turnToward step ${s}`, motion.turnToward(0, 1, n));
      finite(`turnToward from ${s}`, motion.turnToward(n, 1, 0.1));
      const h = motion.headingOf(n, 1);
      if (h !== null) finite(`headingOf(${s})`, h);
    }
  });

  it("motion helpers survive any input", () => {
    for (const n of NASTY) {
      finite(`squashFor(${String(n)})`, motion.squashFor(n));
      finite(`travel(${String(n)})`, motion.travel(0, 0, n, 0));
      for (const g of motion.wake(n, 1)) finite("wake ghost", g);
    }
  });

  it("sight, clock and easing survive any input", () => {
    for (const n of NASTY) {
      finite(`sightRadius(${String(n)})`, fov.sightRadius(n));
      finite(`daylight(${String(n)})`, cycle.daylight({ turn: n }));
      finite(`phaseOf(${String(n)})`, cycle.phaseOf({ turn: n }));
      finite(`lightAt(${String(n)})`, cycle.lightAt(1, { turn: n }));
      expect(cycle.timeName({ turn: n }).length).toBeGreaterThan(0);
      for (const e of [fx.linear, fx.easeOutCubic, fx.easeOutQuad, fx.easeInQuad, fx.pulse]) {
        finite("easing", e(n));
      }
      finite(`jitter(${String(n)})`, fx.jitter(n, 1));
    }
  });

  it("footprint geometry survives any anchor or heading", () => {
    for (const n of NASTY) {
      for (const shape of ["single", "line2", "line3", "block2"] as const) {
        for (const t of fp.tilesOf(shape, n, n, n)) finite(`${shape} tile`, t);
        finite(`${shape} bounds`, fp.boundsOf(shape, n, n, n));
        finite(`${shape} centre`, fp.centreOf(shape, n, n, n));
      }
    }
  });

  it("biology and the plasmid survive any depth", () => {
    const p = new Plasmid();
    p.put(4, { kind: "promoter", strength: "strong" });
    p.put(5, { kind: "gene", id: "mtrC", optimised: true });
    for (const n of NASTY) {
      const s = String(n);
      finite(`energyYield(${s})`, bio.energyYield(n));
      expect(bio.stratum(n).depth).toBeGreaterThanOrEqual(1);
      finite(`expression(${s})`, p.expression("mtrC", n));
      finite(`power(${s})`, p.power(n));
      finite(`atpGain(${s})`, p.atpGain(n));
      finite(`atpCost(${s})`, p.atpCost(n));
      finite(`vitality(${s})`, p.vitality(n));
      finite(`armour(${s})`, p.armour(n));
      expect(items.substratesAt(n).length).toBeGreaterThan(0);
    }
  });

  it("a poisoned supply cannot spread through the plasmid", () => {
    // `supply` is public and assigned from an ATP division every turn.
    const p = new Plasmid();
    p.put(4, { kind: "promoter", strength: "strong" });
    p.put(5, { kind: "gene", id: "mtrC", optimised: true });
    for (const n of NASTY) {
      p.supply = n;
      finite(`expression, supply=${String(n)}`, p.expression("mtrC", 4));
      finite(`power, supply=${String(n)}`, p.power(4));
      expect(p.expression("mtrC", 4)).toBeGreaterThanOrEqual(0);
    }
  });

  it("rng and mapgen survive any seed or density", () => {
    for (const n of NASTY) {
      finite(`rng(${String(n)})`, makeRng(n).next());
      finite(`rng.int(${String(n)})`, makeRng(n).int(5));
      const g = mg.generate(20, 20, makeRng(1), { density: n, passes: 2 });
      expect(g.countFloor()).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("the origin is an invariant, not a hope", () => {
  // Without `ori` every expression is zero and the cell is dead -- and the
  // origin is in no loot table, so nothing can bring it back. `put` is public
  // and `applySave` writes the whole ring through it.
  it("survives wiping every slot", () => {
    const p = new Plasmid();
    for (let i = 0; i < 16; i++) p.put(i, null);
    expect(p.has("ori")).toBe(true);
  });

  it("survives a ring with no room left", () => {
    const p = new Plasmid();
    for (let i = 0; i < 16; i++) p.put(i, { kind: "terminator" });
    expect(p.has("ori")).toBe(true);
  });

  it("survives thousands of arbitrary legal operations", () => {
    const p = new Plasmid();
    for (let i = 0; i < 3000; i++) {
      p.rotate(i);
      p.swap(i, i * 7);
      p.put(i, null);
      p.stash({ kind: "terminator" });
    }
    expect(p.has("ori")).toBe(true);
    expect(p.slots).toHaveLength(16);
    expect(p.bin.length).toBeLessThanOrEqual(18);
  });

  it("a restored origin actually restores expression", () => {
    const p = new Plasmid();
    for (let i = 0; i < 16; i++) p.put(i, null);
    p.put(4, { kind: "promoter", strength: "strong" });
    p.put(5, { kind: "gene", id: "cbbL", optimised: true });
    expect(p.expression("cbbL", 1)).toBeGreaterThan(0);
  });
});

describe("hostile saves", () => {
  const HOSTILE: unknown[] = [
    null, undefined, 0, "", [], {}, { version: 5 },
    { version: 5, depth: {}, floor: [], seed: "x", px: {}, py: null, hp: [],
      atp: "z", ring: {}, bin: 7, run: [], settings: 3 },
    { version: 5, depth: 1, floor: 1, seed: 1, px: 1, py: 1, hp: 1, atp: 1,
      ring: new Array<unknown>(10000).fill({ kind: "gene", id: "mtrC" }),
      bin: new Array<unknown>(10000).fill({ kind: "terminator" }),
      run: { deepest: 1e9, deaths: -1e9,
             bestiary: new Array<unknown>(9999).fill("geobacter"),
             library: new Array<unknown>(9999).fill("mtrC") }, settings: {} },
    { version: 5, depth: NaN, floor: NaN, seed: NaN, px: NaN, py: NaN, hp: NaN,
      atp: NaN, ring: [], bin: [], run: {}, settings: {} },
  ];

  it("never produce a non-finite field or an unbounded array", () => {
    for (const [i, h] of HOSTILE.entries()) {
      const s = parseSave(h);
      if (!s) continue;
      for (const [k, v] of Object.entries(s)) {
        if (typeof v === "number") {
          expect(Number.isFinite(v), `save#${String(i)}.${k}`).toBe(true);
        }
      }
      expect(s.ring, `save#${String(i)} ring`).toHaveLength(16);
      expect(s.bin.length, `save#${String(i)} bin`).toBeLessThanOrEqual(18);
      expect(s.run.bestiary.length).toBeLessThanOrEqual(bio.MICROBES.length);
      expect(s.run.deepest).toBeLessThanOrEqual(bio.MAX_DEPTH);
      expect(s.run.deaths).toBeGreaterThanOrEqual(0);
    }
  });

  it("never throw", () => {
    for (const h of HOSTILE) expect(() => parseSave(h)).not.toThrow();
  });
});

describe("pathfinding always terminates", () => {
  it("on a solid grid, a degenerate budget, or out-of-bounds ends", () => {
    const solid = new mg.Grid(20, 20, mg.WALL);
    const open = new mg.Grid(40, 40, mg.FLOOR);
    expect(() => findPath(solid, { x: 5, y: 5 }, { x: 5, y: 5 })).not.toThrow();
    expect(() => findPath(solid, { x: -5, y: -5 }, { x: 99, y: 99 })).not.toThrow();
    for (const budget of [0, -5, NaN, Infinity]) {
      expect(() => findPath(open, { x: 1, y: 1 }, { x: 38, y: 38 }, { maxNodes: budget }))
        .not.toThrow();
    }
  });
});

describe("every table covers the union it is keyed by", () => {
  it("microbes have a size, weapon, behaviour, sprite and vector fallback", () => {
    for (const m of bio.MICROBES) {
      expect(SIZES[m.size], `${m.id} size`).toBeDefined();
      expect(WEAPONS[m.weapon], `${m.id} weapon`).toBeDefined();
      expect(senseRange(m.behaviour), `${m.id} behaviour`).toBeGreaterThan(0);
      expect(PIXELS[m.id], `${m.id} sprite`).toBeDefined();
      expect(validate(PIXELS[m.id] ?? []), `${m.id} sprite shape`).toBeNull();
      expect(MORPHOLOGY[m.id], `${m.id} vector fallback`).toBeDefined();
      expect(canStrike(m.behaviour, m.size, 0), `${m.id} cannot strike`).toBe(true);
      for (const g of m.genes) expect(bio.GENES[g], `${m.id} gene ${g}`).toBeDefined();
    }
  });

  it("every gene but the origin has an NCBI source", () => {
    for (const id of Object.keys(bio.GENES) as bio.GeneId[]) {
      if (id === "ori") continue;
      expect(SOURCES[id], id).toBeDefined();
    }
  });

  it("every module, substrate and room kind resolves", () => {
    for (const m of MODULES) {
      for (const s of m.steps) expect(bio.GENES[s.gene], `${m.id} ${s.gene}`).toBeDefined();
    }
    for (const s of Object.values(items.SUBSTRATES)) {
      if (s.needs) expect(bio.GENES[s.needs], s.id).toBeDefined();
    }
    for (let d = 1; d <= bio.MAX_DEPTH; d++) {
      for (const k of planFor(d, false).kinds) expect(ROOM_STYLE[k], k).toBeDefined();
      expect(items.substratesAt(d).length, `D${String(d)}`).toBeGreaterThan(0);
      expect(bio.microbesAt(d).length, `D${String(d)}`).toBeGreaterThan(0);
    }
  });
});

describe("every generated floor holds together", () => {
  it("stairs, sight buffers, uids and bodies are all consistent", () => {
    for (const seed of [1, 13, 77]) {
      const d = new Dungeon(96, 96, seed);
      for (let f = 1; f <= MAX_FLOOR; f++) {
        const L = d.level(f);
        const at = `seed ${String(seed)} f${String(f)}`;
        expect(L.floor, at).toBe(f);
        expect(L.depth, at).toBe(strataOf(f));
        expect(L.boss, at).toBe(isBossFloor(f));
        expect(L.grid.isFloor(L.up.x, L.up.y), `${at} up stair`).toBe(true);
        if (L.down) expect(L.grid.isFloor(L.down.x, L.down.y), `${at} down stair`).toBe(true);
        expect(L.sight.visible.length, `${at} sight`).toBe(L.grid.w * L.grid.h);
        expect(new Set(L.mobs.map((m) => m.uid)).size, `${at} uids`).toBe(L.mobs.length);
        for (const r of L.rooms) {
          expect(L.grid.isFloor(r.cx, r.cy), `${at} room centre`).toBe(true);
        }
      }
    }
  });

  it("no two bodies share a tile at spawn", () => {
    // Three places asked this and two only checked the ANCHOR tile, so a
    // filament whose anchor was free still overlapped through its other two.
    for (const seed of [1, 13, 77]) {
      const d = new Dungeon(96, 96, seed);
      for (let f = 1; f <= MAX_FLOOR; f++) {
        const L = d.level(f);
        const seen = new Set<string>();
        for (const m of L.mobs) {
          for (const t of tilesOf(SIZES[m.size].footprint, m.x, m.y, m.heading)) {
            expect(L.grid.isFloor(t.x, t.y),
                   `seed ${String(seed)} f${String(f)}: ${m.name} body in rock`).toBe(true);
            const k = `${String(t.x)},${String(t.y)}`;
            expect(seen.has(k),
                   `seed ${String(seed)} f${String(f)}: overlap at ${k}`).toBe(false);
            seen.add(k);
            expect(covers(SIZES[m.size].footprint, m.x, m.y, m.heading, t.x, t.y),
                   "covers disagrees with tilesOf").toBe(true);
          }
        }
      }
    }
  });
});
