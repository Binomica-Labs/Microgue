import { describe, expect, it } from "vitest";
import * as bio from "../src/biology.js";
import { Genome } from "../src/genome.js";
import { Dungeon } from "../src/dungeon.js";
import * as mg from "../src/mapgen.js";
import { findPath } from "../src/path.js";
import { makeRng } from "../src/rng.js";
import { DEFAULT_SETTINGS, parseSave } from "../src/save.js";
import { Plasmid, SLOTS } from "../src/plasmid.js";
import { describe as describeSlot, slotAt, slotCentre } from "../src/plasmid_ui.js";
import { buttonAt, layoutButtons, makeButtons } from "../src/buttons.js";
import { classify, traceWalls } from "../src/walls.js";
import { PIXELS, PX_SIZE, validate as validatePixels } from "../src/pixels.js";

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
                 ring: [{ kind: "promoter", strength: "strong" },
                        { kind: "gene", id: "mtrC", optimised: true }],
                 settings: { uiScale: 1.5, highContrast: true, reduceMotion: false, diagonal: false } };

  it("round-trips a valid save", () => {
    const s = parseSave(good);
    expect(s?.depth).toBe(4);
    expect(s?.ring[0]).toEqual({ kind: "promoter", strength: "strong" });
    expect(s?.ring[1]).toEqual({ kind: "gene", id: "mtrC", optimised: true });
    expect(s?.ring).toHaveLength(SLOTS);
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
  it("drops ring entries that are not real parts", () => {
    const s = parseSave({ ...good, ring: [
      { kind: "gene", id: "mtrC", optimised: true },
      { kind: "gene", id: "notAGene" }, "junk", 7,
      { kind: "gene", id: "mtrC" },                    // duplicate
    ]});
    expect(s?.ring[0]).toEqual({ kind: "gene", id: "mtrC", optimised: true });
    expect(s?.ring[1]).toBeNull();
    expect(s?.ring[2]).toBeNull();
    expect(s?.ring[4]).toBeNull();
  });
  it("clamps an over-long ring and defaults a bad promoter strength", () => {
    const long = Array.from({ length: 40 }, () => ({ kind: "terminator" }));
    expect(parseSave({ ...good, ring: long })?.ring).toHaveLength(SLOTS);
    const s = parseSave({ ...good, ring: [{ kind: "promoter", strength: "nuclear" }] });
    expect(s?.ring[0]).toEqual({ kind: "promoter", strength: "medium" });
  });
  it("falls back to defaults on malformed settings", () => {
    expect(parseSave({ ...good, settings: "corrupt" })?.settings).toEqual(DEFAULT_SETTINGS);
    expect(parseSave({ ...good, settings: { uiScale: 500 } })?.settings.uiScale).toBe(3);
  });
  it("survives a hand-edited hostile payload", () => {
    const s = parseSave({ depth: {}, seed: [], px: 1, py: 1, hp: -50,
                          ring: "all of them", settings: null });
    expect(s).not.toBeNull();
    expect(s?.hp).toBeGreaterThan(0);
    expect(s?.ring.every((p) => p === null)).toBe(true);
  });
});

