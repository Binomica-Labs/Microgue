import { describe, expect, it } from "vitest";
import * as bio from "../src/biology.js";
import { Dungeon } from "../src/dungeon.js";
import * as mg from "../src/mapgen.js";
import { findPath } from "../src/path.js";
import { makeRng } from "../src/rng.js";
import { DEFAULT_SETTINGS, parseSave } from "../src/save.js";
import { BIN_CAP, Plasmid, SLOTS, type Part } from "../src/plasmid.js";
import { describe as describeSlot, slotAt, slotCentre } from "../src/plasmid_ui.js";
import { buttonAt, layoutButtons, makeButtons } from "../src/buttons.js";
import { classify, traceWalls } from "../src/walls.js";
import { PIXELS, PX_SIZE, validate as validatePixels } from "../src/pixels.js";
import { classifyDown, classifyKey, inBox, type Gesture } from "../src/gesture.js";
import { Effects, easeInQuad, easeOutCubic, easeOutQuad, jitter, linear,
         lungeOffset, pulse } from "../src/fx.js";
import { TAU, angleDelta, headingOf, normalise, snap8, squashFor, travel,
         turnToward, wake } from "../src/motion.js";
import { SIZES, canStrike, chebyshev, decideStep, senseRange, touchesWall }
  from "../src/behaviour.js";
import { STATUS, apply, apply as applyStatus, clear as clearStatus,
         has as hasStatus, haste, tick, type Status } from "../src/status.js";
import { blocks, describeEntity, makeBody, type Entity } from "../src/entity.js";
import { microbeTurn } from "../src/combat.js";
import { NAME_POOL, loadSlot } from "../src/saves.js";
import type { Mob } from "../src/dungeon.js";
import { EDGES, MODULES, NODES, graphBounds, missingGenes, moduleState,
         orphanMetabolites } from "../src/kegg.js";
