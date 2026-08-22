import { describe, expect, it } from "vitest";
import * as bio from "../src/biology.js";
import { Genome } from "../src/genome.js";
import { Dungeon } from "../src/dungeon.js";
import * as mg from "../src/mapgen.js";
import { findPath } from "../src/path.js";
import { makeRng } from "../src/rng.js";
import { DEFAULT_SETTINGS, parseSave } from "../src/save.js";

describe("redox tower", () => {
  const depthOf = (t: bio.Teap) => bio.STRATA.find((s) => s.teap === t)!.depth;

  it("E0' decreases monotonically with depth", () => {
    const e = bio.STRATA.map((s) => s.e0);
    expect(e).toEqual([...e].sort((a, b) => b - a));
    expect(e[0]).toBe(820);
    expect(e.at(-1)).toBe(-240);
  });
  it("light decreases monotonically", () => {
    const l = bio.STRATA.map((s) => s.light);
    expect(l).toEqual([...l].sort((a, b) => b - a));
  });
  it("Fe(III) sits ABOVE sulfate reduction", () => {
    expect(depthOf("Fe(III)")).toBeLessThan(depthOf("SO4"));
  });
  it("CO2 is the floor, below sulfate", () => {
    expect(depthOf("SO4")).toBeLessThan(depthOf("CO2"));
    expect(depthOf("CO2")).toBe(8);
  });
  it("TEAP order is O2 > NO3 > Mn > Fe", () => {
    expect(depthOf("O2")).toBeLessThan(depthOf("NO3-"));
    expect(depthOf("NO3-")).toBeLessThan(depthOf("Mn(IV)"));
    expect(depthOf("Mn(IV)")).toBeLessThan(depthOf("Fe(III)"));
  });
  it("energy yield falls with depth", () => {
    expect(bio.energyYield(1)).toBeGreaterThan(bio.energyYield(4));
    expect(bio.energyYield(4)).toBeGreaterThan(bio.energyYield(8));
    expect(bio.energyYield(8)).toBeCloseTo(0.04, 2);
  });
  it("every stratum has a distinct hatch cue where hues collide", () => {
    // D1 and D6 are both green; deuteranopia collapses them, so the
    // non-colour cue must differ.
    const d1 = bio.stratum(1), d6 = bio.stratum(6);
    expect(d1.hatch).not.toBe(d6.hatch);
  });
});

describe("organisms", () => {
  it("every stratum has at least two", () => {
    for (let d = 1; d <= bio.MAX_DEPTH; d++) {
      expect(bio.microbesAt(d).length).toBeGreaterThanOrEqual(2);
    }
  });
  it("every referenced gene exists", () => {
    for (const m of bio.MICROBES) {
      for (const g of m.genes) expect(bio.GENES[g], `${m.id} -> ${g}`).toBeDefined();
    }
  });
  it("fmoA is exclusive to the green sulfur band", () => {
    for (const m of bio.MICROBES) {
      if (m.genes.includes("fmoA")) expect(m.depth).toBe(6);
    }
  });
  it("all 20 organisms ported", () => { expect(bio.MICROBES).toHaveLength(20); });
});

describe("plasmid", () => {
  it("starts with an origin and refuses to lose it", () => {
    const g = new Genome();
    expect(g.has("ori")).toBe(true);
    expect(g.remove("ori").ok).toBe(false);
  });
  it("refuses duplicates and overfilling", () => {
    const g = new Genome();
    expect(g.insert("psbA").ok).toBe(true);
    expect(g.insert("psbA").ok).toBe(false);
    for (const id of ["cbbL","katG","narG","mtrC","dsrA","mcrA","nifH"] as const) g.insert(id);
    expect(g.used()).toBeLessThanOrEqual(g.capacity);
  });
  it("burden rises past the knee", () => {
    const g = new Genome();
    expect(g.burden()).toBe(0);
    for (const id of ["narG","katG","mtrC","dsrA","aprA"] as const) g.insert(id);
    expect(g.burden()).toBeGreaterThan(0);
  });

  const kit = () => {
    const g = new Genome();
    for (const id of ["nifH","mcrA","mtrC","psbA"] as const) g.insert(id);
    return g;
  };
  it("nifH is destroyed by O2 but works anoxically", () => {
    const g = kit();
    expect(g.expression("nifH", 1)).toBe(0);
    expect(g.expression("nifH", 5)).toBeGreaterThan(0);
  });
  it("mcrA is dead weight until CO2 is the acceptor", () => {
    const g = kit();
    expect(g.expression("mcrA", 7)).toBe(0);
    expect(g.expression("mcrA", 8)).toBeGreaterThan(0);
  });
  it("mtrC only fires on Fe(III)", () => {
    const g = kit();
    expect(g.expression("mtrC", 4)).toBeGreaterThan(0);
    expect(g.expression("mtrC", 7)).toBe(0);
  });
  it("phototrophy dies in the dark, chlorosomes do not", () => {
    const g = new Genome();
    g.insert("psbA"); g.insert("csmA");
    expect(g.expression("psbA", 1)).toBeGreaterThan(0);
    expect(g.expression("psbA", 8)).toBe(0);
    expect(g.expression("csmA", 8)).toBeGreaterThan(0);
  });
  it("codon optimisation raises expression", () => {
    const g = kit();
    const before = g.expression("mtrC", 4);
    expect(g.optimise("mtrC").ok).toBe(true);
    expect(g.expression("mtrC", 4)).toBeGreaterThan(before);
    expect(g.optimise("mtrC").ok).toBe(false);
  });
  it("plasmid map arcs sum to 360", () => {
    const r = kit().report(4);
    expect(r.at(-1)!.stop).toBeCloseTo(360, 6);
  });
});