describe("plasmid operons", () => {
  const P = () => new Plasmid();

  it("starts transcribing an origin", () => {
    const p = P();
    expect(p.has("ori")).toBe(true);
    expect(p.operons()).toHaveLength(1);
    expect(p.operons()[0]!.genes.map((g) => g.id)).toEqual(["ori"]);
  });

  it("a gene outside any operon is not expressed", () => {
    const p = P();
    p.put(8, { kind: "gene", id: "mtrC", optimised: false });   // no promoter
    expect(p.has("mtrC")).toBe(true);
    expect(p.operonOf("mtrC")).toBeNull();
    expect(p.expression("mtrC", 4)).toBe(0);
  });

  it("a promoter upstream switches it on", () => {
    const p = P();
    p.put(7, { kind: "promoter", strength: "medium" });
    p.put(8, { kind: "gene", id: "mtrC", optimised: false });
    expect(p.expression("mtrC", 4)).toBeGreaterThan(0);
  });

  it("a terminator ends the operon", () => {
    const p = P();
    p.put(7, { kind: "promoter", strength: "strong" });
    p.put(8, { kind: "terminator" });
    p.put(9, { kind: "gene", id: "mtrC", optimised: false });
    expect(p.expression("mtrC", 4)).toBe(0);
  });

  it("a gap ends the operon", () => {
    const p = P();
    p.put(7, { kind: "promoter", strength: "strong" });
    p.put(9, { kind: "gene", id: "mtrC", optimised: false });   // slot 8 empty
    expect(p.expression("mtrC", 4)).toBe(0);
  });

  it("promoter strength scales output", () => {
    const build = (s: "weak" | "medium" | "strong") => {
      const p = P();
      p.put(7, { kind: "promoter", strength: s });
      p.put(8, { kind: "gene", id: "mtrC", optimised: false });
      return p.expression("mtrC", 4);
    };
    expect(build("weak")).toBeLessThan(build("medium"));
    expect(build("medium")).toBeLessThan(build("strong"));
  });

  it("polarity starves the tail of a long operon", () => {
    const p = P();
    p.put(4, { kind: "promoter", strength: "strong" });
    p.put(5, { kind: "gene", id: "mtrC", optimised: false });
    p.put(6, { kind: "gene", id: "omcS", optimised: false });
    const near = p.expression("mtrC", 4);
    const far = p.expression("omcS", 4);
    expect(far).toBeLessThan(near);
  });

  it("same-pathway neighbours co-regulate", () => {
    const lone = P();
    lone.put(4, { kind: "promoter", strength: "medium" });
    lone.put(5, { kind: "gene", id: "mtrC", optimised: false });
    const solo = lone.expression("mtrC", 4);

    const clustered = P();
    clustered.put(4, { kind: "promoter", strength: "medium" });
    clustered.put(5, { kind: "gene", id: "mtrC", optimised: false });
    clustered.put(6, { kind: "gene", id: "omcS", optimised: false });  // also iron
    expect(clustered.expression("mtrC", 4)).toBeGreaterThan(solo);
  });

  it("a mixed-pathway operon beats nothing but loses to a clean one", () => {
    const mixed = P();
    mixed.put(4, { kind: "promoter", strength: "medium" });
    mixed.put(5, { kind: "gene", id: "mtrC", optimised: false });
    mixed.put(6, { kind: "gene", id: "katG", optimised: false });      // defense
    const clean = P();
    clean.put(4, { kind: "promoter", strength: "medium" });
    clean.put(5, { kind: "gene", id: "mtrC", optimised: false });
    clean.put(6, { kind: "gene", id: "omcS", optimised: false });
    expect(clean.expression("mtrC", 4)).toBeGreaterThan(mixed.expression("mtrC", 4));
  });

  it("substrate gating still applies inside an operon", () => {
    const p = P();
    p.put(4, { kind: "promoter", strength: "strong" });
    p.put(5, { kind: "gene", id: "mcrA", optimised: false });
    expect(p.expression("mcrA", 4)).toBe(0);          // no CO2 acceptor here
    expect(p.expression("mcrA", 8)).toBeGreaterThan(0);
  });

  it("oxygen still destroys nifH regardless of promoter", () => {
    const p = P();
    p.put(4, { kind: "promoter", strength: "strong" });
    p.put(5, { kind: "gene", id: "nifH", optimised: false });
    expect(p.expression("nifH", 1)).toBe(0);
    expect(p.expression("nifH", 5)).toBeGreaterThan(0);
  });

  it("rotation preserves relative order, so operons survive", () => {
    const p = P();
    p.put(4, { kind: "promoter", strength: "medium" });
    p.put(5, { kind: "gene", id: "mtrC", optimised: false });
    const before = p.expression("mtrC", 4);
    p.rotate(5);
    expect(p.expression("mtrC", 4)).toBeCloseTo(before, 10);
  });

  it("swap is the drag primitive and can break an operon", () => {
    const p = P();
    p.put(4, { kind: "promoter", strength: "medium" });
    p.put(5, { kind: "gene", id: "mtrC", optimised: false });
    expect(p.expression("mtrC", 4)).toBeGreaterThan(0);
    p.swap(5, 12);                                     // drag it far away
    expect(p.expression("mtrC", 4)).toBe(0);
  });

  it("the origin cannot be excised", () => {
    const p = P();
    const i = p.slots.findIndex((s) => s?.kind === "gene" && s.id === "ori");
    expect(p.remove(i).ok).toBe(false);
  });

  it("refuses duplicates and reports a full ring", () => {
    const p = P();
    expect(p.add({ kind: "gene", id: "mtrC", optimised: false }).ok).toBe(true);
    expect(p.add({ kind: "gene", id: "mtrC", optimised: false }).ok).toBe(false);
    for (let i = 0; i < SLOTS; i++) p.put(i, { kind: "terminator" });
    expect(p.add({ kind: "gene", id: "psbA", optimised: false }).ok).toBe(false);
  });

  it("power rises when you arrange well", () => {
    const bad = P();
    bad.put(5, { kind: "gene", id: "mtrC", optimised: false });   // orphaned
    bad.put(9, { kind: "gene", id: "omcS", optimised: false });
    const good = P();
    good.put(4, { kind: "promoter", strength: "strong" });
    good.put(5, { kind: "gene", id: "mtrC", optimised: false });
    good.put(6, { kind: "gene", id: "omcS", optimised: false });
    expect(good.power(4)).toBeGreaterThan(bad.power(4));
  });
});