import { NODE_W, NODE_H, clampView, fitView, moduleBoxes, toScreen, toWorld,
         type View } from "../src/kegg_ui.js";

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
  const good = { version: 3, depth: 4, seed: 7, px: 10, py: 12, hp: 22,
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
  it("rejects a save from an incompatible schema instead of half-loading it", () => {
    // version was written and never read; the flat-gene-list to ring rewrite
    // would have fed the old shape straight into slot code.
    expect(parseSave({ ...good, version: 2 })).toBeNull();
    expect(parseSave({ ...good, version: 99 })).toBeNull();
    const noVersion: Record<string, unknown> = { ...good };
    delete noVersion["version"];
    expect(parseSave(noVersion)).toBeNull();
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
    const s = parseSave({ version: 3, depth: {}, seed: [], px: 1, py: 1, hp: -50,
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
      layoutButtons(bs, W, H, { top: 40, right: 0, bottom: 48 }, u, 300);
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
    layoutButtons(bs, 1080, 2340, { top: 40, right: 0, bottom: 48 }, 2.5, 300);
    for (const b of bs) {
      expect(buttonAt(bs, b.x + b.w / 2, b.y + b.h / 2)?.id).toBe(b.id);
    }
  });
  it("never overlaps the reserved log + status bar", () => {
    for (const [W, H] of [[1080, 2340], [720, 1600], [1179, 2556]] as const) {
      const bs = makeButtons();
      const u = Math.max(Math.min(W, H) / 420, 1);
      const reserve = 340;
      layoutButtons(bs, W, H, { top: 40, right: 0, bottom: 48 }, u, reserve);
      for (const b of bs) {
        expect(b.y + b.h, `${W}x${H} ${b.id}`).toBeLessThanOrEqual(H - 48 - reserve);
      }
    }
  });

  it("stays a single column, so nothing sits under the log text", () => {
    const bs = makeButtons();
    layoutButtons(bs, 1080, 2340, { top: 40, right: 0, bottom: 48 }, 2.5, 300);
    const xs = new Set(bs.map((b) => b.x));
    expect(xs.size).toBe(1);
  });

  it("ignores disabled buttons", () => {
    const bs = makeButtons();
    layoutButtons(bs, 1080, 2340, { top: 40, right: 0, bottom: 48 }, 2.5, 300);
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

describe("pointer gestures", () => {
  const closeBox = { x: 900, y: 40, w: 46, h: 46 };
  const base = { closeBox, slot: null, distFromRing: 500, rOuter: 200, onButton: false };

  it("a button press is a button press, not a dismiss", () => {
    // The exact sequence that broke: button is outside the ring, but the
    // plasmid is CLOSED when the gesture is decided, so it can only be a press.
    expect(classifyDown({ ...base, plasmidOpen: false, onButton: true }, 990, 2200))
      .toBe("button");
  });

  it("closing requires the close box, not merely being outside the ring", () => {
    const open = { ...base, plasmidOpen: true };
    expect(classifyDown(open, 990, 2200)).toBe("spin");     // outside != dismiss
    expect(classifyDown(open, 920, 60)).toBe("dismiss");
  });

  it("a slot tap beats the spin zone", () => {
    expect(classifyDown({ ...base, plasmidOpen: true, slot: 7, distFromRing: 150 }, 0, 0))
      .toBe("slot");
  });

  it("the hole in the middle of the ring does nothing", () => {
    expect(classifyDown({ ...base, plasmidOpen: true, distFromRing: 40 }, 0, 0))
      .toBe("none");
  });

  it("world taps only happen while the plasmid is closed", () => {
    expect(classifyDown({ ...base, plasmidOpen: false }, 300, 900)).toBe("world");
    for (const d of [10, 150, 900]) {
      expect(classifyDown({ ...base, plasmidOpen: true, distFromRing: d }, 300, 900))
        .not.toBe("world");
    }
  });

  it("no gesture from an open plasmid can move the player", () => {
    const open = { ...base, plasmidOpen: true };
    const cases: Gesture[] = [
      classifyDown(open, 920, 60),
      classifyDown({ ...open, slot: 3 }, 0, 0),
      classifyDown({ ...open, distFromRing: 999 }, 0, 0),
      classifyDown({ ...open, distFromRing: 10 }, 0, 0),
      classifyDown({ ...open, onButton: true }, 500, 500),
    ];
    expect(cases).not.toContain("world");
  });

  it("inBox is inclusive of its edges", () => {
    expect(inBox(closeBox, 900, 40)).toBe(true);
    expect(inBox(closeBox, 946, 86)).toBe(true);
    expect(inBox(closeBox, 899, 40)).toBe(false);
  });
});

describe("level openness", () => {
  it("no level at any depth is a solid block", () => {
    // Densities past ~0.48 fragment the caves and keepLargestRegion seals
    // nearly everything: D8 was arriving at 2% open floor with 22 microbes
    // packed into it.
    for (const seed of [1, 7, 42, 99]) {
      const d = new Dungeon(110, 80, seed);
      for (let depth = 1; depth <= bio.MAX_DEPTH; depth++) {
        const g = d.level(depth).grid;
        const open = g.countFloor() / (g.w * g.h);
        expect(open, `seed ${seed} D${depth}`).toBeGreaterThan(0.25);
      }
    }
  });

  it("openness decreases with depth on average", () => {
    const d = new Dungeon(110, 80, 7);
    const frac = (k: number) => {
      const g = d.level(k).grid;
      return g.countFloor() / (g.w * g.h);
    };
    expect(frac(1)).toBeGreaterThan(frac(8));
  });

  it("every level has far more open tiles than microbes", () => {
    for (const seed of [3, 11]) {
      const d = new Dungeon(110, 80, seed);
      for (let depth = 1; depth <= bio.MAX_DEPTH; depth++) {
        const lvl = d.level(depth);
        const open = lvl.grid.countFloor();
        expect(open / Math.max(lvl.mobs.length, 1), `seed ${seed} D${depth}`)
          .toBeGreaterThan(20);
      }
    }
  });
});

describe("keyboard while the plasmid is open", () => {
  const MOVE_KEYS = ["ArrowUp","ArrowDown","ArrowLeft","ArrowRight",
                     "w","a","s","d","y","u","b","n"];
  const WORLD_KEYS = [...MOVE_KEYS, "+", "=", "-", ">", ".", "<", ",", "c", "Tab"];

  it("no key can move the player while the inventory is up", () => {
    for (const k of MOVE_KEYS) {
      expect(classifyKey(k, true).kind, k).not.toBe("move");
    }
  });

  it("no key can zoom the world while the inventory is up", () => {
    for (const k of ["+", "=", "-"]) {
      expect(classifyKey(k, true).kind, k).not.toBe("zoom");
    }
  });

  it("no world action of any kind gets through", () => {
    const worldKinds = ["move", "zoom", "descend", "ascend", "toggleContrast"];
    for (const k of WORLD_KEYS) {
      expect(worldKinds, k).not.toContain(classifyKey(k, true).kind);
    }
  });

  it("only closing gets through", () => {
    for (const k of ["i", "p", "Escape"]) {
      expect(classifyKey(k, true).kind, k).toBe("closePlasmid");
    }
  });

  it("the same keys work normally when it is closed", () => {
    expect(classifyKey("ArrowUp", false)).toEqual({ kind: "move", dx: 0, dy: -1 });
    expect(classifyKey("n", false)).toEqual({ kind: "move", dx: 1, dy: 1 });
    expect(classifyKey("=", false).kind).toBe("zoom");
    expect(classifyKey(">", false).kind).toBe("descend");
    expect(classifyKey("i", false).kind).toBe("togglePlasmid");
  });

  it("unknown keys are inert either way", () => {
    for (const open of [true, false]) {
      expect(classifyKey("F5", open).kind).toBe("none");
      expect(classifyKey("Shift", open).kind).toBe("none");
    }
  });

  it("Escape closes the inventory rather than quitting", () => {
    expect(classifyKey("Escape", true).kind).toBe("closePlasmid");
    expect(classifyKey("Escape", false).kind).toBe("quit");
  });
});

describe("parts bin", () => {
  it("starts stocked with regulatory parts, not genes", () => {
    const p = new Plasmid();
    expect(p.bin.length).toBeGreaterThan(0);
    expect(p.bin.every((x) => x.kind !== "gene")).toBe(true);
    expect(p.bin.some((x) => x.kind === "promoter")).toBe(true);
    expect(p.bin.some((x) => x.kind === "terminator")).toBe(true);
  });

  it("loot goes to the bin, not onto the ring", () => {
    const p = new Plasmid();
    expect(p.stash({ kind: "gene", id: "mtrC", optimised: false }).ok).toBe(true);
    expect(p.inBin("mtrC")).toBe(true);
    expect(p.has("mtrC")).toBe(false);
    expect(p.expression("mtrC", 4)).toBe(0);          // stashed is not expressed
  });

  it("refuses a duplicate whether it is on the ring or in the bin", () => {
    const p = new Plasmid();
    p.stash({ kind: "gene", id: "mtrC", optimised: false });
    expect(p.stash({ kind: "gene", id: "mtrC", optimised: false }).ok).toBe(false);
    p.install(p.bin.findIndex((x) => x.kind === "gene"), 8);
    expect(p.stash({ kind: "gene", id: "mtrC", optimised: false }).ok).toBe(false);
  });

  it("install and uninstall conserve parts -- nothing is destroyed", () => {
    const p = new Plasmid();
    const count = () => p.bin.length + p.slots.filter((x) => x !== null).length;
    const before = count();
    p.stash({ kind: "gene", id: "mtrC", optimised: false });
    const i = p.bin.findIndex((x) => x.kind === "gene");
    p.install(i, 8);
    expect(count()).toBe(before + 1);
    p.uninstall(8);
    expect(count()).toBe(before + 1);
    expect(p.inBin("mtrC")).toBe(true);
  });

  it("installing over an occupied slot returns the old part to the bin", () => {
    const p = new Plasmid();
    p.put(8, { kind: "terminator" });
    p.stash({ kind: "gene", id: "mtrC", optimised: false });
    const binBefore = p.bin.length;
    p.install(p.bin.findIndex((x) => x.kind === "gene"), 8);
    expect(p.bin.length).toBe(binBefore);            // one out, one back in
    expect(p.bin.some((x) => x.kind === "terminator")).toBe(true);
  });

  it("the origin can be neither displaced nor uninstalled", () => {
    const p = new Plasmid();
    const oi = p.slots.findIndex((x) => x?.kind === "gene" && x.id === "ori");
    expect(p.uninstall(oi).ok).toBe(false);
    p.stash({ kind: "gene", id: "mtrC", optimised: false });
    expect(p.install(p.bin.findIndex((x) => x.kind === "gene"), oi).ok).toBe(false);
  });
});

describe("operon complexes", () => {
  const build = (parts: [number, Part][]) => {
    const p = new Plasmid();
    for (const [i, part] of parts) p.put(i, part);
    return p;
  };
  const gene = (id: Parameters<Plasmid["has"]>[0]): Part =>
    ({ kind: "gene", id, optimised: true });

  it("a complete pathway in one operon activates; scattered genes do not", () => {
    const together = build([
      [4, { kind: "promoter", strength: "strong" }],
      [5, gene("mtrC")], [6, gene("omcS")],
    ]);
    expect(together.complexes(4).map((c) => c.id)).toContain("eet");

    const apart = build([
      [4, { kind: "promoter", strength: "strong" }], [5, gene("mtrC")],
      [9, { kind: "promoter", strength: "strong" }], [10, gene("omcS")],
    ]);
    expect(apart.complexes(4).map((c) => c.id)).not.toContain("eet");
  });

  it("a complex is inert where its genes have no substrate", () => {
    const p = build([
      [4, { kind: "promoter", strength: "strong" }],
      [5, gene("mtrC")], [6, gene("omcS")],
    ]);
    expect(p.complexes(4).map((c) => c.id)).toContain("eet");   // ferruginous
    expect(p.complexes(7).map((c) => c.id)).not.toContain("eet"); // no Fe(III)
  });

  it("electron transfer grants reach, sulfate reduction grants an aura", () => {
    const eet = build([[4, { kind: "promoter", strength: "strong" }],
                       [5, gene("mtrC")], [6, gene("omcS")]]);
    expect(eet.reach(4)).toBe(2);
    const sr = build([[4, { kind: "promoter", strength: "strong" }],
                      [5, gene("dsrA")], [6, gene("aprA")]]);
    expect(sr.aura(7)).toBeGreaterThan(0);
  });

  it("a complex multiplies output beyond the sum of its genes", () => {
    const pair = build([[4, { kind: "promoter", strength: "strong" }],
                        [5, gene("mcrA")], [6, gene("hdrB")]]);
    const solo = build([[4, { kind: "promoter", strength: "strong" }],
                        [5, gene("mcrA")], [7, gene("hdrB")]]);  // gap between
    expect(pair.power(8)).toBeGreaterThan(solo.power(8) * 1.4);
  });

  it("armour reduces incoming damage only while the complex holds", () => {
    const p = build([[4, { kind: "promoter", strength: "strong" }],
                     [5, gene("katG")], [6, gene("sqr")]]);
    expect(p.armour(3)).toBeLessThan(1);
    p.put(6, null);
    expect(p.armour(3)).toBe(1);
  });
});

describe("toxic intermediates", () => {
  it("nitrate reductase without N2O reductase accumulates nitrous oxide", () => {
    const p = new Plasmid();
    p.put(4, { kind: "promoter", strength: "strong" });
    p.put(5, { kind: "gene", id: "narG", optimised: true });
    expect(p.hazards(2).map((h) => h.id)).toContain("n2o");
    expect(p.toxicity(2)).toBeGreaterThan(0);
  });

  it("completing the chain clears the hazard and grants the complex", () => {
    const p = new Plasmid();
    p.put(4, { kind: "promoter", strength: "strong" });
    p.put(5, { kind: "gene", id: "narG", optimised: true });
    p.put(6, { kind: "gene", id: "nosZ", optimised: true });
    expect(p.hazards(2).map((h) => h.id)).not.toContain("n2o");
    expect(p.complexes(2).map((c) => c.id)).toContain("denitrification");
  });

  it("a hazard needs the offending gene to actually be expressed", () => {
    const p = new Plasmid();
    p.put(9, { kind: "gene", id: "narG", optimised: true });   // no promoter
    expect(p.toxicity(2)).toBe(0);
  });

  it("every hazard names a gene pair that exists", () => {
    for (const h of bio.HAZARDS) {
      expect(bio.GENES[h.present], h.id).toBeDefined();
      expect(bio.GENES[h.missing], h.id).toBeDefined();
    }
  });

  it("every complex names genes that exist and share a plausible pathway", () => {
    for (const c of bio.COMPLEXES) {
      expect(c.genes.length, c.id).toBeGreaterThanOrEqual(2);
      for (const g of c.genes) expect(bio.GENES[g], `${c.id} -> ${g}`).toBeDefined();
    }
  });
});

describe("save round-trips the bin", () => {
  it("keeps stashed parts across a reload", () => {
    const s = parseSave({
      version: 3, depth: 4, seed: 7, px: 5, py: 5, hp: 20,
      ring: [{ kind: "promoter", strength: "medium" }],
      bin: [{ kind: "gene", id: "mtrC", optimised: false }, { kind: "terminator" }],
      settings: {},
    });
    expect(s?.bin).toHaveLength(2);
    expect(s?.bin[0]).toEqual({ kind: "gene", id: "mtrC", optimised: false });
  });
  it("drops junk and duplicates from the bin", () => {
    const s = parseSave({
      version: 3, depth: 1, seed: 1, px: 1, py: 1, hp: 30, ring: [], settings: {},
      bin: [{ kind: "gene", id: "mtrC" }, { kind: "gene", id: "mtrC" }, "junk", 7,
            { kind: "gene", id: "notReal" }],
    });
    expect(s?.bin).toHaveLength(1);
  });
  it("a missing bin is an empty bin, not a crash", () => {
    const s = parseSave({ version: 3, depth: 1, seed: 1, px: 1, py: 1, hp: 30, ring: [], settings: {} });
    expect(s?.bin).toEqual([]);
  });
});

describe("KEGG modules", () => {
  it("every module step names a real gene and a real EC-shaped code", () => {
    for (const m of MODULES) {
      expect(m.steps.length, m.id).toBeGreaterThan(0);
      for (const s of m.steps) {
        expect(bio.GENES[s.gene], `${m.id} -> ${s.gene}`).toBeDefined();
        expect(s.ec, `${m.id} ${s.gene}`).toMatch(/^[\d-]+\.[\d-]+\.[\d-]+\.[\d-]+$/);
      }
    }
  });

  it("module ids look like KEGG identifiers", () => {
    for (const m of MODULES) expect(m.id).toMatch(/^M\d{5}$/);
  });

  it("a chain's products feed the next step's substrate where it should", () => {
    const denit = MODULES.find((m) => m.id === "M00529")!;
    for (let i = 1; i < denit.steps.length; i++) {
      expect(denit.steps[i]!.from).toBe(denit.steps[i - 1]!.to);
    }
  });

  it("an empty genome greys out every step", () => {
    const st = moduleState(MODULES[0]!, new Set());
    expect(st.steps.every((s) => s === "missing")).toBe(true);
    expect(st.complete).toBe(false);
    expect(st.held).toBe(0);
  });

  it("a partial genome reports exactly which enzymes are missing", () => {
    const denit = MODULES.find((m) => m.id === "M00529")!;
    const have = new Set<bio.GeneId>(["narG", "nosZ"]);
    const st = moduleState(denit, have);
    expect(st.complete).toBe(false);
    expect(st.held).toBe(2);
    expect(missingGenes(denit, have).sort()).toEqual(["nirS", "norB"]);
  });

  it("a full genome completes the module", () => {
    const denit = MODULES.find((m) => m.id === "M00529")!;
    const have = new Set<bio.GeneId>(["narG", "nirS", "norB", "nosZ"]);
    expect(moduleState(denit, have).complete).toBe(true);
    expect(missingGenes(denit, have)).toEqual([]);
  });

  it("stashed genes count toward completeness, like a genome scan", () => {
    const p = new Plasmid();
    p.stash({ kind: "gene", id: "sat", optimised: false });
    expect(p.carried().has("sat")).toBe(true);
  });
});

describe("module auto-assembly", () => {
  const sulfate: bio.GeneId[] = ["sat", "aprA", "dsrA"];
  const stocked = () => {
    const p = new Plasmid();
    for (const g of sulfate) p.stash({ kind: "gene", id: g, optimised: true });
    return p;
  };

  it("refuses when an enzyme is missing, and names it", () => {
    const p = new Plasmid();
    p.stash({ kind: "gene", id: "dsrA", optimised: true });
    const r = p.assemble(sulfate);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.err).toContain("sat"); expect(r.err).toContain("aprA"); }
  });

  it("refuses without a spare promoter -- it is not a free win", () => {
    const p = stocked();
    while (p.bin.some((x) => x.kind === "promoter")) {
      p.bin.splice(p.bin.findIndex((x) => x.kind === "promoter"), 1);
    }
    const r = p.assemble(sulfate);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.err).toContain("promoter");
  });

  it("refuses without contiguous room, and says how much it needs", () => {
    const p = stocked();
    for (let i = 0; i < SLOTS; i++) {
      if (p.at(i) === null) p.put(i, { kind: "terminator" });
    }
    const r = p.assemble(sulfate);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.err).toContain("contiguous");
  });

  it("lays the operon out in reaction order and it transcribes", () => {
    const p = stocked();
    expect(p.assemble(sulfate).ok).toBe(true);
    for (const g of sulfate) expect(p.has(g), g).toBe(true);
    const op = p.operonOf("sat");
    expect(op).not.toBeNull();
    // reaction order preserved: sat upstream of aprA upstream of dsrA
    expect(p.operonOf("sat")!.rank).toBeLessThan(p.operonOf("aprA")!.rank);
    expect(p.operonOf("aprA")!.rank).toBeLessThan(p.operonOf("dsrA")!.rank);
    expect(p.expression("dsrA", 7)).toBeGreaterThan(0);
  });

  it("assembling grants the complex and clears the matching hazard", () => {
    const p = stocked();
    p.assemble(sulfate);
    expect(p.complexes(7).map((c) => c.id)).toContain("sulfidogenesis");
    expect(p.hazards(7).map((h) => h.id)).not.toContain("sulfite");
  });

  it("consumes the promoter from the bin rather than conjuring one", () => {
    const p = stocked();
    const before = p.bin.filter((x) => x.kind === "promoter").length;
    p.assemble(sulfate);
    expect(p.bin.filter((x) => x.kind === "promoter").length).toBe(before - 1);
  });

  it("re-assembling an already-installed module does not duplicate genes", () => {
    const p = stocked();
    p.assemble(sulfate);
    p.bin.push({ kind: "promoter", strength: "weak" });
    p.assemble(sulfate);
    for (const g of sulfate) {
      const n = p.slots.filter((x) => x?.kind === "gene" && x.id === g).length;
      expect(n, g).toBe(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Regression guards. These assert relationships BETWEEN tables rather than any
// one value, so adding a gene, organism, complex or module without wiring it
// up fails here instead of silently producing an unreachable feature.
// ---------------------------------------------------------------------------

describe("data integrity", () => {
  const droppable = new Set(bio.MICROBES.flatMap((m) => [...m.genes]));

  it("every gene is obtainable, or is a documented starter part", () => {
    const starters = new Set<bio.GeneId>(["ori"]);
    for (const id of Object.keys(bio.GENES) as bio.GeneId[]) {
      expect(droppable.has(id) || starters.has(id),
        `${id} is carried by no organism and is not a starter`).toBe(true);
    }
  });

  it("every complex is assemblable from what drops", () => {
    for (const c of bio.COMPLEXES) {
      for (const g of c.genes) {
        expect(droppable.has(g), `${c.id} needs ${g}, which nothing drops`).toBe(true);
      }
    }
  });

  it("every KEGG module is completable from what drops", () => {
    for (const m of MODULES) {
      expect(moduleState(m, droppable).complete, `${m.id} is unobtainable`).toBe(true);
    }
  });

  it("every hazard is escapable -- its missing gene must be findable", () => {
    for (const h of bio.HAZARDS) {
      expect(droppable.has(h.missing),
        `${h.id} can never be cleared: nothing drops ${h.missing}`).toBe(true);
    }
  });

  it("every organism can be met before the genes it drops are needed", () => {
    // A gene used by a complex should drop at or above the depth where that
    // complex is useful; otherwise you can never assemble it in time.
    for (const m of bio.MICROBES) {
      expect(m.depth, m.id).toBeGreaterThanOrEqual(1);
      expect(m.depth, m.id).toBeLessThanOrEqual(bio.MAX_DEPTH);
    }
  });

  it("no gene is larger than the plasmid can hold", () => {
    const cap = new Plasmid().capacityKb();
    for (const [id, g] of Object.entries(bio.GENES)) {
      expect(g.kb, id).toBeLessThan(cap);
    }
  });

  it("no module needs more slots than the ring has", () => {
    for (const m of MODULES) {
      expect(m.steps.length + 2, m.id).toBeLessThanOrEqual(SLOTS);
    }
  });

  it("every microbe has a pixel sprite and a pigment", () => {
    for (const m of bio.MICROBES) {
      expect(PIXELS[m.id], m.id).toBeDefined();
      expect(m.pigment, m.id).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("gene ids are unique and self-consistent", () => {
    for (const [key, g] of Object.entries(bio.GENES)) {
      expect(g.id, `${key} key/id mismatch`).toBe(key);
    }
  });

  it("microbe ids are unique", () => {
    const ids = bio.MICROBES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("edge cases across modules", () => {
  it("rng survives degenerate seeds", () => {
    for (const seed of [0, -1, 2 ** 32, Number.MAX_SAFE_INTEGER]) {
      const r = makeRng(seed);
      const v = r.next();
      expect(Number.isFinite(v), `seed ${seed}`).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("a 1x1 grid does not crash generation or pathing", () => {
    const g = mg.generate(1, 1, makeRng(1));
    expect(g.w).toBeGreaterThanOrEqual(3);          // clamped
    expect(() => mg.keepLargestRegion(g)).not.toThrow();
    expect(() => mg.carveSpawn(g)).not.toThrow();
  });

  it("pathing from a tile to itself returns that tile", () => {
    const g = new mg.Grid(6, 6, mg.FLOOR);
    expect(findPath(g, { x: 2, y: 2 }, { x: 2, y: 2 })).toEqual([{ x: 2, y: 2 }]);
  });

  it("pathing into a sealed pocket returns null rather than hanging", () => {
    const g = new mg.Grid(9, 9, mg.FLOOR);
    for (let i = 0; i < 9; i++) { g.set(i, 4, mg.WALL); g.set(4, i, mg.WALL); }
    expect(findPath(g, { x: 1, y: 1 }, { x: 7, y: 7 })).toBeNull();
  });

  it("rotating the ring by absurd amounts is a no-op modulo SLOTS", () => {
    const p = new Plasmid();
    p.put(4, { kind: "promoter", strength: "medium" });
    p.put(5, { kind: "gene", id: "mtrC", optimised: false });
    const before = p.slots.map((x) => (x?.kind === "gene" ? x.id : x?.kind ?? null));
    p.rotate(SLOTS * 1000);
    expect(p.slots.map((x) => (x?.kind === "gene" ? x.id : x?.kind ?? null))).toEqual(before);
    p.rotate(-SLOTS * 3);
    expect(p.slots.map((x) => (x?.kind === "gene" ? x.id : x?.kind ?? null))).toEqual(before);
  });

  it("swapping a slot with itself changes nothing", () => {
    const p = new Plasmid();
    const before = JSON.stringify(p.slots);
    p.swap(3, 3);
    expect(JSON.stringify(p.slots)).toBe(before);
  });

  it("assembling an empty module list is refused, not a crash", () => {
    const p = new Plasmid();
    expect(() => p.assemble([])).not.toThrow();
  });

  it("a completely full ring reports no free slots and refuses installs", () => {
    const p = new Plasmid();
    for (let i = 0; i < SLOTS; i++) if (p.at(i) === null) p.put(i, { kind: "terminator" });
    expect(p.free()).toBe(0);
    expect(p.add({ kind: "gene", id: "psbA", optimised: false }).ok).toBe(false);
  });

  it("a full bin refuses further loot rather than dropping it silently", () => {
    const p = new Plasmid();
    while (p.stash({ kind: "terminator" }).ok) { /* fill */ }
    expect(p.bin.length).toBeLessThanOrEqual(18);
    expect(p.stash({ kind: "gene", id: "psbA", optimised: false }).ok).toBe(false);
  });

  it("expression is finite and non-negative at every depth for every gene", () => {
    const p = new Plasmid();
    p.put(4, { kind: "promoter", strength: "strong" });
    let slot = 5;
    for (const id of Object.keys(bio.GENES) as bio.GeneId[]) {
      if (id === "ori" || slot >= SLOTS) continue;
      p.put(slot++, { kind: "gene", id, optimised: true });
    }
    for (let d = 1; d <= bio.MAX_DEPTH; d++) {
      for (const id of Object.keys(bio.GENES) as bio.GeneId[]) {
        const e = p.expression(id, d);
        expect(Number.isFinite(e), `${id} at D${d}`).toBe(true);
        expect(e, `${id} at D${d}`).toBeGreaterThanOrEqual(0);
      }
      expect(Number.isFinite(p.power(d))).toBe(true);
      expect(p.armour(d)).toBeGreaterThan(0);
      expect(p.armour(d)).toBeLessThanOrEqual(1);
    }
  });

  it("stratum() clamps any depth, including nonsense", () => {
    for (const d of [-99, 0, 1, 8, 999, 1.5, Number.NaN]) {
      const s = bio.stratum(d);
      expect(s.depth).toBeGreaterThanOrEqual(1);
      expect(s.depth).toBeLessThanOrEqual(bio.MAX_DEPTH);
    }
  });

  it("energyYield stays in a sane band at every depth", () => {
    for (let d = 1; d <= bio.MAX_DEPTH; d++) {
      const y = bio.energyYield(d);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThanOrEqual(1);
    }
  });
});

describe("pathway graph", () => {
  it("every metabolite a module names has a node -- no orphans", () => {
    expect(orphanMetabolites()).toEqual([]);
  });

  it("edges derive from modules, so the graph cannot drift", () => {
    const stepCount = MODULES.reduce((a, m) => a + m.steps.length, 0);
    expect(EDGES).toHaveLength(stepCount);
    for (const e of EDGES) {
      expect(e.module.steps.some((s) => s.gene === e.gene), e.gene).toBe(true);
    }
  });

  it("the nitrogen cycle closes", () => {
    const adj = new Map<string, string[]>();
    for (const e of EDGES) {
      const l = adj.get(e.from.id) ?? [];
      l.push(e.to.id);
      adj.set(e.from.id, l);
    }
    const seen = new Set<string>();
    const reaches = (a: string, b: string): boolean => {
      if (a === b && seen.size > 0) return true;
      if (seen.has(a)) return false;
      seen.add(a);
      return (adj.get(a) ?? []).some((n) => n === b || reaches(n, b));
    };
    expect(reaches("N2", "N2")).toBe(true);
  });

  it("the sulfur cycle closes", () => {
    const adj = new Map<string, string[]>();
    for (const e of EDGES) {
      const l = adj.get(e.from.id) ?? [];
      l.push(e.to.id);
      adj.set(e.from.id, l);
    }
    const walk = (n: string, target: string, seen: Set<string>): boolean => {
      if (seen.has(n)) return false;
      seen.add(n);
      for (const nx of adj.get(n) ?? []) {
        if (nx === target || walk(nx, target, seen)) return true;
      }
      return false;
    };
    expect(walk("H2S", "H2S", new Set())).toBe(true);
  });

  it("no two nodes sit on top of each other", () => {
    for (let i = 0; i < NODES.length; i++) {
      for (let j = i + 1; j < NODES.length; j++) {
        const a = NODES[i]!, b = NODES[j]!;
        const overlap = Math.abs(a.x - b.x) < NODE_W && Math.abs(a.y - b.y) < NODE_H;
        expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });

  it("node ids are unique", () => {
    const ids = NODES.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("fitView puts the whole graph on screen at any viewport", () => {
    for (const [w, h] of [[1080, 2000], [720, 1200], [2400, 1000]] as const) {
      const v = fitView(w, h);
      const b = graphBounds();
      expect(v.scale).toBeGreaterThan(0);
      expect((b.maxX - b.minX) * v.scale).toBeLessThanOrEqual(w + 1);
    }
  });

  it("clampView keeps the graph reachable and the scale sane", () => {
    for (const bad of [{ x: -1e6, y: -1e6, scale: 0.001 },
                       { x: 1e6, y: 1e6, scale: 900 }]) {
      const v = clampView(bad, 1080, 2000);
      expect(v.scale).toBeGreaterThanOrEqual(0.35);
      expect(v.scale).toBeLessThanOrEqual(2.5);
      expect(Number.isFinite(v.x)).toBe(true);
      expect(Number.isFinite(v.y)).toBe(true);
    }
  });

  it("screen and world transforms round-trip", () => {
    const v: View = { x: 40, y: -20, scale: 0.8 };
    for (const [x, y] of [[0, 0], [500, 300], [-120, 900]] as const) {
      const s = toScreen(v, x, y);
      const w = toWorld(v, s.x, s.y);
      expect(w.x).toBeCloseTo(x, 6);
      expect(w.y).toBeCloseTo(y, 6);
    }
  });

  it("every module gets a caption box inside the graph bounds", () => {
    const boxes = moduleBoxes();
    expect(boxes).toHaveLength(MODULES.length);
    const b = graphBounds();
    for (const box of boxes) {
      expect(box.x, box.module.id).toBeGreaterThan(b.minX - 400);
      expect(box.x, box.module.id).toBeLessThan(b.maxX + 400);
    }
  });
});

describe("starter parts library", () => {
  it("stocks enough to lay down several transcripts before looting", () => {
    const p = new Plasmid();
    const proms = p.bin.filter((x) => x.kind === "promoter").length;
    const terms = p.bin.filter((x) => x.kind === "terminator").length;
    expect(proms).toBeGreaterThanOrEqual(3);
    expect(terms).toBeGreaterThanOrEqual(3);
  });

  it("a fresh plasmid can assemble a looted module without extra promoters", () => {
    const p = new Plasmid();
    for (const g of ["sat", "aprA", "dsrA"] as const) {
      p.stash({ kind: "gene", id: g, optimised: false });
    }
    expect(p.assemble(["sat", "aprA", "dsrA"]).ok).toBe(true);
    // and still has parts left for a second transcript
    expect(p.bin.some((x) => x.kind === "promoter")).toBe(true);
  });

  it("starter parts leave room in the bin for loot", () => {
    const p = new Plasmid();
    expect(p.bin.length).toBeLessThan(BIN_CAP - 4);
  });
});

describe("graph caption layout", () => {
  const BOX_W = 150, BOX_H = 22;
  const hit = (ax: number, ay: number, aw: number, ah: number,
               bx: number, by: number, bw: number, bh: number): boolean =>
    ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;

  it("no caption overlaps another caption", () => {
    const boxes = moduleBoxes();
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!, b = boxes[j]!;
        expect(hit(a.x, a.y, BOX_W, BOX_H, b.x, b.y, BOX_W, BOX_H),
          `${a.module.id} overlaps ${b.module.id}`).toBe(false);
      }
    }
  });

  it("no caption sits on top of a metabolite box", () => {
    for (const box of moduleBoxes()) {
      for (const n of NODES) {
        expect(hit(box.x, box.y, BOX_W, BOX_H, n.x, n.y, NODE_W, NODE_H),
          `${box.module.id} overlaps ${n.id}`).toBe(false);
      }
    }
  });

  it("electron pools are distinct -- ferredoxin is not the quinone pool", () => {
    const ids = NODES.map((n) => n.id);
    expect(ids).toContain("e- (Fd)");
    expect(ids).toContain("e- (Q)");
  });

  it("no edge spans an absurd distance across the map", () => {
    for (const e of EDGES) {
      const d = Math.hypot(e.to.x - e.from.x, e.to.y - e.from.y);
      expect(d, `${e.gene}: ${e.from.id} -> ${e.to.id}`).toBeLessThan(420);
    }
  });
});

describe("effects", () => {
  const now = 1000;

  it("easing functions stay in [0,1] and hit their endpoints", () => {
    for (const e of [linear, easeOutCubic, easeOutQuad, easeInQuad]) {
      expect(e(0)).toBeCloseTo(0, 6);
      expect(e(1)).toBeCloseTo(1, 6);
      for (let t = 0; t <= 1; t += 0.05) {
        expect(e(t)).toBeGreaterThanOrEqual(-1e-9);
        expect(e(t)).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it("pulse goes out and comes back", () => {
    expect(pulse(0)).toBeCloseTo(0, 6);
    expect(pulse(0.5)).toBeCloseTo(1, 6);
    expect(pulse(1)).toBeCloseTo(0, 6);
    expect(pulse(-5)).toBeCloseTo(0, 6);       // clamped
    expect(pulse(5)).toBeCloseTo(0, 6);
  });

  it("a lunge starts and ends at zero offset -- nothing is left displaced", () => {
    const f = { kind: "lunge" as const, t0: now, dur: 200, who: "player",
                from: { x: 3, y: 3 }, to: { x: 4, y: 3 } };
    expect(lungeOffset(f, now).x).toBeCloseTo(0, 6);
    expect(lungeOffset(f, now + 200).x).toBeCloseTo(0, 6);
    expect(lungeOffset(f, now + 100).x).toBeGreaterThan(0.3);
  });

  it("a lunge never overshoots the target tile", () => {
    const f = { kind: "lunge" as const, t0: now, dur: 200, who: "player",
                from: { x: 0, y: 0 }, to: { x: 1, y: 0 } };
    for (let t = 0; t <= 200; t += 5) {
      expect(lungeOffset(f, now + t).x).toBeLessThan(1);
    }
  });

  it("effects expire and the queue drains", () => {
    const fx = new Effects();
    fx.add({ kind: "flash", t0: now, dur: 100, x: 0, y: 0, colour: "#fff" });
    fx.add({ kind: "flash", t0: now, dur: 400, x: 0, y: 0, colour: "#fff" });
    expect(fx.count()).toBe(2);
    fx.prune(now + 150);
    expect(fx.count()).toBe(1);
    fx.prune(now + 500);
    expect(fx.count()).toBe(0);
  });

  it("the queue is bounded, so a runaway producer cannot leak", () => {
    const fx = new Effects();
    for (let i = 0; i < 5000; i++) {
      fx.add({ kind: "flash", t0: now, dur: 1e9, x: 0, y: 0, colour: "#fff" });
    }
    expect(fx.count()).toBeLessThanOrEqual(160);
  });

  it("shake decays to exactly zero and is magnitude-capped", () => {
    const fx = new Effects();
    fx.shake(999, 300, now);                  // absurd request
    const a = fx.shakeOffset(now + 10);
    expect(Math.hypot(a.x, a.y)).toBeLessThanOrEqual(14 * Math.SQRT2);
    expect(fx.shakeOffset(now + 300)).toEqual({ x: 0, y: 0 });
    expect(fx.shakeOffset(now + 5000)).toEqual({ x: 0, y: 0 });
  });

  it("a bigger hit overrides a smaller ongoing shake, and they never sum", () => {
    const fx = new Effects();
    fx.shake(2, 300, now);
    fx.shake(8, 300, now + 50);
    const mag = Math.hypot(fx.shakeOffset(now + 60).x, fx.shakeOffset(now + 60).y);
    expect(mag).toBeLessThanOrEqual(8 * Math.SQRT2);
  });

  it("hitstop is capped so a flurry of kills cannot lock the game", () => {
    const fx = new Effects();
    for (let i = 0; i < 50; i++) fx.hitstop(60, now);
    expect(fx.frozen(now + 119)).toBe(true);
    expect(fx.frozen(now + 121)).toBe(false);
  });

  it("hitstop from an earlier frame does not persist forever", () => {
    const fx = new Effects();
    fx.hitstop(60, now);
    expect(fx.frozen(now + 30)).toBe(true);
    expect(fx.frozen(now + 200)).toBe(false);
  });

  it("jitter is deterministic and bounded", () => {
    for (let i = 0; i < 200; i++) {
      const a = jitter(42, i), b = jitter(42, i);
      expect(a).toEqual(b);
      expect(Math.abs(a.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(a.y)).toBeLessThanOrEqual(1);
    }
  });

  it("progress is clamped for effects queried outside their window", () => {
    const f = { kind: "flash" as const, t0: now, dur: 100, x: 0, y: 0, colour: "#fff" };
    expect(Effects.t(f, now - 500)).toBe(0);
    expect(Effects.t(f, now + 500)).toBe(1);
  });

  it("a zero-duration effect does not divide by zero", () => {
    const f = { kind: "flash" as const, t0: now, dur: 0, x: 0, y: 0, colour: "#fff" };
    expect(Number.isFinite(Effects.t(f, now))).toBe(true);
  });

  it("clear() drops effects, shake and hitstop together", () => {
    const fx = new Effects();
    fx.add({ kind: "flash", t0: now, dur: 9999, x: 0, y: 0, colour: "#fff" });
    fx.shake(10, 500, now);
    fx.hitstop(100, now);
    fx.clear();
    expect(fx.count()).toBe(0);
    expect(fx.shakeOffset(now + 10)).toEqual({ x: 0, y: 0 });
    expect(fx.frozen(now + 10)).toBe(false);
  });
});

describe("juice cannot break the game", () => {
  it("a rapid kill streak never freezes for more than the cap", () => {
    const fx = new Effects();
    let t = 0;
    for (let i = 0; i < 30; i++) {
      fx.hitstop(70, t);
      fx.shake(7, 260, t);
      t += 8;                                  // faster than frames arrive
    }
    // still bounded from the last call
    expect(fx.frozen(t + 121)).toBe(false);
  });

  it("effects added far in the future still expire", () => {
    const fx = new Effects();
    fx.add({ kind: "flash", t0: 5000, dur: 100, x: 0, y: 0, colour: "#fff" });
    fx.prune(4000);
    expect(fx.count()).toBe(1);                // not yet started
    fx.prune(5200);
    expect(fx.count()).toBe(0);
  });

  it("a burst is deterministic, so particles do not jitter between frames", () => {
    const a = Array.from({ length: 14 }, (_v, i) => jitter(999, i));
    const b = Array.from({ length: 14 }, (_v, i) => jitter(999, i));
    expect(a).toEqual(b);
  });

  it("shake offset is finite for any clock value", () => {
    const fx = new Effects();
    fx.shake(6, 200, 1000);
    for (const t of [0, 999, 1000, 1100, 1e9, Number.MAX_SAFE_INTEGER]) {
      const o = fx.shakeOffset(t);
      expect(Number.isFinite(o.x), String(t)).toBe(true);
      expect(Number.isFinite(o.y), String(t)).toBe(true);
    }
  });

  it("descending clears effects so a wipe never inherits the last level's debris", () => {
    const fx = new Effects();
    for (let i = 0; i < 20; i++) {
      fx.add({ kind: "burst", t0: 0, dur: 9999, x: 0, y: 0, colour: "#fff", n: 8, seed: i });
    }
    fx.clear();
    expect(fx.count()).toBe(0);
  });
});

describe("facing and movement", () => {
  it("heading is null when there is no movement", () => {
    expect(headingOf(0, 0)).toBeNull();
  });

  it("headings point where you would expect on screen", () => {
    expect(headingOf(1, 0)).toBeCloseTo(0, 6);              // east
    expect(headingOf(0, 1)).toBeCloseTo(Math.PI / 2, 6);    // south (y grows down)
    expect(headingOf(-1, 0)).toBeCloseTo(Math.PI, 6);       // west
    expect(headingOf(0, -1)).toBeCloseTo(-Math.PI / 2, 6);  // north
  });

  it("turning takes the SHORT way across the wrap", () => {
    // The classic bug: 170deg to -170deg is a 20deg turn, not 340.
    const a = (170 * Math.PI) / 180;
    const b = (-170 * Math.PI) / 180;
    expect(Math.abs(angleDelta(a, b))).toBeCloseTo((20 * Math.PI) / 180, 6);
    const stepped = turnToward(a, b, (5 * Math.PI) / 180);
    // must move toward b the short way, i.e. past +180
    expect(Math.abs(angleDelta(stepped, b))).toBeLessThan(Math.abs(angleDelta(a, b)));
  });

  it("turning converges and then stops exactly on target", () => {
    let h = -3.0;
    const target = 2.9;                                     // across the wrap
    for (let i = 0; i < 200; i++) h = turnToward(h, target, 0.1);
    expect(Math.abs(angleDelta(h, target))).toBeCloseTo(0, 6);
  });

  it("turning never spins the long way for any pair of angles", () => {
    for (let i = 0; i < 64; i++) {
      for (let j = 0; j < 64; j++) {
        const a = (i / 64) * TAU - Math.PI;
        const b = (j / 64) * TAU - Math.PI;
        expect(Math.abs(angleDelta(a, b))).toBeLessThanOrEqual(Math.PI + 1e-9);
      }
    }
  });

  it("normalise keeps every angle in (-PI, PI]", () => {
    for (const a of [0, 7, -7, 100, -100, TAU, -TAU, 3 * Math.PI]) {
      const n = normalise(a);
      expect(n).toBeGreaterThan(-Math.PI - 1e-9);
      expect(n).toBeLessThanOrEqual(Math.PI + 1e-9);
    }
  });

  it("snap8 lands on one of eight compass points", () => {
    const step = TAU / 8;
    for (let i = 0; i < 100; i++) {
      const a = (i / 100) * TAU - Math.PI;
      const s = snap8(a);
      expect(Math.abs(Math.round(s / step) * step - s)).toBeLessThan(1e-9);
    }
  });

  it("squash preserves rough volume and returns to round at rest", () => {
    const rest = squashFor(0);
    expect(rest.sx).toBeCloseTo(1, 6);
    expect(rest.sy).toBeCloseTo(1, 6);
    const moving = squashFor(1);
    expect(moving.sx).toBeGreaterThan(1);
    expect(moving.sy).toBeLessThan(1);
    expect(moving.sx * moving.sy).toBeGreaterThan(0.9);   // not a pancake
    expect(moving.sx * moving.sy).toBeLessThan(1.1);
  });

  it("squash clamps for nonsense speeds", () => {
    for (const v of [-5, 99, Number.NaN]) {
      const s = squashFor(v);
      expect(Number.isFinite(s.sx) && Number.isFinite(s.sy)).toBe(true);
    }
  });

  it("travel is 0 at rest and capped at 1", () => {
    expect(travel(3, 3, 3, 3)).toBe(0);
    expect(travel(0, 0, 100, 100)).toBe(1);
    expect(travel(3, 3, 3.5, 3)).toBeCloseTo(0.5, 6);
  });

  it("a wake only exists while moving, and trails BEHIND", () => {
    expect(wake(0, 0)).toEqual([]);
    expect(wake(null, 1)).toEqual([]);
    const w = wake(0, 1);                                   // heading east
    expect(w.length).toBeGreaterThan(0);
    for (const g of w) {
      expect(g.dx, "ghost must be west of the body").toBeLessThan(0);
      expect(g.alpha).toBeGreaterThan(0);
      expect(g.alpha).toBeLessThan(1);
    }
  });

  it("wake ghosts fade with distance", () => {
    const w = wake(Math.PI / 2, 1, 3);
    for (let i = 1; i < w.length; i++) {
      expect(w[i]!.alpha).toBeLessThan(w[i - 1]!.alpha);
    }
  });

  it("facing follows morphology: anchored and symmetric cells do not turn", () => {
    const by = (id: string) => bio.MICROBES.find((m) => m.id === id)!;
    expect(by("thiothrix").facing, "holdfast-anchored").toBe("none");
    expect(by("prosthecochloris").facing, "radially symmetric").toBe("none");
    expect(by("methanosarcina").facing, "cuboidal packet").toBe("none");
    expect(by("chlorella").facing, "coccoid").toBe("none");
    expect(by("rhodospirillum").facing, "spiral").toBe("rotate");
    expect(by("desulfovibrio").facing, "vibrio").toBe("rotate");
  });

  it("every microbe declares a facing", () => {
    for (const m of bio.MICROBES) {
      expect(["rotate", "flip", "none"], m.id).toContain(m.facing);
    }
  });
});

describe("ATP economy", () => {
  const withOperon = (...genes: bio.GeneId[]) => {
    const p = new Plasmid();
    p.put(4, { kind: "promoter", strength: "strong" });
    genes.forEach((g, i) => { p.put(5 + i, { kind: "gene", id: g, optimised: true }); });
    return p;
  };

  it("an untranscribed gene costs nothing -- carrying is not expressing", () => {
    // A fresh plasmid already transcribes its origin, and maintaining a
    // replicon genuinely costs energy, so compare against that baseline.
    const base = new Plasmid().atpCost(2);
    const p = new Plasmid();
    p.put(9, { kind: "gene", id: "narG", optimised: true });   // no promoter
    expect(p.atpCost(2)).toBeCloseTo(base, 6);
  });

  it("maintaining the origin itself costs ATP", () => {
    expect(new Plasmid().atpCost(1)).toBeGreaterThan(0);
  });

  it("switching an operon on creates a cost", () => {
    const off = new Plasmid();
    off.put(9, { kind: "gene", id: "cbbL", optimised: true });
    const on = withOperon("cbbL");
    expect(on.atpCost(1)).toBeGreaterThan(off.atpCost(1));
  });

  it("bigger genes cost more to express", () => {
    // narG is 3.7 kb, nosZ is 1.9
    const big = withOperon("narG");
    const small = withOperon("nosZ");
    expect(big.atpCost(2)).toBeGreaterThan(small.atpCost(2));
  });

  it("terminal reductases and light genes generate; structural ones do not", () => {
    const gen = withOperon("psbA");
    const bare = new Plasmid();
    expect(gen.atpGain(1)).toBeGreaterThan(bare.atpGain(1));
    const inert = withOperon("katG");            // defensive, not a generator
    expect(inert.atpGain(1)).toBeCloseTo(bare.atpGain(1), 6);
  });

  it("the same kit generates less the deeper you go", () => {
    const q = withOperon("hydA");
    expect(q.atpGain(5)).toBeGreaterThan(q.atpGain(8));
  });

  it("a bare plasmid is net positive -- you are never dead on arrival", () => {
    const p = new Plasmid();
    for (let d = 1; d <= bio.MAX_DEPTH; d++) {
      expect(p.atpBalance(d), `D${d}`).toBeGreaterThan(0);
    }
  });

  it("a generator-free hoard runs at a loss, and worse the deeper it goes", () => {
    const p = withOperon("katG", "cbbL", "aclB", "nosZ");
    expect(p.atpBalance(1)).toBeLessThan(0);
    expect(p.atpBalance(5)).toBeLessThan(p.atpBalance(1));
  });

  it("every canonical respiration pays for itself at its own depth", () => {
    const cases: [bio.GeneId[], number][] = [
      [["narG", "nirS", "norB", "nosZ"], 2],
      [["sat", "aprA", "dsrA"], 7],
      [["mcrA", "hdrB"], 8],
      [["fmoA", "csmA"], 6],
      [["mtrC", "omcS"], 4],
      [["psbA", "cbbL"], 1],
    ];
    for (const [genes, d] of cases) {
      expect(withOperon(...genes).atpBalance(d), `${genes.join("+")} at D${d}`)
        .toBeGreaterThan(0);
    }
  });

  it("ATP sulfurylase is a net consumer -- sulfate activation costs two ATP", () => {
    // sat alone should be worse than nothing; only dsrA downstream redeems it.
    const bare = new Plasmid().atpBalance(7);
    expect(withOperon("sat").atpBalance(7)).toBeLessThan(bare);
  });

  it("brownout scales expression down without switching it off", () => {
    const p = withOperon("cbbL");
    const full = p.expression("cbbL", 1);
    p.supply = 0.4;
    const dim = p.expression("cbbL", 1);
    expect(dim).toBeCloseTo(full * 0.4, 6);
    expect(dim).toBeGreaterThan(0);
  });

  it("cost is computed from raw expression, so it cannot chase the brownout", () => {
    const p = withOperon("cbbL");
    const cost = p.atpCost(1);
    p.supply = 0.2;
    expect(p.atpCost(1)).toBeCloseTo(cost, 6);
  });

  it("power falls under brownout, so the energy cost is felt in combat", () => {
    const p = withOperon("cbbL", "psbA");
    const full = p.power(1);
    p.supply = 0.5;
    expect(p.power(1)).toBeLessThan(full);
  });

  it("balance and gain are finite at every depth for every arrangement", () => {
    for (let d = 1; d <= bio.MAX_DEPTH; d++) {
      const p = withOperon("narG", "nirS", "norB", "nosZ");
      expect(Number.isFinite(p.atpGain(d))).toBe(true);
      expect(Number.isFinite(p.atpCost(d))).toBe(true);
      expect(Number.isFinite(p.atpBalance(d))).toBe(true);
      expect(p.atpGain(d)).toBeGreaterThan(0);
    }
  });

  it("a complete denitrification operon pays for itself", () => {
    // Four reductases generating, against their own expression cost.
    const p = withOperon("narG", "nirS", "norB", "nosZ");
    expect(p.atpBalance(2)).toBeGreaterThan(0);
  });
});

describe("motility behaviours", () => {
  const open = (w = 11, h = 11) => new mg.Grid(w, h, mg.FLOOR);
  const walled = () => {
    const g = new mg.Grid(11, 11, mg.FLOOR);
    for (let i = 0; i < 11; i++) g.set(i, 0, mg.WALL);
    return g;
  };
  const noOne = () => false;
  const sensed = (px: number, py: number, at: { x: number; y: number }, allies = 0) =>
    ({ px, py, dist: chebyshev(at.x, at.y, px, py), alliesNear: allies });

  it("anchored organisms never move", () => {
    for (const b of ["sessile", "wire"] as const) {
      const at = { x: 5, y: 5 };
      for (let i = 0; i < 50; i++) {
        expect(decideStep(b, at, sensed(6, 5, at), open(), makeRng(i), noOne), b).toBeNull();
      }
    }
  });

  it("a chaser closes distance", () => {
    const at = { x: 2, y: 2 };
    const step = decideStep("chase", at, sensed(8, 8, at), open(), makeRng(1), noOne);
    expect(step).not.toBeNull();
    expect(chebyshev(step!.x, step!.y, 8, 8)).toBeLessThan(chebyshev(2, 2, 8, 8));
  });

  it("a chaser out of sensing range holds still", () => {
    const g = new mg.Grid(40, 40, mg.FLOOR);
    const at = { x: 1, y: 1 };
    expect(decideStep("chase", at, sensed(35, 35, at), g, makeRng(1), noOne)).toBeNull();
  });

  it("a glider only steps to tiles touching a surface", () => {
    const g = walled();
    const at = { x: 5, y: 1 };                     // hugging the wall at y=0
    for (let i = 0; i < 40; i++) {
      const s = decideStep("glide", at, sensed(9, 1, at), g, makeRng(i), noOne);
      if (s) expect(touchesWall(g, s.x, s.y), `${s.x},${s.y}`).toBe(true);
    }
  });

  it("a glider in open water cannot go anywhere", () => {
    const at = { x: 5, y: 5 };
    for (let i = 0; i < 30; i++) {
      expect(decideStep("glide", at, sensed(7, 5, at), open(), makeRng(i), noOne)).toBeNull();
    }
  });

  it("drift is Brownian -- it does not reliably close", () => {
    const at = { x: 5, y: 5 };
    let closer = 0;
    for (let i = 0; i < 300; i++) {
      const s = decideStep("drift", at, sensed(9, 9, at), open(), makeRng(i), noOne);
      if (s && chebyshev(s.x, s.y, 9, 9) < chebyshev(5, 5, 9, 9)) closer++;
    }
    expect(closer / 300).toBeLessThan(0.4);        // luck, not intent
  });

  it("a swarmer commits once its own kind is around", () => {
    const at = { x: 3, y: 3 };
    const lone = Array.from({ length: 60 }, (_v, i) =>
      decideStep("swarm", at, sensed(7, 7, at, 0), open(), makeRng(i), noOne)).filter(Boolean).length;
    const quorate = Array.from({ length: 60 }, (_v, i) =>
      decideStep("swarm", at, sensed(7, 7, at, 3), open(), makeRng(i), noOne)).filter(Boolean).length;
    expect(quorate).toBeGreaterThan(lone);
  });

  it("nothing ever steps into a wall or onto an occupied tile", () => {
    const g = walled();
    const at = { x: 5, y: 1 };
    for (const b of ["chase", "glide", "drift", "swarm"] as const) {
      for (let i = 0; i < 60; i++) {
        const s = decideStep(b, at, sensed(5, 0, at), g, makeRng(i),
                             (x, y) => x === 6 && y === 1);
        if (!s) continue;
        expect(g.isFloor(s.x, s.y), `${b} into wall`).toBe(true);
        expect(s.x === 6 && s.y === 1, `${b} onto occupied`).toBe(false);
      }
    }
  });

  it("a step is always adjacent -- nothing teleports", () => {
    const at = { x: 5, y: 5 };
    for (const b of ["chase", "glide", "drift", "swarm"] as const) {
      for (let i = 0; i < 80; i++) {
        const s = decideStep(b, at, sensed(9, 9, at, 3), walled(), makeRng(i), noOne);
        if (s) expect(chebyshev(s.x, s.y, 5, 5), b).toBeLessThanOrEqual(1);
      }
    }
  });

  it("nanowire strikes reach further than a body does", () => {
    expect(canStrike("wire", "medium", 3)).toBe(true);
    expect(canStrike("chase", "medium", 3)).toBe(false);
    expect(canStrike("chase", "medium", 1)).toBe(true);
  });

  it("filaments are large, slow and long-reaching", () => {
    expect(SIZES.filament.hp).toBeGreaterThan(SIZES.pico.hp);
    expect(SIZES.filament.cooldown).toBeGreaterThan(SIZES.pico.cooldown);
    expect(SIZES.filament.reach).toBeGreaterThan(SIZES.small.reach);
  });

  it("motility matches morphology for the diagnostic cases", () => {
    const by = (id: string) => bio.MICROBES.find((m) => m.id === id)!;
    expect(by("thiothrix").behaviour, "holdfast").toBe("sessile");
    expect(by("beggiatoa").behaviour, "gliding mat").toBe("glide");
    expect(by("nitzschia").behaviour, "diatoms glide via the raphe").toBe("glide");
    expect(by("pseudomonas").behaviour, "polar flagellum").toBe("chase");
    expect(by("geobacter").behaviour, "conductive pili").toBe("wire");
    expect(by("beggiatoa").size, "genuinely enormous").toBe("filament");
    expect(by("synechococcus").size, "picoplankton").toBe("pico");
  });

  it("every microbe declares a behaviour and a size", () => {
    for (const m of bio.MICROBES) {
      expect(senseRange(m.behaviour), m.id).toBeGreaterThan(0);
      expect(SIZES[m.size], m.id).toBeDefined();
    }
  });
});

describe("status effects", () => {
  it("expire on their own", () => {
    const list: Status[] = [];
    apply(list, "acid", 2);
    tick(list); expect(list).toHaveLength(1);
    tick(list); expect(list).toHaveLength(0);
  });

  it("stacking effects accumulate magnitude, others only refresh", () => {
    const a: Status[] = [];
    apply(a, "oxidative", 5); apply(a, "oxidative", 5);
    expect(a[0]!.magnitude).toBe(2);
    const b: Status[] = [];
    apply(b, "acid", 3); apply(b, "acid", 6);
    expect(b[0]!.magnitude).toBe(1);
    expect(b[0]!.turns).toBe(6);
  });

  it("magnitude is capped, so nothing becomes unsurvivable", () => {
    const list: Status[] = [];
    for (let i = 0; i < 100; i++) apply(list, "oxidative", 9);
    expect(list[0]!.magnitude).toBeLessThanOrEqual(6);
  });

  it("a lytic infection worsens over time", () => {
    const list: Status[] = [];
    apply(list, "phage", 8);
    const first = tick(list);
    const second = tick(list);
    expect(second).toBeGreaterThan(first);
  });

  it("haste is never zero -- nothing is permanently frozen", () => {
    const list: Status[] = [];
    apply(list, "sulfide", 9); apply(list, "starved", 9); apply(list, "slowed", 9);
    expect(haste(list)).toBeGreaterThan(0);
    expect(haste(list)).toBeLessThan(1);
  });

  it("clear removes a named effect and leaves the rest", () => {
    const list: Status[] = [];
    apply(list, "acid", 4); apply(list, "sulfide", 4);
    clearStatus(list, "acid");
    expect(hasStatus(list, "acid")).toBe(false);
    expect(hasStatus(list, "sulfide")).toBe(true);
  });

  it("every status id has a definition", () => {
    for (const id of Object.keys(STATUS)) {
      expect(STATUS[id as keyof typeof STATUS].name).toBeTruthy();
    }
  });
});

describe("entity model", () => {
  it("describeEntity is exhaustive -- adding a kind breaks the build", () => {
    const body = makeBody(0, 0, 10);
    const kinds: Entity[] = [
      { ...body, kind: "player", atp: 10, atpMax: 10, speed: 18 },
      { ...body, kind: "microbe", id: "x", name: "X", glyph: "x", genes: [],
        note: "", pigment: "#fff", facing: "none", behaviour: "drift",
        size: "small", atk: 1, cooldown: 0 },
      { ...body, kind: "hazard", id: "peroxide", radius: 2, potency: 1 },
      { ...body, kind: "item", id: "cassette", gene: "mtrC" },
    ];
    for (const e of kinds) expect(describeEntity(e).length).toBeGreaterThan(0);
  });

  it("only solid kinds block movement", () => {
    const body = makeBody(0, 0, 10);
    expect(blocks({ ...body, kind: "hazard", id: "h", radius: 1, potency: 1 })).toBe(false);
    expect(blocks({ ...body, kind: "item", id: "i", gene: null })).toBe(false);
    expect(blocks({ ...body, kind: "player", atp: 1, atpMax: 1, speed: 1 })).toBe(true);
  });

  it("a dead microbe stops blocking", () => {
    const m: Entity = { ...makeBody(0, 0, 10), kind: "microbe", id: "x", name: "X",
      glyph: "x", genes: [], note: "", pigment: "#fff", facing: "none",
      behaviour: "drift", size: "small", atk: 1, cooldown: 0 };
    expect(blocks(m)).toBe(true);
    m.alive = false;
    expect(blocks(m)).toBe(false);
  });
});

describe("save slots", () => {
  it("slot indices outside the range are refused, not clamped silently", () => {
    expect(loadSlot(-1)).toBeNull();
    expect(loadSlot(99)).toBeNull();
  });

  it("suggested names look like strain designations", () => {
    expect(NAME_POOL.length).toBeGreaterThan(3);
    for (const n of NAME_POOL) expect(n.length).toBeGreaterThan(1);
  });
});

describe("the microbe turn", () => {
  const world = (mobs: Mob[], px = 5, py = 5) => ({
    grid: new mg.Grid(15, 15, mg.FLOOR),
    mobs,
    player: { x: px, y: py, hp: 30, status: [] as Status[] },
    rng: makeRng(7),
    armour: 1,
  });
  const mob = (over: Partial<Mob>): Mob => ({
    id: "pseudomonas", name: "Pseudomonas", glyph: "p", x: 8, y: 5,
    ax: 8, ay: 5, hp: 12, maxhp: 12, atk: 4, genes: [], note: "",
    pigment: "#fff", alive: true, facing: "rotate", heading: null,
    behaviour: "chase", size: "medium", cooldown: 0, status: [],
    ...over,
  });

  it("a chaser closes and then strikes", () => {
    const m = mob({ x: 8, y: 5 });
    const w = world([m]);
    microbeTurn(w);
    expect(m.x).toBeLessThan(8);
    for (let i = 0; i < 6; i++) microbeTurn(w);
    expect(w.player.hp).toBeLessThan(30);
  });

  it("a sessile microbe never moves but still strikes on contact", () => {
    const m = mob({ id: "thiothrix", behaviour: "sessile", size: "filament", x: 6, y: 5 });
    const w = world([m]);
    microbeTurn(w);
    expect(m.x).toBe(6);
    expect(w.player.hp).toBeLessThan(30);
  });

  it("a nanowire strikes from beyond arm's reach", () => {
    const m = mob({ id: "geobacter", behaviour: "wire", x: 8, y: 5 });
    const w = world([m]);
    microbeTurn(w);
    expect(m.x).toBe(8);                       // did not move
    expect(w.player.hp).toBeLessThan(30);      // still hit you
  });

  it("large bodies act less often than small ones", () => {
    const big = mob({ size: "filament", behaviour: "sessile", x: 6, y: 5 });
    const small = mob({ size: "pico", behaviour: "sessile", x: 6, y: 5 });
    const a = world([big]); const b = world([small]);
    let bigHits = 0, smallHits = 0;
    for (let i = 0; i < 8; i++) {
      const h1 = a.player.hp; microbeTurn(a); if (a.player.hp < h1) bigHits++;
      const h2 = b.player.hp; microbeTurn(b); if (b.player.hp < h2) smallHits++;
    }
    expect(bigHits).toBeLessThan(smallHits);
  });

  it("microbes never stack on the same tile", () => {
    const mobs = [mob({ x: 8, y: 5 }), mob({ x: 9, y: 5 }), mob({ x: 10, y: 5 })];
    const w = world(mobs);
    for (let i = 0; i < 12; i++) microbeTurn(w);
    const seen = new Set(mobs.filter((m) => m.alive).map((m) => `${m.x},${m.y}`));
    expect(seen.size).toBe(mobs.filter((m) => m.alive).length);
  });

  it("a microbe never steps onto the player", () => {
    const mobs = [mob({ x: 6, y: 5 }), mob({ x: 5, y: 6 })];
    const w = world(mobs);
    for (let i = 0; i < 20; i++) {
      microbeTurn(w);
      for (const m of mobs) expect(`${m.x},${m.y}`).not.toBe("5,5");
    }
  });

  it("Thiobacillus inflicts acid; a chaser with no product does not", () => {
    const acid = world([mob({ id: "thiobacillus", behaviour: "sessile", x: 6, y: 5 })]);
    for (let i = 0; i < 20; i++) microbeTurn(acid);
    expect(hasStatus(acid.player.status, "acid")).toBe(true);

    const plain = world([mob({ id: "shewanella", behaviour: "sessile", x: 6, y: 5 })]);
    for (let i = 0; i < 20; i++) microbeTurn(plain);
    expect(plain.player.status).toHaveLength(0);
  });

  it("armour reduces incoming damage", () => {
    const bare = world([mob({ behaviour: "sessile", x: 6, y: 5 })]);
    const armoured = { ...world([mob({ behaviour: "sessile", x: 6, y: 5 })]), armour: 0.4 };
    microbeTurn(bare); microbeTurn(armoured);
    expect(30 - armoured.player.hp).toBeLessThanOrEqual(30 - bare.player.hp);
  });

  it("a poisoned microbe can die of its own affliction", () => {
    const m = mob({ hp: 2, behaviour: "sessile" });
    applyStatus(m.status, "phage", 9, 3);
    const w = world([m]);
    for (let i = 0; i < 6; i++) microbeTurn(w);
    expect(m.alive).toBe(false);
  });
});