describe("pathfinding", () => {
  // The only route between the two floor tiles is the diagonal corner squeeze.
  // The only route between the two floor tiles is the diagonal corner squeeze.
  const pinch = mg.Grid.from([
    [1, 1, 1, 1],
    [1, 0, 1, 1],
    [1, 1, 0, 1],
    [1, 1, 1, 1],
  ]);
  it("refuses a diagonal squeeze between two walls by default", () => {
    expect(findPath(pinch, {x:1,y:1}, {x:2,y:2})).toBeNull();
  });
  it("allows it when tunnelling is on", () => {
    expect(findPath(pinch, {x:1,y:1}, {x:2,y:2}, { tunnel: true })).not.toBeNull();
  });

  const open = new mg.Grid(20, 20, mg.FLOOR);
  for (let i = 0; i < 20; i++) {
    open.set(i, 0, mg.WALL); open.set(i, 19, mg.WALL);
    open.set(0, i, mg.WALL); open.set(19, i, mg.WALL);
  }
  it("diagonal is tighter than orthogonal across open ground", () => {
    const d = findPath(open, {x:1,y:1}, {x:18,y:18})!;
    const o = findPath(open, {x:1,y:1}, {x:18,y:18}, { diagonal: false })!;
    expect(d.length).toBeLessThan(o.length);
    expect(d.length).toBe(18);
  });
  it("every step is contiguous and walkable", () => {
    const p = findPath(open, {x:1,y:1}, {x:18,y:18})!;
    for (let i = 1; i < p.length; i++) {
      expect(Math.abs(p[i]!.x - p[i-1]!.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(p[i]!.y - p[i-1]!.y)).toBeLessThanOrEqual(1);
      expect(open.isFloor(p[i]!.x, p[i]!.y)).toBe(true);
    }
  });
  it("returns null rather than throwing on an out-of-bounds goal", () => {
    expect(findPath(open, {x:1,y:1}, {x:999,y:999})).toBeNull();
  });
});

describe("dungeon", () => {
  it("all 8 strata generate with valid stairs", () => {
    const d = new Dungeon(80, 60, 7);
    for (let depth = 1; depth <= bio.MAX_DEPTH; depth++) {
      const L = d.level(depth);
      expect(L.grid.isFloor(L.up.x, L.up.y)).toBe(true);
      if (depth < bio.MAX_DEPTH) {
        expect(L.down).not.toBeNull();
        expect(L.grid.isFloor(L.down!.x, L.down!.y)).toBe(true);
      } else {
        expect(L.down).toBeNull();
      }
    }
  });
  it("mobs are on floor and depth-appropriate", () => {
    const d = new Dungeon(80, 60, 7);
    for (let depth = 1; depth <= bio.MAX_DEPTH; depth++) {
      const L = d.level(depth);
      for (const m of L.mobs) {
        expect(L.grid.isFloor(m.x, m.y)).toBe(true);
        expect(bio.MICROBES.find((p) => p.id === m.id)!.depth).toBe(depth);
      }
    }
  });
  it("mob count scales with depth", () => {
    const d = new Dungeon(80, 60, 7);
    expect(d.level(8).mobs.length).toBeGreaterThan(d.level(1).mobs.length);
  });
  it("down-stairs is far from up-stairs", () => {
    const L = new Dungeon(80, 60, 7).level(4);
    const dist = Math.hypot(L.up.x - L.down!.x, L.up.y - L.down!.y);
    expect(dist).toBeGreaterThan(20);
  });
  it("levels are cached, not regenerated", () => {
    const d = new Dungeon(60, 40, 3);
    expect(d.level(3).grid).toBe(d.level(3).grid);
  });
  it("cannot descend past the floor or ascend past the surface", () => {
    const d = new Dungeon(60, 40, 3);
    d.depth = 8;
    expect(d.descend()).toHaveProperty("err");
    d.depth = 1;
    expect(d.ascend()).toHaveProperty("err");
  });
  it("the same seed produces an identical column", () => {
    const a = new Dungeon(60, 40, 42).level(5);
    const b = new Dungeon(60, 40, 42).level(5);
    expect(b.grid.equals(a.grid)).toBe(true);
    expect(b.mobs.map((m) => [m.id, m.x, m.y])).toEqual(a.mobs.map((m) => [m.id, m.x, m.y]));
  });
  it("different seeds produce different columns", () => {
    expect(new Dungeon(60, 40, 1).level(5).grid
      .equals(new Dungeon(60, 40, 2).level(5).grid)).toBe(false);
  });
  it("every level is fully connected -- no unreachable stairs", () => {
    const d = new Dungeon(80, 60, 11);
    for (let depth = 1; depth < bio.MAX_DEPTH; depth++) {
      const L = d.level(depth);
      expect(findPath(L.grid, L.up, L.down!), `depth ${depth}`).not.toBeNull();
    }
  });
  it("every mob is reachable from the arrival stair", () => {
    const d = new Dungeon(60, 45, 5);
    const L = d.level(3);
    for (const m of L.mobs) {
      expect(findPath(L.grid, L.up, { x: m.x, y: m.y }), m.id).not.toBeNull();
    }
  });
});

describe("rng", () => {
  it("is deterministic and reproducible", () => {
    const a = makeRng(99), b = makeRng(99);
    expect(Array.from({length:20}, () => a.next()))
      .toEqual(Array.from({length:20}, () => b.next()));
  });
  it("stays in [0,1)", () => {
    const r = makeRng(1);
    for (let i = 0; i < 5000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it("forks diverge", () => {
    const r = makeRng(7);
    expect(r.fork(1).next()).not.toBe(r.fork(2).next());
  });
});

describe("save validation", () => {
  const good = { depth: 4, seed: 7, px: 10, py: 12, hp: 22,
                 genes: [["mtrC", true], ["psbA", false]],
                 settings: { uiScale: 1.5, highContrast: true, reduceMotion: false, diagonal: false } };

  it("round-trips a valid save", () => {
    const s = parseSave(good);
    expect(s?.depth).toBe(4);
    expect(s?.genes).toEqual([["mtrC", true], ["psbA", false]]);
    expect(s?.settings.highContrast).toBe(true);
  });
  it("rejects non-objects outright", () => {
    for (const junk of [null, undefined, 42, "nope", [1, 2, 3]]) {
      expect(parseSave(junk)).toBeNull();
    }
  });
  it("rejects a save with no usable position", () => {
    expect(parseSave({ ...good, px: "over there" })).toBeNull();
    expect(parseSave({ ...good, py: NaN })).toBeNull();
  });
  it("clamps a depth outside the column", () => {
    expect(parseSave({ ...good, depth: 9999 })?.depth).toBe(bio.MAX_DEPTH);
    expect(parseSave({ ...good, depth: -3 })?.depth).toBe(1);
    expect(parseSave({ ...good, depth: "four" })?.depth).toBe(1);
  });
  it("drops genes that do not exist", () => {
    const s = parseSave({ ...good, genes: [["mtrC", true], ["notAGene", true], "junk", 7] });
    expect(s?.genes).toEqual([["mtrC", true]]);
  });
  it("falls back to defaults on malformed settings", () => {
    expect(parseSave({ ...good, settings: "corrupt" })?.settings).toEqual(DEFAULT_SETTINGS);
    expect(parseSave({ ...good, settings: { uiScale: 500 } })?.settings.uiScale).toBe(3);
  });
  it("survives a hand-edited hostile payload", () => {
    const s = parseSave({ depth: {}, seed: [], px: 1, py: 1, hp: -50,
                          genes: "all of them", settings: null });
    expect(s).not.toBeNull();
    expect(s?.hp).toBeGreaterThan(0);
    expect(s?.genes).toEqual([]);
  });
});