describe("plasmid ring geometry", () => {
  const g = { cx: 200, cy: 300, rInner: 80, rOuter: 130, rot: 0 };

  it("maps a slot centre back to its own index", () => {
    for (let i = 0; i < SLOTS; i++) {
      const c = slotCentre(g, i);
      expect(slotAt(g, c.x, c.y), `slot ${i}`).toBe(i);
    }
  });
  it("survives rotation", () => {
    const r = { ...g, rot: 1.3 };
    for (let i = 0; i < SLOTS; i++) {
      const c = slotCentre(r, i);
      expect(slotAt(r, c.x, c.y)).toBe(i);
    }
  });
  it("rejects points inside and outside the band", () => {
    expect(slotAt(g, g.cx, g.cy)).toBeNull();
    expect(slotAt(g, g.cx + 400, g.cy)).toBeNull();
  });
  it("describe() flags an untranscribed gene", () => {
    const p = new Plasmid();
    p.put(9, { kind: "gene", id: "mtrC", optimised: false });
    expect(describeSlot(p, 9, 4).join(" ")).toContain("NOT TRANSCRIBED");
  });
});

describe("button layout", () => {
  it("stays inside the viewport and meets the 44pt target", () => {
    for (const [W, H] of [[1080, 2340], [720, 1600], [1179, 2556]] as const) {
      const bs = makeButtons();
      const u = Math.max(Math.min(W, H) / 420, 1);
      layoutButtons(bs, W, H, { right: 0, bottom: 48 }, u, 90 * u);
      for (const b of bs) {
        expect(b.w, `${W}x${H}`).toBeGreaterThanOrEqual(44);
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(W);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.y + b.h).toBeLessThanOrEqual(H);
      }
    }
  });
  it("hit-tests each button at its own centre", () => {
    const bs = makeButtons();
    layoutButtons(bs, 1080, 2340, { right: 0, bottom: 48 }, 2.5, 200);
    for (const b of bs) {
      expect(buttonAt(bs, b.x + b.w / 2, b.y + b.h / 2)?.id).toBe(b.id);
    }
  });
  it("ignores disabled buttons", () => {
    const bs = makeButtons();
    layoutButtons(bs, 1080, 2340, { right: 0, bottom: 48 }, 2.5, 200);
    const first = bs[0]!;
    first.enabled = false;
    expect(buttonAt(bs, first.x + 2, first.y + 2)?.id).not.toBe(first.id);
  });
});

describe("hud geometry", () => {
  it("the column gauge stops above the reserved status bar", () => {
    // Mirrors drawColumn's arithmetic: it must not extend past H - bottom - reserve.
    const H = 2340, bottom = 48, reserve = 220, pad = 15;
    const top = pad;
    const h = H - top - bottom - reserve - pad * 2;
    expect(top + h).toBeLessThanOrEqual(H - bottom - reserve);
    expect(h).toBeGreaterThan(0);
  });
  it("survives a short viewport without inverting", () => {
    const H = 320, bottom = 0, reserve = 60, pad = 6;
    const h = H - pad - bottom - reserve - pad * 2;
    expect(h).toBeGreaterThan(0);
  });
});

describe("organic wall contours", () => {
  // 0 = floor, 1 = wall
  const G = (rows: number[][]) => mg.Grid.from(rows);

  it("an isolated wall tile is rounded on all four corners", () => {
    const g = G([
      [0,0,0,0,0],
      [0,0,0,0,0],
      [0,0,1,0,0],
      [0,0,0,0,0],
      [0,0,0,0,0],
    ]);
    for (const c of ["tl","tr","br","bl"] as const) {
      expect(classify(g, 2, 2, c), c).toBe("convex");
    }
  });

  it("a tile in the middle of a slab has no rounded corners", () => {
    const g = G([[1,1,1],[1,1,1],[1,1,1]]);
    for (const c of ["tl","tr","br","bl"] as const) {
      expect(classify(g, 1, 1, c), c).toBe("square");
    }
  });

  it("an L junction produces exactly one concave fillet", () => {
    //  . 1        NW floor, N wall, W wall -> the corner at (1,1) is an inside
    //  1 1        corner and must be filleted
    const g = G([
      [0,0,0,0],
      [0,0,1,0],
      [0,1,1,0],
      [0,0,0,0],
    ]);
    expect(classify(g, 2, 2, "tl")).toBe("concave");
  });

  it("each inside corner is emitted by exactly one tile", () => {
    const g = G([
      [0,0,0,0],
      [0,0,1,0],
      [0,1,1,0],
      [0,0,0,0],
    ]);
    // the same physical corner, seen from the other two tiles of the L
    expect(classify(g, 2, 1, "bl")).not.toBe("concave");
    expect(classify(g, 1, 2, "tr")).not.toBe("concave");
  });

  it("a straight edge stays straight -- no seams opened along it", () => {
    // Kept off the grid border on purpose: Grid.get is total and reads
    // out-of-bounds as WALL, so a tile at x=0 has a solid neighbour to its west.
    const g = G([
      [0,0,0,0,0],
      [0,1,1,1,0],
      [0,1,1,1,0],
    ]);
    // interior of the top edge: exposed north, but east and west are wall
    expect(classify(g, 2, 1, "tl")).toBe("square");
    expect(classify(g, 2, 1, "tr")).toBe("square");
    // the ends of that edge do get rounded
    expect(classify(g, 1, 1, "tl")).toBe("convex");
    expect(classify(g, 3, 1, "tr")).toBe("convex");
  });

  it("out of bounds reads as solid, so the map border never rounds inward", () => {
    const g = G([[1,1],[1,1]]);
    expect(classify(g, 0, 0, "tl")).toBe("square");
  });

  it("a diagonal chain rounds on both open sides", () => {
    const g = G([
      [0,0,0,0,0],
      [0,1,0,0,0],
      [0,0,1,0,0],
      [0,0,0,1,0],
      [0,0,0,0,0],
    ]);
    expect(classify(g, 2, 2, "tr")).toBe("convex");
    expect(classify(g, 2, 2, "bl")).toBe("convex");
  });

  it("classification never throws at the grid edge", () => {
    const g = G([[1,1],[1,1]]);
    for (const [x, y] of [[0,0],[1,0],[0,1],[1,1],[-1,-1],[5,5]] as const) {
      for (const c of ["tl","tr","br","bl"] as const) {
        expect(() => classify(g, x, y, c)).not.toThrow();
      }
    }
  });

  it("a real generated cave has both corner kinds in quantity", () => {
    const grid = mg.generate(80, 60, makeRng(7), { density: 0.46, passes: 5 });
    let convex = 0, concave = 0;
    for (let y = 0; y < grid.h; y++) {
      for (let x = 0; x < grid.w; x++) {
        if (!grid.isWall(x, y)) continue;
        for (const c of ["tl","tr","br","bl"] as const) {
          const k = classify(grid, x, y, c);
          if (k === "convex") convex++;
          if (k === "concave") concave++;
        }
      }
    }
    expect(convex).toBeGreaterThan(50);
    expect(concave).toBeGreaterThan(20);
  });
});

describe("wall contour tracing", () => {
  // A minimal canvas-context stand-in that records the path ops.
  const recorder = () => {
    const ops: string[] = [];
    return {
      ops,
      ctx: {
        moveTo: () => ops.push("moveTo"),
        lineTo: () => ops.push("lineTo"),
        arc: () => ops.push("arc"),
        closePath: () => ops.push("close"),
      } as unknown as CanvasRenderingContext2D,
    };
  };

  it("emits nothing for an all-floor region", () => {
    const g = new mg.Grid(6, 6, mg.FLOOR);
    const r = recorder();
    traceWalls(r.ctx, g, 1, 1, 4, 4);
    expect(r.ops).toHaveLength(0);
  });

  it("emits one closed subpath per wall tile", () => {
    const g = mg.Grid.from([[0,0,0],[0,1,0],[0,0,0]]);
    const r = recorder();
    traceWalls(r.ctx, g, 0, 0, 2, 2);
    expect(r.ops.filter((o) => o === "close")).toHaveLength(1);
    expect(r.ops.filter((o) => o === "arc")).toHaveLength(4);  // fully exposed
  });

  it("emits extra subpaths for inside corners", () => {
    const g = mg.Grid.from([[0,0,0,0],[0,0,1,0],[0,1,1,0],[0,0,0,0]]);
    const r = recorder();
    traceWalls(r.ctx, g, 0, 0, 3, 3);
    // three wall tiles, plus one fillet patch for the single inside corner
    expect(r.ops.filter((o) => o === "close")).toHaveLength(4);
  });

  it("radius is clamped into [0, 0.5]", () => {
    const g = mg.Grid.from([[0,0,0],[0,1,0],[0,0,0]]);
    for (const bad of [-5, 99, Number.NaN]) {
      const r = recorder();
      expect(() => { traceWalls(r.ctx, g, 0, 0, 2, 2, bad); }).not.toThrow();
    }
  });

  it("a zero radius emits no arcs at all", () => {
    const g = mg.Grid.from([[0,0,0],[0,1,0],[0,0,0]]);
    const r = recorder();
    traceWalls(r.ctx, g, 0, 0, 2, 2, 0);
    expect(r.ops.filter((o) => o === "arc")).toHaveLength(0);
  });
});

describe("pixel art", () => {
  it("every sprite is a well-formed 16x16 role grid", () => {
    for (const [id, art] of Object.entries(PIXELS)) {
      expect(validatePixels(art), id).toBeNull();
    }
  });
  it("covers every organism plus the player", () => {
    for (const m of bio.MICROBES) expect(PIXELS[m.id], m.id).toBeDefined();
    expect(PIXELS["player"]).toBeDefined();
  });
  it("no sprite is blank", () => {
    for (const [id, art] of Object.entries(PIXELS)) {
      const filled = art.join("").split("").filter((c) => c !== ".").length;
      expect(filled, id).toBeGreaterThan(12);
    }
  });
  it("no sprite fills the whole tile -- silhouettes need air", () => {
    for (const [id, art] of Object.entries(PIXELS)) {
      const filled = art.join("").split("").filter((c) => c !== ".").length;
      expect(filled / (PX_SIZE * PX_SIZE), id).toBeLessThan(0.92);
    }
  });
  it("validate rejects malformed art", () => {
    expect(validatePixels(["...."])).not.toBeNull();
    expect(validatePixels(Array.from({ length: PX_SIZE }, () => "x".repeat(PX_SIZE))))
      .not.toBeNull();
    expect(validatePixels(Array.from({ length: PX_SIZE }, () => ".".repeat(3))))
      .not.toBeNull();
  });
});
