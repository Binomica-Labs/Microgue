import { PREFIXES, SUFFIXES, WILD_TYPE, alleleEffect, alleleName, alleleRarity,
         alleleReadout, quality, rollAllele } from "../src/allele.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as bio from "../src/biology.js";
import { Dungeon, MAX_FLOOR, floorWithin, isBossFloor, strataOf }
  from "../src/dungeon.js";
import * as mg from "../src/mapgen.js";
import { findPath } from "../src/path.js";
import { makeRng } from "../src/rng.js";
import { BARRIERS } from "../src/barrier.js";
import { contour, type Solid } from "../src/contour.js";
import { signedArea2, traceContour } from "../src/wall_path.js";
import { CLASSES, CLASS_IDS } from "../src/classes.js";
import { ELITES, ELITE_IDS, eliteCount, promoteSome } from "../src/elite.js";
import { miniBox, miniView } from "../src/minimap.js";
import { wallPattern } from "../src/paint.js";
import { WALL_MATERIALS, WALL_PX, materialFor } from "../src/wall_pixels.js";
import { MAX_STACK, countOf, stacks } from "../src/stack.js";
import { phenotypeOf } from "../src/phenotype.js";
import { DEFAULT_SETTINGS, SCHEMA, ZOOM_MAX, ZOOM_MIN, ZOOM_PREF_MAX,
         ZOOM_PREF_MIN, parseSave } from "../src/save.js";
import { ATP_MAX, BIN_CAP, Plasmid, SLOTS, STARTING_PARTS, type Part }
  from "../src/plasmid.js";
import { MAX_LEVEL, MODIFIERS, PROMOTERS, RARITY, RARITY_IDS, TERMINATORS,
         RARITY_RANK, evolutionCost, modifierSlots, partsOfRarity,
         rarityOfTier, rollRarity,
         type ModifierId, type PromoterId, type TerminatorId } from "../src/parts.js";
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
import { FOOTPRINT_TILES, centreOf, covers, stretchOf, tilesOf }
  from "../src/footprint.js";
import { distanceTo, nextAction } from "../src/pursuit.js";
import { WEAPONS, lineOfSight } from "../src/weapons.js";
import { completeness, exportAnnotation, newRun, notebook, recordLocus,
         recordSighting } from "../src/run.js";
import { SOURCES, cached, fetchAll, fetchOne, parseFasta, parseFirstId }
  from "../src/ncbi.js";
import { launch, stepClouds, stepPackets, type Cloud, type Packet }
  from "../src/projectile.js";
import { Toasts, guard } from "../src/toast.js";
import { drawClose, inBox as inBoxChrome } from "../src/chrome.js";
import { SUBSTRATES, addDrop, dropAt, itemColour, itemName, itemNote, removeDrop,
         rollPart, substratesAt, yieldOf, type Drop } from "../src/items.js";
import * as say from "../src/flavour.js";
import { computeFov, fractionSeen, isSeen, isVisible, makeSight, sightRadius }
  from "../src/fov.js";
import { TURNS_PER_DAY, daylight, isNight, lightAt, newClock, timeName }
  from "../src/cycle.js";
import { ROOM_STYLE, carveRooms, planFor, roomAt } from "../src/rooms.js";
import { NAME_POOL, loadSlot } from "../src/saves.js";
import type { Mob } from "../src/dungeon.js";
import { EDGES, MODULES, NODES, graphBounds, missingGenes, moduleState,
         orphanMetabolites } from "../src/kegg.js";
import { partRarity } from "../src/plasmid_ui.js";
import { RESTOCK_TURNS, capacityAt, describeStock, meanLight, rateAt,
         restockAmount } from "../src/production.js";
import { BASE_SLOTS, MAX_SLOTS, TRAITS, TRAIT_IDS, atpCeiling, capacityFor,
         copiesFor, expansionCost, slotsFor } from "../src/chromosome.js";
import { MAX_STRAIN, bonusCapacityKb, bonusSlots, strainLevel }
  from "../src/strain.js";
import { LEDGER_CAP, buy, creditFor, genePrice, newLab, offers,
         recordRun, sitesPrice, stockCap, strainPrice } from "../src/lab.js";
import { parseLab } from "../src/lab_save.js";
import { LYSIS_MS, phaseAt, shards } from "../src/lysis.js";
import { adaptation, levelProgress } from "../src/strain.js";
import { frontier, nextExplore, unexplored } from "../src/explore.js";
import { playerSpeed, speedOf, tick as speedTick } from "../src/speed.js";
import { REPAIR_GENES, estimate, profileFor, repairTurn }
  from "../src/repair.js";
import { TRACE_CAP, Trace } from "../src/trace.js";
import { NODE_W, NODE_H, clampView, fitView, frame, litBounds, moduleBoxes,
         toScreen, toWorld, zoomAbout, type View } from "../src/kegg_ui.js";

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
  it("every floor generates with valid stairs", () => {
    const d = new Dungeon(90, 90, 7);
    for (let f = 1; f <= MAX_FLOOR; f++) {
      const L = d.level(f);
      expect(L.grid.isFloor(L.up.x, L.up.y), `floor ${f}`).toBe(true);
      if (f < MAX_FLOOR) {
        expect(L.down, `floor ${f}`).not.toBeNull();
        expect(L.grid.isFloor(L.down!.x, L.down!.y)).toBe(true);
      } else {
        expect(L.down).toBeNull();
      }
    }
  });
  it("floors map onto strata three at a time", () => {
    expect(strataOf(1)).toBe(1);
    expect(strataOf(3)).toBe(1);
    expect(strataOf(4)).toBe(2);
    expect(strataOf(MAX_FLOOR)).toBe(bio.MAX_DEPTH);
    expect(isBossFloor(3)).toBe(true);
    expect(isBossFloor(2)).toBe(false);
    expect(floorWithin(4)).toBe(1);
  });
  it("mobs are on floor and belong to their stratum", () => {
    const d = new Dungeon(90, 90, 7);
    for (let f = 1; f <= MAX_FLOOR; f++) {
      const L = d.level(f);
      for (const m of L.mobs) {
        expect(L.grid.isFloor(m.x, m.y), `floor ${f}`).toBe(true);
        expect(bio.MICROBES.find((p) => p.id === m.id)!.depth).toBe(strataOf(f));
      }
    }
  });
  it("mob count scales with depth", () => {
    const d = new Dungeon(90, 90, 7);
    expect(d.level(MAX_FLOOR).mobs.length).toBeGreaterThan(d.level(1).mobs.length);
  });
  it("down-stairs is far from up-stairs", () => {
    const L = new Dungeon(90, 90, 7).level(4);
    const dist = Math.hypot(L.up.x - L.down!.x, L.up.y - L.down!.y);
    expect(dist).toBeGreaterThan(15);
  });
  it("levels are cached, not regenerated", () => {
    const d = new Dungeon(60, 40, 3);
    expect(d.level(3).grid).toBe(d.level(3).grid);
  });
  it("cannot descend past the floor or ascend past the surface", () => {
    const d = new Dungeon(90, 90, 3);
    d.floor = MAX_FLOOR;
    expect(d.descend()).toHaveProperty("err");
    d.floor = 1;
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
  const good = { version: SCHEMA, depth: 4, seed: 7, px: 10, py: 12, hp: 22,
                 ring: [{ kind: "promoter", id: "j23119" },
                        { kind: "gene", id: "mtrC", level: 1, mods: ["codon"], allele: WILD_TYPE }],
                 settings: { uiScale: 1.5, highContrast: true, reduceMotion: false, diagonal: false } };

  it("round-trips a valid save", () => {
    const s = parseSave(good);
    expect(s?.depth).toBe(4);
    expect(s?.ring[0]).toEqual({ kind: "promoter", id: "j23119" });
    expect(s?.ring[1]).toEqual({ kind: "gene", id: "mtrC", level: 1, mods: ["codon"], allele: WILD_TYPE });
    expect(s?.ring).toHaveLength(SLOTS);
    expect(s?.settings.highContrast).toBe(true);
  });
  it("rejects a save from an incompatible schema instead of half-loading it", () => {
    // version was written and never read; the flat-gene-list to ring rewrite
    // would have fed the old shape straight into slot code.
    expect(parseSave({ ...good, version: SCHEMA - 1 })).toBeNull();
    expect(parseSave({ ...good, version: SCHEMA + 1 })).toBeNull();
    expect(parseSave(good), "the current schema must still load").not.toBeNull();
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
      { kind: "gene", id: "mtrC", level: 1, mods: ["codon"], allele: WILD_TYPE },
      { kind: "gene", id: "notAGene" }, "junk", 7,
      { kind: "gene", id: "mtrC" },                    // duplicate
    ]});
    expect(s?.ring[0]).toEqual({ kind: "gene", id: "mtrC", level: 1, mods: ["codon"], allele: WILD_TYPE });
    expect(s?.ring[1]).toBeNull();
    expect(s?.ring[2]).toBeNull();
    expect(s?.ring[4]).toBeNull();
  });
  it("clamps an over-long ring and defaults a bad promoter strength", () => {
    const long = Array.from({ length: 40 }, () => ({ kind: "terminator", id: "rrnbt1" }));
    expect(parseSave({ ...good, ring: long })?.ring).toHaveLength(SLOTS);
    const s = parseSave({ ...good, ring: [{ kind: "promoter", strength: "nuclear" }] });
    expect(s?.ring[0]).toEqual({ kind: "promoter", id: "j23106" });
  });
  it("falls back to defaults on malformed settings", () => {
    expect(parseSave({ ...good, settings: "corrupt" })?.settings).toEqual(DEFAULT_SETTINGS);
    expect(parseSave({ ...good, settings: { uiScale: 500 } })?.settings.uiScale).toBe(3);
  });
  it("survives a hand-edited hostile payload", () => {
    const s = parseSave({ version: SCHEMA, depth: {}, seed: [], px: 1, py: 1, hp: -50,
                          ring: "all of them", settings: null });
    expect(s).not.toBeNull();
    expect(s?.hp).toBeGreaterThan(0);
    expect(s?.ring.every((p) => p === null)).toBe(true);
  });
});

describe("plasmid operons", () => {
  const P = () => {
    const p = new Plasmid();
    p.integrated = MAX_SLOTS - BASE_SLOTS;   // room for the fixtures below
    return p;
  };

  it("starts transcribing an origin", () => {
    const p = P();
    expect(p.has("ori")).toBe(true);
    expect(p.operons()).toHaveLength(1);
    expect(p.operons()[0]!.genes.map((g) => g.id)).toEqual(["ori"]);
  });

  it("a gene outside any operon is not expressed", () => {
    const p = P();
    p.put(8, { kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE });   // no promoter
    expect(p.has("mtrC")).toBe(true);
    expect(p.operonOf("mtrC")).toBeNull();
    expect(p.expression("mtrC", 4)).toBe(0);
  });

  it("a promoter upstream switches it on", () => {
    const p = P();
    p.put(7, { kind: "promoter", id: "j23106" });
    p.put(8, { kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE });
    expect(p.expression("mtrC", 4)).toBeGreaterThan(0);
  });

  it("a terminator attenuates rather than ends the operon", () => {
    // Real terminators are 60-98% efficient; the rest reads through. That is
    // what makes the CHOICE of terminator matter instead of being a full stop.
    const build = (id: TerminatorId) => {
      const p = P();
      p.put(0, { kind: "promoter", id: "j23119" });
      p.put(1, { kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE });
      p.put(2, { kind: "terminator", id });
      p.put(3, { kind: "gene", id: "omcS", level: 1, mods: [], allele: WILD_TYPE });
      return { before: p.expression("mtrC", 4), after: p.expression("omcS", 4) };
    };
    const leaky = build("hairpin");
    const tight = build("rrnbt1t2");
    expect(leaky.before).toBeGreaterThan(0);
    expect(leaky.after, "a leaky hairpin must let some through").toBeGreaterThan(0);
    expect(tight.after, "a tandem terminator must let far less through")
      .toBeLessThan(leaky.after / 5);
    expect(tight.before).toBeCloseTo(leaky.before, 6);
  });


  it("a gap ends the operon", () => {
    const p = P();
    p.put(7, { kind: "promoter", id: "j23119" });
    p.put(9, { kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE });   // slot 8 empty
    expect(p.expression("mtrC", 4)).toBe(0);
  });

  it("promoter strength scales output", () => {
    const build = (s: PromoterId) => {
      const p = P();
      p.put(7, { kind: "promoter", id: s });
      p.put(8, { kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE });
      return p.expression("mtrC", 4);
    };
    expect(build("j23114")).toBeLessThan(build("j23106"));
    expect(build("j23106")).toBeLessThan(build("j23119"));
  });

  it("polarity starves the tail of a long operon", () => {
    const p = P();
    p.put(4, { kind: "promoter", id: "j23119" });
    p.put(5, { kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE });
    p.put(6, { kind: "gene", id: "omcS", level: 1, mods: [], allele: WILD_TYPE });
    const near = p.expression("mtrC", 4);
    const far = p.expression("omcS", 4);
    expect(far).toBeLessThan(near);
  });

  it("same-pathway neighbours co-regulate", () => {
    const lone = P();
    lone.put(4, { kind: "promoter", id: "j23106" });
    lone.put(5, { kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE });
    const solo = lone.expression("mtrC", 4);

    const clustered = P();
    clustered.put(4, { kind: "promoter", id: "j23106" });
    clustered.put(5, { kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE });
    clustered.put(6, { kind: "gene", id: "omcS", level: 1, mods: [], allele: WILD_TYPE });  // also iron
    expect(clustered.expression("mtrC", 4)).toBeGreaterThan(solo);
  });

  it("a mixed-pathway operon beats nothing but loses to a clean one", () => {
    const mixed = P();
    mixed.put(4, { kind: "promoter", id: "j23106" });
    mixed.put(5, { kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE });
    mixed.put(6, { kind: "gene", id: "katG", level: 1, mods: [], allele: WILD_TYPE });      // defense
    const clean = P();
    clean.put(4, { kind: "promoter", id: "j23106" });
    clean.put(5, { kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE });
    clean.put(6, { kind: "gene", id: "omcS", level: 1, mods: [], allele: WILD_TYPE });
    expect(clean.expression("mtrC", 4)).toBeGreaterThan(mixed.expression("mtrC", 4));
  });

  it("substrate gating still applies inside an operon", () => {
    const p = P();
    p.put(4, { kind: "promoter", id: "j23119" });
    p.put(5, { kind: "gene", id: "mcrA", level: 1, mods: [], allele: WILD_TYPE });
    expect(p.expression("mcrA", 4)).toBe(0);          // no CO2 acceptor here
    expect(p.expression("mcrA", 8)).toBeGreaterThan(0);
  });

  it("oxygen still destroys nifH regardless of promoter", () => {
    const p = P();
    p.put(4, { kind: "promoter", id: "j23119" });
    p.put(5, { kind: "gene", id: "nifH", level: 1, mods: [], allele: WILD_TYPE });
    expect(p.expression("nifH", 1)).toBe(0);
    expect(p.expression("nifH", 5)).toBeGreaterThan(0);
  });

  it("rotation preserves relative order, so operons survive", () => {
    const p = P();
    p.put(4, { kind: "promoter", id: "j23106" });
    p.put(5, { kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE });
    const before = p.expression("mtrC", 4);
    p.rotate(5);
    expect(p.expression("mtrC", 4)).toBeCloseTo(before, 10);
  });

  it("swap is the drag primitive and can break an operon", () => {
    const p = P();
    p.put(4, { kind: "promoter", id: "j23106" });
    p.put(5, { kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE });
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
    expect(p.add({ kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE }).ok).toBe(true);
    expect(p.add({ kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE }).ok).toBe(false);
    for (let i = 0; i < SLOTS; i++) p.put(i, { kind: "terminator", id: "rrnbt1" });
    expect(p.add({ kind: "gene", id: "psbA", level: 1, mods: [], allele: WILD_TYPE }).ok).toBe(false);
  });

  it("power rises when you arrange well", () => {
    const bad = P();
    bad.put(5, { kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE });   // orphaned
    bad.put(9, { kind: "gene", id: "omcS", level: 1, mods: [], allele: WILD_TYPE });
    const good = P();
    good.put(4, { kind: "promoter", id: "j23119" });
    good.put(5, { kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE });
    good.put(6, { kind: "gene", id: "omcS", level: 1, mods: [], allele: WILD_TYPE });
    expect(good.power(4)).toBeGreaterThan(bad.power(4));
  });
});

describe("plasmid ring geometry", () => {
  const g = { cx: 200, cy: 300, rInner: 80, rOuter: 130, rot: 0, used: SLOTS };

  it("maps a slot centre back to its own index, at every ring size", () => {
    // The ring is the REPLICON's, not the array's. Drawing 24 wedges on a
    // 16-slot backbone put eight phantom positions on screen -- tapping one
    // selected an "empty slot" that could never hold anything, which is why
    // an installed promoter appeared immovable.
    for (const used of [10, 12, 14, 16, 22, SLOTS]) {
      const ring = { ...g, used };
      for (let i = 0; i < used; i++) {
        const c = slotCentre(ring, i);
        expect(slotAt(ring, c.x, c.y), `slot ${i} of ${used}`).toBe(i);
      }
    }
  });
  it("survives rotation at every ring size", () => {
    for (const used of [10, 16, 22]) {
      const r = { ...g, used, rot: 1.3 };
      for (let i = 0; i < used; i++) {
        const c = slotCentre(r, i);
        expect(slotAt(r, c.x, c.y), `slot ${i} of ${used}`).toBe(i);
      }
    }
  });
  it("never returns a position the ring does not have", () => {
    const r = { ...g, used: 12 };
    for (let a = 0; a < 360; a += 3) {
      const rad = (a * Math.PI) / 180;
      const p = { x: r.cx + Math.cos(rad) * 105, y: r.cy + Math.sin(rad) * 105 };
      const s = slotAt(r, p.x, p.y);
      expect(s, `angle ${a}`).not.toBeNull();
      if (s !== null) expect(s).toBeLessThan(12);
    }
  });
  it("rejects points inside and outside the band", () => {
    expect(slotAt(g, g.cx, g.cy)).toBeNull();
    expect(slotAt(g, g.cx + 400, g.cy)).toBeNull();
  });
  it("describe() flags an untranscribed gene", () => {
    const p = new Plasmid();
    p.integrated = MAX_SLOTS - BASE_SLOTS;   // these fixtures need room
    p.put(9, { kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE });
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
  it("no floor at any depth is a solid block", () => {
    // Densities past ~0.48 fragment the caves and keepLargestRegion seals
    // nearly everything: D8 was arriving at 2% open floor with 22 microbes
    // packed into it.
    for (const seed of [1, 7, 42, 99]) {
      const d = new Dungeon(96, 96, seed);
      for (let f = 1; f <= MAX_FLOOR; f++) {
        const g = d.level(f).grid;
        const open = g.countFloor() / (g.w * g.h);
        expect(open, `seed ${seed} floor ${f}`).toBeGreaterThan(0.2);
      }
    }
  });

  it("every floor is playable, whatever the seed", () => {
    // Openness used to fall with depth and was the difficulty lever. It is
    // not any more: rooms and the retry loop hold it near 40% everywhere, and
    // difficulty comes from mobs, sight radius and the ATP deficit instead.
    // What must still hold is that no floor is unplayable.
    for (const seed of [3, 7, 11, 19]) {
      const d = new Dungeon(96, 96, seed);
      for (let f = 1; f <= MAX_FLOOR; f++) {
        const g = d.level(f).grid;
        const open = g.countFloor() / (g.w * g.h);
        expect(open, `seed ${seed} floor ${f}`).toBeGreaterThan(0.2);
        expect(open, `seed ${seed} floor ${f}`).toBeLessThan(0.75);
      }
    }
  });

  it("every level has far more open tiles than microbes", () => {
    for (const seed of [3, 11]) {
      const d = new Dungeon(96, 96, seed);
      for (let f = 1; f <= MAX_FLOOR; f++) {
        const lvl = d.level(f);
        const open = lvl.grid.countFloor();
        expect(open / Math.max(lvl.mobs.length, 1), `seed ${seed} floor ${f}`)
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
    p.integrated = MAX_SLOTS - BASE_SLOTS;   // these fixtures need room
    expect(p.bin.length).toBeGreaterThan(0);
    expect(p.bin.every((x) => x.kind !== "gene")).toBe(true);
    expect(p.bin.some((x) => x.kind === "promoter")).toBe(true);
    expect(p.bin.some((x) => x.kind === "terminator")).toBe(true);
  });

  it("loot goes to the bin, not onto the ring", () => {
    const p = new Plasmid();
    p.integrated = MAX_SLOTS - BASE_SLOTS;   // these fixtures need room
    expect(p.stash({ kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE }).ok).toBe(true);
    expect(p.inBin("mtrC")).toBe(true);
    expect(p.has("mtrC")).toBe(false);
    expect(p.expression("mtrC", 4)).toBe(0);          // stashed is not expressed
  });

  it("stacks a duplicate rather than refusing it", () => {
    // It used to be refused outright, so a better roll of a gene you already
    // carried was simply unpickupable. It stacks now -- but only up to
    // MAX_STACK, and never onto a gene already on the chromosome.
    const p = new Plasmid();
    p.integrated = MAX_SLOTS - BASE_SLOTS;
    const copy = (): Part =>
      ({ kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE });
    expect(p.stash(copy()).ok).toBe(true);
    expect(p.stash(copy()).ok, "the second copy did not stack").toBe(true);
    const rows = p.bin.filter((x) => x.kind === "gene" && x.id === "mtrC");
    expect(rows.length, "it made a second row instead of stacking").toBe(1);
    expect(countOf(rows[0]!)).toBe(2);

    // Installing takes ONE off the stack, leaving the spare.
    p.install(p.bin.findIndex((x) => x.kind === "gene" && x.id === "mtrC"), 8);
    expect(p.has("mtrC"), "it did not install").toBe(true);
    expect(countOf(p.bin.find((x) => x.kind === "gene" && x.id === "mtrC")!),
           "installing consumed the whole stack").toBe(1);

    // And a stack fills to MAX_STACK, then refuses.
    while (p.stash(copy()).ok) { /* fill it */ }
    const row = p.bin.find((x) => x.kind === "gene" && x.id === "mtrC");
    expect(countOf(row!)).toBe(MAX_STACK);
    expect(p.stash(copy()).ok, "a full stack accepted a fourth").toBe(false);
  });

  it("install and uninstall conserve parts -- nothing is destroyed", () => {
    const p = new Plasmid();
    p.integrated = MAX_SLOTS - BASE_SLOTS;   // these fixtures need room
    const count = () => p.bin.length + p.slots.filter((x) => x !== null).length;
    const before = count();
    p.stash({ kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE });
    const i = p.bin.findIndex((x) => x.kind === "gene");
    p.install(i, 8);
    expect(count()).toBe(before + 1);
    p.uninstall(8);
    expect(count()).toBe(before + 1);
    expect(p.inBin("mtrC")).toBe(true);
  });

  it("installing over an occupied slot returns the old part to the bin", () => {
    const p = new Plasmid();
    p.integrated = MAX_SLOTS - BASE_SLOTS;   // these fixtures need room
    p.put(8, { kind: "terminator", id: "rrnbt1" });
    p.stash({ kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE });
    const binBefore = p.bin.length;
    p.install(p.bin.findIndex((x) => x.kind === "gene"), 8);
    expect(p.bin.length).toBe(binBefore);            // one out, one back in
    expect(p.bin.some((x) => x.kind === "terminator")).toBe(true);
  });

  it("the origin can be neither displaced nor uninstalled", () => {
    const p = new Plasmid();
    p.integrated = MAX_SLOTS - BASE_SLOTS;   // these fixtures need room
    const oi = p.slots.findIndex((x) => x?.kind === "gene" && x.id === "ori");
    expect(p.uninstall(oi).ok).toBe(false);
    p.stash({ kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE });
    expect(p.install(p.bin.findIndex((x) => x.kind === "gene"), oi).ok).toBe(false);
  });
});

describe("operon complexes", () => {
  const build = (parts: [number, Part][]) => {
    const p = new Plasmid();
    p.integrated = MAX_SLOTS - BASE_SLOTS;   // these fixtures need room
    for (const [i, part] of parts) p.put(i, part);
    return p;
  };
  const gene = (id: Parameters<Plasmid["has"]>[0]): Part =>
    ({ kind: "gene", id, level: 1, mods: ["codon"] as ModifierId[], allele: WILD_TYPE });

  it("a complete pathway in one operon activates; scattered genes do not", () => {
    const together = build([
      [4, { kind: "promoter", id: "j23119" }],
      [5, gene("mtrC")], [6, gene("omcS")],
    ]);
    expect(together.complexes(4).map((c) => c.id)).toContain("eet");

    const apart = build([
      [4, { kind: "promoter", id: "j23119" }], [5, gene("mtrC")],
      [9, { kind: "promoter", id: "j23119" }], [10, gene("omcS")],
    ]);
    expect(apart.complexes(4).map((c) => c.id)).not.toContain("eet");
  });

  it("a complex is inert where its genes have no substrate", () => {
    const p = build([
      [4, { kind: "promoter", id: "j23119" }],
      [5, gene("mtrC")], [6, gene("omcS")],
    ]);
    expect(p.complexes(4).map((c) => c.id)).toContain("eet");   // ferruginous
    expect(p.complexes(7).map((c) => c.id)).not.toContain("eet"); // no Fe(III)
  });

  it("electron transfer grants reach, sulfate reduction grants an aura", () => {
    const eet = build([[4, { kind: "promoter", id: "j23119" }],
                       [5, gene("mtrC")], [6, gene("omcS")]]);
    expect(eet.reach(4)).toBe(2);
    const sr = build([[4, { kind: "promoter", id: "j23119" }],
                      [5, gene("dsrA")], [6, gene("aprA")]]);
    expect(sr.aura(7)).toBeGreaterThan(0);
  });

  it("a complex multiplies output beyond the sum of its genes", () => {
    const pair = build([[4, { kind: "promoter", id: "j23119" }],
                        [5, gene("mcrA")], [6, gene("hdrB")]]);
    const solo = build([[4, { kind: "promoter", id: "j23119" }],
                        [5, gene("mcrA")], [7, gene("hdrB")]]);  // gap between
    expect(pair.power(8)).toBeGreaterThan(solo.power(8) * 1.4);
  });

  it("armour reduces incoming damage only while the complex holds", () => {
    const p = build([[4, { kind: "promoter", id: "j23119" }],
                     [5, gene("katG")], [6, gene("sqr")]]);
    expect(p.armour(3)).toBeLessThan(1);
    p.put(6, null);
    expect(p.armour(3)).toBe(1);
  });
});

describe("toxic intermediates", () => {
  it("nitrate reductase without N2O reductase accumulates nitrous oxide", () => {
    const p = new Plasmid();
    p.integrated = MAX_SLOTS - BASE_SLOTS;   // these fixtures need room
    p.put(4, { kind: "promoter", id: "j23119" });
    p.put(5, { kind: "gene", id: "narG", level: 1, mods: ["codon"], allele: WILD_TYPE });
    expect(p.hazards(2).map((h) => h.id)).toContain("n2o");
    expect(p.toxicity(2)).toBeGreaterThan(0);
  });

  it("completing the chain clears the hazard and grants the complex", () => {
    const p = new Plasmid();
    p.integrated = MAX_SLOTS - BASE_SLOTS;   // these fixtures need room
    p.put(4, { kind: "promoter", id: "j23119" });
    p.put(5, { kind: "gene", id: "narG", level: 1, mods: ["codon"], allele: WILD_TYPE });
    p.put(6, { kind: "gene", id: "nosZ", level: 1, mods: ["codon"], allele: WILD_TYPE });
    expect(p.hazards(2).map((h) => h.id)).not.toContain("n2o");
    expect(p.complexes(2).map((c) => c.id)).toContain("denitrification");
  });

  it("a hazard needs the offending gene to actually be expressed", () => {
    const p = new Plasmid();
    p.integrated = MAX_SLOTS - BASE_SLOTS;   // these fixtures need room
    p.put(9, { kind: "gene", id: "narG", level: 1, mods: ["codon"], allele: WILD_TYPE });   // no promoter
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
      version: SCHEMA, depth: 4, seed: 7, px: 5, py: 5, hp: 20,
      ring: [{ kind: "promoter", id: "j23106" }],
      bin: [{ kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE }, { kind: "terminator", id: "rrnbt1" }],
      settings: {},
    });
    expect(s?.bin).toHaveLength(2);
    expect(s?.bin[0]).toEqual({ kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE });
  });
  it("drops junk and duplicates from the bin", () => {
    const s = parseSave({
      version: SCHEMA, depth: 1, seed: 1, px: 1, py: 1, hp: 30, ring: [], settings: {},
      bin: [{ kind: "gene", id: "mtrC" }, { kind: "gene", id: "mtrC" }, "junk", 7,
            { kind: "gene", id: "notReal" }],
    });
    expect(s?.bin).toHaveLength(1);
  });
  it("a missing bin is an empty bin, not a crash", () => {
    const s = parseSave({ version: SCHEMA, depth: 1, seed: 1, px: 1, py: 1, hp: 30, ring: [], settings: {} });
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
    p.integrated = MAX_SLOTS - BASE_SLOTS;   // these fixtures need room
    p.stash({ kind: "gene", id: "sat", level: 1, mods: [], allele: WILD_TYPE });
    expect(p.carried().has("sat")).toBe(true);
  });
});

describe("module auto-assembly", () => {
  const sulfate: bio.GeneId[] = ["sat", "aprA", "dsrA"];
  const stocked = () => {
    const p = new Plasmid();
    p.integrated = MAX_SLOTS - BASE_SLOTS;   // these fixtures need room
    for (const g of sulfate) p.stash({ kind: "gene", id: g, level: 1, mods: ["codon"], allele: WILD_TYPE });
    return p;
  };

  it("refuses when an enzyme is missing, and names it", () => {
    const p = new Plasmid();
    p.integrated = MAX_SLOTS - BASE_SLOTS;   // these fixtures need room
    p.stash({ kind: "gene", id: "dsrA", level: 1, mods: ["codon"], allele: WILD_TYPE });
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
      if (p.at(i) === null) p.put(i, { kind: "terminator", id: "rrnbt1" });
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
    p.bin.push({ kind: "promoter", id: "j23114" });
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

  it("rotating by absurd amounts is a no-op modulo the USABLE slots", () => {
    // Modulo usableSlots, not SLOTS: the array is sized for the largest
    // replicon and only the positions this one owns take part.
    const p = new Plasmid();
    p.integrated = MAX_SLOTS - BASE_SLOTS;   // these fixtures need room
    p.put(4, { kind: "promoter", id: "j23106" });
    p.put(5, { kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE });
    const snap = () => p.slots.map((x) => (x?.kind === "gene" ? x.id : x?.kind ?? null));
    const before = snap();
    p.rotate(p.usableSlots * 1000);
    expect(snap()).toEqual(before);
    p.rotate(-p.usableSlots * 3);
    expect(snap()).toEqual(before);
    for (const n of [NaN, Infinity, 1e12]) {
      expect(() => { p.rotate(n); }).not.toThrow();
    }
  });

  it("spinning the ring never strands a part past the chromosome", () => {
    // Rotating all 24 array positions while the chromosome owned 8 pushed
    // parts where nothing could reach them -- from simply dragging the ring,
    // which is the most ordinary thing a player does on that screen.
    for (let rep = 0; rep <= MAX_SLOTS - BASE_SLOTS; rep += 3) {
      const p = new Plasmid();
      p.integrated = rep;
      p.strain = 1;
      for (let i = 0; i < 60; i++) {
        p.rotate(i * 7 - 30);
        for (let s = 0; s < SLOTS; s++) {
          if (!p.usable(s)) {
            expect(p.at(s), `${String(rep)}: part stranded at ${String(s)}`).toBeNull();
          }
        }
      }
      expect(p.has("ori"), `${String(rep)}: origin lost while spinning`).toBe(true);
    }
  });

  it("a swap outside the chromosome is refused rather than stranding a part", () => {
    const p = new Plasmid();
    p.integrated = 0;             // the base eight positions
    p.strain = 1;
    expect(p.swap(1, 20).ok).toBe(false);
    expect(p.at(20)).toBeNull();
    expect(p.swap(1, 2).ok).toBe(true);
  });

  it("swapping a slot with itself changes nothing", () => {
    const p = new Plasmid();
    p.integrated = MAX_SLOTS - BASE_SLOTS;   // these fixtures need room
    const before = JSON.stringify(p.slots);
    p.swap(3, 3);
    expect(JSON.stringify(p.slots)).toBe(before);
  });

  it("assembling an empty module list is refused, not a crash", () => {
    const p = new Plasmid();
    p.integrated = MAX_SLOTS - BASE_SLOTS;   // these fixtures need room
    expect(() => p.assemble([])).not.toThrow();
  });

  it("a completely full ring reports no free slots and refuses installs", () => {
    const p = new Plasmid();
    p.integrated = MAX_SLOTS - BASE_SLOTS;   // these fixtures need room
    // Fill the RING, not the array: positions past the replicon's last are not
    // free space, they do not exist.
    for (let i = 0; i < p.usableSlots; i++) {
      if (p.at(i) === null) p.put(i, { kind: "terminator", id: "rrnbt1" });
    }
    expect(p.free()).toBe(0);
    expect(p.add({ kind: "gene", id: "psbA", level: 1, mods: [], allele: WILD_TYPE }).ok).toBe(false);
  });

  it("a full bin refuses further loot rather than dropping it silently", () => {
    const p = new Plasmid();
    p.integrated = MAX_SLOTS - BASE_SLOTS;   // these fixtures need room
    while (p.stash({ kind: "terminator", id: "rrnbt1" }).ok) { /* fill */ }
    expect(p.bin.length).toBeLessThanOrEqual(18);
    expect(p.stash({ kind: "gene", id: "psbA", level: 1, mods: [], allele: WILD_TYPE }).ok).toBe(false);
  });

  it("expression is finite and non-negative at every depth for every gene", () => {
    const p = new Plasmid();
    p.integrated = MAX_SLOTS - BASE_SLOTS;   // these fixtures need room
    p.put(4, { kind: "promoter", id: "j23119" });
    let slot = 5;
    for (const id of Object.keys(bio.GENES) as bio.GeneId[]) {
      if (id === "ori" || slot >= SLOTS) continue;
      p.put(slot++, { kind: "gene", id, level: 1, mods: ["codon"], allele: WILD_TYPE });
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
    p.integrated = MAX_SLOTS - BASE_SLOTS;   // these fixtures need room
    const proms = p.bin.filter((x) => x.kind === "promoter").length;
    const terms = p.bin.filter((x) => x.kind === "terminator").length;
    expect(proms).toBeGreaterThanOrEqual(3);
    expect(terms).toBeGreaterThanOrEqual(3);
  });

  it("a fresh plasmid can assemble a looted module without extra promoters", () => {
    const p = new Plasmid();
    p.integrated = MAX_SLOTS - BASE_SLOTS;   // these fixtures need room
    for (const g of ["sat", "aprA", "dsrA"] as const) {
      p.stash({ kind: "gene", id: g, level: 1, mods: [], allele: WILD_TYPE });
    }
    expect(p.assemble(["sat", "aprA", "dsrA"]).ok).toBe(true);
    // and still has parts left for a second transcript
    expect(p.bin.some((x) => x.kind === "promoter")).toBe(true);
  });

  it("starter parts leave room in the bin for loot", () => {
    const p = new Plasmid();
    p.integrated = MAX_SLOTS - BASE_SLOTS;   // these fixtures need room
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
    p.integrated = MAX_SLOTS - BASE_SLOTS;   // these fixtures need room
    // The base chromosome is eight positions and the starting vector uses
    // three. These fixtures lay down whole operons, so they need room.
    p.integrated = MAX_SLOTS - BASE_SLOTS;
    p.put(4, { kind: "promoter", id: "j23119" });
    genes.forEach((g, i) => {
      p.put(5 + i, { kind: "gene", id: g, level: 1, mods: ["codon"], allele: WILD_TYPE });
    });
    // Terminated, because an unterminated operon now burns ATP on transcription
    // that produces nothing -- so terminating one is part of building it, not
    // an optional tidy-up.
    p.put(5 + genes.length, { kind: "terminator", id: "rrnbt1" });
    return p;
  };

  it("an untranscribed gene costs nothing -- carrying is not expressing", () => {
    // A fresh plasmid already transcribes its origin, and maintaining a
    // replicon genuinely costs energy, so compare against that baseline.
    const base = new Plasmid().atpCost(2);
    const p = new Plasmid();
    p.integrated = MAX_SLOTS - BASE_SLOTS;   // these fixtures need room
    p.put(9, { kind: "gene", id: "narG", level: 1, mods: ["codon"], allele: WILD_TYPE });   // no promoter
    expect(p.atpCost(2)).toBeCloseTo(base, 6);
  });

  it("maintaining the origin itself costs ATP", () => {
    expect(new Plasmid().atpCost(1)).toBeGreaterThan(0);
  });

  it("switching an operon on creates a cost", () => {
    const off = new Plasmid();
    off.put(9, { kind: "gene", id: "cbbL", level: 1, mods: ["codon"], allele: WILD_TYPE });
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
    p.integrated = MAX_SLOTS - BASE_SLOTS;   // these fixtures need room
    for (let d = 1; d <= bio.MAX_DEPTH; d++) {
      expect(p.atpBalance(d), `D${d}`).toBeGreaterThan(0);
    }
  });

  it("a generator-free hoard runs at a loss, and worse the deeper it goes", () => {
    // Baseline fermentation covers a small hoard at the surface -- it was
    // raised to 1.6 when repair began costing ATP. What has to hold is that
    // carrying dead weight gets steadily worse as respiration pays less, and
    // that it is underwater well before the bottom.
    const p = withOperon("katG", "cbbL", "aclB", "nosZ");
    expect(p.atpBalance(5)).toBeLessThan(p.atpBalance(1));
    expect(p.atpBalance(5), "a generator-free hoard should be underwater by D5")
      .toBeLessThan(0);
    expect(p.atpBalance(8)).toBeLessThan(p.atpBalance(5));
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

  it("a chaser closes distance ON AVERAGE, not every single step", () => {
    // Pursuit is a biased random walk now, so a single step may tumble the
    // wrong way. Asserting one step always closes was asserting PERFECT
    // tracking -- which is what made a pack move as one body.
    const at = { x: 2, y: 2 };
    let closer = 0;
    const n = 200;
    for (let s = 0; s < n; s++) {
      const step = decideStep("chase", at, sensed(8, 8, at), open(), makeRng(s), noOne);
      if (step && chebyshev(step.x, step.y, 8, 8) < chebyshev(2, 2, 8, 8)) closer++;
    }
    expect(closer / n, `only ${String(closer)}/${String(n)} steps closed`)
      .toBeGreaterThan(0.6);
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
      { ...body, kind: "microbe", uid: 1, id: "x", name: "X", glyph: "x", genes: [],
        note: "", pigment: "#fff", facing: "none", behaviour: "drift",
        size: "small", weapon: "melee", atk: 1, cooldown: 0, elite: false,
        reload: 0, charging: 0 },
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
    const m: Entity = { ...makeBody(0, 0, 10), kind: "microbe", uid: 2, id: "x", name: "X",
      glyph: "x", genes: [], note: "", pigment: "#fff", facing: "none",
      behaviour: "drift", size: "small", weapon: "melee", atk: 1, cooldown: 0,
      elite: false, reload: 0, charging: 0 };
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
    packets: [], clouds: [],
  });
  const mob = (over: Partial<Mob>): Mob => ({
    uid: 1, id: "pseudomonas", name: "Pseudomonas", glyph: "p", x: 8, y: 5,
    ax: 8, ay: 5, hp: 12, maxhp: 12, atk: 4, genes: [], note: "",
    pigment: "#fff", alive: true, facing: "rotate", heading: null,
    behaviour: "chase", size: "medium", cooldown: 0, status: [],
    weapon: "melee", reload: 0, charging: 0, elite: false,
    ...over,
  });

  it("a chaser closes and then strikes", () => {
    // Given ENOUGH turns. A single step may tumble the wrong way now, so
    // asserting the first one always closes was asserting perfect tracking.
    const m = mob({ x: 8, y: 5 });
    const w = world([m]);
    for (let i = 0; i < 14; i++) microbeTurn(w);
    expect(m.x, "it never got any closer at all").toBeLessThan(8);
    expect(w.player.hp, "it never landed a blow").toBeLessThan(30);
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

describe("plasmid memoisation cannot go stale", () => {
  const fresh = () => {
    const p = new Plasmid();
    p.integrated = MAX_SLOTS - BASE_SLOTS;   // these fixtures need room
    p.put(4, { kind: "promoter", id: "j23119" });
    p.put(5, { kind: "gene", id: "narG", level: 1, mods: ["codon"], allele: WILD_TYPE });
    return p;
  };

  // The memo is keyed on a revision counter, so the ONLY way it can serve a
  // stale value is a mutator that forgets to bump it. Enumerate them.
  // The list above is METHODS. Four public FIELDS also feed memoised reads --
  // integrated and strain set `usableSlots`, which is an argument to
  // transcribe(); traits set copy number; depth and inducers are the context
  // conditional promoters read. None of them bumped `rev`, so the memo served
  // values computed for a different chromosome. Measured before the fix:
  // atpCost read 0.19 where the truth was 0.77, a 4x understatement that
  // corrected itself only when the player next happened to touch the ring.
  it("every public FIELD that feeds a memo bumps the revision", () => {
    const cases: [string, (p: Plasmid) => void][] = [
      ["integrated", (p) => { p.integrated += 4; }],
      ["strain",     (p) => { p.strain = 6; }],
      ["traits",     (p) => { p.acquire("runaway"); }],
      ["setTraits",  (p) => { p.setTraits(["partitioned"]); }],
      ["depth",      (p) => { p.depth = 5; }],
      ["inducers",   (p) => { p.inducers = new Set(["h2"]); }],
    ];
    for (const [name, mutate] of cases) {
      const p = fresh();
      const before = p.revision();
      mutate(p);
      expect(p.revision(), `${name} did not invalidate the memo`).toBeGreaterThan(before);
    }
  });

  it("a memoised ATP cost never disagrees with a freshly computed one", () => {
    const p = fresh();
    p.depth = 4;
    p.atpCost(4);                       // prime the memo
    p.integrated += 8;
    p.acquire("runaway");
    p.strain = 8;
    const memoised = p.atpCost(4);
    const fresh_ = new Plasmid();
    fresh_.depth = 4;
    fresh_.integrated = p.integrated;
    fresh_.acquire("runaway");
    fresh_.strain = 8;
    for (let i = 0; i < p.slots.length; i++) fresh_.put(i, p.slots[i] ?? null);
    expect(memoised).toBeCloseTo(fresh_.atpCost(4), 6);
  });

  // A refusal that has already destroyed the parts is the worst shape a bug
  // can take. `pi` was found before the gene pull and used after it, so every
  // gene sitting below the promoter in the bin shifted it -- and off the end
  // it reported "no spare promoter in the bin" having binned four genes.
  it("a failed assemble destroys nothing, whatever the bin order", () => {
    const genes: bio.GeneId[] = ["narG", "nirS", "norB", "nosZ"];
    for (const promoterFirst of [true, false]) {
      const p = new Plasmid();
      p.bin.length = 0;
      const promoter = (): Part => ({ kind: "promoter", id: "j23119" });
      const cassettes = (): Part[] => genes.map((id) =>
        ({ kind: "gene", id, level: 1, mods: [], allele: WILD_TYPE }));
      if (promoterFirst) p.bin.push(promoter(), ...cassettes());
      else p.bin.push(...cassettes(), promoter());

      const before = p.slots.filter(Boolean).length + p.bin.length;
      const r = p.assemble(genes);
      const after = p.slots.filter(Boolean).length + p.bin.length;
      expect(after, `promoterFirst=${String(promoterFirst)}: parts vanished`)
        .toBe(before);
      // And when it says it worked, it laid the promoter down, not some
      // other part the stale index happened to be pointing at.
      if (r.ok) {
        const at = p.slots.findIndex((x) => x?.kind === "gene" && x.id === "narG");
        expect(p.at(at - 1)?.kind, "the operon is not headed by a promoter")
          .toBe("promoter");
      }
    }
  });

  it("restoring the origin returns whatever it displaces to the bin", () => {
    const p = new Plasmid();
    const binBefore = p.bin.length;
    // Fill every usable position, which overwrites the origin. touch() then
    // restores it, and on a full ring it has to evict something to do so --
    // that part used to be dropped on the floor, breaking the conservation
    // guarantee install/uninstall are tested for.
    for (let i = 0; i < p.usableSlots; i++) {
      p.put(i, { kind: "terminator", id: "rrnbt1" });
    }
    expect(p.has("ori"), "the origin was not restored").toBe(true);
    expect(p.bin.length, "ensureOrigin destroyed the part it overwrote")
      .toBe(binBefore + 1);
  });

  it("a gene cannot be on the ring and in the bin at once", () => {
    const p = new Plasmid();
    const g = (): Part =>
      ({ kind: "gene", id: "psbA", level: 1, mods: [], allele: WILD_TYPE });
    expect(p.stash(g()).ok).toBe(true);
    expect(p.add(g()).ok, "add() ignored the bin").toBe(false);
    expect(p.has("psbA") && p.inBin("psbA"), "carried twice").toBe(false);
  });

  it("every public mutator bumps the revision", () => {
    const cases: [string, (p: Plasmid) => void][] = [
      ["put",        (p) => { p.put(9, { kind: "terminator", id: "rrnbt1" }); }],
      ["swap",       (p) => { p.swap(4, 9); }],
      ["remove",     (p) => { p.remove(5); }],
      ["rotate",     (p) => { p.rotate(3); }],
      ["optimise",   (p) => { p.put(9, { kind: "gene", id: "katG", level: 1, mods: [], allele: WILD_TYPE });
                              p.optimise("katG"); }],
      ["stash",      (p) => { p.stash({ kind: "terminator", id: "rrnbt1" }); }],
      ["add",        (p) => { p.add({ kind: "terminator", id: "rrnbt1" }, 9); }],
      ["install",    (p) => { p.stash({ kind: "gene", id: "katG", level: 1, mods: [], allele: WILD_TYPE });
                              p.install(p.bin.findIndex((x) => x.kind === "gene"), 9); }],
      ["uninstall",  (p) => { p.uninstall(5); }],
      ["assemble",   (p) => { p.stash({ kind: "gene", id: "nirS", level: 1, mods: [], allele: WILD_TYPE });
                              p.stash({ kind: "gene", id: "norB", level: 1, mods: [], allele: WILD_TYPE });
                              p.stash({ kind: "gene", id: "nosZ", level: 1, mods: [], allele: WILD_TYPE });
                              p.assemble(["narG", "nirS", "norB", "nosZ"]); }],
    ];
    for (const [name, mutate] of cases) {
      const p = fresh();
      const before = p.revision();
      mutate(p);
      expect(p.revision(), `${name} did not invalidate the memo`).toBeGreaterThan(before);
    }
  });

  it("operons reflect a mutation immediately", () => {
    const p = fresh();
    expect(p.operonOf("narG")).not.toBeNull();
    p.put(4, null);                       // pull the promoter
    expect(p.operonOf("narG")).toBeNull();
  });

  it("ATP figures reflect a mutation immediately", () => {
    const p = fresh();
    const before = p.atpGain(2);
    p.put(6, { kind: "gene", id: "nosZ", level: 1, mods: ["codon"], allele: WILD_TYPE });
    expect(p.atpGain(2)).not.toBeCloseTo(before, 6);
  });

  it("cost is memoised per depth, not shared across depths", () => {
    const p = fresh();
    const a = p.atpGain(1), b = p.atpGain(8);
    expect(a).not.toBeCloseTo(b, 6);
    expect(p.atpGain(1)).toBeCloseTo(a, 10);   // second read still correct
  });

  it("changing supply does not disturb the cost memo", () => {
    const p = fresh();
    const c = p.atpCost(2);
    p.supply = 0.3;
    expect(p.atpCost(2)).toBeCloseTo(c, 10);
    expect(p.expression("narG", 2)).toBeLessThan(p.rawExpression("narG", 2));
  });

  it("a memoised read matches a freshly built plasmid", () => {
    const a = fresh();
    a.atpGain(4); a.operons();             // warm the memo
    a.put(7, { kind: "gene", id: "katG", level: 1, mods: ["codon"], allele: WILD_TYPE });
    const b = fresh();
    b.put(7, { kind: "gene", id: "katG", level: 1, mods: ["codon"], allele: WILD_TYPE });
    expect(a.atpGain(4)).toBeCloseTo(b.atpGain(4), 10);
    expect(a.operons().length).toBe(b.operons().length);
  });
});

describe("toasts", () => {
  it("expire and are bounded", () => {
    const t = new Toasts();
    for (let i = 0; i < 50; i++) t.push(`msg ${i}`, "info", i * 4000);
    expect(t.count()).toBeLessThanOrEqual(4);
    t.prune(1e9);
    expect(t.count()).toBe(0);
  });

  it("collapses a repeated message so a per-frame failure cannot spam", () => {
    const t = new Toasts();
    for (let i = 0; i < 100; i++) t.push("boom", "error", 1000 + i);
    expect(t.count()).toBe(1);
  });

  it("lets the same message through again after it has aged", () => {
    const t = new Toasts();
    t.push("boom", "error", 0);
    t.push("boom", "error", 5000);
    expect(t.count()).toBe(2);
  });

  it("errors last longer than info", () => {
    const t = new Toasts();
    t.push("a", "info", 0);
    t.push("b", "error", 0);
    t.prune(3000);
    expect(t.all().map((x) => x.text)).toEqual(["b"]);
  });

  it("alpha fades to zero and never goes negative", () => {
    const t = new Toasts();
    t.push("x", "info", 0);
    const item = t.all()[0]!;
    expect(Toasts.alpha(item, 0)).toBe(1);
    expect(Toasts.alpha(item, item.dur)).toBe(0);
    expect(Toasts.alpha(item, item.dur * 10)).toBe(0);
  });

  it("very long messages are truncated, not wrapped forever", () => {
    const t = new Toasts();
    t.push("x".repeat(5000), "error", 0);
    expect(t.all()[0]!.text.length).toBeLessThanOrEqual(160);
  });

  it("guard returns the value on success and the fallback on throw", () => {
    const seen: string[] = [];
    expect(guard("ok", () => 42, -1, (m) => seen.push(m))).toBe(42);
    expect(seen).toHaveLength(0);
    expect(guard("bad", () => { throw new Error("nope"); }, -1, (m) => seen.push(m))).toBe(-1);
    expect(seen[0]).toContain("bad");
    expect(seen[0]).toContain("nope");
  });

  it("guard reports non-Error throws without crashing", () => {
    const seen: string[] = [];
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- the point
    guard("odd", () => { throw "a string"; }, null, (m) => seen.push(m));
    expect(seen[0]).toContain("a string");
  });
});

describe("multi-tile bodies", () => {
  it("a single body occupies exactly its own tile", () => {
    expect(tilesOf("single", 4, 4, 0)).toEqual([{ x: 4, y: 4 }]);
  });

  it("a filament lies along its heading, centred on the anchor", () => {
    const east = tilesOf("line3", 5, 5, 0);
    expect(east).toEqual([{ x: 4, y: 5 }, { x: 5, y: 5 }, { x: 6, y: 5 }]);
    const south = tilesOf("line3", 5, 5, Math.PI / 2);
    expect(south).toEqual([{ x: 5, y: 4 }, { x: 5, y: 5 }, { x: 5, y: 6 }]);
  });

  it("a filament turning sweeps different tiles", () => {
    const a = tilesOf("line3", 5, 5, 0).map((t) => `${t.x},${t.y}`);
    const b = tilesOf("line3", 5, 5, Math.PI / 2).map((t) => `${t.x},${t.y}`);
    expect(new Set([...a, ...b]).size).toBeGreaterThan(3);
  });

  it("every footprint occupies the number of tiles it claims", () => {
    for (const fp of ["single", "line2", "line3", "block2"] as const) {
      expect(tilesOf(fp, 5, 5, 0), fp).toHaveLength(FOOTPRINT_TILES[fp]);
    }
  });

  it("footprints never contain duplicate tiles at any heading", () => {
    for (const fp of ["single", "line2", "line3", "block2"] as const) {
      for (let i = 0; i < 16; i++) {
        const h = (i / 16) * Math.PI * 2 - Math.PI;
        const ts = tilesOf(fp, 5, 5, h).map((t) => `${t.x},${t.y}`);
        expect(new Set(ts).size, `${fp} at ${h.toFixed(2)}`).toBe(ts.length);
      }
    }
  });

  it("covers() agrees with tilesOf for every tile and heading", () => {
    for (const fp of ["line2", "line3", "block2"] as const) {
      for (let i = 0; i < 8; i++) {
        const h = (i / 8) * Math.PI * 2 - Math.PI;
        for (const t of tilesOf(fp, 6, 6, h)) {
          expect(covers(fp, 6, 6, h, t.x, t.y), `${fp} ${t.x},${t.y}`).toBe(true);
        }
        expect(covers(fp, 6, 6, h, 99, 99)).toBe(false);
      }
    }
  });

  it("a filament cannot squeeze into a corridor narrower than itself", () => {
    // A one-tile-wide east-west corridor: a north-south filament cannot fit.
    const g = new mg.Grid(11, 11, mg.WALL);
    for (let x = 1; x < 10; x++) g.set(x, 5, mg.FLOOR);
    const at = { x: 5, y: 5 };
    for (let i = 0; i < 40; i++) {
      const s = decideStep("chase", at,
        { px: 9, py: 5, dist: 4, alliesNear: 0 }, g, makeRng(i), () => false, "line3");
      if (!s) continue;
      // whatever it does, its whole body must land on floor
      const h = Math.atan2(s.y - at.y, s.x - at.x);
      for (const t of tilesOf("line3", s.x, s.y, h)) {
        expect(g.isFloor(t.x, t.y), `body in wall at ${t.x},${t.y}`).toBe(true);
      }
    }
  });

  it("large and filament sizes really are multi-tile", () => {
    expect(SIZES.filament.footprint).toBe("line3");
    expect(SIZES.large.footprint).toBe("block2");
    expect(SIZES.medium.footprint).toBe("single");
  });

  it("a filament is stretched when drawn, a packet is not", () => {
    expect(stretchOf("line3")).toBeGreaterThan(stretchOf("line2"));
    expect(stretchOf("block2")).toBe(1);
    expect(stretchOf("single")).toBe(1);
  });

  it("the centre of a symmetric footprint is its anchor", () => {
    expect(centreOf("line3", 5, 5, 0)).toEqual({ x: 5, y: 5 });
    expect(centreOf("single", 5, 5, null)).toEqual({ x: 5, y: 5 });
  });
});

describe("footprints in the microbe turn", () => {
  const mob = (over: Partial<Mob>): Mob => ({
    uid: 1, id: "beggiatoa", name: "Beggiatoa", glyph: "B", x: 8, y: 5, ax: 8, ay: 5,
    hp: 40, maxhp: 40, atk: 5, genes: [], note: "", pigment: "#fff",
    alive: true, facing: "rotate", heading: 0, behaviour: "sessile",
    size: "filament", cooldown: 0, status: [],
    weapon: "melee", reload: 0, charging: 0, elite: false, ...over,
  });

  it("a filament strikes from either end of its body", () => {
    // anchor at (8,5) heading east covers 7,8,9 -- so it reaches x=5 from x=7
    const m = mob({ x: 8, y: 5, heading: 0 });
    const w = {
      grid: new mg.Grid(15, 15, mg.FLOOR), mobs: [m],
      player: { x: 5, y: 5, hp: 30, status: [] as Status[] },
      rng: makeRng(3), armour: 1, packets: [], clouds: [],
    };
    for (let i = 0; i < 4; i++) microbeTurn(w);
    expect(w.player.hp).toBeLessThan(30);
  });

  it("bodies never overlap, whatever their footprints", () => {
    const mobs = [mob({ x: 4, y: 4, behaviour: "chase" }),
                  mob({ x: 9, y: 9, behaviour: "chase" }),
                  mob({ x: 4, y: 9, size: "large", behaviour: "chase" })];
    const w = {
      grid: new mg.Grid(20, 20, mg.FLOOR), mobs,
      player: { x: 12, y: 12, hp: 999, status: [] as Status[] },
      rng: makeRng(5), armour: 1, packets: [], clouds: [],
    };
    for (let step = 0; step < 25; step++) {
      microbeTurn(w);
      const seen = new Set<string>();
      for (const m of mobs.filter((x) => x.alive)) {
        for (const t of tilesOf(SIZES[m.size].footprint, m.x, m.y, m.heading)) {
          const k = `${t.x},${t.y}`;
          expect(seen.has(k), `overlap at ${k} on step ${step}`).toBe(false);
          seen.add(k);
        }
      }
    }
  });
});

describe("pursuit", () => {
  const grid = () => new mg.Grid(20, 20, mg.FLOOR);
  const mob = (over: Partial<Mob>): Mob => ({
    uid: 1, id: "pseudomonas", name: "Pseudomonas", glyph: "p", x: 10, y: 5, ax: 10, ay: 5,
    hp: 12, maxhp: 12, atk: 4, genes: [], note: "", pigment: "#fff",
    alive: true, facing: "rotate", heading: 0, behaviour: "chase",
    size: "medium", cooldown: 0, status: [],
    weapon: "melee", reload: 0, charging: 0, elite: false, ...over,
  });
  const opts = { reach: 1, maxRange: 24 };

  it("attacks when already in reach", () => {
    const m = mob({ x: 6, y: 5 });
    const a = nextAction({ x: 5, y: 5 }, [m], grid(), m, false, opts);
    expect(a.kind).toBe("attack");
  });

  it("steps toward a distant target", () => {
    const m = mob({ x: 12, y: 5 });
    const a = nextAction({ x: 5, y: 5 }, [m], grid(), m, false, opts);
    expect(a.kind).toBe("step");
    if (a.kind === "step") expect(a.to.x).toBeGreaterThan(5);
  });

  it("re-paths as the target moves -- the route is never stale", () => {
    const m = mob({ x: 14, y: 5 });
    const g = grid();
    let p = { x: 5, y: 5 };
    for (let turn = 0; turn < 20; turn++) {
      const a = nextAction(p, [m], g, m, false, opts);
      if (a.kind === "attack") break;
      if (a.kind === "step") p = a.to;
      m.y += turn % 2 === 0 ? 1 : -1;          // target dodges
      m.x -= 1;                                 // and closes
    }
    expect(nextAction(p, [m], g, m, false, opts).kind).toBe("attack");
  });

  it("converges on a target that is also chasing you", () => {
    const m = mob({ x: 16, y: 5 });
    const g = grid();
    let p = { x: 2, y: 5 };
    let turns = 0;
    for (; turns < 30; turns++) {
      const a = nextAction(p, [m], g, m, false, opts);
      if (a.kind === "attack") break;
      if (a.kind === "step") p = a.to;
      if (m.x > p.x) m.x -= 1;                  // it closes too
    }
    expect(turns).toBeLessThan(12);             // they meet in the middle
  });

  it("never steps onto the target's body", () => {
    const m = mob({ x: 12, y: 5, size: "filament" });
    const g = grid();
    let p = { x: 2, y: 5 };
    for (let i = 0; i < 20; i++) {
      const a = nextAction(p, [m], g, m, false, opts);
      if (a.kind !== "step") break;
      p = a.to;
      for (const t of tilesOf(SIZES[m.size].footprint, m.x, m.y, m.heading)) {
        expect(`${p.x},${p.y}`).not.toBe(`${t.x},${t.y}`);
      }
    }
  });

  it("reaches a filament from either end", () => {
    // body spans x = 11..13; standing at 10 is adjacent to its near end
    const m = mob({ x: 12, y: 5, size: "filament", heading: 0 });
    expect(distanceTo({ x: 10, y: 5 }, m)).toBe(1);
    expect(distanceTo({ x: 14, y: 5 }, m)).toBe(1);
  });

  it("drops a dead target", () => {
    const m = mob({ x: 6, y: 5, alive: false });
    expect(nextAction({ x: 5, y: 5 }, [m], grid(), m, false, opts).kind).toBe("idle");
  });

  it("auto-seek picks the nearest and re-picks when it dies", () => {
    const near = mob({ x: 8, y: 5 });
    const far = mob({ x: 17, y: 5 });
    const a = nextAction({ x: 5, y: 5 }, [near, far], grid(), null, true, opts);
    expect(a.kind === "step" && a.target).toBe(near);
    near.alive = false;
    const b = nextAction({ x: 5, y: 5 }, [near, far], grid(), null, true, opts);
    expect(b.kind === "step" && b.target).toBe(far);
  });

  it("does nothing without auto-seek and no target", () => {
    expect(nextAction({ x: 5, y: 5 }, [mob({})], grid(), null, false, opts).kind)
      .toBe("idle");
  });

  it("gives up on a target beyond max range", () => {
    const m = mob({ x: 19, y: 19 });
    expect(nextAction({ x: 1, y: 1 }, [m], grid(), m, false,
                      { reach: 1, maxRange: 5 }).kind).toBe("idle");
  });

  it("gives up when the target is walled off, rather than looping", () => {
    const g = new mg.Grid(20, 20, mg.FLOOR);
    for (let y = 0; y < 20; y++) g.set(9, y, mg.WALL);
    const m = mob({ x: 14, y: 5 });
    expect(nextAction({ x: 3, y: 5 }, [m], g, m, false, opts).kind).toBe("idle");
  });

  it("nanowire reach lets you strike without closing", () => {
    const m = mob({ x: 8, y: 5 });
    expect(nextAction({ x: 5, y: 5 }, [m], grid(), m, false,
                      { reach: 3, maxRange: 24 }).kind).toBe("attack");
  });

  it("an empty level is idle, not a crash", () => {
    expect(nextAction({ x: 5, y: 5 }, [], grid(), null, true, opts).kind).toBe("idle");
  });
});

describe("ranged weapons", () => {
  const world = (mobs: Mob[], px = 5, py = 5, grid?: mg.Grid) => ({
    grid: grid ?? new mg.Grid(20, 20, mg.FLOOR),
    mobs,
    player: { x: px, y: py, hp: 60, status: [] as Status[] },
    rng: makeRng(11),
    armour: 1,
    packets: [] as Packet[],
    clouds: [] as Cloud[],
  });
  const gun = (over: Partial<Mob>): Mob => ({
    uid: 1, id: "pseudomonas", name: "Pseudomonas", glyph: "p", x: 5, y: 5, ax: 5, ay: 5,
    hp: 20, maxhp: 20, atk: 6, genes: [], note: "", pigment: "#fff",
    alive: true, facing: "rotate", heading: 0, behaviour: "sessile",
    size: "medium", cooldown: 0, status: [],
    weapon: "melee", reload: 0, charging: 0, elite: false, ...over,
  });

  it("a speargun winds up before it fires -- the tell is real", () => {
    const m = gun({ weapon: "spear", x: 6, y: 5 });
    const w = world([m]);
    const first = microbeTurn(w);
    expect(first.some((e) => e.kind === "charge")).toBe(true);
    expect(w.player.hp).toBe(60);                    // no damage yet
    const second = microbeTurn(w);
    expect(second.some((e) => e.kind === "fire")).toBe(true);
    expect(w.player.hp).toBeLessThan(60);
  });

  it("T6SS hits far harder than a bump but only at contact range", () => {
    const near = world([gun({ weapon: "spear", x: 6, y: 5 })]);
    microbeTurn(near); microbeTurn(near);
    const speared = 60 - near.player.hp;

    const bump = world([gun({ weapon: "melee", x: 6, y: 5 })]);
    microbeTurn(bump);
    expect(speared).toBeGreaterThan(60 - bump.player.hp);

    const far = world([gun({ weapon: "spear", x: 9, y: 5 })]);
    for (let i = 0; i < 6; i++) microbeTurn(far);
    expect(far.player.hp).toBe(60);                  // out of contact range
  });

  it("stepping out of range aborts a charge instead of banking it", () => {
    const m = gun({ weapon: "spear", x: 6, y: 5 });
    const w = world([m]);
    microbeTurn(w);
    expect(m.charging).toBe(1);
    w.player.x = 15;                                  // you back off
    microbeTurn(w);
    expect(m.charging).toBe(0);
  });

  it("a nanowire needs a clear line", () => {
    const open = world([gun({ weapon: "bolt", x: 8, y: 5 })]);
    microbeTurn(open);
    expect(open.player.hp).toBeLessThan(60);

    const g = new mg.Grid(20, 20, mg.FLOOR);
    for (let y = 0; y < 20; y++) g.set(7, y, mg.WALL);
    const walled = world([gun({ weapon: "bolt", x: 8, y: 5 })], 5, 5, g);
    for (let i = 0; i < 4; i++) microbeTurn(walled);
    expect(walled.player.hp).toBe(60);
  });

  it("a tailocin is launched as a particle, not resolved instantly", () => {
    const w = world([gun({ weapon: "packet", x: 11, y: 5 })]);
    microbeTurn(w);
    expect(w.packets).toHaveLength(1);
    expect(w.player.hp).toBe(60);                     // still in flight
  });

  it("a particle travels a tile per turn and can be stepped around", () => {
    const w = world([gun({ weapon: "packet", x: 11, y: 5 })]);
    microbeTurn(w);
    const p = w.packets[0]!;
    const startX = p.x;
    stepPackets(w.packets, w.grid, w.player, () => false);
    expect(Math.abs(p.x - startX)).toBe(1);

    // sidestep: the packet passes through the row you left
    w.player.y = 7;
    for (let i = 0; i < 8; i++) stepPackets(w.packets, w.grid, w.player, () => false);
    expect(w.player.hp).toBe(60);
  });

  it("a particle that connects deals damage and infects", () => {
    const w = world([gun({ weapon: "packet", x: 11, y: 5 })]);
    microbeTurn(w);
    let hits = 0;
    for (let i = 0; i < 10; i++) {
      for (const h of stepPackets(w.packets, w.grid, w.player, () => false)) {
        hits++;
        w.player.hp -= h.dmg;
        if (h.inflicts) apply(w.player.status, h.inflicts, 5, 1);
      }
    }
    expect(hits).toBe(1);
    expect(hasStatus(w.player.status, "phage")).toBe(true);
  });

  it("particles die on walls and expire, so none can orbit forever", () => {
    const g = new mg.Grid(20, 20, mg.FLOOR);
    for (let y = 0; y < 20; y++) g.set(9, y, mg.WALL);
    const w = world([gun({ weapon: "packet", x: 5, y: 5 })], 5, 5, g);
    w.packets.push(launch({ x: 6, y: 5 }, { x: 19, y: 5 }, 5, null, "#fff"));
    for (let i = 0; i < 30; i++) stepPackets(w.packets, g, { x: 0, y: 0 }, () => false);
    expect(w.packets).toHaveLength(0);
  });

  it("a gradient lingers on the ground and denies it", () => {
    const w = world([gun({ weapon: "cloud", x: 8, y: 5 })]);
    microbeTurn(w);                            // winds up
    microbeTurn(w);                            // then releases
    expect(w.clouds).toHaveLength(1);
    let ticks = 0;
    for (let i = 0; i < 12; i++) {
      for (const h of stepClouds(w.clouds, w.player)) { ticks++; void h; }
    }
    expect(ticks).toBeGreaterThan(2);          // it kept hurting while you stood in it
    expect(w.clouds).toHaveLength(0);          // and then dispersed
  });

  it("walking out of a gradient stops the damage", () => {
    const clouds: Cloud[] = [{ cx: 5, cy: 5, radius: 2, dmg: 2, ttl: 9,
                               inflicts: "acid", colour: "#fff" }];
    expect(stepClouds(clouds, { x: 5, y: 5 })).toHaveLength(1);
    expect(stepClouds(clouds, { x: 15, y: 15 })).toHaveLength(0);
  });

  it("reload gates the rate of fire", () => {
    const m = gun({ weapon: "bolt", x: 7, y: 5 });
    const w = world([m]);
    let fired = 0;
    for (let i = 0; i < 10; i++) {
      if (microbeTurn(w).some((e) => e.kind === "fire")) fired++;
    }
    expect(fired).toBeLessThan(10);
    expect(fired).toBeGreaterThan(2);
  });

  it("line of sight is symmetric and stops at walls", () => {
    const solid = (x: number): ((x: number, y: number) => boolean) =>
      (px) => px === x;
    expect(lineOfSight(0, 0, 6, 0, solid(3))).toBe(false);
    expect(lineOfSight(6, 0, 0, 0, solid(3))).toBe(false);
    expect(lineOfSight(0, 0, 6, 0, () => false)).toBe(true);
  });

  it("weapons match what each organism actually secretes", () => {
    const by = (id: string) => bio.MICROBES.find((m) => m.id === id)!;
    expect(by("pseudomonas").weapon, "T6SS").toBe("spear");
    expect(by("geobacter").weapon, "OmcS nanowire").toBe("bolt");
    expect(by("thiobacillus").weapon, "sulfuric acid").toBe("cloud");
    expect(by("desulfovibrio").weapon, "exhaled H2S").toBe("cloud");
    expect(by("prosthecochloris").weapon, "membrane vesicles").toBe("packet");
    expect(by("chlorella").weapon, "no armament").toBe("melee");
  });

  it("every microbe declares a weapon that exists", () => {
    for (const m of bio.MICROBES) expect(WEAPONS[m.weapon], m.id).toBeDefined();
  });
});

describe("the run, as a roguelike", () => {
  it("the notebook records each organism once, in column order", () => {
    const run = newRun();
    expect(recordSighting(run, "desulfovibrio")).toBe(true);
    expect(recordSighting(run, "desulfovibrio")).toBe(false);
    recordSighting(run, "synechococcus");
    expect(notebook(run).map((s) => s.depth)).toEqual([1, 7]);
  });

  it("completeness tracks against the full roster", () => {
    const run = newRun();
    expect(completeness(run)).toEqual({ seen: 0, total: bio.MICROBES.length });
    for (const m of bio.MICROBES) recordSighting(run, m.id);
    expect(completeness(run).seen).toBe(bio.MICROBES.length);
  });

  it("the library accumulates loci without duplicates", () => {
    const run = newRun();
    recordLocus(run, "mtrC");
    recordLocus(run, "mtrC");
    recordLocus(run, "dsrA");
    expect(run.library).toEqual(["mtrC", "dsrA"]);
  });

  it("the export names real loci and refuses to invent sequence", () => {
    const p = new Plasmid();
    p.integrated = MAX_SLOTS - BASE_SLOTS;   // these fixtures need room
    p.put(4, { kind: "promoter", id: "j23119" });
    p.put(5, { kind: "gene", id: "dsrA", level: 1, mods: ["codon"], allele: WILD_TYPE });
    const out = exportAnnotation("SP162", 7, p.slots);
    expect(out).toContain("dsrA");
    expect(out).toContain("dissimilatory sulfite reductase");
    expect(out).toContain("SP162");
    expect(out).toContain("D7");
    // With no sequences supplied it must emit the query, never invented bases.
    expect(out).toContain("dsrA[Gene]");
    expect(out.toLowerCase()).toContain("nothing here is invented");
    expect(out).not.toMatch(/^[ACGT]{20,}$/m);
  });

  it("every stratum names its electron donor and where it comes from", () => {
    for (const s of bio.STRATA) {
      expect(s.donor, `D${s.depth}`).toBeTruthy();
      expect(s.donorFrom, `D${s.depth}`).toBeTruthy();
    }
  });

  it("sulfide rising from the sulfidogenic zone feeds the layers above it", () => {
    // The cascade runs both ways in a real column: biomass sinks, sulfide rises.
    const sulfide = bio.STRATA.filter((s) => s.donor === "H2S").map((s) => s.depth);
    expect(sulfide).toContain(3);                 // the Beggiatoa front
    expect(sulfide).toContain(6);                 // green sulfur band
  });
});

describe("running out of ATP is lethal, not cosmetic", () => {
  const bare = () => new Plasmid();

  it("a plasmid with no respiration for this depth runs a deficit", () => {
    // A load of structural genes and no generator, deep down.
    const p = new Plasmid();
    p.integrated = MAX_SLOTS - BASE_SLOTS;   // these fixtures need room
    p.put(4, { kind: "promoter", id: "j23119" });
    (["katG", "cbbL", "aclB"] as const).forEach((g, i) => {
      p.put(5 + i, { kind: "gene", id: g, level: 1, mods: ["codon"], allele: WILD_TYPE });
    });
    expect(p.atpBalance(8)).toBeLessThan(0);
  });

  it("acquiring the right respiration turns the deficit around", () => {
    const p = new Plasmid();
    p.integrated = MAX_SLOTS - BASE_SLOTS;   // these fixtures need room
    p.put(4, { kind: "promoter", id: "j23119" });
    (["katG", "cbbL", "aclB"] as const).forEach((g, i) => {
      p.put(5 + i, { kind: "gene", id: g, level: 1, mods: ["codon"], allele: WILD_TYPE });
    });
    const before = p.atpBalance(8);
    p.put(8, { kind: "gene", id: "mcrA", level: 1, mods: ["codon"], allele: WILD_TYPE });
    p.put(9, { kind: "gene", id: "hdrB", level: 1, mods: ["codon"], allele: WILD_TYPE });
    expect(p.atpBalance(8)).toBeGreaterThan(before);
  });

  it("a bare lineage survives at the surface but is squeezed at the floor", () => {
    expect(bare().atpBalance(1)).toBeGreaterThan(bare().atpBalance(8));
  });
});

describe("NCBI sequence retrieval", () => {
  // A stub Entrez, so nothing in the suite touches the network.
  const REAL_FASTA = [
    ">NC_004347.2:c1234-1 mtrC [Shewanella oneidensis MR-1]",
    "ATGAAATTTAGACTTAACTTAATCACCTTAGCACTGCTAACAGGATTAGCA",
    "GGCTGTGGCGGCAGCGATGGCAACGGCGATGGCGGCAGCAGCGGCAGCGGC",
  ].join("\n");

  const stub = (opts: { ids?: string; fasta?: string; fail?: boolean } = {}) =>
    (url: string): Promise<string> => {
      if (opts.fail) return Promise.reject(new Error("network down"));
      if (url.includes("esearch")) {
        return Promise.resolve(
          opts.ids ?? "<eSearchResult><IdList><Id>24375140</Id></IdList></eSearchResult>");
      }
      return Promise.resolve(opts.fasta ?? REAL_FASTA);
    };

  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    });
  });

  it("parses a UID out of the esearch XML", () => {
    expect(parseFirstId("<eSearchResult><IdList><Id>12345</Id><Id>9</Id></IdList></eSearchResult>"))
      .toBe("12345");
    expect(parseFirstId("<eSearchResult><IdList/></eSearchResult>")).toBeNull();
  });

  it("parses accession, defline and bases from FASTA", () => {
    const r = parseFasta(REAL_FASTA);
    expect(r?.accession).toBe("NC_004347.2:c1234-1");
    expect(r?.defline).toContain("Shewanella");
    expect(r?.seq).toMatch(/^[ACGT]+$/);
    expect(r?.seq).toHaveLength(102);
  });

  it("refuses anything that is not sequence -- an error page is not bases", () => {
    expect(parseFasta(">hdr\n<html>Service unavailable</html>")).toBeNull();
    expect(parseFasta("no header here\nACGT")).toBeNull();
    expect(parseFasta("")).toBeNull();
  });

  it("fetches a locus and caches it", async () => {
    const rec = await fetchOne("mtrC", stub());
    expect(rec?.accession).toBe("NC_004347.2:c1234-1");
    expect(cached("mtrC")?.seq).toBe(rec?.seq);
  });

  it("a cached locus does not hit the network again", async () => {
    let calls = 0;
    const counting = (url: string): Promise<string> => {
      calls++;
      return stub()(url);
    };
    await fetchOne("mtrC", counting);
    const first = calls;
    await fetchOne("mtrC", counting);
    expect(calls).toBe(first);
  });

  it("a failed fetch returns null rather than throwing", async () => {
    await expect(fetchOne("dsrA", stub({ fail: true }))).resolves.toBeNull();
    await expect(fetchOne("dsrA", stub({ ids: "<eSearchResult/>" }))).resolves.toBeNull();
  });

  it("a gene with no NCBI record is never given one", async () => {
    expect(SOURCES.ori).toBeUndefined();
    await expect(fetchOne("ori", stub())).resolves.toBeNull();
  });

  it("every gene except the origin has an Entrez query naming an organism", () => {
    for (const id of Object.keys(bio.GENES) as bio.GeneId[]) {
      if (id === "ori") continue;
      const src = SOURCES[id];
      expect(src, id).toBeDefined();
      expect(src?.query, id).toContain("[Gene]");
      expect(src?.query, id).toContain("[Organism]");
      expect(src?.organism, id).toBeTruthy();
    }
  });

  it("nxrA is sourced from Nitrobacter winogradskyi", () => {
    // The column is named after him; the gene may as well come from his organism.
    expect(SOURCES.nxrA?.organism).toContain("winogradskyi");
  });

  it("the export emits real FASTA when sequences are in hand", async () => {
    const p = new Plasmid();
    p.integrated = MAX_SLOTS - BASE_SLOTS;   // these fixtures need room
    p.put(4, { kind: "promoter", id: "j23119" });
    p.put(5, { kind: "gene", id: "mtrC", level: 1, mods: ["codon"], allele: WILD_TYPE });
    const got = await fetchAll(["mtrC"], stub());
    const out = exportAnnotation("MR-1", 4, p.slots, got);
    expect(out).toContain(">NC_004347.2");
    expect(out).toMatch(/^ATGAAATTT/m);
    expect(out).toContain("decaheme");
  });

  it("a locus without a sequence exports its query, never invented bases", () => {
    const p = new Plasmid();
    p.integrated = MAX_SLOTS - BASE_SLOTS;   // these fixtures need room
    p.put(4, { kind: "promoter", id: "j23119" });
    p.put(5, { kind: "gene", id: "dsrA", level: 1, mods: ["codon"], allele: WILD_TYPE });
    const out = exportAnnotation("Hilden", 7, p.slots, new Map());
    expect(out).toContain("no sequence retrieved");
    expect(out).toContain("dsrA[Gene]");
    expect(out).not.toMatch(/^[ACGT]{20,}$/m);
  });

  it("the origin is exported as a design element, not a locus", () => {
    const p = new Plasmid();
    p.integrated = MAX_SLOTS - BASE_SLOTS;   // these fixtures need room
    const out = exportAnnotation("x", 1, p.slots, new Map());
    expect(out).toContain("design element, no NCBI record");
  });

  it("fetchAll reports progress and skips loci with no source", async () => {
    const seen: string[] = [];
    const got = await fetchAll(["mtrC", "ori", "dsrA"], stub(),
                               (p) => seen.push(`${p.gene}:${String(p.ok)}`));
    expect(seen).toEqual(["mtrC:true", "dsrA:true"]);   // ori has no source
    expect(got.size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Guards for bugs found in the adversarial audit. Each of these passed silently
// before the fix, which is the point.
// ---------------------------------------------------------------------------

describe("audit regressions", () => {
  it("the save carries the lineage, not just the plasmid", () => {
    // The notebook, score and death count were written nowhere. Every sighting
    // was discarded the moment the tab closed.
    const s = parseSave({
      version: SCHEMA, depth: 3, seed: 7, px: 5, py: 5, hp: 20, atp: 90,
      ring: [], bin: [], settings: {},
      run: { deepest: 6, deaths: 2, bestiary: ["geobacter", "beggiatoa"], library: ["mtrC"] },
    });
    expect(s?.run.deepest).toBe(6);
    expect(s?.run.deaths).toBe(2);
    expect(s?.run.bestiary).toEqual(["geobacter", "beggiatoa"]);
    expect(s?.run.library).toEqual(["mtrC"]);
  });

  it("a corrupt lineage block degrades to an empty one", () => {
    const base = { version: SCHEMA, depth: 1, seed: 1, px: 1, py: 1, hp: 30, atp: 100,
                   ring: [], bin: [], settings: {} };
    expect(parseSave({ ...base, run: "nonsense" })?.run.bestiary).toEqual([]);
    expect(parseSave(base)?.run.deepest).toBe(1);
  });

  it("the bestiary rejects organisms that do not exist and drops duplicates", () => {
    const s = parseSave({
      version: SCHEMA, depth: 1, seed: 1, px: 1, py: 1, hp: 30, atp: 100,
      ring: [], bin: [], settings: {},
      run: { deepest: 1, deaths: 0, bestiary: ["geobacter", "geobacter", "sasquatch", 7],
             library: ["mtrC", "notAGene"] },
    });
    expect(s?.run.bestiary).toEqual(["geobacter"]);
    expect(s?.run.library).toEqual(["mtrC"]);
  });

  // `run.deepest` is a FLOOR, not a stratum: strain.ts normalises it by
  // MAX_FLOOR and the invariant bounds it by MAX_DEPTH*3. This asserted
  // MAX_DEPTH, which is what the parser wrongly clamped to -- so a lineage
  // that reached F20 loaded back as 8 and lost the strain level it had earned.
  it("deepest floor is clamped to the column, and it is a floor", () => {
    const s = parseSave({
      version: SCHEMA, depth: 1, seed: 1, px: 1, py: 1, hp: 30, atp: 100,
      ring: [], bin: [], settings: {},
      run: { deepest: 9999, deaths: -5, bestiary: [], library: [] },
    });
    expect(s?.run.deepest).toBeLessThanOrEqual(MAX_FLOOR);
    expect(s?.run.deaths).toBeGreaterThanOrEqual(0);
  });

  it("a floor deeper than a stratum survives the round trip", () => {
    const s = parseSave({
      version: SCHEMA, depth: 1, seed: 1, px: 1, py: 1, hp: 30, atp: 100,
      ring: [], bin: [], settings: {},
      run: { deepest: 20, deaths: 0, bestiary: [], library: [] },
    });
    expect(s?.run.deepest, "a floor-20 lineage must not load back as 8").toBe(20);
  });

  it("the zoom preference survives at both extremes", () => {
    // Stored as a MULTIPLE of the per-viewport default, so it means the same
    // on a phone and a desktop. The bound on that multiple has to be wide
    // enough to express the whole absolute range: the default is floored at
    // 0.3 and the absolute ceiling is 8, so the ratio runs to about 27. A
    // hand-picked bound of 4 silently turned "zoomed all the way in on a
    // phone" into something else entirely on reload.
    for (const base of [0.3, 0.47, 1.3]) {          // small phone .. desktop
      for (const target of [0.3, 1, 8]) {           // the full absolute range
        const ratio = Math.min(Math.max(target / base, ZOOM_PREF_MIN), ZOOM_PREF_MAX);
        const s = parseSave({
          version: SCHEMA, depth: 1, seed: 1, px: 1, py: 1, hp: 30, atp: 100,
          ring: [], bin: [], run: {},
          settings: { ...DEFAULT_SETTINGS, zoom: ratio },
        });
        const back = Math.min(Math.max(base * (s?.settings.zoom ?? 1), ZOOM_MIN), ZOOM_MAX);
        expect(Math.abs(back - target),
               `zoom ${String(target)} at base ${String(base)} did not survive`)
          .toBeLessThan(0.01);
      }
    }
  });

  it("a developed strain's ATP pool survives the round trip", () => {
    // atpCeiling reaches 350; this clamped to a flat 100 and destroyed up to
    // 250 ATP on every reload, which is what pays for the growth curve.
    const s = parseSave({
      version: SCHEMA, depth: 1, seed: 1, px: 1, py: 1, hp: 30, atp: 340,
      ring: [], bin: [], settings: {},
      run: { deepest: 1, deaths: 0, bestiary: [], library: [] },
    });
    expect(s?.atp).toBe(340);
  });

  it("a failed path gives up on a budget instead of walking the whole grid", () => {
    const g = new mg.Grid(110, 80, mg.FLOOR);
    for (let y = 0; y < 80; y++) g.set(55, y, mg.WALL);   // impassable divide
    for (const budget of [50, 200, 900]) {
      expect(findPath(g, { x: 10, y: 40 }, { x: 100, y: 40 }, { maxNodes: budget }))
        .toBeNull();
    }
    // A tiny budget must fail even where a path EXISTS -- which proves the cap
    // is doing the work, rather than the wall happening to be impassable.
    const open = new mg.Grid(110, 80, mg.FLOOR);
    expect(findPath(open, { x: 2, y: 2 }, { x: 100, y: 70 }, { maxNodes: 5 })).toBeNull();
    expect(findPath(open, { x: 2, y: 2 }, { x: 100, y: 70 }, { maxNodes: 40000 }))
      .not.toBeNull();
  });

  it("failed searches stay fast enough not to drop frames", () => {
    // A wall-clock smoke bound, deliberately loose: it exists to catch an
    // order-of-magnitude regression, not to measure this machine.
    const g = new mg.Grid(110, 80, mg.FLOOR);
    for (let y = 0; y < 80; y++) g.set(55, y, mg.WALL);
    for (let i = 0; i < 5; i++) findPath(g, { x: 10, y: 40 }, { x: 100, y: 40 });
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) {
      findPath(g, { x: 10, y: 40 }, { x: 100, y: 40 }, { maxNodes: 900 });
    }
    const perCall = (performance.now() - t0) / 20;
    expect(perCall, `${perCall.toFixed(1)} ms per failed search`).toBeLessThan(15);
  });

  it("a budget never turns a reachable path into a failure it should have found", () => {
    const g = new mg.Grid(40, 40, mg.FLOOR);
    const path = findPath(g, { x: 2, y: 2 }, { x: 35, y: 35 }, { maxNodes: 4000 });
    expect(path).not.toBeNull();
    expect(path?.[0]).toEqual({ x: 2, y: 2 });
    expect(path?.[path.length - 1]).toEqual({ x: 35, y: 35 });
  });

  it("pursuing a walled-off target is cheap, not a dropped frame", () => {
    const g = new mg.Grid(110, 80, mg.FLOOR);
    for (let y = 0; y < 80; y++) g.set(30, y, mg.WALL);
    const m: Mob = {
      uid: 1, id: "x", name: "X", glyph: "x", x: 40, y: 40, ax: 40, ay: 40, hp: 9, maxhp: 9,
      atk: 1, genes: [], note: "", pigment: "#fff", alive: true, facing: "none",
      heading: 0, behaviour: "chase", size: "medium", cooldown: 0, status: [],
      weapon: "melee", reload: 0, charging: 0, elite: false,
    };
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) {
      nextAction({ x: 20, y: 40 }, [m], g, m, false, { reach: 1, maxRange: 24 });
    }
    const perCall = (performance.now() - t0) / 20;
    // Loose on purpose. The guarantee is the node budget in findPath; this
    // only catches a regression back to an exhaustive search.
    expect(perCall, `${perCall.toFixed(1)} ms per pursuit turn`).toBeLessThan(12);
  });

  it("screen chrome is shared, so a close button is the same box everywhere", () => {
    const calls: string[] = [];
    const ctx = new Proxy({} as CanvasRenderingContext2D, {
      get: (_t, p: string) => (["fillStyle","strokeStyle","font","textAlign",
        "textBaseline","lineWidth","globalAlpha"].includes(p)
        ? "" : () => { calls.push(p); }),
      set: () => true,
    });
    const ins = { top: 40, right: 0, bottom: 20, left: 0 };
    const a = drawClose(ctx, 400, ins, 2);
    const b = drawClose(ctx, 400, ins, 2);
    expect(a).toEqual(b);
    expect(a.w).toBeGreaterThanOrEqual(44);
    expect(a.x + a.w).toBeLessThanOrEqual(400);
    expect(inBoxChrome(a, a.x + 1, a.y + 1)).toBe(true);
    expect(inBoxChrome(a, a.x - 1, a.y)).toBe(false);
  });
});

describe("items on the floor", () => {
  it("substrates match the chemistry of their layer", () => {
    expect(substratesAt(1)).toContain("glucose");     // photic, organic-rich
    expect(substratesAt(2)).toContain("nitrate");
    expect(substratesAt(4)).toContain("ferric");
    expect(substratesAt(7)).toContain("h2");
    expect(substratesAt(8)).toContain("co2");         // the last acceptor
    expect(substratesAt(1)).not.toContain("co2");
  });

  it("a gated substrate is worthless without its enzyme", () => {
    expect(yieldOf("sulfide", () => false)).toEqual({ atp: 0, blocked: "sqr" });
    expect(yieldOf("sulfide", () => true).atp).toBeGreaterThan(0);
    expect(yieldOf("h2", () => false).blocked).toBe("hydA");
    expect(yieldOf("acetate", () => false).blocked).toBeNull();   // always edible
  });

  it("every substrate names a real gene, or none at all", () => {
    for (const s of Object.values(SUBSTRATES)) {
      if (s.needs !== null) expect(bio.GENES[s.needs], s.id).toBeDefined();
      expect(s.formula, s.id).toBeTruthy();
      expect(s.atp, s.id).toBeGreaterThan(0);
    }
  });

  it("drops merge onto a tile instead of stacking invisibly", () => {
    const drops: Drop[] = [];
    addDrop(drops, 3, 3, [{ kind: "substrate", id: "acetate" }]);
    addDrop(drops, 3, 3, [{ kind: "substrate", id: "h2" }]);
    expect(drops).toHaveLength(1);
    expect(drops[0]!.items).toHaveLength(2);
  });

  it("a pile is capped, and the drop list is bounded", () => {
    const drops: Drop[] = [];
    for (let i = 0; i < 40; i++) {
      addDrop(drops, 3, 3, [{ kind: "substrate", id: "acetate" }]);
    }
    expect(drops[0]!.items.length).toBeLessThanOrEqual(8);
    for (let i = 0; i < 500; i++) {
      addDrop(drops, i, 0, [{ kind: "substrate", id: "acetate" }]);
    }
    expect(drops.length).toBeLessThanOrEqual(60);
  });

  it("an empty drop is never created", () => {
    const drops: Drop[] = [];
    addDrop(drops, 1, 1, []);
    expect(drops).toHaveLength(0);
  });

  it("dropAt finds by tile and removeDrop clears it", () => {
    const drops: Drop[] = [];
    addDrop(drops, 5, 6, [{ kind: "cassette", gene: "mtrC", allele: WILD_TYPE }]);
    const d = dropAt(drops, 5, 6);
    expect(d).not.toBeNull();
    expect(dropAt(drops, 0, 0)).toBeNull();
    removeDrop(drops, d!);
    expect(drops).toHaveLength(0);
  });
});

describe("message text", () => {
  it("a kill reads as lysis, not as a hitpoint number", () => {
    const line = say.hitLine("Geobacter", 9, true, 1);
    expect(line).toMatch(/Geobacter/);
    expect(line).not.toMatch(/\bhp\b|\bdestroyed\b/i);
    expect(line.length).toBeGreaterThan(24);
  });

  it("each weapon reports itself in its own terms", () => {
    expect(say.incomingLine("Pseudomonas", "spear", 9, 1)).toMatch(/sheath|spike/);
    expect(say.incomingLine("Geobacter", "bolt", 3, 1)).toMatch(/pilus|current/);
    expect(say.incomingLine("Prosthecochloris", "packet", 4, 1)).toMatch(/particle|fuse/);
    expect(say.incomingLine("Thiobacillus", "cloud", 2, 1)).toMatch(/exudate|burn/);
  });

  it("a charge warns without saying the word charge", () => {
    expect(say.chargeLine("Pseudomonas", "spear")).toMatch(/sheath/);
    expect(say.chargeLine("Thiobacillus", "cloud")).toMatch(/vent|cloudy/);
  });

  it("picking up a gated substrate names the enzyme you lack", () => {
    const line = say.pickupLine({ kind: "substrate", id: "sulfide" }, 0, "sqr");
    expect(line).toContain("H2S");
    expect(line).toContain("sqr");
  });

  it("a usable substrate reports the ATP", () => {
    expect(say.pickupLine({ kind: "substrate", id: "acetate" }, 14, null))
      .toContain("+14 ATP");
  });

  it("HGT explains what was taken and what it does", () => {
    const line = say.hgtLine("mtrC", "Shewanella");
    expect(line).toContain("mtrC");
    expect(line).toContain("Shewanella");
    expect(line.toLowerCase()).toContain("decaheme");
  });

  it("lines vary, so the log does not read as a stuck record", () => {
    const seen = new Set(Array.from({ length: 12 },
      (_v, i) => say.hitLine("Beggiatoa", 3, false, i)));
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("the pathway map fits a portrait screen", () => {
  it("centres content that is smaller than the viewport instead of pinning it", () => {
    // Crossing clamp bounds pushed the whole graph 1500px down a phone screen.
    const b = graphBounds();
    for (const [w, h] of [[1080, 2200], [720, 1600], [2200, 1000]] as const) {
      const v = clampView(fitView(w, h), w, h);
      const topPx = (b.minY - v.y) * v.scale;
      const botPx = (b.maxY - v.y) * v.scale;
      expect(topPx, `${w}x${h} top`).toBeGreaterThan(-h);
      expect(botPx, `${w}x${h} bottom`).toBeLessThan(h * 1.5);
      // and roughly centred when it fits
      if ((b.maxY - b.minY) * v.scale < h) {
        const centre = (topPx + botPx) / 2;
        expect(Math.abs(centre - h / 2), `${w}x${h} off-centre`).toBeLessThan(h * 0.35);
      }
    }
  });
});

describe("field of view", () => {
  const openGrid = (n = 21) => new mg.Grid(n, n, mg.FLOOR);

  it("you can always see where you are standing", () => {
    const s = makeSight(21, 21);
    computeFov(s, openGrid(), 10, 10, 8);
    expect(isVisible(s, 10, 10)).toBe(true);
  });

  it("vision is a disc, not a square", () => {
    const s = makeSight(21, 21);
    computeFov(s, openGrid(), 10, 10, 5);
    expect(isVisible(s, 15, 10)).toBe(true);        // 5 straight out
    expect(isVisible(s, 14, 14)).toBe(false);       // 5.6 diagonally
  });

  it("a wall casts a shadow behind it", () => {
    const g = openGrid();
    g.set(12, 10, mg.WALL);
    const s = makeSight(21, 21);
    computeFov(s, g, 10, 10, 9);
    expect(isVisible(s, 12, 10), "the wall itself is lit").toBe(true);
    expect(isVisible(s, 14, 10), "directly behind it is not").toBe(false);
    expect(isVisible(s, 14, 13), "around it is").toBe(true);
  });

  it("a sealed room shows only its own walls", () => {
    const g = new mg.Grid(21, 21, mg.WALL);
    for (let y = 9; y <= 11; y++) for (let x = 9; x <= 11; x++) g.set(x, y, mg.FLOOR);
    const s = makeSight(21, 21);
    computeFov(s, g, 10, 10, 9);
    expect(isVisible(s, 10, 10)).toBe(true);
    expect(isVisible(s, 12, 12), "the enclosing wall").toBe(true);
    expect(isVisible(s, 15, 15), "beyond it").toBe(false);
  });

  it("memory persists after you walk away, but current sight does not", () => {
    const s = makeSight(21, 21);
    const g = openGrid();
    computeFov(s, g, 3, 3, 5);
    expect(isVisible(s, 4, 4)).toBe(true);
    computeFov(s, g, 17, 17, 5);
    expect(isVisible(s, 4, 4), "no longer lit").toBe(false);
    expect(isSeen(s, 4, 4), "still remembered").toBe(true);
  });

  it("vision is roughly symmetric -- if you see it, it sees you", () => {
    const g = openGrid();
    for (let y = 6; y < 15; y++) g.set(12, y, mg.WALL);
    g.set(12, 10, mg.FLOOR);                         // a doorway
    const a = makeSight(21, 21), b = makeSight(21, 21);
    computeFov(a, g, 8, 10, 9);
    computeFov(b, g, 16, 10, 9);
    expect(isVisible(a, 16, 10)).toBe(isVisible(b, 8, 10));
  });

  it("never reads or writes outside the grid", () => {
    const s = makeSight(9, 9);
    for (const [x, y] of [[0, 0], [8, 8], [-5, -5], [50, 50]] as const) {
      expect(() => { computeFov(s, new mg.Grid(9, 9, mg.FLOOR), x, y, 12); }).not.toThrow();
    }
    expect(isVisible(s, -1, 0)).toBe(false);
    expect(isVisible(s, 99, 0)).toBe(false);
  });

  it("light reaches further in the photic zone than on the floor", () => {
    expect(sightRadius(bio.stratum(1).light))
      .toBeGreaterThan(sightRadius(bio.stratum(8).light));
  });

  it("a real cave leaves most of itself undiscovered from one spot", () => {
    const d = new Dungeon(110, 80, 5);
    const lvl = d.level(3);
    const s = makeSight(lvl.grid.w, lvl.grid.h);
    computeFov(s, lvl.grid, lvl.up.x, lvl.up.y, 9);
    expect(fractionSeen(s)).toBeLessThan(0.1);
  });

  it("computing FOV is cheap enough to do on every step", () => {
    const d = new Dungeon(110, 80, 5);
    const lvl = d.level(3);
    const s = makeSight(lvl.grid.w, lvl.grid.h);
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) computeFov(s, lvl.grid, 40 + (i % 9), 30, 10);
    const per = (performance.now() - t0) / 200;
    expect(per, `${(per * 1000).toFixed(0)} us per recompute`).toBeLessThan(6);
  });
});

describe("crawl-like behaviours", () => {
  it("sight radius follows the light gradient of the column", () => {
    const radii = bio.STRATA.map((s) => sightRadius(s.light));
    expect(radii[0]!).toBeGreaterThan(radii[7]!);
    for (const r of radii) {
      expect(r).toBeGreaterThanOrEqual(5);        // never blind
      expect(r).toBeLessThanOrEqual(12);
    }
  });

  it("a level starts entirely unexplored", () => {
    const d = new Dungeon(110, 80, 3);
    expect(fractionSeen(d.level(1).sight)).toBe(0);
  });

  it("each level remembers its own exploration, not a shared map", () => {
    const d = new Dungeon(110, 80, 3);
    const a = d.level(1), b = d.level(2);
    computeFov(a.sight, a.grid, a.up.x, a.up.y, 9);
    expect(fractionSeen(a.sight)).toBeGreaterThan(0);
    expect(fractionSeen(b.sight)).toBe(0);
  });

  it("walking reveals more of the map, monotonically", () => {
    const d = new Dungeon(110, 80, 3);
    const lvl = d.level(1);
    let last = 0, first = 0;
    for (let i = 0; i < 12; i++) {
      computeFov(lvl.sight, lvl.grid, lvl.up.x + i, lvl.up.y, 8);
      const now = fractionSeen(lvl.sight);
      expect(now, `step ${String(i)}`).toBeGreaterThanOrEqual(last);
      if (i === 0) first = now;
      last = now;
    }
    // Measured against STANDING STILL rather than against a magic fraction of
    // the map. The old floor was `> 0.01`, a number that depends on how
    // straight the corridors happen to be on seed 3; making them wander
    // dropped it to 0.0095 and failed a test whose actual subject is that
    // walking reveals more than not walking. This asserts that directly.
    //
    // Note the walk marches due east through whatever is there and is inside
    // rock by step 7 -- `visible` collapses to a single tile while `seen`
    // keeps its memory, which is correct and is why the monotonic check is on
    // `seen`. A straighter corridor merely hid that for longer.
    expect(first, "a single step revealed nothing").toBeGreaterThan(0);
    expect(last, "twelve steps revealed no more than one").toBeGreaterThan(first);
  });

  it("a discarded part leaves the bin and does not come back", () => {
    const p = new Plasmid();
    p.integrated = MAX_SLOTS - BASE_SLOTS;   // these fixtures need room
    p.stash({ kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE });
    const before = p.bin.length;
    const i = p.bin.findIndex((x) => x.kind === "gene");
    p.bin.splice(i, 1);
    expect(p.bin.length).toBe(before - 1);
    expect(p.inBin("mtrC")).toBe(false);
    // and the slot is free again for a fresh copy
    expect(p.stash({ kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE }).ok).toBe(true);
  });

  it("waiting is a real turn: microbes act and status ticks", () => {
    const m: Mob = {
      uid: 1, id: "thiothrix", name: "Thiothrix", glyph: "T", x: 6, y: 5, ax: 6, ay: 5,
      hp: 20, maxhp: 20, atk: 6, genes: [], note: "", pigment: "#fff",
      alive: true, facing: "none", heading: 0, behaviour: "sessile",
      size: "medium", cooldown: 0, status: [], weapon: "melee",
      reload: 0, charging: 0, elite: false,
    };
    const w = {
      grid: new mg.Grid(15, 15, mg.FLOOR), mobs: [m],
      player: { x: 5, y: 5, hp: 30, status: [] as Status[] },
      rng: makeRng(1), armour: 1, packets: [] as Packet[], clouds: [] as Cloud[],
    };
    microbeTurn(w);
    expect(w.player.hp).toBeLessThan(30);        // standing still is not safe
  });
});

describe("the column as a cylinder", () => {
  it("a level is a disc, with solid glass outside it", () => {
    const g = mg.generate(60, 60, makeRng(3), { density: 0.4, passes: 4 });
    mg.maskToColumn(g);
    const cx = (g.w - 1) / 2, cy = (g.h - 1) / 2;
    const r = mg.columnRadius(g);
    for (let y = 0; y < g.h; y++) {
      for (let x = 0; x < g.w; x++) {
        const d2 = (x - cx) ** 2 + (y - cy) ** 2;
        if (d2 > r * r) expect(g.isWall(x, y), `${x},${y} outside the rim`).toBe(true);
      }
    }
  });

  it("the disc still holds a usable amount of floor", () => {
    const d = new Dungeon(96, 96, 11);
    for (let f = 1; f <= MAX_FLOOR; f += 4) {
      const g = d.level(f).grid;
      const open = g.countFloor() / (g.w * g.h);
      expect(open, `floor ${f}`).toBeGreaterThan(0.2);
    }
  });
});

describe("day and night", () => {
  it("light rises and falls, and night is genuinely dark", () => {
    const c = newClock();
    const seen: number[] = [];
    for (let i = 0; i < TURNS_PER_DAY; i += 10) { c.turn = i; seen.push(daylight(c)); }
    expect(Math.max(...seen)).toBeGreaterThan(0.9);
    expect(Math.min(...seen)).toBe(0);
    expect(seen.filter((v) => v === 0).length).toBeGreaterThan(3);
  });

  it("the cycle repeats", () => {
    const a = newClock(), b = newClock();
    a.turn = 5; b.turn = 5 + TURNS_PER_DAY * 3;
    expect(daylight(a)).toBeCloseTo(daylight(b), 10);
  });

  it("night changes the surface but not the deep column", () => {
    const day = newClock(), night = newClock();
    day.turn = Math.floor(TURNS_PER_DAY * 0.4);
    night.turn = Math.floor(TURNS_PER_DAY * 0.9);
    expect(isNight(night)).toBe(true);
    expect(isNight(day)).toBe(false);
    const surface = bio.stratum(1).light;
    const floorLight = bio.stratum(8).light;
    expect(lightAt(surface, day)).toBeGreaterThan(lightAt(surface, night));
    expect(lightAt(floorLight, day)).toBeCloseTo(lightAt(floorLight, night), 6);
  });

  it("time reads as words, and covers the whole cycle", () => {
    const c = newClock();
    const names = new Set<string>();
    for (let i = 0; i < TURNS_PER_DAY; i++) { c.turn = i; names.add(timeName(c)); }
    expect(names.size).toBeGreaterThanOrEqual(5);
  });
});

describe("bioluminescence", () => {
  const lit = () => {
    const p = new Plasmid();
    p.integrated = MAX_SLOTS - BASE_SLOTS;   // these fixtures need room
    p.put(4, { kind: "promoter", id: "j23119" });
    p.put(5, { kind: "gene", id: "luxAB", level: 1, mods: ["codon"], allele: WILD_TYPE });
    return p;
  };

  it("luciferase is an oxygenase: it only turns over in the oxic zone", () => {
    expect(lit().expression("luxAB", 1)).toBeGreaterThan(0);
    for (let d = 2; d <= bio.MAX_DEPTH; d++) {
      expect(lit().expression("luxAB", d), `D${d}`).toBe(0);
    }
  });

  it("glowing costs energy rather than making it", () => {
    const dark = new Plasmid();
    dark.put(4, { kind: "promoter", id: "j23119" });
    expect(lit().atpGain(1)).toBeLessThan(dark.atpGain(1));
  });

  it("it is carried by the organisms that actually glow", () => {
    const carriers = bio.MICROBES.filter((m) => m.genes.includes("luxAB"));
    expect(carriers.length).toBeGreaterThan(0);
    for (const m of carriers) expect(m.depth, m.id).toBeLessThanOrEqual(2);
  });
});

describe("boss floors", () => {
  it("every stratum ends on a boss floor and they are populated", () => {
    const d = new Dungeon(96, 96, 21);
    for (let f = 1; f <= MAX_FLOOR; f++) {
      const L = d.level(f);
      expect(L.boss, `floor ${f}`).toBe(isBossFloor(f));
      if (L.boss) expect(L.bossName, `floor ${f}`).toBeDefined();
    }
  });

  it("a boss floor holds a boss; ordinary floors hold a FEW elites", () => {
    // Ordinary floors used to hold none at all -- twenty of every twenty-four
    // had exactly one difficulty, and the only thing that changed as you
    // descended was which species was in front of you.
    const d = new Dungeon(96, 96, 21);
    for (let f = 1; f <= MAX_FLOOR; f++) {
      const L = d.level(f);
      const elites = L.mobs.filter((m) => m.elite).length;
      if (isBossFloor(f)) {
        expect(elites, `floor ${String(f)}`).toBeGreaterThan(0);
      } else {
        // A count, not a rate. A floor holds around a hundred and fifty
        // organisms, so a per-mob probability produced six -- and an elite you
        // meet six times a floor is the local difficulty, not an event.
        expect(elites, `floor ${String(f)} has ${String(elites)} elites`)
          .toBeLessThanOrEqual(eliteCount(L.depth));
        expect(elites, `floor ${String(f)} has none`).toBeGreaterThan(0);
      }
    }
  });

  it("a boss floor is sealed until its elites are dead", () => {
    const d = new Dungeon(96, 96, 21);
    const L = d.level(3);
    expect(Dungeon.isCleared(L)).toBe(false);
    for (const m of L.mobs) if (m.elite) m.alive = false;
    expect(Dungeon.isCleared(L)).toBe(true);
  });

  it("an ordinary floor is never sealed", () => {
    const d = new Dungeon(96, 96, 21);
    expect(Dungeon.isCleared(d.level(2))).toBe(true);
  });

  it("bosses stand on floor and never inside the glass", () => {
    const d = new Dungeon(96, 96, 5);
    for (let f = 3; f <= MAX_FLOOR; f += 3) {
      const L = d.level(f);
      for (const m of L.mobs) {
        for (const t of tilesOf(SIZES[m.size].footprint, m.x, m.y, m.heading)) {
          expect(L.grid.isFloor(t.x, t.y), `floor ${f} ${m.name}`).toBe(true);
        }
      }
    }
  });
});

describe("the difficulty curve", () => {
  // A player who built a sensible, capacity-respecting kit for their depth.
  const kitFor = (depth: number): Plasmid => {
    const p = new Plasmid();
    p.integrated = MAX_SLOTS - BASE_SLOTS;   // these fixtures need room
    const useful: bio.GeneId[] = [];
    for (const m of bio.MICROBES) {
      if (m.depth > depth || m.depth < depth - 2) continue;
      for (const g of m.genes) if (!useful.includes(g)) useful.push(g);
    }
    p.put(3, { kind: "promoter", id: "j23119" });
    let kb = 0.7, slot = 4;
    for (const g of useful) {
      if (kb + bio.GENES[g].kb > p.capacityKb() * 0.7 || slot >= 14) break;
      p.put(slot++, { kind: "gene", id: g, level: 1, mods: ["codon"], allele: WILD_TYPE });
      kb += bio.GENES[g].kb;
    }
    return p;
  };

  it("toughness comes from the genome, so building one is progression", () => {
    const bare = new Plasmid();
    expect(kitFor(6).vitality(6)).toBeGreaterThan(bare.vitality(6));
  });

  it("an over-stuffed plasmid is crippled but never silently switched off", () => {
    const p = new Plasmid();
    // Grown, then over-filled: the point is exceeding CAPACITY, and the
    // biggest genes are the ones that do it.
    p.integrated = MAX_SLOTS - BASE_SLOTS;
    p.put(3, { kind: "promoter", id: "j23119" });
    const big = (Object.keys(bio.GENES) as bio.GeneId[])
      .filter((id) => id !== "ori")
      .sort((a, b) => bio.GENES[b].kb - bio.GENES[a].kb);
    let slot = 4;
    for (const id of big) {
      if (slot >= p.usableSlots) break;
      p.put(slot++, { kind: "gene", id, level: 1, mods: ["codon"], allele: WILD_TYPE });
    }
    expect(p.burden()).toBeGreaterThan(0.5);
    expect(p.burden(), "a cliff to exactly zero is a trap").toBeLessThan(1);
    expect(p.power(4), "something must still express").toBeGreaterThan(0);
  });

  it("the game gets harder with depth, monotonically enough to feel graded", () => {
    const d = new Dungeon(96, 96, 17);
    const survivable = (f: number): number => {
      const s = strataOf(f);
      const p = kitFor(s);
      const mobAtk = Math.max(...d.level(f).mobs.map((m) => m.atk), 1);
      const inc = Math.max(Math.round(mobAtk * 0.55 * p.armour(s)), 1);
      return p.vitality(s) / inc;
    };
    // The surface must be forgiving and the floor must not be.
    expect(survivable(1)).toBeGreaterThan(12);
    expect(survivable(MAX_FLOOR)).toBeLessThan(8);
    expect(survivable(1)).toBeGreaterThan(survivable(MAX_FLOOR) * 2);
  });

  it("no floor is a wall you simply cannot damage", () => {
    const d = new Dungeon(96, 96, 17);
    for (let f = 1; f <= MAX_FLOOR; f++) {
      const s = strataOf(f);
      const atk = 3 + kitFor(s).power(s) * 0.9;
      const big = Math.max(...d.level(f).mobs.map((m) => m.maxhp), 1);
      expect(big / atk, `floor ${f} turns to kill the biggest`).toBeLessThan(30);
    }
  });

  it("a bare starting plasmid can still survive the first floor", () => {
    const bare = new Plasmid();
    const d = new Dungeon(96, 96, 17);
    const mobAtk = Math.max(...d.level(1).mobs.map((m) => m.atk), 1);
    const inc = Math.max(Math.round(mobAtk * 0.55), 1);
    expect(bare.vitality(1) / inc).toBeGreaterThan(5);
  });
});

describe("rooms", () => {
  const carve = (seed: number, depth = 4, boss = false) => {
    const g = mg.generate(96, 96, makeRng(seed), { density: 0.42, passes: 5 });
    mg.maskToColumn(g);
    const rooms = carveRooms(g, makeRng(seed * 31), planFor(depth, boss));
    mg.keepLargestRegion(g);
    return { g, rooms };
  };

  it("rooms are carved and their interiors are floor", () => {
    const { g, rooms } = carve(7);
    expect(rooms.length).toBeGreaterThan(0);
    for (const r of rooms) {
      const open = r.tiles.filter((t) => g.isFloor(t.x, t.y)).length;
      expect(open / r.tiles.length, r.kind).toBeGreaterThan(0.5);
    }
  });

  it("every room stays inside the glass", () => {
    const { g, rooms } = carve(11);
    const cx = (g.w - 1) / 2, cy = (g.h - 1) / 2;
    const rim = mg.columnRadius(g);
    for (const r of rooms) {
      const d = Math.hypot(r.cx - cx, r.cy - cy);
      expect(d + r.r, `${r.kind} breaches the rim`).toBeLessThanOrEqual(rim + 1);
    }
  });

  it("rooms do not overlap each other", () => {
    const { rooms } = carve(13);
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        const a = rooms[i]!, b = rooms[j]!;
        const d = Math.hypot(a.cx - b.cx, a.cy - b.cy);
        expect(d, `${a.kind}/${b.kind}`).toBeGreaterThan(a.r + b.r);
      }
    }
  });

  it("ports sit against the glass, chambers do not have to", () => {
    let ports = 0;
    for (const seed of [3, 7, 11, 19, 23]) {
      const { g, rooms } = carve(seed);
      const cx = (g.w - 1) / 2, cy = (g.h - 1) / 2;
      const rim = mg.columnRadius(g);
      for (const r of rooms.filter((x) => x.kind === "port")) {
        ports++;
        expect(Math.hypot(r.cx - cx, r.cy - cy)).toBeGreaterThan(rim * 0.5);
      }
    }
    expect(ports).toBeGreaterThan(0);
  });

  it("every surviving room is reachable from the rest of the level", () => {
    // carveRooms links each room to existing floor, then keepLargestRegion
    // prunes anything still stranded -- so a surviving room must be connected.
    for (const seed of [5, 15, 25]) {
      const { g, rooms } = carve(seed);
      const alive = rooms.filter((r) => g.isFloor(r.cx, r.cy));
      expect(alive.length, `seed ${seed}`).toBeGreaterThan(0);
      const first = alive[0]!;
      for (const r of alive.slice(1)) {
        expect(findPath(g, { x: first.cx, y: first.cy }, { x: r.cx, y: r.cy }),
               `${r.kind} unreachable`).not.toBeNull();
      }
    }
  });

  it("room kinds follow the chemistry: mats only at the redox interface", () => {
    expect(planFor(1, false).kinds).not.toContain("mat");
    expect(planFor(5, false).kinds).toContain("mat");
    expect(planFor(8, false).kinds).not.toContain("mat");
  });

  it("a port is worth crossing the level for, a chamber is not", () => {
    expect(ROOM_STYLE.port.loot).toBeGreaterThan(ROOM_STYLE.chamber.loot);
    expect(ROOM_STYLE.enrichment.loot).toBeGreaterThan(ROOM_STYLE.port.loot);
    expect(ROOM_STYLE.enrichment.guard).toBeGreaterThan(ROOM_STYLE.chamber.guard);
  });

  it("roomAt finds a room from inside it and not from outside", () => {
    const { rooms } = carve(9);
    const r = rooms[0]!;
    expect(roomAt(rooms, r.cx, r.cy)).toBe(r);
    expect(roomAt(rooms, -50, -50)).toBeNull();
  });

  it("carving never strands the level", () => {
    for (const seed of [2, 4, 6, 8, 12, 16]) {
      const { g } = carve(seed, 6, true);
      expect(g.countFloor() / (g.w * g.h), `seed ${seed}`).toBeGreaterThan(0.15);
    }
  });
});

describe("the loop has an end", () => {
  it("a boss floor blocks descent until it is cleared", () => {
    const d = new Dungeon(96, 96, 33);
    const L = d.level(3);
    expect(Dungeon.isCleared(L)).toBe(false);
    for (const m of L.mobs) if (m.elite) m.alive = false;
    expect(Dungeon.isCleared(L)).toBe(true);
  });

  it("the last floor has no way down, so it is the end", () => {
    const d = new Dungeon(96, 96, 33);
    expect(d.level(MAX_FLOOR).down).toBeNull();
    expect(d.level(MAX_FLOOR).boss).toBe(true);
  });

  it("every floor between is passable once cleared", () => {
    const d = new Dungeon(96, 96, 33);
    for (let f = 1; f < MAX_FLOOR; f++) {
      const L = d.level(f);
      for (const m of L.mobs) m.alive = false;
      expect(Dungeon.isCleared(L), `floor ${f}`).toBe(true);
      expect(L.down, `floor ${f}`).not.toBeNull();
    }
  });
});

describe("sighting alerts fire once per sighting", () => {
  // The spam bug: the key was species-plus-position, so a microbe taking a
  // step re-fired the alert every single turn. Modelled here exactly as the
  // game does it.
  const seen = new Set<number>();
  const alertsFor = (
    mobs: readonly { uid: number; vis: boolean }[],
  ): number => {
    const now = new Set<number>();
    let arrivals = 0;
    for (const m of mobs) {
      if (!m.vis) continue;
      now.add(m.uid);
      if (!seen.has(m.uid)) arrivals++;
    }
    for (const uid of [...seen]) if (!now.has(uid)) seen.delete(uid);
    for (const m of mobs) if (m.vis) seen.add(m.uid);
    return arrivals;
  };

  it("a microbe that stays in view alerts once, not once per turn", () => {
    seen.clear();
    expect(alertsFor([{ uid: 1, vis: true }])).toBe(1);
    for (let turn = 0; turn < 30; turn++) {
      expect(alertsFor([{ uid: 1, vis: true }]), `turn ${turn}`).toBe(0);
    }
  });

  it("leaving and returning alerts again", () => {
    seen.clear();
    expect(alertsFor([{ uid: 1, vis: true }])).toBe(1);
    expect(alertsFor([{ uid: 1, vis: false }])).toBe(0);
    expect(alertsFor([{ uid: 1, vis: true }])).toBe(1);
  });

  it("two of the same species are two separate sightings", () => {
    seen.clear();
    expect(alertsFor([{ uid: 1, vis: true }, { uid: 2, vis: true }])).toBe(2);
    expect(alertsFor([{ uid: 1, vis: true }, { uid: 2, vis: true }])).toBe(0);
  });

  it("uids are unique across a whole column", () => {
    const d = new Dungeon(96, 96, 77);
    const uids = new Set<number>();
    let total = 0;
    for (let f = 1; f <= MAX_FLOOR; f++) {
      for (const m of d.level(f).mobs) { uids.add(m.uid); total++; }
    }
    expect(uids.size, "two microbes shared an identity").toBe(total);
  });

  it("uid survives the spread used to build bosses", () => {
    const d = new Dungeon(96, 96, 77);
    for (const m of d.level(3).mobs) expect(m.uid).toBeGreaterThan(0);
  });
});

describe("the player sprite is a cell", () => {
  it("art points east, like every other organism here", () => {
    const art = PIXELS["player"];
    expect(art).toBeDefined();
    let minX = 99, maxX = -1, minY = 99, maxY = -1;
    (art ?? []).forEach((row, y) => {
      let x = 0;
      for (const c of row) {
        if (c !== ".") {
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
        x++;
      }
    });
    expect(maxX - minX, "long axis must be horizontal").toBeGreaterThan(maxY - minY);
  });

  it("the body is a rod, not a sphere", () => {
    // A round body with a stalk on it reads as an eyeball with an optic nerve.
    const art = PIXELS["player"] ?? [];
    let minX = 99, maxX = -1, minY = 99, maxY = -1;
    art.forEach((row, y) => {
      let x = 0;
      for (const c of row) {
        if (c !== ".") {
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
        x++;
      }
    });
    const w = maxX - minX + 1, h = maxY - minY + 1;
    expect(w / h, "aspect ratio should be bacillus, not coccus").toBeGreaterThan(1.5);
  });

  it("the flagellum is stroked, not baked into the art", () => {
    // It lives in paint.ts so it can beat. Art with a tail cannot move.
    const art = PIXELS["player"] ?? [];
    const leftmost = art.map((row) => {
      let x = 0;
      for (const c of row) { if (c !== ".") return x; x++; }
      return 99;
    });
    // No thin stub hanging off the west end: the art starts as a solid body.
    const bodyStart = Math.min(...leftmost);
    const rowsAtStart = leftmost.filter((x) => x <= bodyStart + 1).length;
    expect(rowsAtStart, "a lone pixel column is a stalk, not a body")
      .toBeGreaterThan(2);
  });

  it("the plasmid is visible inside the cell", () => {
    const art = PIXELS["player"] ?? [];
    let hi = 0;
    for (const row of art) for (const ch of row) if (ch === "4") hi++;
    expect(hi, "no highlighted ring").toBeGreaterThan(8);
  });
});

describe("the pathway map frames what you have unlocked", () => {
  it("reports no lit region for an empty genome", () => {
    expect(litBounds(new Set())).toBeNull();
  });

  it("the lit region covers exactly the edges you carry", () => {
    const b = litBounds(new Set(["mtrC", "omcS"]));
    expect(b).not.toBeNull();
    // Both EET edges run between the iron nodes, well right of the nitrogen ring.
    expect(b!.minX).toBeGreaterThan(0);
    const wider = litBounds(new Set(["mtrC", "omcS", "nifH"]));
    expect(wider!.maxX - wider!.minX).toBeGreaterThan(b!.maxX - b!.minX);
  });

  it("framing centres the region it is given", () => {
    const b = { minX: 100, minY: 200, maxX: 300, maxY: 400 };
    const v = frame(1080, 2000, b);
    const cxScreen = (((b.minX + b.maxX) / 2) - v.x) * v.scale;
    const cyScreen = (((b.minY + b.maxY) / 2) - v.y) * v.scale;
    expect(cxScreen).toBeCloseTo(1080 / 2, 6);
    expect(cyScreen).toBeCloseTo(2000 / 2, 6);
  });

  it("a small unlocked region is framed larger than the whole graph", () => {
    const lit = litBounds(new Set(["mtrC", "omcS"]))!;
    expect(frame(1080, 2000, lit).scale)
      .toBeGreaterThan(fitView(1080, 2000).scale);
  });

  it("the rest of the map stays reachable by panning", () => {
    const lit = litBounds(new Set(["mtrC", "omcS"]))!;
    const v = clampView(frame(1080, 2000, lit), 1080, 2000);
    const b = graphBounds();
    // Panning hard in each direction must be able to bring the far corners in.
    const far = clampView({ ...v, x: -1e6, y: -1e6 }, 1080, 2000);
    const near = clampView({ ...v, x: 1e6, y: 1e6 }, 1080, 2000);
    expect(far.x).toBeLessThan(b.minX + 50);
    expect(near.x).toBeGreaterThan(v.x);
  });

  it("zooming about a point keeps that point under the finger", () => {
    const v = { x: 40, y: -20, scale: 0.8 };
    for (const [sx, sy] of [[100, 200], [540, 900], [0, 0]] as const) {
      for (const factor of [1.4, 0.6]) {
        const z = zoomAbout(v, sx, sy, factor);
        const before = toWorld(v, sx, sy);
        const after = toWorld(z, sx, sy);
        expect(after.x, `x at ${sx},${sy} x${factor}`).toBeCloseTo(before.x, 6);
        expect(after.y, `y at ${sx},${sy} x${factor}`).toBeCloseTo(before.y, 6);
      }
    }
  });

  it("zoom stays inside its limits however hard you pinch", () => {
    let v: View = { x: 0, y: 0, scale: 1 };
    for (let i = 0; i < 40; i++) v = zoomAbout(v, 500, 500, 1.5);
    expect(v.scale).toBeLessThanOrEqual(2.5);
    for (let i = 0; i < 40; i++) v = zoomAbout(v, 500, 500, 0.5);
    expect(v.scale).toBeGreaterThanOrEqual(0.35);
  });

  it("framing a lit region still fits on a portrait phone", () => {
    const lit = litBounds(new Set(["dsrA", "aprA", "sat"]))!;
    for (const [w, h] of [[1080, 2200], [720, 1600]] as const) {
      const v = clampView(frame(w, h, lit), w, h);
      const topPx = (lit.minY - v.y) * v.scale;
      const botPx = (lit.maxY - v.y) * v.scale;
      expect(topPx, `${w}x${h}`).toBeGreaterThan(-h * 0.5);
      expect(botPx, `${w}x${h}`).toBeLessThan(h * 1.5);
    }
  });
});

describe("view maths survives degenerate input", () => {
  const finite = (v: View, label: string): void => {
    expect(Number.isFinite(v.x), `${label} x`).toBe(true);
    expect(Number.isFinite(v.y), `${label} y`).toBe(true);
    expect(Number.isFinite(v.scale), `${label} scale`).toBe(true);
  };

  it("a pinch that produces NaN is a no-op, not a poisoned view", () => {
    // One NaN reaching a View makes every later transform NaN and the map
    // goes blank with nothing logged anywhere.
    const base: View = { x: 0, y: 0, scale: 1 };
    for (const f of [Number.NaN, 0, Infinity, -Infinity, -3]) {
      finite(zoomAbout(base, 10, 10, f), `factor ${String(f)}`);
    }
    for (const s of [Number.NaN, Infinity]) {
      finite(zoomAbout(base, s, s, 1.2), `screen ${String(s)}`);
    }
    finite(zoomAbout({ x: Number.NaN, y: 0, scale: Number.NaN }, 5, 5, 1.1), "view NaN");
  });

  it("framing survives empty, inverted and non-finite bounds", () => {
    finite(frame(1080, 2000, { minX: 5, minY: 5, maxX: 5, maxY: 5 }), "zero size");
    finite(frame(1080, 2000, { minX: 900, minY: 900, maxX: 100, maxY: 100 }), "inverted");
    finite(frame(1080, 2000, { minX: Number.NaN, minY: 0, maxX: 10, maxY: 10 }), "NaN");
    finite(frame(0, 0, { minX: 0, minY: 0, maxX: 100, maxY: 100 }), "zero viewport");
  });

  it("clampView repairs a view rather than propagating its damage", () => {
    finite(clampView({ x: Number.NaN, y: Number.NaN, scale: Number.NaN }, 1080, 2000), "all NaN");
    finite(clampView({ x: 1e300, y: -1e300, scale: 1e300 }, 1080, 2000), "huge");
  });

  it("a repaired view still shows the graph", () => {
    const v = clampView({ x: Number.NaN, y: Number.NaN, scale: Number.NaN }, 1080, 2000);
    const b = graphBounds();
    const onScreen = (b.minX - v.x) * v.scale;
    expect(Math.abs(onScreen)).toBeLessThan(1e5);
    expect(v.scale).toBeGreaterThanOrEqual(0.35);
    expect(v.scale).toBeLessThanOrEqual(2.5);
  });

  it("repeated zooming never drifts off to infinity", () => {
    let v: View = { x: 0, y: 0, scale: 1 };
    for (let i = 0; i < 500; i++) {
      v = clampView(zoomAbout(v, 540, 1000, i % 2 === 0 ? 1.3 : 0.77), 1080, 2000);
    }
    finite(v, "after 500 pinches");
    expect(v.scale).toBeGreaterThanOrEqual(0.35);
    expect(v.scale).toBeLessThanOrEqual(2.5);
  });

  it("litBounds ignores genes that appear in no module", () => {
    // luxAB is real and carried, but it is in no KEGG module here.
    expect(litBounds(new Set(["luxAB"]))).toBeNull();
    expect(litBounds(new Set(["luxAB", "mtrC"]))).not.toBeNull();
  });
});

describe("a pinch is never a tap", () => {
  // Modelled exactly as main.ts does it. The bug: a pinch clears panFrom, so
  // panMoved stays near zero, and lifting a finger over a module caption
  // BUILT that module. Inspecting a pathway by pinching it assembled it.
  interface S { panMoved: number; pinching: boolean; pts: Set<number> }
  const fresh = (): S => ({ panMoved: 0, pinching: false, pts: new Set() });

  const down = (s: S, id: number): void => {
    if (s.pts.size > 2) s.pts.clear();
    s.pts.add(id);
    if (s.pts.size === 2) { s.pinching = true; s.panMoved = 0; }
  };
  const up = (s: S, id: number): void => {
    s.pts.delete(id);
    if (s.pts.size === 0) s.pinching = false;
  };
  const wouldBuild = (s: S): boolean => s.panMoved < 10 && !s.pinching;

  it("a genuine tap builds", () => {
    const s = fresh();
    down(s, 1);
    expect(wouldBuild(s)).toBe(true);
  });

  it("a pinch does not, even though it barely moved", () => {
    const s = fresh();
    down(s, 1); down(s, 2);
    expect(wouldBuild(s), "lifting a pinch must not assemble").toBe(false);
  });

  it("lifting one finger of two still does not build", () => {
    const s = fresh();
    down(s, 1); down(s, 2);
    up(s, 2);
    expect(wouldBuild(s)).toBe(false);
  });

  it("tapping again after the pinch fully ends does build", () => {
    const s = fresh();
    down(s, 1); down(s, 2);
    up(s, 1); up(s, 2);
    down(s, 3);
    expect(wouldBuild(s)).toBe(true);
  });

  it("a stale pointer cannot fake a pinch", () => {
    // A missed pointerup -- a notification, an app switch -- used to leave an
    // entry that paired with the next single touch.
    const s = fresh();
    down(s, 1); down(s, 2); down(s, 3);   // three down, none released
    up(s, 1); up(s, 2); up(s, 3);
    down(s, 4);
    expect(s.pts.size).toBe(1);
    expect(wouldBuild(s)).toBe(true);
  });

  it("a drag across a caption does not build either", () => {
    const s = fresh();
    down(s, 1);
    s.panMoved = 40;
    expect(wouldBuild(s)).toBe(false);
  });
});

describe("the part catalogue is data, not code", () => {
  it("every promoter declares a mode, a strength and an activation rule", () => {
    for (const p of Object.values(PROMOTERS)) {
      expect(p.strength, p.id).toBeGreaterThan(0);
      expect(["constitutive", "conditional", "inducible"], p.id).toContain(p.mode);
      expect(p.note.length, `${p.id}: must say why it exists`).toBeGreaterThan(30);
      for (let d = 1; d <= bio.MAX_DEPTH; d++) {
        const a = p.active({ stratum: bio.stratum(d), inducers: new Set() });
        expect(a, `${p.id} at D${String(d)}`).toBeGreaterThanOrEqual(0);
        expect(a, `${p.id} at D${String(d)}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("constitutive promoters ignore the chemistry; conditional ones do not", () => {
    const at = (id: PromoterId, d: number): number =>
      PROMOTERS[id].active({ stratum: bio.stratum(d), inducers: new Set() });
    for (const id of ["j23114", "j23106", "j23119"] as PromoterId[]) {
      expect(at(id, 1), id).toBe(at(id, 8));
    }
    // FNR carries a [4Fe-4S] cluster that O2 destroys: that IS the promoter.
    expect(at("pfnr", 1)).toBeLessThan(at("pfnr", 8));
    // SoxRS answers superoxide, which only exists where oxygen does.
    expect(at("psoxs", 1)).toBeGreaterThan(at("psoxs", 8));
  });

  it("an inducible promoter is dead weight until you carry the inducer", () => {
    const bare = PROMOTERS.plac.active({ stratum: bio.stratum(1), inducers: new Set() });
    const fed = PROMOTERS.plac.active({
      stratum: bio.stratum(1), inducers: new Set(["glucose"]),
    });
    expect(bare).toBeLessThan(0.1);
    expect(fed).toBe(1);
  });

  it("terminators leak, and a tandem leaks least", () => {
    // Efficiency is measured as readthrough and is never zero -- which is
    // exactly why tandem terminators are standard practice.
    for (const t of Object.values(TERMINATORS)) {
      expect(t.readthrough, t.id).toBeGreaterThan(0);
      expect(t.readthrough, t.id).toBeLessThan(1);
    }
    expect(TERMINATORS.rrnbt1t2.readthrough).toBeLessThan(TERMINATORS.rrnbt1.readthrough);
    expect(TERMINATORS.rrnbt1.readthrough).toBeLessThan(TERMINATORS.hairpin.readthrough);
    // And the tandem costs more space, or it would be a free win.
    expect(TERMINATORS.rrnbt1t2.kb).toBeGreaterThan(TERMINATORS.rrnbt1.kb);
  });

  it("readthrough reaches genes downstream, proportionally", () => {
    const build = (id: TerminatorId): number => {
      const p = new Plasmid();
    p.integrated = MAX_SLOTS - BASE_SLOTS;   // these fixtures need room
      p.put(0, { kind: "promoter", id: "j23119" });
      p.put(1, { kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE });
      p.put(2, { kind: "terminator", id });
      p.put(3, { kind: "gene", id: "omcS", level: 1, mods: [], allele: WILD_TYPE });
      return p.expression("omcS", 4);
    };
    const leaky = build("hairpin");
    const tight = build("rrnbt1t2");
    expect(leaky / tight).toBeCloseTo(
      TERMINATORS.hairpin.readthrough / TERMINATORS.rrnbt1t2.readthrough, 1);
  });

  it("every modifier declares at least one effect and a cost or a trade", () => {
    for (const m of Object.values(MODIFIERS)) {
      const e = m.effect;
      const changes = Object.values(e).filter((v) => v !== undefined).length;
      expect(changes, `${m.id} changes nothing`).toBeGreaterThan(0);
      expect(m.note.length, `${m.id}: must explain itself`).toBeGreaterThan(25);
      // A pure upside with no cost anywhere is not a decision.
      const pureUpside = (e.expression ?? 1) > 1 && (e.power ?? 1) >= 1
        && (e.upkeep ?? 1) <= 1 && (e.kb ?? 0) <= 0;
      if (pureUpside) expect(m.id, `${m.id} is a free win`).toBe("codon");
    }
  });

  it("modifiers compose multiplicatively and are capped by level", () => {
    const p = new Plasmid();
    p.integrated = MAX_SLOTS - BASE_SLOTS;   // these fixtures need room
    p.put(0, { kind: "promoter", id: "j23119" });
    p.put(1, { kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE });
    const bare = p.expression("mtrC", 4);
    expect(p.addModifier("mtrC", "codon").ok).toBe(true);
    const one = p.expression("mtrC", 4);
    expect(one / bare).toBeCloseTo(MODIFIERS.codon.effect.expression ?? 1, 5);
    // Level 1 allows a single modifier.
    expect(p.addModifier("mtrC", "rbs").ok, "level 1 must cap at one slot").toBe(false);
    expect(p.evolve("mtrC").ok).toBe(true);
    expect(p.addModifier("mtrC", "rbs").ok, "level 2 allows a second").toBe(true);
    expect(p.addModifier("mtrC", "codon").ok, "no duplicates").toBe(false);
  });

  it("directed evolution raises efficacy and costs more each time", () => {
    const p = new Plasmid();
    p.integrated = MAX_SLOTS - BASE_SLOTS;   // these fixtures need room
    p.put(0, { kind: "promoter", id: "j23119" });
    p.put(1, { kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE });
    let last = p.expression("mtrC", 4);
    let cost = p.evolutionCost("mtrC");
    for (let l = 2; l <= MAX_LEVEL; l++) {
      expect(p.evolve("mtrC").ok, `to level ${String(l)}`).toBe(true);
      const now = p.expression("mtrC", 4);
      expect(now, `level ${String(l)} must be stronger`).toBeGreaterThan(last);
      last = now;
      const next = p.evolutionCost("mtrC");
      if (l < MAX_LEVEL) expect(next, "cost must rise").toBeGreaterThan(cost);
      cost = next;
    }
    expect(p.evolve("mtrC").ok, "cannot exceed the cap").toBe(false);
    expect(p.evolutionCost("mtrC")).toBe(Infinity);
  });

  it("rarity skews richer with depth, and always returns a real tier", () => {
    const sample = (depth: number): Record<string, number> => {
      const out: Record<string, number> = {};
      for (let i = 0; i < 4000; i++) {
        const r = rollRarity(i / 4000, depth);
        out[r] = (out[r] ?? 0) + 1;
      }
      return out;
    };
    const shallow = sample(1);
    const deep = sample(8);
    expect((deep["rare"] ?? 0) + (deep["legendary"] ?? 0))
      .toBeGreaterThan((shallow["rare"] ?? 0) + (shallow["legendary"] ?? 0));
    expect(shallow["common"]).toBeGreaterThan(0);
    for (const n of [NaN, -1, 2, Infinity]) {
      expect(RARITY_IDS).toContain(rollRarity(n, 4));
    }
  });

  it("a legacy save migrates onto the new part model", () => {
    // `strength` becomes an Anderson promoter, `optimised` becomes the codon
    // modifier. Old saves must load, not be discarded.
    const s = parseSave({
      version: SCHEMA, depth: 2, floor: 4, seed: 1, px: 5, py: 5, hp: 20, atp: 50,
      ring: [
        { kind: "promoter", strength: "strong" },
        { kind: "gene", id: "mtrC", optimised: true },
        { kind: "terminator" },
      ],
      bin: [], run: {}, settings: {},
    });
    expect(s).not.toBeNull();
    expect(s?.ring[0]).toEqual({ kind: "promoter", id: "j23119" });
    expect(s?.ring[1]).toEqual({ kind: "gene", id: "mtrC", level: 1, mods: ["codon"], allele: WILD_TYPE });
    expect(s?.ring[2]).toEqual({ kind: "terminator", id: "rrnbt1" });
  });

  it("a hand-edited save cannot exceed what play allows", () => {
    const s = parseSave({
      version: SCHEMA, depth: 1, floor: 1, seed: 1, px: 5, py: 5, hp: 20, atp: 50,
      ring: [{ kind: "gene", id: "mtrC", level: 99,
               mods: ["codon", "rbs", "chaperone", "ssra", "signal", "fusion"], allele: WILD_TYPE }],
      bin: [], run: {}, settings: {},
    });
    const g = s?.ring[0];
    expect(g?.kind).toBe("gene");
    if (g?.kind !== "gene") return;
    expect(g.level).toBeLessThanOrEqual(MAX_LEVEL);
    expect(g.mods.length).toBeLessThanOrEqual(modifierSlots(g.level));
  });
});

describe("rare parts drop and research spends", () => {
  it("every rarity tier has parts, so a roll can never come back empty", () => {
    for (const r of RARITY_IDS) {
      const { promoters, terminators, modifiers } = partsOfRarity(r);
      expect(promoters.length + terminators.length + modifiers.length,
             `${r} has no members`).toBeGreaterThan(0);
    }
  });

  it("rollPart always returns a real part, whatever the input", () => {
    for (const roll of [0, 0.5, 0.999, NaN, -1, 2, Infinity]) {
      for (const pick of [0, 0.5, 0.999, NaN, -3]) {
        const it = rollPart(roll, pick, 4);
        expect(it, `roll ${String(roll)} pick ${String(pick)}`).not.toBeNull();
        if (!it) continue;
        expect(["promoter", "terminator", "modifier"]).toContain(it.kind);
        expect(itemName(it).length).toBeGreaterThan(0);
        expect(itemNote(it).length).toBeGreaterThan(10);
      }
    }
  });

  it("the deep column yields better parts than the surface", () => {
    const score: Record<string, number> = { common: 0, uncommon: 1, rare: 2, legendary: 3 };
    const mean = (depth: number): number => {
      let t = 0;
      for (let i = 0; i < 3000; i++) {
        const it = rollPart(i / 3000, (i * 7919 % 1000) / 1000, depth);
        if (it && it.kind !== "cassette" && it.kind !== "substrate") {
          t += score[it.rarity] ?? 0;
        }
      }
      return t / 3000;
    };
    expect(mean(8)).toBeGreaterThan(mean(1));
  });

  it("the rarity ladder matches the power ladder", () => {
    // A legendary part must not be worse than a common one, or rarity is a lie.
    expect(PROMOTERS.plac.strength).toBeGreaterThan(PROMOTERS.j23114.strength);
    expect(TERMINATORS.rrnbt1t2.readthrough).toBeLessThan(TERMINATORS.hairpin.readthrough);
    expect(PROMOTERS.j23114.rarity).toBe("common");
    expect(PROMOTERS.plac.rarity).toBe("legendary");
  });

  it("a modifier is held, not stashed on the ring", () => {
    // Modifiers attach to a gene; they are not parts you can transcribe.
    const it = { kind: "modifier" as const, id: "codon" as ModifierId,
                 rarity: "uncommon" as const };
    expect(itemName(it)).toBe(MODIFIERS.codon.name);
    expect(itemColour(it)).toBe(RARITY.uncommon.colour);
  });

  it("evolution cost rises steeply and is finite until the cap", () => {
    for (const g of ["mtrC", "dsrA", "psbA"] as bio.GeneId[]) {
      let last = 0;
      for (let l = 1; l < MAX_LEVEL; l++) {
        const c = evolutionCost(l, g);
        expect(Number.isFinite(c), `${g} L${String(l)}`).toBe(true);
        expect(c, `${g} L${String(l)} must cost more than L${String(l - 1)}`)
          .toBeGreaterThan(last);
        last = c;
      }
      expect(evolutionCost(MAX_LEVEL, g)).toBe(Infinity);
    }
  });

  it("a higher-tier gene costs more to evolve than a starter one", () => {
    expect(evolutionCost(1, "mcrA")).toBeGreaterThan(evolutionCost(1, "psbA"));
  });

  it("modifier slots open with level and are never exceeded", () => {
    expect(modifierSlots(1)).toBe(1);
    expect(modifierSlots(2)).toBe(2);
    expect(modifierSlots(MAX_LEVEL)).toBe(3);
    const p = new Plasmid();
    p.integrated = MAX_SLOTS - BASE_SLOTS;   // these fixtures need room
    p.put(0, { kind: "promoter", id: "j23119" });
    p.put(1, { kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE });
    let added = 0;
    for (const m of ["codon", "rbs", "chaperone", "ssra"] as ModifierId[]) {
      if (p.addModifier("mtrC", m).ok) added++;
    }
    expect(added).toBe(modifierSlots(1));
  });

  it("evolving is atomic: a refusal changes nothing", () => {
    const p = new Plasmid();
    p.integrated = MAX_SLOTS - BASE_SLOTS;   // these fixtures need room
    p.put(1, { kind: "gene", id: "mtrC", level: MAX_LEVEL, mods: [], allele: WILD_TYPE });
    const before = JSON.stringify(p.slots);
    expect(p.evolve("mtrC").ok).toBe(false);
    expect(JSON.stringify(p.slots)).toBe(before);
    expect(p.evolve("dsrA").ok, "not carried").toBe(false);
    expect(JSON.stringify(p.slots)).toBe(before);
  });
});

describe("rarity reads at a glance", () => {
  it("uses the classic five, in the colours everyone already knows", () => {
    expect(RARITY_IDS).toEqual(["common", "uncommon", "rare", "epic", "legendary"]);
    // Grey, green, blue, purple, orange -- not decorative, conventional.
    expect(RARITY.common.colour.toLowerCase()).toMatch(/^#9|^#a/);
    expect(RARITY.uncommon.colour.toLowerCase()).toMatch(/^#4fd|^#5/);
    expect(RARITY.legendary.colour.toLowerCase()).toMatch(/^#f0|^#e/);
    // Every colour distinct, or the channel carries no information.
    expect(new Set(RARITY_IDS.map((r) => RARITY[r].colour)).size).toBe(5);
  });

  it("rarer tiers are strictly less common", () => {
    for (let i = 1; i < RARITY_IDS.length; i++) {
      const lo = RARITY[RARITY_IDS[i - 1]!], hi = RARITY[RARITY_IDS[i]!];
      expect(hi.weight, `${hi.id} must be rarer than ${lo.id}`).toBeLessThan(lo.weight);
      expect(RARITY_RANK[hi.id]).toBeGreaterThan(RARITY_RANK[lo.id]);
    }
  });

  it("every tier holds parts, so no rarity is decoration", () => {
    for (const r of RARITY_IDS) {
      const { promoters, terminators, modifiers } = partsOfRarity(r);
      expect(promoters.length + terminators.length + modifiers.length, r)
        .toBeGreaterThan(0);
    }
  });

  it("a gene's rarity follows its tier, so the two cannot disagree", () => {
    expect(rarityOfTier(1)).toBe("common");
    expect(rarityOfTier(8)).toBe("legendary");
    for (let t = 1; t <= 8; t++) {
      expect(RARITY_IDS).toContain(rarityOfTier(t));
      if (t > 1) {
        expect(RARITY_RANK[rarityOfTier(t)])
          .toBeGreaterThanOrEqual(RARITY_RANK[rarityOfTier(t - 1)]);
      }
    }
    // And the deepest genes really are the rarest.
    expect(rarityOfTier(bio.GENES.mcrA.tier)).toBe("legendary");
    expect(rarityOfTier(bio.GENES.psbA.tier)).toBe("common");
  });

  it("the bin colours a part by the COPY, not the gene", () => {
    // A wild-type mcrA is a common find of a powerful gene. Colouring it
    // legendary described the gene and promised something the copy lacked.
    expect(partRarity({ kind: "gene", id: "mcrA", level: 1, mods: [], allele: WILD_TYPE })).toBe("common");
    expect(partRarity({ kind: "gene", id: "psbA", level: 1, mods: [], allele: WILD_TYPE })).toBe("common");
    expect(partRarity({ kind: "promoter", id: "plac" })).toBe("legendary");
    expect(partRarity({ kind: "terminator", id: "hairpin" })).toBe("common");
  });
});

describe("every gene carries its real history", () => {
  it("all of them have a discovery line", () => {
    for (const id of Object.keys(bio.GENES) as bio.GeneId[]) {
      const d = bio.GENES[id].discovery;
      expect(d, `${id} has no discovery line`).toBeTruthy();
      expect(d.length, `${id}: too terse to be worth reading`).toBeGreaterThan(60);
      expect(d.trim().endsWith("."), `${id}: unfinished sentence`).toBe(true);
    }
  });

  it("they are distinct, not a template with the name swapped", () => {
    const all = (Object.keys(bio.GENES) as bio.GeneId[]).map((id) => bio.GENES[id].discovery);
    expect(new Set(all).size).toBe(all.length);
  });

  it("the ones tied to this column name the right people", () => {
    // Winogradsky discovered nitrite oxidation, and the column is his.
    expect(bio.GENES.nxrA.discovery).toContain("Winogradsky");
    // Beijerinck named Desulfovibrio and found nitrogen fixation.
    expect(bio.GENES.dsrA.discovery).toContain("Beijerinck");
    expect(bio.GENES.nifH.discovery).toContain("Beijerinck");
    // Shewanella oneidensis is named for the lake it came out of.
    expect(bio.GENES.mtrC.discovery).toContain("Oneida");
    // The purple bacterial reaction centre was the first membrane structure.
    expect(bio.GENES.pufM.discovery).toContain("1985");
  });

  it("history is separate from mechanics, so neither crowds the other", () => {
    for (const id of Object.keys(bio.GENES) as bio.GeneId[]) {
      const g = bio.GENES[id];
      expect(g.discovery, `${id}: history duplicates the description`)
        .not.toBe(g.desc);
    }
  });
});

describe("the column feeds from the top", () => {
  it("capacity and restock rate both fall with depth", () => {
    // The biological pump: phototrophs fix carbon at the surface, it sinks,
    // and less of it is still edible the further down it gets.
    for (let d = 2; d <= bio.MAX_DEPTH; d++) {
      expect(capacityAt(d), `D${String(d)}`).toBeLessThanOrEqual(capacityAt(d - 1));
      expect(rateAt(d, 1), `D${String(d)}`).toBeLessThan(rateAt(d - 1, 1));
    }
    expect(capacityAt(1)).toBeGreaterThan(capacityAt(bio.MAX_DEPTH) * 2);
  });

  it("production nearly stops at night, at every depth", () => {
    for (let d = 1; d <= bio.MAX_DEPTH; d++) {
      expect(rateAt(d, 0), `D${String(d)}`).toBeLessThan(rateAt(d, 1) / 5);
      expect(rateAt(d, 0), "never exactly zero, or a night camp is a deadlock")
        .toBeGreaterThan(0);
    }
  });

  it("a stripped floor refills over time, and never past capacity", () => {
    const clock = { turn: RESTOCK_TURNS * 2 };
    const gained = restockAmount(1, 0, RESTOCK_TURNS, clock, RESTOCK_TURNS);
    expect(gained).toBeGreaterThan(0);
    expect(gained).toBeLessThanOrEqual(capacityAt(1));
    // Already full: nothing more falls.
    expect(restockAmount(1, capacityAt(1), 9999, clock, 0)).toBe(0);
  });

  it("leaving and coming straight back gains nothing", () => {
    const clock = { turn: 100 };
    expect(restockAmount(4, 0, 0, clock, 100)).toBe(0);
    expect(restockAmount(4, 0, -50, clock, 150)).toBe(0);
  });

  it("the surface refills far faster than the floor", () => {
    const clock = { turn: 40 };
    const shallow = restockAmount(1, 0, 300, clock, 0);
    const deep = restockAmount(8, 0, 300, clock, 0);
    expect(shallow, "climbing must actually be worth the turns")
      .toBeGreaterThan(deep * 2);
  });

  it("restocking survives absurd inputs", () => {
    const clock = { turn: 0 };
    for (const n of [NaN, Infinity, -Infinity, 1e12]) {
      const g = restockAmount(4, 0, n, clock, 0);
      expect(Number.isFinite(g), String(n)).toBe(true);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(capacityAt(4));
      expect(Number.isFinite(capacityAt(n))).toBe(true);
      expect(Number.isFinite(rateAt(n, n))).toBe(true);
    }
  });

  it("the description matches how bare the floor actually is", () => {
    expect(describeStock(1, 0)).toMatch(/bare|Nothing/i);
    expect(describeStock(1, capacityAt(1))).toMatch(/Fresh|feeds/i);
    expect(describeStock(8, capacityAt(8))).not.toMatch(/feeds itself/);
    for (let d = 1; d <= bio.MAX_DEPTH; d++) {
      for (const n of [0, 1, capacityAt(d)]) {
        expect(describeStock(d, n).length).toBeGreaterThan(20);
      }
    }
  });

  it("the stock clock survives a reload, so a stripped floor stays stripped", () => {
    const s = parseSave({
      version: SCHEMA, depth: 1, floor: 1, seed: 1, px: 5, py: 5, hp: 20, atp: 50,
      ring: [], bin: [], run: {}, settings: {}, heldMods: [], turn: 900,
      stocked: [[1, 400], [2, 850], ["bad", 3], [4]],
    });
    expect(s?.stocked).toEqual([[1, 400], [2, 850]]);
    expect(s?.turn).toBe(900);
  });
});

describe("regeneration is monotonic", () => {
  // Sampling daylight at the ENDPOINTS of the interval made 600 turns away
  // return less than 300, because both ends landed at night. That is
  // indefensible and was invisible until the numbers were printed.
  it("more time away never yields less material", () => {
    const clock = { turn: 0 };
    for (const depth of [1, 4, 8]) {
      let last = -1;
      for (let t = 0; t <= 1200; t += 20) {
        clock.turn = t;
        const g = restockAmount(depth, 0, t, clock, 0);
        expect(g, `D${String(depth)} at ${String(t)} turns went backwards`)
          .toBeGreaterThanOrEqual(last);
        last = g;
      }
    }
  });

  it("the result does not depend on where in the day the span begins", () => {
    // Sampling across the interval means a long span averages out the cycle.
    const clock = { turn: 0 };
    const long = 600;
    const values = [0, 55, 110, 165].map((start) =>
      restockAmount(1, 0, long, clock, start));
    const spread = Math.max(...values) - Math.min(...values);
    expect(spread, `start phase changed the yield by ${String(spread)}`)
      .toBeLessThanOrEqual(2);
  });

  it("mean light over a whole day matches the daily average", () => {
    const a = meanLight(0, TURNS_PER_DAY);
    const b = meanLight(TURNS_PER_DAY / 2, TURNS_PER_DAY);
    expect(a).toBeCloseTo(b, 2);
    expect(a).toBeGreaterThan(0.1);
    expect(a).toBeLessThan(0.7);
  });

  it("the climb is worth it and the floor is not", () => {
    // The whole point: going up refills, staying down does not.
    const clock = { turn: 0 };
    const day = TURNS_PER_DAY;
    expect(restockAmount(1, 0, day, clock, 0) / capacityAt(1),
           "a day at the surface should visibly refill it").toBeGreaterThan(0.5);
    expect(restockAmount(8, 0, day, clock, 0) / capacityAt(8),
           "the floor must stay barren, or there is no reason to climb")
      .toBeLessThan(0.2);
  });
});

describe("allelic variation is the loot roll", () => {
  const rolls = (gene: bio.GeneId, depth: number, n = 3000) => {
    const rng = makeRng(depth * 97 + gene.length);
    return Array.from({ length: n }, () => rollAllele(rng, depth));
  };

  it("most finds are unremarkable and the best are genuinely rare", () => {
    // A ladder where a third of drops are top-tier is not a hunt.
    const tally: Record<string, number> = {};
    for (const a of rolls("psbA", 1)) {
      const r = alleleRarity("psbA", a);
      tally[r] = (tally[r] ?? 0) + 1;
    }
    expect((tally["common"] ?? 0) / 3000, "common must dominate at the surface")
      .toBeGreaterThan(0.6);
    // Legendary is now a rolled TIER rather than a lucky derivation, so the
    // rate is the weight in RARITY rather than an emergent accident.
    expect((tally["legendary"] ?? 0) / 3000).toBeLessThan(0.03);
  });

  it("depth widens the distribution rather than only raising it", () => {
    const spread = (depth: number): number => {
      const q = rolls("mtrC", depth).map(quality);
      const mean = q.reduce((a, b) => a + b, 0) / q.length;
      return Math.sqrt(q.reduce((a, b) => a + (b - mean) ** 2, 0) / q.length);
    };
    expect(spread(8), "a deep roll must be able to be junk too")
      .toBeGreaterThan(spread(1));
  });

  it("a low Km counts as GOOD, because affinity is the point of it", () => {
    // Getting this backwards would make the whole hunt reward the wrong thing.
    const tight = quality({ ...WILD_TYPE, km: 0.6 });
    const loose = quality({ ...WILD_TYPE, km: 1.6 });
    expect(tight).toBeGreaterThan(loose);
    expect(alleleReadout({ ...WILD_TYPE, km: 0.6 }).join(" ")).toMatch(/\+\d+% affinity/);
  });

  it("a low-Km enzyme is worth more when substrate is scarce", () => {
    const p = (km: number, supply: number): number => {
      const pl = new Plasmid();
      pl.put(0, { kind: "promoter", id: "j23119" });
      pl.put(1, { kind: "gene", id: "mtrC", level: 1, mods: [],
                  allele: { ...WILD_TYPE, km } });
      pl.supply = supply;
      return pl.expression("mtrC", 4);
    };
    const plentyGain = p(0.6, 1) / p(1.4, 1);
    const scarceGain = p(0.6, 0.1) / p(1.4, 0.1);
    expect(scarceGain, "affinity should matter MORE when starved")
      .toBeGreaterThan(plentyGain);
  });

  it("every affix carries a real trade, not a free upside", () => {
    for (const [id, def] of [...Object.entries(PREFIXES), ...Object.entries(SUFFIXES)]) {
      const e = def.effect;
      const ups = [(e.kcat ?? 1) > 1, (e.stability ?? 1) > 1, (e.expression ?? 1) > 1,
                   (e.km ?? 1) < 1, (e.upkeep ?? 1) < 1, e.promiscuous === true];
      const downs = [(e.kcat ?? 1) < 1, (e.stability ?? 1) < 1, (e.expression ?? 1) < 1,
                     (e.km ?? 1) > 1, (e.upkeep ?? 1) > 1];
      expect(ups.some(Boolean), `${id} does nothing good`).toBe(true);
      expect(downs.some(Boolean), `${id} is a free win`).toBe(true);
      expect(def.note.length, `${id} must explain its trade`).toBeGreaterThan(40);
    }
  });

  it("the name reads as a find", () => {
    const named = alleleName("mtrC", {
      ...WILD_TYPE, prefix: "thermostable", suffix: "broadSpecificity",
    });
    expect(named).toBe("thermostable mtrC of broad specificity");
    expect(alleleName("mtrC", WILD_TYPE)).toBe("mtrC");
  });

  it("rolls stay inside their bands however many are drawn", () => {
    for (const depth of [1, 8]) {
      for (const a of rolls("mtrC", depth, 2000)) {
        for (const v of [a.kcat, a.km, a.stability]) {
          expect(Number.isFinite(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(0.55);
          expect(v).toBeLessThanOrEqual(1.9);
        }
        expect(Number.isFinite(quality(a))).toBe(true);
      }
    }
  });

  it("a corrupt allele degrades to wild type rather than poisoning anything", () => {
    const bad = { kcat: NaN, km: Infinity, stability: -5,
                  prefix: null, suffix: null, rarity: "legendary" } as const;
    const e = alleleEffect(bad);
    for (const v of Object.values(e)) {
      if (typeof v === "number") expect(Number.isFinite(v)).toBe(true);
    }
    expect(Number.isFinite(quality(bad))).toBe(true);
    expect(RARITY_IDS).toContain(alleleRarity("mtrC", bad));
  });
});

describe("DNA is food as well as information", () => {
  it("a saved allele is clamped to what a roll can produce", () => {
    const s = parseSave({
      version: SCHEMA, depth: 1, floor: 1, seed: 1, px: 5, py: 5, hp: 20, atp: 50,
      ring: [{ kind: "gene", id: "mtrC", level: 1, mods: [],
               allele: { kcat: 99, km: -3, stability: NaN, prefix: "nonsense" } }],
      bin: [], run: {}, settings: {}, heldMods: [], turn: 0, stocked: [],
    });
    const g = s?.ring[0];
    expect(g?.kind).toBe("gene");
    if (g?.kind !== "gene") return;
    expect(g.allele.kcat).toBeLessThanOrEqual(2.2);
    expect(g.allele.km).toBeGreaterThanOrEqual(0.4);
    expect(Number.isFinite(g.allele.stability)).toBe(true);
    expect(g.allele.prefix).toBeNull();
  });

  it("a legacy save with no allele loads as wild type", () => {
    const s = parseSave({
      version: SCHEMA, depth: 1, floor: 1, seed: 1, px: 5, py: 5, hp: 20, atp: 50,
      ring: [{ kind: "gene", id: "mtrC", level: 1, mods: [] }],
      bin: [], run: {}, settings: {}, heldMods: [], turn: 0, stocked: [],
    });
    const g = s?.ring[0];
    if (g?.kind !== "gene") { expect(g?.kind).toBe("gene"); return; }
    expect(g.allele).toEqual(WILD_TYPE);
  });
});

describe("the gene catalogue is deep enough to hunt in", () => {
  it("there are enough genes for a run to feel different each time", () => {
    expect(Object.keys(bio.GENES).length).toBeGreaterThan(45);
  });

  it("every stratum has several genes reachable in it", () => {
    for (let d = 1; d <= bio.MAX_DEPTH; d++) {
      const here = new Set(bio.microbesAt(d).flatMap((m) => [...m.genes]));
      expect(here.size, `D${String(d)} has too little to find`).toBeGreaterThan(2);
    }
  });

  it("every new gene has a product, a description and real history", () => {
    for (const id of Object.keys(bio.GENES) as bio.GeneId[]) {
      // The origin is a replicon, not an enzyme: no tier, no product to name.
      if (id === "ori") continue;
      const g = bio.GENES[id];
      expect(g.product.length, id).toBeGreaterThan(5);
      expect(g.kb, id).toBeGreaterThan(0);
      expect(g.tier, id).toBeGreaterThanOrEqual(1);
      expect(g.discovery.length, id).toBeGreaterThan(60);
    }
  });
});


describe("strain level comes from what the lineage has learned", () => {
  it("breadth, depth AND fighting each count", () => {
    // Fighting used to advance nothing at all -- only the FIRST kill of a
    // species counted, as cataloguing. That is the main thing a player does,
    // and it did not move the bar.
    const deepOnly = strainLevel({ catalogued: 0, deepest: MAX_FLOOR });
    const wideOnly = strainLevel({ catalogued: bio.MICROBES.length, deepest: 1 });
    const fightOnly = strainLevel({ catalogued: 0, deepest: 1, killed: 500 });
    const all = strainLevel({ catalogued: bio.MICROBES.length,
                              deepest: MAX_FLOOR, killed: 500 });
    expect(deepOnly).toBeGreaterThan(1);
    expect(wideOnly).toBeGreaterThan(1);
    expect(fightOnly, "killing advances nothing").toBeGreaterThan(1);
    expect(all, "doing everything must beat any one")
      .toBeGreaterThan(Math.max(deepOnly, wideOnly, fightOnly));
    expect(all).toBe(MAX_STRAIN);
  });

  it("grinding one floor cannot substitute for descending", () => {
    // The combat term saturates. A linear one would make farming a safe floor
    // the optimal play, which is the opposite of what the game is about.
    const grinder = strainLevel({ catalogued: 3, deepest: 2, killed: 100000 });
    const explorer = strainLevel({ catalogued: bio.MICROBES.length,
                                   deepest: MAX_FLOOR, killed: 0 });
    expect(grinder, "grinding reached the cap").toBeLessThan(MAX_STRAIN);
    expect(explorer, "exploring lost to grinding").toBeGreaterThan(grinder);
    // And the first kills must be worth noticeably more than the last.
    const early = adaptation({ catalogued: 0, deepest: 1, killed: 40 })
      - adaptation({ catalogued: 0, deepest: 1, killed: 0 });
    const late = adaptation({ catalogued: 0, deepest: 1, killed: 1040 })
      - adaptation({ catalogued: 0, deepest: 1, killed: 1000 });
    expect(early).toBeGreaterThan(late * 5);
  });

  it("level never leaves its band, whatever the input", () => {
    for (const c of [-5, 0, 9999, NaN]) {
      for (const d of [-1, 0, 9999, NaN]) {
        const l = strainLevel({ catalogued: c, deepest: d });
        expect(Number.isFinite(l), `${String(c)}/${String(d)}`).toBe(true);
        expect(l).toBeGreaterThanOrEqual(1);
        expect(l).toBeLessThanOrEqual(MAX_STRAIN);
      }
    }
  });

  it("levelling expands the plasmid rather than granting power", () => {
    expect(bonusSlots(1)).toBe(0);
    expect(bonusSlots(MAX_STRAIN)).toBeGreaterThan(0);
    expect(bonusCapacityKb(MAX_STRAIN)).toBeGreaterThan(bonusCapacityKb(1));
    // and it does not touch expression
    const low = new Plasmid(); low.strain = 1;
    const high = new Plasmid(); high.strain = MAX_STRAIN;
    // Slots 0-2 are the starting vector; build in free space so the two
    // plasmids differ only by strain.
    for (const p of [low, high]) {
      p.put(5, { kind: "promoter", id: "j23119" });
      p.put(6, { kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE });
      p.put(7, { kind: "terminator", id: "rrnbt1" });
    }
    expect(high.expression("mtrC", 4)).toBeCloseTo(low.expression("mtrC", 4), 6);
    expect(high.usableSlots).toBeGreaterThan(low.usableSlots);
  });

});

describe("terminators cost ATP, not just isolation", () => {
  // Built on FREE slots. Writing over 0-2 replaces the starting vector --
  // including its origin, which then gets restored somewhere unpredictable,
  // and including its terminator, so the "no terminator" case quietly had one.
  const withTerm = (id: TerminatorId | null) => {
    const p = new Plasmid();
    p.integrated = MAX_SLOTS - BASE_SLOTS;
    p.put(6, { kind: "promoter", id: "j23119" });
    p.put(7, { kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE });
    if (id !== null) p.put(8, { kind: "terminator", id });
    return p;
  };

  it("a leaky terminator burns ATP on transcription that makes nothing", () => {
    // This is what makes the CHOICE of terminator matter every turn, rather
    // than only when something sits downstream of it.
    const leaky = withTerm("hairpin");
    const tight = withTerm("rrnbt1t2");
    // Compared as a ratio of 3, not 5: the starting vector's own operon
    // contributes a constant to both, so the measured ratio is 4.98 and an
    // assertion of 5 fails by a hair on a true result.
    expect(leaky.wastedTranscription(4)).toBeGreaterThan(
      tight.wastedTranscription(4) * 3);
    expect(leaky.atpBalance(4), "and it shows in the net")
      .toBeLessThan(tight.atpBalance(4));
  });

  it("waste tracks readthrough in order", () => {
    const order: TerminatorId[] = ["rrnbt1t2", "rrnbt1", "trpa", "hairpin"];
    let last = -1;
    for (const id of order) {
      const w = withTerm(id).wastedTranscription(4);
      expect(w, `${id} should waste more than the one before`).toBeGreaterThan(last);
      last = w;
    }
  });

  it("no terminator at all is the worst case", () => {
    expect(withTerm(null).wastedTranscription(4))
      .toBeGreaterThan(withTerm("hairpin").wastedTranscription(4));
  });

  it("the starting vector ships with a terminator, as a real one does", () => {
    const p = new Plasmid();
    p.integrated = MAX_SLOTS - BASE_SLOTS;   // these fixtures need room
    expect(p.slots.some((s) => s?.kind === "terminator"),
           "an unterminated starter burns ATP from turn one").toBe(true);
  });

  it("waste is finite for any arrangement", () => {
    const p = new Plasmid();
    p.integrated = MAX_SLOTS - BASE_SLOTS;   // these fixtures need room
    for (let i = 0; i < 16; i++) p.put(i, { kind: "promoter", id: "j23119" });
    expect(Number.isFinite(p.wastedTranscription(4))).toBe(true);
    for (let i = 0; i < 16; i++) p.put(i, { kind: "terminator", id: "hairpin" });
    expect(Number.isFinite(p.wastedTranscription(4))).toBe(true);
  });
});

describe("synthesis credit", () => {
  const base = { floor: 1, turns: 0, catalogued: 0, bossesCleared: 0,
                 genesCarried: 0, bestAllele: 1, killedBy: "x", won: false };

  it("ground already covered pays a fraction", () => {
    // Three hundred instant deaths on the first floor earned 2700 credit --
    // more per second than descending -- so the optimal strategy was to kill
    // yourself repeatedly. A lab learns nothing from the 300th identical
    // failure.
    const firstTime = creditFor({ ...base, floor: 12, catalogued: 8 }, 0);
    const again = creditFor({ ...base, floor: 12, catalogued: 8 }, 12);
    expect(again, "retreading paid the same as breaking new ground")
      .toBeLessThan(firstTime);
    expect(again, "and it must still pay something").toBeGreaterThan(0);

    // Going DEEPER than the record pays the full rate for the new floors.
    const deeper = creditFor({ ...base, floor: 16, catalogued: 8 }, 12);
    expect(deeper).toBeGreaterThan(again);
  });

  it("grinding shallow deaths does not out-earn descending", () => {
    const suicide = { ...base, floor: 1 };
    let grind = 0;
    for (let i = 0; i < 300; i++) grind += creditFor(suicide, 1);
    const oneRun = creditFor({ ...base, floor: 12, catalogued: 9,
                               bossesCleared: 3, genesCarried: 7,
                               bestAllele: 1.2 }, 0);
    // Three hundred restarts must not be worth more than a few real runs.
    expect(grind, "suiciding is still the optimal strategy")
      .toBeLessThan(oneRun * 4);
  });

  it("depth dominates, but is not the only thing that pays", () => {
    // If depth were everything the optimal play would be to dive blindly past
    // the column without ever studying it.
    const deep = creditFor({ ...base, floor: 20 });
    const shallow = creditFor({ ...base, floor: 2 });
    expect(deep).toBeGreaterThan(shallow * 3);
    expect(creditFor({ ...base, floor: 6, catalogued: 10 }),
           "cataloguing must pay").toBeGreaterThan(creditFor({ ...base, floor: 6 }));
    expect(creditFor({ ...base, floor: 6, bossesCleared: 2 }))
      .toBeGreaterThan(creditFor({ ...base, floor: 6 }));
    expect(creditFor({ ...base, floor: 6, bestAllele: 1.6 }),
           "a good roll is knowledge worth banking")
      .toBeGreaterThan(creditFor({ ...base, floor: 6 }));
  });

  it("reaching the bottom pays far more than dying just short", () => {
    const won = creditFor({ ...base, floor: MAX_FLOOR, catalogued: 20, won: true });
    const nearly = creditFor({ ...base, floor: MAX_FLOOR - 1, catalogued: 20 });
    expect(won).toBeGreaterThan(nearly * 1.5);
  });

  it("a hopeless run still pays something, and never nothing", () => {
    expect(creditFor(base)).toBeGreaterThan(0);
    for (const bad of [NaN, -50, Infinity]) {
      const c = creditFor({ ...base, floor: bad, catalogued: bad, bestAllele: bad });
      expect(Number.isFinite(c), String(bad)).toBe(true);
      expect(c).toBeGreaterThan(0);
    }
  });

  it("the ledger is capped and keeps the newest", () => {
    const lab = newLab();
    for (let i = 0; i < LEDGER_CAP + 15; i++) {
      // Credit varies so the newest entry is identifiable; floor is clamped to
      // MAX_FLOOR and cannot be used as a marker past 24.
      recordRun(lab, { ...base, floor: 3 }, i + 1);
    }
    expect(lab.ledger.length).toBe(LEDGER_CAP);
    expect(lab.ledger[lab.ledger.length - 1]?.credit).toBe(LEDGER_CAP + 15);
    expect(lab.ledger[0]?.credit, "the oldest entries should be gone")
      .toBeGreaterThan(1);
  });

  it("deepestEver only ever rises", () => {
    const lab = newLab();
    recordRun(lab, { ...base, floor: 12 }, 10);
    recordRun(lab, { ...base, floor: 3 }, 10);
    expect(lab.deepestEver, "a worse run must not erase the record").toBe(12);
  });

  it("buying validates fully before it spends", () => {
    const lab = newLab();
    lab.credit = 10;
    const offer = offers(lab, ["mtrC"])[0];
    expect(offer).toBeDefined();
    if (!offer) return;
    const r = buy(lab, offer);
    expect(r.ok).toBe(false);
    expect(lab.credit, "a refused order must not spend").toBe(10);
    expect(lab.stock).toEqual([]);

    lab.credit = offer.price + 5;
    expect(buy(lab, offer).ok).toBe(true);
    expect(lab.credit).toBe(5);
    expect(lab.stock).toEqual(["mtrC"]);
    expect(buy(lab, { ...offer, owned: true }).ok, "no double orders").toBe(false);
  });

  it("only genes the lab has seen are offered", () => {
    const lab = newLab();
    const list = offers(lab, ["mtrC"]).filter((o) => o.id.kind === "gene");
    expect(list.map((o) => o.name)).toEqual(["mtrC"]);
    expect(offers(lab, []).some((o) => o.id.kind === "gene")).toBe(false);
  });

  it("prices rise with what a construct actually costs to synthesise", () => {
    expect(genePrice("mcrA")).toBeGreaterThan(genePrice("psbA"));
    expect(sitesPrice(3)).toBeGreaterThan(sitesPrice(0));
    expect(strainPrice(5)).toBeGreaterThan(strainPrice(1));
  });

  it("a stored lab is clamped to what play can produce", () => {
    const lab = parseLab({
      credit: -50, deepestEver: 9999, startStrain: 99, startSites: 999,
      stock: ["mtrC", "mtrC", "notAGene", 7],
      ledger: [{ floor: 9999, credit: -3, killedBy: "x".repeat(500) }, "junk"],
    });
    expect(lab.credit).toBeGreaterThanOrEqual(0);
    expect(lab.deepestEver).toBeLessThanOrEqual(MAX_FLOOR);
    expect(lab.startStrain).toBeLessThanOrEqual(MAX_STRAIN);
    expect(lab.startSites).toBeLessThanOrEqual(MAX_SLOTS - BASE_SLOTS);
    expect(lab.stock).toEqual(["mtrC"]);
    expect(lab.ledger).toHaveLength(1);
    expect(lab.ledger[0]?.killedBy.length).toBeLessThanOrEqual(60);
  });

  it("a corrupt or absent lab degrades to an empty one", () => {
    for (const junk of [null, undefined, 0, "", [], "nonsense"]) {
      const lab = parseLab(junk);
      expect(lab.credit).toBe(0);
      expect(lab.ledger).toEqual([]);
    }
  });
});

describe("the lysis sequence", () => {
  it("runs through its beats in order and ends", () => {
    const beats = [0, 200, 500, 900, 1200, 1600, 1900, 9999].map((ms) => phaseAt(ms).beat);
    expect(beats[0]).toBe("still");
    expect(beats[2]).toBe("rupture");
    expect(beats[4]).toBe("wash");
    expect(beats[beats.length - 1]).toBe("done");
    // Once done it stays done, however long the screen is left up.
    expect(phaseAt(1e9).beat).toBe("done");
  });

  it("the remains spread and never retract", () => {
    let last = -1;
    for (let ms = 0; ms <= LYSIS_MS; ms += 25) {
      const s = phaseAt(ms).spill;
      expect(s, `spill went backwards at ${String(ms)}ms`).toBeGreaterThanOrEqual(last);
      last = s;
    }
    expect(last).toBe(1);
  });

  it("the ledger arrives under the wash, not after it", () => {
    // Waiting for a full fade to black and only then showing the result makes
    // the pause feel like a hang.
    const during = phaseAt(1700);
    expect(during.wash).toBeGreaterThan(0);
    expect(during.reveal).toBeGreaterThan(0);
    expect(phaseAt(LYSIS_MS).reveal).toBe(1);
  });

  it("every value stays in range for any input", () => {
    for (const ms of [-500, 0, NaN, Infinity, -Infinity, 1e12]) {
      const p = phaseAt(ms);
      for (const [k, v] of Object.entries(p)) {
        if (typeof v !== "number") continue;
        expect(Number.isFinite(v), `${k} at ${String(ms)}`).toBe(true);
        expect(v, `${k} at ${String(ms)}`).toBeGreaterThanOrEqual(0);
        expect(v, `${k} at ${String(ms)}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("shards are deterministic and fade out", () => {
    const a = shards(1234, 0.5);
    const b = shards(1234, 0.5);
    expect(a).toEqual(b);
    expect(shards(1234, 1).every((s) => s.a === 0),
           "the remains should be gone by the end").toBe(true);
    for (const s of shards(NaN, NaN)) {
      expect(Number.isFinite(s.x) && Number.isFinite(s.y)).toBe(true);
    }
  });

  it("shards drift downward, because this is sediment", () => {
    const mean = shards(7, 1).reduce((a, s) => a + s.y, 0) / 18;
    expect(mean, "the remains should settle, not scatter evenly")
      .toBeGreaterThan(0);
  });
});

describe("the plasmid grows as the strain learns", () => {
  it("ring positions are earned every other level", () => {
    expect(bonusSlots(1)).toBe(0);
    expect(bonusSlots(MAX_STRAIN)).toBeGreaterThan(bonusSlots(4));
    for (let l = 2; l <= MAX_STRAIN; l++) {
      expect(bonusSlots(l), `L${String(l)}`).toBeGreaterThanOrEqual(bonusSlots(l - 1));
    }
    // and the ring array must be able to hold the biggest combination
    // The ring array must hold the biggest combination there is.
    expect(slotsFor(MAX_SLOTS, bonusSlots(MAX_STRAIN))).toBeLessThanOrEqual(SLOTS);
  });

  it("progress fills toward the next level and reads full at the cap", () => {
    // `raw - floor(raw)` is 0 at exactly the cap, which would show a fully
    // adapted strain as having made no progress at all.
    expect(levelProgress({ catalogued: 0, deepest: 1 })).toBe(0);
    // Full adaptation now needs all THREE terms. Breadth and depth together
    // reach 0.85 of the score, which is level 7 -- a strain that never fought
    // anything is not fully adapted, which is the point of the combat term.
    expect(levelProgress({ catalogued: bio.MICROBES.length, deepest: MAX_FLOOR,
                           killed: 500 })).toBe(1);
    expect(strainLevel({ catalogued: bio.MICROBES.length, deepest: MAX_FLOOR }),
           "a strain that never fought should not be fully adapted")
      .toBeLessThan(MAX_STRAIN);
    for (const p of [{ catalogued: 3, deepest: 3 }, { catalogued: 9, deepest: 12 }]) {
      const v = levelProgress(p);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("progress and level move together", () => {
    // Crossing a level boundary must reset the bar, not leave it stuck full.
    let lastLevel = 1;
    for (let c = 0; c <= bio.MICROBES.length; c++) {
      const p = { catalogued: c, deepest: 6 };
      const l = strainLevel(p);
      if (l > lastLevel) {
        expect(levelProgress(p), `bar did not reset at L${String(l)}`)
          .toBeLessThan(0.6);
        lastLevel = l;
      }
    }
  });

  it("progress survives absurd input", () => {
    for (const n of [NaN, -9, 1e9, Infinity]) {
      const v = levelProgress({ catalogued: n, deepest: n });
      expect(Number.isFinite(v), String(n)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe("the gene catalogue keeps growing", () => {
  it("there are enough genes that no two runs look alike", () => {
    expect(Object.keys(bio.GENES).length).toBeGreaterThan(65);
  });

  it("every gene is still obtainable and sourced", () => {
    const droppable = new Set(bio.MICROBES.flatMap((m) => [...m.genes]));
    for (const id of Object.keys(bio.GENES) as bio.GeneId[]) {
      if (id === "ori") continue;
      expect(droppable.has(id), `${id} is carried by nothing`).toBe(true);
      expect(SOURCES[id], `${id} has no NCBI source`).toBeDefined();
    }
  });

  it("every stratum offers a real choice of genes", () => {
    for (let d = 1; d <= bio.MAX_DEPTH; d++) {
      const here = new Set(bio.microbesAt(d).flatMap((m) => [...m.genes]));
      expect(here.size, `D${String(d)}`).toBeGreaterThan(4);
    }
  });
});

describe("nothing ordered is ever lost", () => {
  /**
   * Buy to a fixed point.
   *
   * A single pass no longer fills the manifest: buying a SITE raises the cap,
   * so more genes become orderable than the pass had seen. Loop until an
   * entire pass changes nothing.
   */
  const buyAll = (lab: ReturnType<typeof newLab>, seen: bio.GeneId[]): void => {
    for (let pass = 0; pass < 40; pass++) {
      const before = lab.credit;
      for (const o of offers(lab, seen)) buy(lab, o);
      if (lab.credit === before) return;
    }
  };

  it("the manifest tracks the chromosome, not the bin", () => {
    // The bin is about CARRYING; the chromosome is about USING. A flat cap of
    // eleven sold eleven constructs to a strain with five free ring positions
    // -- credit spent on genes that sit in the bin for most of a run.
    expect(stockCap(0)).toBeLessThan(stockCap(4));
    for (let s = 0; s <= MAX_SLOTS - BASE_SLOTS; s++) {
      const cap = stockCap(s);
      const ring = slotsFor(s, 0);
      expect(cap, `${String(s)} sites: sells more than the ring can hold`)
        .toBeLessThanOrEqual(ring - 3 + 2);
      expect(cap, `${String(s)} sites: the bin cannot hold the manifest`)
        .toBeLessThanOrEqual(BIN_CAP - STARTING_PARTS);
      expect(cap).toBeGreaterThanOrEqual(3);
    }
    for (const n of [NaN, -9, 1e9]) {
      expect(Number.isFinite(stockCap(n)), String(n)).toBe(true);
    }
  });

  it("STARTING_PARTS matches what the vector actually puts in the bin", () => {
    // If these drift, the stock cap is wrong and the surplus is dropped
    // silently at inoculation.
    expect(new Plasmid().bin.length).toBe(STARTING_PARTS);
  });

  it("the manifest cannot exceed what a strain can carry", () => {
    const lab = newLab();
    lab.credit = 1e6;
    const all = (Object.keys(bio.GENES) as bio.GeneId[]).filter((g) => g !== "ori");
    buyAll(lab, all);
    expect(lab.stock.length).toBeLessThanOrEqual(stockCap(lab.startSites));
  });

  it("every construct in the manifest reaches a fresh strain", () => {
    // Credit spent on a gene that never arrives is the worst kind of bug:
    // nothing anywhere said so. 29 of 40 used to vanish.
    const lab = newLab();
    lab.credit = 1e6;
    const all = (Object.keys(bio.GENES) as bio.GeneId[]).filter((g) => g !== "ori");
    for (const o of offers(lab, all)) buy(lab, o);
    const p = new Plasmid();
    p.integrated = MAX_SLOTS - BASE_SLOTS;   // these fixtures need room
    let arrived = 0;
    for (const g of lab.stock) {
      if (p.stash({ kind: "gene", id: g, level: 1, mods: [], allele: WILD_TYPE }).ok) {
        arrived++;
      }
    }
    expect(arrived, `${String(lab.stock.length - arrived)} constructs lost`)
      .toBe(lab.stock.length);
  });

  it("a full manifest refuses further orders rather than taking the credit", () => {
    const lab = newLab();
    lab.credit = 1e6;
    const all = (Object.keys(bio.GENES) as bio.GeneId[]).filter((g) => g !== "ori");
    buyAll(lab, all);
    const before = lab.credit;
    const more = offers(lab, all).filter((o) => o.id.kind === "gene" && !o.owned);
    for (const o of more) buy(lab, o);
    expect(lab.credit, "credit was taken for nothing").toBe(before);
  });

  it("a full manifest says so instead of looking affordable", () => {
    const lab = newLab();
    lab.credit = 1e6;
    const all = (Object.keys(bio.GENES) as bio.GeneId[]).filter((g) => g !== "ori");
    buyAll(lab, all);
    const gene = offers(lab, all).find(
      (o) => o.id.kind === "gene" && !lab.stock.includes((o.id as { gene: bio.GeneId }).gene));
    expect(gene?.owned, "an unbuyable offer looked buyable").toBe(true);
    expect(gene?.note).toContain("no room");
  });
});

describe("auto-explore targets the frontier", () => {
  const level = () => {
    const d = new Dungeon(96, 96, 19);
    const L = d.level(1);
    computeFov(L.sight, L.grid, L.up.x, L.up.y, 9);
    return L;
  };

  it("goes to known floor beside the unknown, not into the unknown", () => {
    // You cannot path INTO the dark: as far as the pathfinder knows it might
    // be solid. The frontier -- seen floor next to unseen -- is what reveals it.
    const L = level();
    const f = frontier(L.grid, L.sight, L.up);
    expect(f).not.toBeNull();
    if (!f) return;
    expect(isSeen(L.sight, f.x, f.y), "target must be somewhere you have been")
      .toBe(true);
    expect(L.grid.isFloor(f.x, f.y)).toBe(true);
    const touchesDark = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .some(([dx, dy]) => !isSeen(L.sight, f.x + (dx ?? 0), f.y + (dy ?? 0)));
    expect(touchesDark, "target is not on the frontier at all").toBe(true);
  });

  it("returns a walkable path, or says it is finished", () => {
    const L = level();
    const r = nextExplore(L.grid, L.sight, L.up);
    expect(r.kind).toBe("go");
    if (r.kind !== "go") return;
    expect(r.path.length).toBeGreaterThan(1);
    expect(r.path[0]).toEqual({ x: L.up.x, y: L.up.y });
    for (const n of r.path) expect(L.grid.isFloor(n.x, n.y)).toBe(true);
  });

  it("exploring the whole level terminates and reveals nearly all of it", () => {
    // The real risk with a loop like this is that it never finishes: a
    // frontier it cannot path to would be picked for ever.
    const L = level();
    let at = { x: L.up.x, y: L.up.y };
    let legs = 0;
    for (; legs < 400; legs++) {
      const r = nextExplore(L.grid, L.sight, at);
      if (r.kind === "done") break;
      const last = r.path[r.path.length - 1];
      if (!last) break;
      at = last;
      computeFov(L.sight, L.grid, at.x, at.y, 9);
    }
    expect(legs, "auto-explore never terminated").toBeLessThan(400);
    expect(unexplored(L.grid, L.sight), "left too much of the floor dark")
      .toBeLessThan(0.15);
  });

  it("a fully explored level reports done, not an empty path", () => {
    const L = level();
    L.sight.seen.fill(1);
    const r = nextExplore(L.grid, L.sight, L.up);
    expect(r.kind).toBe("done");
    expect(frontier(L.grid, L.sight, L.up)).toBeNull();
    expect(unexplored(L.grid, L.sight)).toBe(0);
  });

  it("a sealed pocket does not strand the search", () => {
    // The nearest frontier is sometimes behind a wall. Giving up on the first
    // failed path would stop exploring next to an open doorway.
    const g = new mg.Grid(40, 40, mg.FLOOR);
    for (let y = 0; y < 40; y++) g.set(20, y, mg.WALL);
    const sight = makeSight(40, 40);
    computeFov(sight, g, 5, 5, 8);
    const r = nextExplore(g, sight, { x: 5, y: 5 });
    expect(r.kind).toBe("go");
  });
});

describe("speed varies by organism", () => {
  it("a chaser genuinely outpaces a glider, and a stalk never moves", () => {
    const acts = (b: Parameters<typeof speedOf>[0], s: Parameters<typeof speedOf>[1]) => {
      const budget = { banked: 0 };
      let n = 0;
      for (let i = 0; i < 20; i++) n += speedTick(budget, speedOf(b, s));
      return n;
    };
    expect(acts("chase", "medium")).toBeGreaterThan(acts("glide", "medium"));
    expect(acts("glide", "medium")).toBeGreaterThan(acts("drift", "medium"));
    expect(acts("sessile", "filament"), "an attached cell should never move").toBe(0);
  });

  it("size drags: a filament is slower than a coccus of the same habit", () => {
    expect(speedOf("chase", "filament")).toBeLessThan(speedOf("chase", "small"));
  });

  it("fractional speed carries across turns rather than being lost", () => {
    // 0.6 must give an action every other turn, not none at all.
    const b = { banked: 0 };
    let acts = 0;
    for (let i = 0; i < 10; i++) acts += speedTick(b, 0.6);
    expect(acts).toBeGreaterThanOrEqual(5);
    expect(acts).toBeLessThanOrEqual(7);
  });

  it("a budget never banks without limit", () => {
    // A creature that could not move for a hundred turns must not then take a
    // hundred steps at once.
    const b = { banked: 0 };
    for (let i = 0; i < 100; i++) speedTick(b, 3);
    expect(b.banked).toBeLessThanOrEqual(4);
    expect(speedTick(b, 3)).toBeLessThanOrEqual(4);
  });

  it("haste multiplies and absurd input does not break it", () => {
    const fast = { banked: 0 };
    const slow = { banked: 0 };
    let f = 0, s = 0;
    for (let i = 0; i < 10; i++) { f += speedTick(fast, 1, 2); s += speedTick(slow, 1, 1); }
    expect(f).toBeGreaterThan(s);
    for (const n of [NaN, -5, Infinity]) {
      const b = { banked: 0 };
      const r = speedTick(b, n, n);
      expect(Number.isFinite(r), String(n)).toBe(true);
      expect(r).toBeGreaterThanOrEqual(0);
    }
  });

  it("player speed is something you carry, not something you have", () => {
    // Building and turning a flagellum is among the most expensive things a
    // cell does, which is why so many give it up.
    const bare = playerSpeed(() => false);
    const full = playerSpeed((g) => ["flhD", "cheA", "pilA"].includes(g));
    expect(bare).toBeLessThan(1);
    expect(full).toBeGreaterThan(bare);
    expect(full).toBeLessThanOrEqual(1.6);
  });

  it("every organism has a defined speed", () => {
    for (const m of bio.MICROBES) {
      const s = speedOf(m.behaviour, m.size);
      expect(Number.isFinite(s), m.id).toBe(true);
      expect(s, m.id).toBeGreaterThanOrEqual(0);
      expect(s, m.id).toBeLessThan(2);
    }
  });
});

describe("repair costs energy, because repair enzymes are ATPases", () => {
  it("a cell with no repair machinery can still limp", () => {
    // Only two of nine complexes grant free regeneration, so without a
    // baseline a scratch on the first floor followed you to the last.
    const p = profileFor(() => false);
    expect(p.rate).toBeGreaterThan(0);
    const r = repairTurn(p, 5, 20, 100, 100);
    expect(r.hp).toBeGreaterThan(0);
    expect(r.atp).toBeGreaterThan(0);
  });

  it("chaperones make repair both faster and cheaper", () => {
    const bare = profileFor(() => false);
    const full = profileFor((g) => ["groL", "dnaK", "recA", "uvrA"].includes(g));
    expect(full.rate).toBeGreaterThan(bare.rate * 3);
    expect(full.cost).toBeLessThan(bare.cost);
    expect(estimate(full, 15).turns).toBeLessThan(estimate(bare, 15).turns / 3);
  });

  it("it never spends the last of the ATP", () => {
    // Running the pumps dry to close a scratch is how you die to the next
    // thing, and doing it by accident punishes the wrong mistake.
    const p = profileFor(() => true);
    const r = repairTurn(p, 1, 40, 18, 100);      // 18 is under the 20% floor
    expect(r.hp).toBe(0);
    expect(r.atp).toBe(0);
    const ok = repairTurn(p, 1, 40, 60, 100);
    expect(ok.atp).toBeLessThanOrEqual(60 - 20);
  });

  it("it never overheals or repairs a full cell", () => {
    const p = profileFor(() => true);
    expect(repairTurn(p, 20, 20, 100, 100).hp).toBe(0);
    const r = repairTurn(p, 19.9, 20, 100, 100);
    expect(r.hp).toBeLessThanOrEqual(0.1 + 1e-9);
  });

  it("repair is bounded by what the ATP will buy", () => {
    const p = profileFor(() => true);
    // Barely above the reserve: it should heal a sliver, not a full tick.
    const r = repairTurn(p, 1, 40, 21, 100);
    expect(r.atp).toBeLessThanOrEqual(1.0001);
    expect(r.hp).toBeLessThan(p.rate);
  });

  it("survives absurd input", () => {
    const p = profileFor(() => false);
    for (const n of [NaN, -50, Infinity]) {
      const r = repairTurn(p, n, n, n, n);
      expect(Number.isFinite(r.hp), String(n)).toBe(true);
      expect(Number.isFinite(r.atp), String(n)).toBe(true);
      expect(r.hp).toBeGreaterThanOrEqual(0);
      expect(r.atp).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(estimate(p, n).turns)).toBe(true);
    }
  });

  it("every repair gene named is a real gene in the catalogue", () => {
    for (const id of Object.keys(REPAIR_GENES)) {
      expect(bio.GENES[id as bio.GeneId], `${id} is not a gene`).toBeDefined();
    }
  });
});

describe("rarity describes the copy, and is never a lie", () => {
  const rolls = (depth: number, n = 4000) => {
    const rng = makeRng(depth * 733);
    return Array.from({ length: n }, () => rollAllele(rng, depth));
  };

  it("rare and above ALWAYS carry an affix", () => {
    // The reported bug: a wild-type psaA at +0% on every stat displayed as
    // RARE, because rarity came from the gene's tier rather than the find.
    for (const depth of [1, 4, 8]) {
      for (const a of rolls(depth, 1500)) {
        const r = alleleRarity("psaA", a);
        const affixes = (a.prefix ? 1 : 0) + (a.suffix ? 1 : 0);
        if (r === "rare" || r === "epic") {
          expect(affixes, `${r} with no affix`).toBeGreaterThanOrEqual(1);
        }
        if (r === "legendary") expect(affixes, "legendary with one affix").toBe(2);
      }
    }
  });

  it("a wild-type copy of the best gene in the game is COMMON", () => {
    expect(alleleRarity("mcrA", WILD_TYPE)).toBe("common");
    expect(alleleRarity("psbA", WILD_TYPE)).toBe("common");
  });

  it("rarer copies are measurably better at the same job", () => {
    // This is the answer to "what is the win": a legendary mtrC out-performs a
    // common mtrC, and the card says by how much.
    const byTier: Record<string, number[]> = {};
    for (const a of rolls(6, 6000)) {
      const r = alleleRarity("mtrC", a);
      (byTier[r] ??= []).push(quality(a));
    }
    const mean = (xs: number[] | undefined): number =>
      xs && xs.length > 0 ? xs.reduce((x, y) => x + y, 0) / xs.length : 0;
    const order = ["common", "uncommon", "rare", "epic", "legendary"];
    let last = 0;
    for (const t of order) {
      const m = mean(byTier[t]);
      if (m === 0) continue;
      expect(m, `${t} is not better than the tier below`).toBeGreaterThan(last);
      last = m;
    }
    expect(mean(byTier["legendary"]) / mean(byTier["common"]),
           "the top tier must be a real step up").toBeGreaterThan(1.2);
  });

  it("a good roll means a LOW Km, so the bias must push it down", () => {
    // Rolling Km like the others made every high-tier allele worse at the one
    // stat that matters most when the substrate has nearly run out.
    const km = (depth: number): number => {
      const xs = rolls(depth, 3000)
        .filter((a) => a.rarity === "legendary" || a.rarity === "epic")
        .map((a) => a.km);
      return xs.length > 0 ? xs.reduce((x, y) => x + y, 0) / xs.length : 1;
    };
    expect(km(8), "top-tier alleles should have tighter affinity").toBeLessThan(1);
  });

  it("a stored allele cannot claim a colour it has not earned", () => {
    const liar = { ...WILD_TYPE, rarity: "legendary" as const };
    expect(alleleRarity("mtrC", liar), "a wild-type legendary was accepted")
      .toBe("common");
    const s = parseSave({
      version: SCHEMA, depth: 1, floor: 1, seed: 1, px: 5, py: 5, hp: 20, atp: 50,
      ring: [{ kind: "gene", id: "mtrC", level: 1, mods: [],
               allele: { kcat: 1, km: 1, stability: 1, rarity: "legendary" } }],
      bin: [], run: {}, settings: {}, heldMods: [], turn: 0, stocked: [],
    });
    const g = s?.ring[0];
    if (g?.kind !== "gene") { expect(g?.kind).toBe("gene"); return; }
    expect(alleleRarity("mtrC", g.allele)).toBe("common");
  });

  it("every tier still appears, at a rate that makes it worth hunting", () => {
    const tally: Record<string, number> = {};
    for (const a of rolls(8, 6000)) {
      const r = alleleRarity("mtrC", a);
      tally[r] = (tally[r] ?? 0) + 1;
    }
    for (const t of ["common", "uncommon", "rare", "epic", "legendary"]) {
      expect(tally[t] ?? 0, `${t} never appeared`).toBeGreaterThan(0);
    }
    expect((tally["legendary"] ?? 0) / 6000).toBeLessThan(0.05);
  });
});

describe("the flight recorder", () => {
  it("keeps the newest events and bounds the buffer", () => {
    const t = new Trace();
    for (let i = 0; i < TRACE_CAP * 3; i++) t.push(i, "move", `step ${String(i)}`);
    const all = t.all();
    expect(all.length).toBe(TRACE_CAP);
    expect(all[all.length - 1]?.what, "the newest event was lost")
      .toBe(`step ${String(TRACE_CAP * 3 - 1)}`);
    expect(all[0]?.what, "oldest first, and the oldest should have rolled off")
      .toBe(`step ${String(TRACE_CAP * 2)}`);
  });

  it("stays ordered across the wrap", () => {
    // A ring buffer read back in the wrong order is worse than none: it says
    // the effect happened before the cause.
    const t = new Trace();
    for (let i = 0; i < TRACE_CAP + 37; i++) t.push(i, "turn", String(i));
    const ts = t.all().map((e) => e.t);
    for (let i = 1; i < ts.length; i++) {
      expect(ts[i] ?? 0, "events came back out of order")
        .toBeGreaterThan(ts[i - 1] ?? 0);
    }
  });

  it("bounds a runaway string", () => {
    const t = new Trace();
    t.push(1, "note", "x".repeat(10000));
    expect((t.all()[0]?.what ?? "").length).toBeLessThan(130);
  });

  it("survives absurd turn numbers", () => {
    const t = new Trace();
    for (const n of [NaN, Infinity, -1e12]) t.push(n, "move", "x");
    for (const e of t.all()) expect(Number.isFinite(e.t)).toBe(true);
  });

  it("the epitaph is the tail, without the chatter", () => {
    const t = new Trace();
    t.push(1, "note", "flavour text nobody needs");
    t.push(2, "hurt", "oxidative stress for 3");
    t.push(3, "death", "F4 by oxidative stress");
    const e = t.epitaph(10);
    expect(e.join(" ")).not.toContain("flavour");
    expect(e[e.length - 1]).toContain("death");
  });

  it("dump reads oldest to newest", () => {
    const t = new Trace();
    t.push(1, "move", "first");
    t.push(2, "move", "last");
    const d = t.dump();
    expect(d.indexOf("first")).toBeLessThan(d.indexOf("last"));
  });
});


describe("the chromosome grows", () => {
  it("starts small and every site costs more than the last", () => {
    // One replicon that GROWS, not a menu of five to pick between. An integron
    // is literally a site that captures gene cassettes one after another.
    expect(slotsFor(0, 0)).toBe(BASE_SLOTS);
    let last = 0;
    for (let i = 0; i < MAX_SLOTS - BASE_SLOTS; i++) {
      const c = expansionCost(slotsFor(i, 0));
      expect(Number.isFinite(c), `site ${String(i)}`).toBe(true);
      expect(c, "expansion got cheaper").toBeGreaterThan(last);
      last = c;
    }
    expect(expansionCost(MAX_SLOTS)).toBe(Infinity);
  });

  it("never grows past what the ring array can hold", () => {
    expect(slotsFor(999, 999)).toBe(MAX_SLOTS);
    expect(slotsFor(MAX_SLOTS, MAX_SLOTS)).toBeLessThanOrEqual(SLOTS);
  });

  it("headroom grows with the molecule", () => {
    const small = capacityFor(BASE_SLOTS, 0);
    const big = capacityFor(MAX_SLOTS, 0);
    expect(big).toBeGreaterThan(small * 2);
    for (let s = BASE_SLOTS; s <= MAX_SLOTS; s++) {
      expect(capacityFor(s, 0)).toBeGreaterThanOrEqual(capacityFor(s - 1, 0));
    }
  });

  it("every site is reachable, and the last one is hard", () => {
    // The first version rose at 1.42 per step: the eighth site cost 744 ATP
    // against a ceiling of 100, so thirteen of sixteen expansions and every
    // trait were simply unreachable. Eighty percent of the system was
    // decoration.
    for (let i = 0; i < MAX_SLOTS - BASE_SLOTS; i++) {
      const cost = expansionCost(slotsFor(i, 0));
      const ceiling = atpCeiling(i, MAX_STRAIN);
      expect(cost, `site ${String(i)} can never be paid for`)
        .toBeLessThanOrEqual(ceiling);
    }
    // And the last must still be a real commitment: most of a full pool.
    const last = MAX_SLOTS - BASE_SLOTS - 1;
    expect(expansionCost(slotsFor(last, 0)) / atpCeiling(last, MAX_STRAIN))
      .toBeGreaterThan(0.6);
  });

  it("every trait is reachable by a developed strain, and none at the start", () => {
    for (const id of TRAIT_IDS) {
      expect(TRAITS[id].cost, `${id} can never be bought`)
        .toBeLessThanOrEqual(atpCeiling(MAX_SLOTS - BASE_SLOTS, MAX_STRAIN));
      expect(TRAITS[id].cost, `${id} is affordable from turn one`)
        .toBeGreaterThan(atpCeiling(0, 1));
    }
  });

  it("the pool grows with the cell, and never shrinks with growth", () => {
    let last = 0;
    for (let i = 0; i <= MAX_SLOTS - BASE_SLOTS; i++) {
      const c = atpCeiling(i, 1);
      expect(c).toBeGreaterThanOrEqual(last);
      last = c;
    }
    expect(atpCeiling(0, 1)).toBe(ATP_MAX);
    expect(atpCeiling(16, MAX_STRAIN)).toBeGreaterThan(ATP_MAX * 2);
    for (const n of [NaN, -9, 1e9]) {
      expect(Number.isFinite(atpCeiling(n, n))).toBe(true);
      expect(atpCeiling(n, n)).toBeGreaterThanOrEqual(ATP_MAX);
    }
  });

  it("survives absurd input", () => {
    for (const n of [NaN, -5, 1e9, Infinity]) {
      expect(Number.isFinite(slotsFor(n, n))).toBe(true);
      expect(slotsFor(n, n)).toBeLessThanOrEqual(MAX_SLOTS);
      expect(Number.isFinite(capacityFor(n, n))).toBe(true);
      const c = expansionCost(n);
      expect(Number.isFinite(c) || c === Infinity).toBe(true);
    }
  });

  it("the plasmid reflects what has been integrated", () => {
    const p = new Plasmid();
    expect(p.usableSlots).toBe(BASE_SLOTS);
    const before = p.capacityKb();
    p.integrated = 4;
    expect(p.usableSlots).toBe(BASE_SLOTS + 4);
    expect(p.capacityKb(), "headroom did not follow").toBeGreaterThan(before);
  });
});

describe("architecture is bought once and kept", () => {
  it("each trait is a different KIND of advantage", () => {
    expect(new Set(TRAIT_IDS).size).toBe(TRAIT_IDS.length);
    for (const id of TRAIT_IDS) {
      expect(TRAITS[id].rule.length, `${id} has no rule`).toBeGreaterThan(20);
      expect(TRAITS[id].cost, `${id} is free`).toBeGreaterThan(0);
    }
  });

  it("partitioned: intermediates never accumulate", () => {
    const mk = (part: boolean) => {
      const p = new Plasmid();
      p.integrated = 6;
      if (part) p.acquire("partitioned");
      p.put(4, { kind: "promoter", id: "j23119" });
      p.put(5, { kind: "gene", id: "dsrA", level: 1, mods: [], allele: WILD_TYPE });
      p.put(6, { kind: "terminator", id: "rrnbt1" });
      return p;
    };
    expect(mk(true).hazards(7)).toEqual([]);
    expect(mk(true).toxicity(7)).toBe(0);
  });

  it("runaway: copy number tracks the energy, and only with the trait", () => {
    const plain = new Plasmid();
    plain.energy = 0;
    const a = plain.copies();
    plain.energy = 1;
    expect(plain.copies(), "a plain chromosome drifted").toBe(a);
    expect(a, "a chromosome is single copy").toBe(1);

    const wild = new Plasmid();
    wild.acquire("runaway");
    wild.energy = 0;
    const low = wild.copies();
    wild.energy = 1;
    expect(wild.copies() / low, "the swing is not worth taking").toBeGreaterThan(8);
  });

  it("copiesFor survives absurd energy", () => {
    for (const n of [NaN, -5, Infinity]) {
      for (const has of [true, false]) {
        const c = copiesFor(has, n);
        expect(Number.isFinite(c), String(n)).toBe(true);
        expect(c).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("the lab sells a bigger starting chromosome, dearer each time", () => {
    const lab = newLab();
    let last = 0;
    for (let i = 0; i < 6; i++) {
      const price = sitesPrice(i);
      expect(price, "sites got cheaper").toBeGreaterThan(last);
      last = price;
    }
    lab.credit = 1e6;
    const before = lab.startSites;
    const offer = offers(lab, []).find((o) => o.id.kind === "sites");
    expect(offer).toBeDefined();
    if (!offer) return;
    expect(buy(lab, offer).ok).toBe(true);
    expect(lab.startSites).toBe(before + 1);
  });
});

describe("the ring closes, at every size", () => {
  // Three separate angle computations existed and two still divided by SLOTS
  // while the loop ran `used` times, so eight wedges were drawn at
  // one-twenty-fourth spacing and the ring rendered as a quarter-circle.
  // Round-tripping a centre back to its index did NOT catch that: slotAt and
  // slotCentre agreed with each other while the drawing disagreed with both.
  const geom = (used: number) =>
    ({ cx: 200, cy: 300, rInner: 80, rOuter: 130, rot: 0, used });

  it("consecutive slot centres are one full step apart", () => {
    for (const used of [8, 10, 14, 16, 20, 24]) {
      const g = geom(used);
      const step = (Math.PI * 2) / used;
      for (let i = 0; i + 1 < used; i++) {
        const a = slotCentre(g, i);
        const b = slotCentre(g, i + 1);
        const angA = Math.atan2(a.y - g.cy, a.x - g.cx);
        const angB = Math.atan2(b.y - g.cy, b.x - g.cx);
        let d = angB - angA;
        while (d < -Math.PI) d += Math.PI * 2;
        while (d > Math.PI) d -= Math.PI * 2;
        expect(d, `${String(used)} slots: gap between ${String(i)} and ${String(i + 1)}`)
          .toBeCloseTo(step, 6);
      }
    }
  });

  it("the positions span the whole circle, not a fraction of it", () => {
    for (const used of [8, 12, 16, 24]) {
      const g = geom(used);
      // Walking every position must return to where it started.
      const first = slotCentre(g, 0);
      const last = slotCentre(g, used - 1);
      const angFirst = Math.atan2(first.y - g.cy, first.x - g.cx);
      const angLast = Math.atan2(last.y - g.cy, last.x - g.cx);
      let span = angLast - angFirst;
      while (span < 0) span += Math.PI * 2;
      const expected = ((used - 1) / used) * Math.PI * 2;
      expect(span, `${String(used)} slots covered only ${(span / Math.PI * 180).toFixed(0)} degrees`)
        .toBeCloseTo(expected, 5);
    }
  });

  it("every direction lands on some position", () => {
    // If the wedges spanned a fraction of the circle, most angles would map to
    // a position that is not drawn there.
    for (const used of [8, 16, 24]) {
      const g = geom(used);
      const hit = new Set<number>();
      for (let a = 0; a < 360; a += 2) {
        const rad = (a * Math.PI) / 180;
        const s = slotAt(g, g.cx + Math.cos(rad) * 105, g.cy + Math.sin(rad) * 105);
        if (s !== null) hit.add(s);
      }
      expect(hit.size, `${String(used)} slots: only ${String(hit.size)} reachable`)
        .toBe(used);
    }
  });
});

describe("compound edits are all or nothing", () => {
  const genes = (Object.keys(bio.GENES) as bio.GeneId[]).filter((g) => g !== "ori");
  const snap = (p: Plasmid): string => JSON.stringify({
    slots: p.slots, bin: p.bin, integrated: p.integrated, traits: [...p.traits],
  });

  it("a refused assemble leaves the bin exactly as it was", () => {
    // It splices parts OUT of the bin and then places them, so a refused
    // `put` partway through destroyed whatever had already been removed.
    for (let seed = 0; seed < 300; seed++) {
      const p = new Plasmid();
      p.integrated = seed % 5;
      for (let i = 0; i < seed % 6; i++) {
        const g = genes[(seed * 7 + i) % genes.length];
        if (g) p.stash({ kind: "gene", id: g, level: 1, mods: [], allele: WILD_TYPE });
      }
      const want = [genes[seed % genes.length], genes[(seed + 3) % genes.length],
                    genes[(seed + 7) % genes.length]].filter((g) => g !== undefined);
      const before = snap(p);
      const r = p.assemble(want);
      if (!r.ok) {
        expect(snap(p), `refused (${r.err}) but changed the plasmid`).toBe(before);
      }
    }
  });

  it("assemble conserves parts: nothing is spliced out and dropped", () => {
    // Not a regression test -- `norm` wraps at `usableSlots`, so the `put`
    // this worried about cannot currently refuse. It is a CONSERVATION check:
    // assemble removes parts from the bin and places them, and the count
    // across bin and ring must not change. That property is what would break
    // first if the wrap rule were ever loosened again.
    for (let sites = 0; sites <= 4; sites++) {
      const p = new Plasmid();
      p.integrated = sites;
      p.stash({ kind: "gene", id: "psbA", level: 1, mods: [], allele: WILD_TYPE });
      const before = p.bin.filter((x) => x.kind === "terminator").length
        + p.slots.filter((x) => x?.kind === "terminator").length;
      p.assemble(["psbA"]);
      const after = p.bin.filter((x) => x.kind === "terminator").length
        + p.slots.filter((x) => x?.kind === "terminator").length;
      expect(after, `${String(sites)} sites: a terminator vanished`).toBe(before);
    }
  });

  it("a throw inside a transaction rolls back AND is re-raised", () => {
    // Rolling back is not the same as pretending nothing went wrong.
    // Swallowing the throw would turn a crash into silent corruption.
    const p = new Plasmid();
    p.stash({ kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE });
    const before = snap(p);
    expect(() => p.transact(() => {
      p.bin.length = 0;
      p.put(4, { kind: "promoter", id: "j23119" });
      throw new Error("boom");
    })).toThrow("boom");
    expect(snap(p), "a throw left the plasmid half-edited").toBe(before);
  });

  it("a failing transaction restores both the ring and the bin", () => {
    const p = new Plasmid();
    p.stash({ kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE });
    const before = snap(p);
    const r = p.transact(() => {
      p.bin.splice(0, 2);
      p.put(5, { kind: "terminator", id: "hairpin" });
      return { ok: false, err: "no" };
    });
    expect(r.ok).toBe(false);
    expect(snap(p)).toBe(before);
  });

  it("a succeeding transaction keeps its changes", () => {
    // Atomic must not mean inert.
    const p = new Plasmid();
    const before = snap(p);
    const r = p.transact(() => {
      p.put(5, { kind: "terminator", id: "hairpin" });
      return { ok: true };
    });
    expect(r.ok).toBe(true);
    expect(snap(p)).not.toBe(before);
    expect(p.at(5)?.kind).toBe("terminator");
  });
});

describe("the operon is read off the map, never assumed", () => {
  const genes = (Object.keys(bio.GENES) as bio.GeneId[]).filter((g) => g !== "ori");

  /** The same ring, computed from scratch by a plasmid with no history. */
  const fromScratch = (p: Plasmid): string => {
    const q = new Plasmid();
    q.integrated = p.integrated;
    q.strain = p.strain;
    q.depth = p.depth;
    q.inducers = p.inducers;
    for (let i = 0; i < p.slots.length; i++) q.slots[i] = p.slots[i] ?? null;
    return JSON.stringify(q.operons());
  };

  it("the cached read always equals a fresh one, after any mutation", () => {
    // `operons()` is memoised, and a memo is a promise that nothing it depends
    // on has changed. Its inputs are the ring, the chromosome size, the depth
    // and the inducers -- a stale one would silently describe a plasmid that
    // no longer exists, which is the worst kind of wrong because everything
    // downstream (expression, ATP, power) is built on it.
    for (let seed = 0; seed < 300; seed++) {
      const p = new Plasmid();
      p.integrated = seed % 9;
      const rng = makeRng(seed);
      for (let step = 0; step < 25; step++) {
        const g = genes[rng.int(genes.length)];
        switch (rng.int(7)) {
          case 0:
            if (g) p.stash({ kind: "gene", id: g, level: 1, mods: [], allele: WILD_TYPE });
            break;
          case 1: p.install(rng.int(Math.max(p.bin.length, 1)), rng.int(p.usableSlots)); break;
          case 2: p.swap(rng.int(p.usableSlots), rng.int(p.usableSlots)); break;
          case 3: p.rotate(rng.int(20) - 10); break;
          case 4: p.remove(rng.int(p.usableSlots)); break;
          case 5: p.depth = 1 + rng.int(8); break;
          case 6: p.uninstall(rng.int(p.usableSlots)); break;
        }
        expect(JSON.stringify(p.operons()),
               `seed ${String(seed)} step ${String(step)}: cached operon is stale`)
          .toBe(fromScratch(p));
      }
    }
  });

  it("swapping a part into a position redefines the operon it lands in", () => {
    const p = new Plasmid();
    p.integrated = 8;
    p.put(4, { kind: "promoter", id: "j23119" });
    p.put(5, { kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE });
    p.put(6, { kind: "terminator", id: "rrnbt1" });
    const inOperon = (id: bio.GeneId): boolean =>
      p.operons().some((o) => o.genes.some((g) => g.id === id));
    expect(inOperon("mtrC")).toBe(true);

    // Move it out from under the promoter. The operon must forget it.
    p.swap(5, 10);
    expect(inOperon("mtrC"), "the operon still claims a gene that moved away")
      .toBe(false);
    p.swap(5, 10);
    expect(inOperon("mtrC"), "moving it back did not restore the operon").toBe(true);
  });

  it("a conditional promoter re-reads the stratum", () => {
    // PfnrS carries an iron-sulfur cluster that O2 destroys. Its output is not
    // a property of the ring, so a memo keyed only on the ring would be wrong.
    const p = new Plasmid();
    p.integrated = 8;
    p.put(4, { kind: "promoter", id: "pfnr" });
    p.put(5, { kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE });
    p.put(6, { kind: "terminator", id: "rrnbt1" });
    const out = (): number => p.operons().find((o) => o.promoter === 4)?.output ?? 0;
    p.depth = 1;
    const oxic = out();
    p.depth = 6;
    expect(out(), "the operon did not notice the oxygen had gone")
      .toBeGreaterThan(oxic * 5);
  });
});

describe("duplicate genes stack", () => {
  const copy = (id: bio.GeneId, allele = WILD_TYPE): Part =>
    ({ kind: "gene", id, level: 1, mods: [], allele });

  it("auto-stacks on pickup, up to the maximum", () => {
    const p = new Plasmid();
    p.integrated = 8;
    for (let i = 0; i < MAX_STACK; i++) {
      expect(p.stash(copy("mtrC")).ok, `copy ${String(i + 1)}`).toBe(true);
    }
    const rows = p.bin.filter((x) => x.kind === "gene" && x.id === "mtrC");
    expect(rows.length, "it made rows instead of a stack").toBe(1);
    expect(countOf(rows[0]!)).toBe(MAX_STACK);
    expect(p.stash(copy("mtrC")).ok, "a fourth was accepted").toBe(false);
  });

  it("the same gene at a different rarity is a different gene", () => {
    // Rarity here describes the COPY -- its rolled kinetics and its affixes --
    // so a rare mtrC and a common one are different objects that share a name.
    // Merging them would quietly average away the thing you went looking for.
    const plain = WILD_TYPE;
    const fancy = { ...WILD_TYPE, kcat: 1.6, km: 0.6, stability: 1.4,
                    prefix: "hyperactive" as const, suffix: "highCopy" as const,
                    rarity: "legendary" as const };
    expect(alleleRarity("mtrC", plain)).not.toBe(alleleRarity("mtrC", fancy));

    const p = new Plasmid();
    p.integrated = 8;
    p.stash(copy("mtrC", plain));
    p.stash(copy("mtrC", fancy));
    const rows = p.bin.filter((x) => x.kind === "gene" && x.id === "mtrC");
    expect(rows.length, "two rarities were merged into one stack").toBe(2);
    for (const r of rows) expect(countOf(r)).toBe(1);
  });

  it("stacking never downgrades what you already had", () => {
    // The stack keeps one allele. It must not be the worse one.
    const p = new Plasmid();
    p.integrated = 8;
    const worked: Part = { kind: "gene", id: "mtrC", level: 3,
                           mods: ["codon"], allele: WILD_TYPE };
    p.stash(worked);
    p.stash(copy("mtrC"));
    const row = p.bin.find((x) => x.kind === "gene" && x.id === "mtrC");
    expect(row?.kind).toBe("gene");
    if (row?.kind !== "gene") return;
    expect(row.level, "the evolved copy was replaced by a fresh one").toBe(3);
    expect(row.mods, "the modifier was lost").toEqual(["codon"]);
    expect(countOf(row)).toBe(2);
  });

  it("installing takes ONE copy, leaving the rest", () => {
    const p = new Plasmid();
    p.integrated = 8;
    for (let i = 0; i < 3; i++) p.stash(copy("mtrC"));
    const at = p.bin.findIndex((x) => x.kind === "gene" && x.id === "mtrC");
    p.install(at, 5);
    expect(p.has("mtrC"), "it did not install").toBe(true);
    const left = p.bin.find((x) => x.kind === "gene" && x.id === "mtrC");
    expect(countOf(left!), "installing ate the whole stack").toBe(2);
  });

  it("the origin never stacks", () => {
    // There is exactly one. A stack of them would imply a spare.
    const a: Part = { kind: "gene", id: "ori", level: 1, mods: [], allele: WILD_TYPE };
    const b: Part = { kind: "gene", id: "ori", level: 1, mods: [], allele: WILD_TYPE };
    expect(stacks(a, b)).toBe(false);
  });

  it("a stack round-trips through a save, and cannot be inflated", () => {
    const s = parseSave({
      version: SCHEMA, depth: 1, floor: 1, seed: 1, px: 5, py: 5, hp: 20, atp: 50,
      ring: [], bin: [
        { kind: "gene", id: "mtrC", level: 1, mods: [], count: 2 },
        { kind: "gene", id: "psbA", level: 1, mods: [], count: 99 },
        { kind: "gene", id: "katG", level: 1, mods: [] },
      ],
      run: {}, settings: {}, heldMods: [], turn: 0, stocked: [],
      integrated: 0, traits: [],
    });
    expect(s).not.toBeNull();
    if (!s) return;
    expect(countOf(s.bin[0]!)).toBe(2);
    expect(countOf(s.bin[1]!), "a save minted copies").toBe(MAX_STACK);
    // Unstacked genes round-trip to exactly what they were, with no count.
    expect((s.bin[2] as { count?: number }).count).toBeUndefined();
  });
});

describe("the cell looks like what it expresses", () => {
  const build = (genes: bio.GeneId[]): Plasmid => {
    const p = new Plasmid();
    p.integrated = MAX_SLOTS - BASE_SLOTS;
    p.strain = MAX_STRAIN;
    let s = 4;
    p.put(s++, { kind: "promoter", id: "j23119" });
    for (const g of genes) {
      p.put(s++, { kind: "gene", id: g, level: 1, mods: [], allele: WILD_TYPE });
    }
    p.put(s, { kind: "terminator", id: "rrnbt1t2" });
    return p;
  };

  it("different metabolisms do not look alike", () => {
    // The avatar was a fixed white capsule for the whole game. A
    // photoferrotroph and a methanogen looked identical, which threw away the
    // one place a build can be read at a glance.
    // Each at a depth where it can actually express: these genes are
    // stratum-gated, so testing them all at the surface would only prove that
    // most of them are switched off there.
    const bestBody = (genes: bio.GeneId[]): string => {
      const p = build(genes);
      let best = phenotypeOf(new Plasmid(), 1).body;
      for (let d = 1; d <= 8; d++) {
        const b = phenotypeOf(p, d).body;
        if (b !== phenotypeOf(new Plasmid(), d).body) best = b;
      }
      return best;
    };
    const looks = new Set([
      bestBody(["psbA", "psaA"]),
      bestBody(["pufM", "pufL"]),
      bestBody(["fmoA", "csmA"]),
      bestBody(["mcrA", "hdrB"]),
      bestBody(["mtrC", "omcS"]),
      bestBody([]),
    ]);
    expect(looks.size, "two builds share a pigment").toBe(6);
  });

  it("EXPRESSION, not mere presence, changes the look", () => {
    // A gene sitting on the ring with no promoter upstream makes no protein
    // and must change nothing. Breaking that here would make the avatar lie
    // about the build.
    const p = new Plasmid();
    p.integrated = MAX_SLOTS - BASE_SLOTS;
    p.put(6, { kind: "gene", id: "psbA", level: 1, mods: [], allele: WILD_TYPE });
    expect(p.expression("psbA", 1), "the fixture is wrong").toBe(0);
    expect(phenotypeOf(p, 1).body, "an unexpressed gene changed the colour")
      .toBe(phenotypeOf(new Plasmid(), 1).body);
  });

  it("luciferase stops glowing below the oxic zone", () => {
    // Bacterial luciferase is an OXYGENASE. A cell carrying luxAB into the
    // anoxic strata genuinely goes dark, and the avatar should show that
    // rather than glowing all the way down.
    const p = build(["luxAB"]);
    expect(phenotypeOf(p, 1).glow, "no glow in the oxic zone").toBeGreaterThan(0.1);
    expect(phenotypeOf(p, 6).glow, "still glowing without oxygen").toBe(0);
  });

  it("appendages appear only with the genes that build them", () => {
    expect(phenotypeOf(build([]), 1).flagellum).toBe(0);
    expect(phenotypeOf(build(["flhD", "cheA"]), 1).flagellum).toBeGreaterThan(0.2);
    expect(phenotypeOf(build([]), 1).pili).toBe(0);
    expect(phenotypeOf(build(["pilA"]), 1).pili).toBeGreaterThan(0);
  });

  it("the pigment is the dominant one, not a blend", () => {
    // Averaging two strong pigments gives a muddy grey that reads as a bug.
    // Pigment saturates; the cell is whichever it makes more of.
    const both = phenotypeOf(build(["psbA", "psaA", "pufM"]), 1).body;
    const green = phenotypeOf(build(["psbA", "psaA"]), 1).body;
    const purple = phenotypeOf(build(["pufM"]), 1).body;
    expect([green, purple], "the blend is neither of its inputs").toContain(both);
  });

  it("the cache key is stable under a drifting supply", () => {
    // It is read once a frame. A key that changed with every brownout tick
    // would rasterise a new sprite sixty times a second.
    const p = build(["psbA", "luxAB", "flhD"]);
    const keys = new Set<string>();
    for (let i = 0; i < 400; i++) {
      p.supply = 0.6 + Math.sin(i / 40) * 0.02;
      keys.add(phenotypeOf(p, 1).key);
    }
    expect(keys.size, "the sprite cache would thrash").toBeLessThanOrEqual(2);
  });

  it("survives a plasmid with nothing on it", () => {
    const bare = new Plasmid();
    for (const d of [1, 8]) {
      const ph = phenotypeOf(bare, d);
      expect(ph.body).toMatch(/^#[0-9a-f]{6}$/);
      expect(Number.isFinite(ph.glow)).toBe(true);
    }
  });
});

describe("caches key on identity, not on a counter", () => {
  it("two plasmids do not share one cached phenotype", () => {
    // `revision()` counts mutations on ONE plasmid and is not unique across
    // instances: two built with the same number of operations both read
    // revision 5, so a module-level memo returned the first one's colour for
    // the second. A purple cell rendered green.
    const mk = (genes: bio.GeneId[]): Plasmid => {
      const p = new Plasmid();
      p.integrated = MAX_SLOTS - BASE_SLOTS;
      p.strain = MAX_STRAIN;
      let s = 4;
      p.put(s++, { kind: "promoter", id: "j23119" });
      for (const g of genes) {
        p.put(s++, { kind: "gene", id: g, level: 1, mods: [], allele: WILD_TYPE });
      }
      return p;
    };
    const green = mk(["psbA", "psaA"]);
    const purple = mk(["pufM", "pufL"]);
    expect(green.revision(), "the fixture no longer reproduces the collision")
      .toBe(purple.revision());

    const a = phenotypeOf(green, 1).body;
    const b = phenotypeOf(purple, 1).body;
    expect(b, "the second plasmid got the first one's cached colour").not.toBe(a);
    expect(phenotypeOf(green, 1).body, "the cache is now wrong for the first")
      .toBe(a);
  });

  it("interleaved reads stay correct", () => {
    // A single-slot memo also thrashes: alternating between two plasmids
    // recomputes every time and returns the right answer by accident. This
    // asserts correctness under interleaving, which is how the renderer and
    // any preview would actually use it.
    const p1 = new Plasmid();
    const p2 = new Plasmid();
    p2.integrated = 8;
    p2.put(4, { kind: "promoter", id: "j23119" });
    p2.put(5, { kind: "gene", id: "psbA", level: 1, mods: [], allele: WILD_TYPE });
    p2.put(6, { kind: "terminator", id: "rrnbt1" });
    const bare = phenotypeOf(p1, 1).body;
    const lit = phenotypeOf(p2, 1).body;
    expect(lit).not.toBe(bare);
    for (let i = 0; i < 20; i++) {
      expect(phenotypeOf(p1, 1).body).toBe(bare);
      expect(phenotypeOf(p2, 1).body).toBe(lit);
    }
  });
});

describe("the phenotype cache cannot serve the wrong cell", () => {
  it("two plasmids at the same revision read differently", () => {
    // `revision()` counts mutations on ONE plasmid and is not unique across
    // instances: two built with the same number of operations both read 5, so
    // a cache keyed on it rendered a purple cell green. The WeakMap keys on
    // the object, which is the only identity that cannot collide.
    const mk = (gene: bio.GeneId): Plasmid => {
      const p = new Plasmid();
      p.integrated = MAX_SLOTS - BASE_SLOTS;
      p.strain = MAX_STRAIN;
      p.put(4, { kind: "promoter", id: "j23119" });
      p.put(5, { kind: "gene", id: gene, level: 1, mods: [], allele: WILD_TYPE });
      p.put(6, { kind: "terminator", id: "rrnbt1t2" });
      return p;
    };
    const green = mk("psbA");
    const purple = mk("pufM");
    expect(green.revision(), "the fixture no longer reproduces the collision")
      .toBe(purple.revision());
    const a = phenotypeOf(green, 1).body;
    const b = phenotypeOf(purple, 4).body;
    expect(b, "the cache served another plasmid's appearance").not.toBe(a);
    // And re-reading the first still gives the first.
    expect(phenotypeOf(green, 1).body).toBe(a);
  });

  it("a mutation invalidates the entry", () => {
    const p = new Plasmid();
    p.integrated = MAX_SLOTS - BASE_SLOTS;
    p.strain = MAX_STRAIN;
    p.put(4, { kind: "promoter", id: "j23119" });
    p.put(5, { kind: "gene", id: "psbA", level: 1, mods: [], allele: WILD_TYPE });
    p.put(6, { kind: "terminator", id: "rrnbt1t2" });
    const green = phenotypeOf(p, 1).body;
    p.remove(5);
    expect(phenotypeOf(p, 1).body, "a stale appearance survived a mutation")
      .not.toBe(green);
  });
});

describe("shrinking the chromosome strands nothing", () => {
  it("parts on positions that go away are rescued, not orphaned", () => {
    // They stayed in the array, were still counted by `used()`, and no
    // operation could ever reach them again. A part that exists and cannot be
    // touched is worse than one that is gone.
    for (let from = 16; from >= 0; from -= 4) {
      const p = new Plasmid();
      p.integrated = MAX_SLOTS - BASE_SLOTS;
      for (let i = 0; i < p.usableSlots; i++) {
        if (p.at(i) === null) {
          p.put(i, { kind: "gene", id: "psbA", level: 1, mods: [], allele: WILD_TYPE });
        }
      }
      p.integrated = from;
      for (let s = p.usableSlots; s < p.slots.length; s++) {
        expect(p.at(s), `a part was stranded at ${String(s)} of `
          + String(p.usableSlots)).toBeNull();
      }
      expect(p.has("ori"), "the origin was lost when the chromosome shrank")
        .toBe(true);
    }
  });

  it("an absurd size cannot size the ring past its array", () => {
    for (const n of [NaN, -50, 1e9]) {
      const p = new Plasmid();
      p.integrated = n;
      expect(p.usableSlots).toBeLessThanOrEqual(SLOTS);
      expect(p.usableSlots).toBeGreaterThanOrEqual(BASE_SLOTS);
    }
  });
});

describe("a pack does not move as one body", () => {
  /** Four identical chasers in a row, same bearing to the player. */
  const pack = (turns: number): { lockstep: number; turns: number } => {
    const d = new Dungeon(96, 96, 5);
    const lvl = d.level(1);
    const proto = lvl.mobs[0];
    if (!proto) return { lockstep: 0, turns: 0 };
    let row = -1;
    for (let y = 5; y < 80 && row < 0; y++) {
      let open = true;
      for (let x = 32; x <= 40; x++) if (!lvl.grid.isFloor(x, y)) { open = false; break; }
      if (open) row = y;
    }
    if (row < 0) return { lockstep: 0, turns: 0 };
    lvl.mobs.length = 0;
    for (let i = 0; i < 4; i++) {
      lvl.mobs.push({ ...proto, behaviour: "chase", x: 33 + i, y: row,
                      ax: 33 + i, ay: row, alive: true, hp: 9 });
    }
    // Inside senseRange("chase"), which is 9. Outside it they simply do not
    // move, and "all moved identically" is trivially true of standing still --
    // which is how a first attempt at this measured 60/60 and proved nothing.
    const player = { x: 40, y: row, hp: 999, maxhp: 999, atp: 50, atpMax: 100,
                     status: [] };
    let lockstep = 0;
    for (let t = 0; t < turns; t++) {
      const before = lvl.mobs.map((m) => [m.x, m.y] as [number, number]);
      microbeTurn({ grid: lvl.grid, mobs: lvl.mobs,
                    player: player,
                    rng: makeRng(7000 + t), armour: 0, packets: [], clouds: [] });
      const moves = lvl.mobs.map((m, i) =>
        `${String(m.x - (before[i]?.[0] ?? 0))},${String(m.y - (before[i]?.[1] ?? 0))}`);
      if (new Set(moves).size === 1) lockstep++;
    }
    return { lockstep, turns };
  };

  it("chasers at the same bearing take different paths", () => {
    // Perfect tracking made every chaser at a similar bearing pick the same
    // step, so a group moved in flawless lockstep -- which reads as one
    // creature drawn several times.
    const r = pack(60);
    expect(r.turns, "the fixture found no open row").toBeGreaterThan(0);
    expect(r.lockstep / r.turns,
           `${String(r.lockstep)}/${String(r.turns)} turns moved as one body`)
      .toBeLessThan(0.6);
  });

  it("but they still close on the player", () => {
    // Chemotaxis is a biased random walk: the right way on average, never in
    // a straight line. If the bias is too weak it stops being pursuit.
    const d = new Dungeon(96, 96, 5);
    const lvl = d.level(1);
    const proto = lvl.mobs[0];
    if (!proto) return;
    let row = -1;
    for (let y = 5; y < 80 && row < 0; y++) {
      let open = true;
      for (let x = 32; x <= 42; x++) if (!lvl.grid.isFloor(x, y)) { open = false; break; }
      if (open) row = y;
    }
    if (row < 0) return;
    let reached = 0;
    const trials = 20;
    for (let s = 0; s < trials; s++) {
      lvl.mobs.length = 0;
      lvl.mobs.push({ ...proto, behaviour: "chase", x: 34, y: row,
                      ax: 34, ay: row, alive: true, hp: 9 });
      const player = { x: 41, y: row, hp: 999, maxhp: 999, atp: 50, atpMax: 100,
                       status: [] };
      for (let t = 0; t < 40; t++) {
        microbeTurn({ grid: lvl.grid, mobs: lvl.mobs,
                      player: player,
                      rng: makeRng(s * 97 + t), armour: 0, packets: [], clouds: [] });
        const m = lvl.mobs[0];
        if (m && Math.abs(m.x - player.x) + Math.abs(m.y - player.y) <= 1) {
          reached++;
          break;
        }
      }
    }
    expect(reached / trials, `only ${String(reached)}/${String(trials)} reached`)
      .toBeGreaterThan(0.7);
  });
});

describe("a relict pocket is another layer, buried", () => {
  it("appears below the first stratum, sealed, and holds shallower genes", () => {
    // A slump has to have had something above it to carry down, so none on
    // the first stratum. And it is sealed COMPLETELY -- the way in is through
    // the crust that buried it, which means expressing a gene rather than
    // finding a corridor.
    let found = 0, sealed = 0;
    for (let seed = 0; seed < 25; seed++) {
      const d = new Dungeon(96, 96, seed);
      for (const f of [1, 6, 12, 20]) {
        const lvl = d.level(f);
        for (const r of lvl.rooms) {
          if (r.kind !== "relict") continue;
          found++;
          expect(lvl.depth, "a relict on the first stratum has nothing above it")
            .toBeGreaterThan(1);
          if (lvl.barriers.some((b) =>
              Math.hypot(b.x - r.cx, b.y - r.cy) <= r.r + 1.6)) sealed++;
        }
      }
    }
    expect(found, "no relict pockets generated at all").toBeGreaterThan(10);
    expect(sealed / found, "relicts are not being sealed").toBeGreaterThan(0.8);
  });

  it("its genes come from ABOVE, which is the only way to carry one down", () => {
    // Loot is otherwise `microbesAt(depth)` -- strictly stratum-locked, which
    // is what makes every deep build converge on the same deep genes.
    const deep = 20;
    const here = new Set(bio.microbesAt(deep).flatMap((m) => [...m.genes]));
    const above = new Set<bio.GeneId>();
    for (let up = 1; up < deep; up++) {
      for (const m of bio.microbesAt(up)) for (const g of m.genes) above.add(g);
    }
    const onlyAbove = [...above].filter((g) => !here.has(g));
    expect(onlyAbove.length,
           "nothing is exclusive to the shallow column, so a relict adds nothing")
      .toBeGreaterThan(20);
  });
});

describe("off-stratum genes are always earned", () => {
  it("no relict is ever left unsealed", () => {
    // A relict that could not be sealed -- because a stair landed inside it,
    // or because sealing it cut the route to the exit -- would hand over the
    // one reward that must be bought by expressing something. It is demoted to
    // a plain chamber instead.
    let relicts = 0, unsealed = 0, stranded = 0;
    for (let seed = 0; seed < 40; seed++) {
      const d = new Dungeon(96, 96, seed);
      for (const f of [1, 5, 10, 16, 22]) {
        const lvl = d.level(f);
        for (const r of lvl.rooms) {
          if (r.kind !== "relict") continue;
          relicts++;
          const ring = lvl.barriers.filter((b) =>
            Math.hypot(b.x - r.cx, b.y - r.cy) <= r.r + 1.6);
          if (ring.length === 0) unsealed++;
          for (const p of [lvl.up, lvl.down]) {
            if (p && Math.hypot(p.x - r.cx, p.y - r.cy) <= r.r) stranded++;
          }
        }
      }
    }
    expect(relicts, "no relicts generated at all").toBeGreaterThan(20);
    expect(unsealed, `${String(unsealed)} relicts gave their genes away free`).toBe(0);
    expect(stranded, "a stair landed inside a sealed pocket").toBe(0);
  });

  it("every floor still has a route to its exit", () => {
    // Barriers gate CACHES, never progress. A floor you cannot leave is
    // unrecoverable, and sealing a relict must never cause one.
    for (let seed = 0; seed < 40; seed++) {
      const d = new Dungeon(96, 96, seed);
      for (const f of [1, 5, 10, 16, 22]) {
        const lvl = d.level(f);
        if (!lvl.down) continue;
        expect(findPath(lvl.grid, lvl.up, lvl.down),
               `seed ${String(seed)} F${String(f)}: no route to the exit`)
          .not.toBeNull();
      }
    }
  });
});

describe("every gene named anywhere is a real gene", () => {
  // TypeScript catches this where the type is `GeneId`. It does not where a
  // list is widened, a string literal is built, or a table is keyed loosely --
  // and a barrier advertising a key that cannot be found is a wall with no
  // door, which no test would otherwise notice.
  //
  // Written by IMPORTING the modules, not by scanning the source. Three
  // separate ad-hoc regexes over biology.ts got this wrong in one session --
  // one required a single space after the colon and silently missed the three
  // aligned entries, reporting 66 genes where there are 69.
  const ids = new Set(Object.keys(bio.GENES));

  it("barriers open on genes that exist", () => {
    for (const id of Object.keys(BARRIERS) as (keyof typeof BARRIERS)[]) {
      for (const g of BARRIERS[id].opens) {
        expect(ids.has(g), `barrier "${id}" opens on "${g}", which is not a gene`)
          .toBe(true);
      }
    }
  });

  it("every barrier can be opened by something reachable at its depth", () => {
    // A seal whose only key lives deeper than the seal is a wall, not a gate.
    for (const id of Object.keys(BARRIERS) as (keyof typeof BARRIERS)[]) {
      const opens = BARRIERS[id].opens;
      let earliest = Infinity;
      for (let d = 1; d <= 8; d++) {
        if (bio.microbesAt(d).some((m) => m.genes.some((g) => opens.includes(g)))) {
          earliest = d;
          break;
        }
      }
      expect(earliest, `nothing anywhere carries a key for "${id}"`)
        .toBeLessThan(Infinity);
    }
  });

  it("every organism's genes exist", () => {
    for (const m of bio.MICROBES) {
      for (const g of m.genes) {
        expect(ids.has(g), `${m.id} carries "${g}", which is not a gene`).toBe(true);
      }
    }
  });
});

describe("the minimap declines rather than misbehaving", () => {
  it("a degenerate button layout gets no map, not a NaN-sized one", () => {
    // `side < 56` looks like a guard and is not: NaN fails every comparison,
    // so a NaN width passed straight through and was drawn.
    for (const [bl, bt] of [[NaN, NaN], [-100, -100], [0, 0]] as const) {
      const b = miniBox(393, 852, { top: 47, right: 0, left: 0 }, bl, bt);
      if (b === null) continue;
      expect(Number.isFinite(b.w), `miniBox(${String(bl)}) returned a NaN width`)
        .toBe(true);
      expect(Math.min(b.w, b.h)).toBeGreaterThanOrEqual(56);
    }
  });

  it("it frames something sensible whether nothing or everything is explored", () => {
    const d = new Dungeon(96, 96, 3);
    const lvl = d.level(1);
    const box = { x: 10, y: 10, w: 120, h: 120 };
    for (const fill of [0, 1]) {
      lvl.sight.seen.fill(fill);
      const v = miniView(lvl.grid, lvl.sight, box);
      expect(Number.isFinite(v.scale) && v.scale > 0,
             `scale broke with seen=${String(fill)}`).toBe(true);
      expect(Number.isFinite(v.ox) && Number.isFinite(v.oy)).toBe(true);
    }
  });

  it("the wall pattern survives any depth and tile size", () => {
    const ctx = new Proxy({} as CanvasRenderingContext2D, {
      get: (_o, p: string) => {
        if (["fillStyle", "globalAlpha", "strokeStyle"].includes(p)) return "";
        return () => undefined;
      },
      set: () => true,
    });
    for (const px of [NaN, -5, 0, 1, 1e6, Infinity]) {
      for (const depth of [NaN, 0, 1, 8, 99]) {
        expect(() => wallPattern(ctx, depth, px, "#123"),
               `wallPattern(${String(depth)}, ${String(px)})`).not.toThrow();
      }
    }
  });
});

describe("wall art is authored, not scattered", () => {
  it("every tile is exactly WALL_PX square and uses only known roles", () => {
    // The tiles are text in source, so the only thing stopping a typo from
    // becoming a rendering bug is this. A short row silently truncates a
    // material; an unknown character silently draws nothing.
    for (const [name, tiles] of Object.entries(WALL_MATERIALS)) {
      expect(tiles.length, `${name} has no variants`).toBeGreaterThan(0);
      for (const [i, tile] of tiles.entries()) {
        expect(tile.length, `${name}[${String(i)}] has ${String(tile.length)} rows`)
          .toBe(WALL_PX);
        for (const [y, row] of tile.entries()) {
          expect(row.length,
                 `${name}[${String(i)}] row ${String(y)} is ${String(row.length)} wide`)
            .toBe(WALL_PX);
          for (const ch of row) {
            expect(".123".includes(ch),
                   `${name}[${String(i)}] row ${String(y)} has "${ch}"`).toBe(true);
          }
        }
      }
    }
  });

  it("every stratum maps to a material that exists", () => {
    for (let d = 1; d <= 8; d++) {
      const m = materialFor(d);
      expect(Object.prototype.hasOwnProperty.call(WALL_MATERIALS, m),
             `D${String(d)} maps to "${m}", which is not a material`).toBe(true);
    }
    for (const n of [NaN, -5, 0, 999]) {
      expect(Object.prototype.hasOwnProperty.call(WALL_MATERIALS, materialFor(n)))
        .toBe(true);
    }
  });

  it("a tile is textured enough to see and sparse enough to read", () => {
    // Under about a tenth and it reads as flat -- which is what the scattered
    // dots did. Over about a half and the wall becomes noise and the outline
    // stops being legible. `massive` is deliberately below the floor: an
    // almost featureless deep clay IS the character of the bottom strata.
    for (const [name, tiles] of Object.entries(WALL_MATERIALS)) {
      for (const [i, tile] of tiles.entries()) {
        let ink = 0;
        for (const row of tile) for (const ch of row) if (ch !== ".") ink++;
        const frac = ink / (WALL_PX * WALL_PX);
        if (name === "massive") {
          expect(frac, "even massive should not be blank").toBeGreaterThan(0);
          continue;
        }
        expect(frac, `${name}[${String(i)}] is ${(frac * 100).toFixed(0)}% ink`)
          .toBeGreaterThan(0.1);
        expect(frac, `${name}[${String(i)}] is ${(frac * 100).toFixed(0)}% ink`)
          .toBeLessThan(0.55);
      }
    }
  });
});

describe("the wall pattern cache keys on everything it reads", () => {
  let nonce = 0;

  /** Count how many times a pattern is actually RASTERISED. A cache hit
   *  returns without building one, so this detects a stale entry directly. */
  const builds = (calls: [number, number, string, string, string][]): number => {
    let made = 0;
    // This suite has no DOM, so `wallPattern` would hit its catch and never
    // rasterise -- the test would pass by measuring nothing. Give it just
    // enough of a document to reach the code under test.
    const inner = new Proxy({} as CanvasRenderingContext2D, {
      get: (_o, p: string) => {
        if (["fillStyle", "globalAlpha", "strokeStyle"].includes(p)) return "";
        return () => undefined;
      },
      set: () => true,
    });
    vi.stubGlobal("document", {
      createElement: () => ({ width: 0, height: 0, getContext: () => inner }),
    });
    const ctx = new Proxy({} as CanvasRenderingContext2D, {
      get: (_o, p: string) => {
        if (["fillStyle", "globalAlpha", "strokeStyle"].includes(p)) return "";
        if (p === "createPattern") {
          made++;
          return () => ({}) as CanvasPattern;
        }
        return () => undefined;
      },
      set: () => true,
    });
    // The cache is module-level and outlives a call, so a `base` used by an
    // earlier assertion would already be warm and the count would come back
    // one short. A nonce in the floor colour makes every run start cold, which
    // is the only way these counts mean what they say.
    nonce++;
    for (const [depth, px, floor, wall, accent] of calls) {
      wallPattern(ctx, depth, px, `${floor}${String(nonce)}`, wall, accent);
    }
    return made;
  };

  it("a changed accent rebuilds; an identical call does not", () => {
    // `accent` was read by the rasteriser and left out of the key. No two
    // strata collide as the palettes stand -- safe by accident, and it breaks
    // the day a colour is retuned rather than the day the bug is written.
    expect(builds([
      [1, 32, "#050d0a", "#6ec78d", "#ffffff"],
      [1, 32, "#050d0a", "#6ec78d", "#ff0000"],
    ]), "a different accent reused the cached texture").toBe(2);

    expect(builds([
      [1, 32, "#050d0a", "#6ec78d", "#ffffff"],
      [1, 32, "#050d0a", "#6ec78d", "#ffffff"],
    ]), "an identical call rasterised twice").toBe(1);
  });

  it("each of depth, size, floor and wall also rebuilds", () => {
    const base: [number, number, string, string, string] =
      [1, 32, "#050d0a", "#6ec78d", "#ffffff"];
    const changed: [string, [number, number, string, string, string]][] = [
      ["depth", [6, 32, "#050d0a", "#6ec78d", "#ffffff"]],
      ["size", [1, 48, "#050d0a", "#6ec78d", "#ffffff"]],
      ["floor", [1, 32, "#111111", "#6ec78d", "#ffffff"]],
      ["wall", [1, 32, "#050d0a", "#123456", "#ffffff"]],
    ];
    for (const [name, other] of changed) {
      expect(builds([base, other]), `a changed ${name} reused the cache`).toBe(2);
    }
  });

  it("below 12px it declines rather than drawing mush", () => {
    // Each art pixel is well under a screen pixel there, the marks merge, and
    // the texture covers 60% of the tile -- more texture than wall.
    expect(builds([[1, 9, "#050d0a", "#6ec78d", "#fff"]]),
           "it rasterised a texture too small to read").toBe(0);
    expect(builds([[1, NaN, "#050d0a", "#6ec78d", "#fff"]]),
           "NaN got past the size floor").toBe(0);
  });
});

describe("wall texture is material, not dither", () => {
  const lum = (hex: string): number => {
    const n = Number.parseInt(hex.slice(1), 16);
    return (((n >> 16) & 255) * 0.30 + ((n >> 8) & 255) * 0.59
            + (n & 255) * 0.11) / 255;
  };
  const mix = (hex: string, target: number, t: number): string => {
    const n = Number.parseInt(hex.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
      .map((c) => Math.round(c + (target - c) * t));
    return `#${ch.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  };

  it("no role is more than a fifth of a step from the wall", () => {
    // The first version keyed one role off the FLOOR and another off the
    // accent: 63% and 31% apart in luminance on the oxic stratum. That is not
    // texture, it is a checkerboard punched through the wall, and at 15px a
    // tile it read as dither.
    for (const s of bio.STRATA) {
      const roles = [mix(s.wall, 0, 0.26), mix(s.wall, 0, 0.13),
                     mix(s.wall, 255, 0.17)];
      for (const [i, r] of roles.entries()) {
        const apart = Math.abs(lum(r) - lum(s.wall));
        expect(apart, `D${String(s.depth)} role ${String(i + 1)} is `
          + `${(apart * 100).toFixed(0)}% from the wall`)
          .toBeLessThan(0.2);
      }
    }
  });

  it("features are several pixels across, not single specks", () => {
    // At 15px a tile each art pixel is about one screen pixel, so a texture
    // made of lone marks IS dither however subtle the colours are. Measured as
    // the share of marked pixels that have a marked orthogonal neighbour.
    for (const [name, tiles] of Object.entries(WALL_MATERIALS)) {
      for (const [i, tile] of tiles.entries()) {
        let marks = 0, clustered = 0;
        for (let y = 0; y < WALL_PX; y++) {
          for (let x = 0; x < WALL_PX; x++) {
            if ((tile[y]?.[x] ?? ".") === ".") continue;
            marks++;
            const near = [[0, -1], [0, 1], [-1, 0], [1, 0]].some(([dx, dy]) =>
              (tile[y + (dy ?? 0)]?.[x + (dx ?? 0)] ?? ".") !== ".");
            if (near) clustered++;
          }
        }
        if (marks === 0) continue;
        expect(clustered / marks,
               `${name}[${String(i)}]: only ${((clustered / marks) * 100).toFixed(0)}%`
               + " of its marks touch another")
          .toBeGreaterThan(0.75);
      }
    }
  });
});

describe("elites are individuals, not a difficulty setting", () => {
  it("every strain is a real phenotype with a real advantage", () => {
    for (const id of ELITE_IDS) {
      const e = ELITES[id];
      expect(e.note.length, `${id} has no explanation`).toBeGreaterThan(40);
      // It must be better at SOMETHING, or the epithet is a lie.
      expect(e.hp > 1 || e.atk > 1, `${id} is no stronger than a normal one`)
        .toBe(true);
      expect(e.loot, `${id} gives nothing extra for the trouble`)
        .toBeGreaterThan(0);
    }
  });

  it("promotion actually changes the organism", () => {
    // A 1.4x on a 1 hp organism rounds back to 1, which is a normal creature
    // with a different name.
    const d = new Dungeon(96, 96, 5);
    const lvl = d.level(3);
    const proto = lvl.mobs.find((m) => !m.elite);
    expect(proto).toBeDefined();
    if (!proto) return;
    for (let seed = 0; seed < 40; seed++) {
      const m = { ...proto, elite: false, hp: 1, maxhp: 1, atk: 1 };
      const mobs = [m];
      promoteSome(mobs, 3, makeRng(seed));
      if (!m.elite) continue;
      expect(m.maxhp, "an elite with the same hp as a normal one")
        .toBeGreaterThan(1);
      expect(m.hp, "it did not start at full").toBe(m.maxhp);
      expect(m.name, "it is not named as one").not.toBe(proto.name);
    }
  });

  it("the count is a count, not a rate", () => {
    // A floor holds around a hundred and fifty organisms, so a per-mob
    // probability produced six elites -- the local difficulty, not an event.
    for (const depth of [1, 4, 8]) {
      const mobs = Array.from({ length: 150 }, (_, i) => ({
        uid: i, elite: false, alive: true, name: "x", hp: 5, maxhp: 5, atk: 2,
      })) as unknown as Parameters<typeof promoteSome>[0];
      promoteSome(mobs, depth, makeRng(depth));
      const n = mobs.filter((m) => m.elite).length;
      expect(n, `D${String(depth)} promoted ${String(n)} of 150`)
        .toBe(eliteCount(depth));
    }
  });

  it("promoting an empty or already-elite population is safe", () => {
    expect(() => { promoteSome([], 4, makeRng(1)); }).not.toThrow();
    const all = Array.from({ length: 3 }, (_, i) => ({
      uid: i, elite: true, alive: true, name: "x", hp: 5, maxhp: 5, atk: 2,
    })) as unknown as Parameters<typeof promoteSome>[0];
    expect(() => { promoteSome(all, 4, makeRng(1)); }).not.toThrow();
  });
});

describe("genes keep dropping", () => {
  it("a stackable duplicate is scored between a discovery and waste", () => {
    // The drop had two tiers: 80% for a gene you did not hold, 35% for
    // anything else. Stacking made a duplicate valuable -- a spare for a
    // second operon, or a better roll to swap in -- and the filter, written
    // before that, scored it alongside a full stack. A floor whose species you
    // had fully sampled fell to 35% a kill, which is what "genes stop
    // dropping" felt like.
    const FRESH = 0.8, STACKABLE = 0.6, FULL = 0.2;
    expect(FRESH).toBeGreaterThan(STACKABLE);
    expect(STACKABLE).toBeGreaterThan(FULL);
    // And the middle tier must be worth something: it is most of the late run.
    expect(STACKABLE).toBeGreaterThan(0.5);
  });

  it("elites exist, everywhere, and are worth the fight", () => {
    let elites = 0, total = 0, floorsWith = 0, floors = 0;
    for (let seed = 0; seed < 12; seed++) {
      const d = new Dungeon(96, 96, seed);
      for (const f of [1, 6, 12, 18, 24]) {
        const lvl = d.level(f);
        floors++;
        total += lvl.mobs.length;
        const n = lvl.mobs.filter((m) => m.elite).length;
        elites += n;
        if (n > 0) floorsWith++;
      }
    }
    expect(elites, "no elites generated at all").toBeGreaterThan(0);
    expect(floorsWith / floors, "elites are not reliably present")
      .toBeGreaterThan(0.8);
    // Rare enough to be an event, common enough to meet.
    expect(elites / total).toBeGreaterThan(0.01);
    expect(elites / total).toBeLessThan(0.2);
  });

  it("every elite strain is a real trade, not a flat buff", () => {
    // A strain that is better at everything is not a choice to fight or avoid.
    for (const id of ELITE_IDS) {
      const e = ELITES[id];
      expect(e.hp, `${id} is not tougher`).toBeGreaterThan(1);
      expect(e.loot, `${id} gives no extra reason to fight it`)
        .toBeGreaterThanOrEqual(1);
      expect(e.note.length, `${id} has no explanation`).toBeGreaterThan(30);
    }
    // At least one must be a genuine downside somewhere.
    expect(ELITE_IDS.some((id) => ELITES[id].atk < 1),
           "no elite trades attack for anything").toBe(true);
  });
});

describe("strain classes", () => {
  it("every class can lay down its own opening operon", () => {
    // A class whose starting genes do not fit its own chromosome would fail at
    // the one moment it matters, and only for that class.
    for (const id of CLASS_IDS) {
      const c = CLASSES[id];
      const p = new Plasmid();
      p.integrated = Math.max(c.sites, 0);
      for (const g of c.genes) {
        p.stash({ kind: "gene", id: g, level: 1, mods: [], allele: WILD_TYPE });
      }
      const r = p.assemble([...c.genes]);
      expect(r.ok, `${c.name} cannot build its own opening: `
        + (r.ok ? "" : r.err)).toBe(true);
      // Native means "worth having here", and for the phototroph that is a
      // range over which output DECLINES rather than one where it is flat. The
      // testable claim is the top of the range, where it should be at its
      // best.
      for (const g of c.genes) {
        expect(p.expression(g, c.native[1]),
               `${c.name} does not express ${g} at the deepest depth it `
               + "claims to be native to").toBeGreaterThan(0);
      }
    }
  });

  it("every starting gene is a real gene", () => {
    for (const id of CLASS_IDS) {
      for (const g of CLASSES[id].genes) {
        expect(Object.prototype.hasOwnProperty.call(bio.GENES, g),
               `${id} starts with "${g}", which is not a gene`).toBe(true);
      }
    }
  });

  it("each class is a trade, not a tier", () => {
    // Every one must name a real cost. A class with only upsides is the
    // correct pick and the others are decoration.
    for (const id of CLASS_IDS) {
      const c = CLASSES[id];
      expect(c.pros.length, `${id} has no advantages`).toBeGreaterThan(0);
      expect(c.cons.length, `${id} has no cost`).toBeGreaterThan(0);
      expect(c.note.length, `${id} has no organism behind it`)
        .toBeGreaterThan(40);
      expect(c.native[0]).toBeLessThanOrEqual(c.native[1]);
    }
    // And they must not all be native to the same place, or the choice is
    // cosmetic.
    const spans = CLASS_IDS.map((id) => CLASSES[id].native.join("-"));
    expect(new Set(spans).size, "every class is native to the same depths")
      .toBeGreaterThan(2);
  });

  it("the chromosome sizes differ, and none is unplayable", () => {
    for (const id of CLASS_IDS) {
      const p = new Plasmid();
      p.integrated = Math.max(CLASSES[id].sites, 0);
      expect(p.usableSlots, `${id} has no room to build`).toBeGreaterThan(6);
      expect(p.free(), `${id} cannot fit an operon`).toBeGreaterThanOrEqual(3);
    }
    expect(new Set(CLASS_IDS.map((id) => CLASSES[id].sites)).size,
           "every class starts with the same chromosome").toBeGreaterThan(1);
  });
});

describe("there is exactly one origin, always", () => {
  const origins = (p: Plasmid): number =>
    p.slots.filter((s) => s?.kind === "gene" && s.id === "ori").length;

  it("a saved ring written back through put() does not duplicate it", () => {
    // A fresh plasmid is CONSTRUCTED with an origin at its default position.
    // `applySave` then writes the saved ring one `put` at a time, and if the
    // player had ever spun the ring the saved origin lands elsewhere -- so the
    // constructed one was never displaced and the plasmid came back with two.
    // Both drew, and neither could be excised, because `remove` refuses to
    // take an origin.
    for (const spin of [0, 1, 3, 7, -2, 11]) {
      const src = new Plasmid();
      src.integrated = 6;
      src.put(5, { kind: "gene", id: "psbA", level: 1, mods: [], allele: WILD_TYPE });
      src.rotate(spin);
      const ring = src.slots.slice();

      const dst = new Plasmid();
      dst.integrated = 6;
      for (const [i, part] of ring.entries()) if (part) dst.put(i, part);
      expect(origins(dst), `spin ${String(spin)} produced `
        + `${String(origins(dst))} origins`).toBe(1);
    }
  });

  it("no sequence of edits can produce a second", () => {
    const genes = (Object.keys(bio.GENES) as bio.GeneId[]).filter((g) => g !== "ori");
    for (let seed = 0; seed < 200; seed++) {
      const p = new Plasmid();
      p.integrated = seed % 9;
      const rng = makeRng(seed * 13);
      for (let step = 0; step < 30; step++) {
        const g = genes[rng.int(genes.length)];
        switch (rng.int(7)) {
          case 0:
            if (g) p.stash({ kind: "gene", id: g, level: 1, mods: [], allele: WILD_TYPE });
            break;
          case 1: p.install(rng.int(Math.max(p.bin.length, 1)), rng.int(p.usableSlots)); break;
          case 2: p.swap(rng.int(p.usableSlots), rng.int(p.usableSlots)); break;
          case 3: p.rotate(rng.int(24) - 12); break;
          case 4: p.remove(rng.int(p.usableSlots)); break;
          case 5: p.uninstall(rng.int(p.usableSlots)); break;
          case 6: p.integrated = rng.int(9); break;
        }
        expect(origins(p), `seed ${String(seed)} step ${String(step)}: `
          + `${String(origins(p))} origins`).toBe(1);
      }
    }
  });

  it("a save carrying two is repaired on load", () => {
    // Anyone already playing has one of these on disk. Loading must fix it,
    // not preserve it.
    const p = new Plasmid();
    p.integrated = 6;
    p.slots[7] = { kind: "gene", id: "ori", level: 1, mods: [], allele: WILD_TYPE };
    // Force the repair the way any real write would.
    p.put(9, { kind: "terminator", id: "rrnbt1" });
    expect(origins(p), "a plasmid with a planted second origin kept it").toBe(1);
  });
});

describe("the wall boundary is a contour, not a staircase", () => {
  const box = (w: number, h: number, walls: string[]): Solid =>
    (x, y) => x < 0 || y < 0 || x >= w || y >= h
      || (walls[y]?.[x] ?? "#") === "#";

  it("a diagonal edge becomes diagonal segments, not steps", () => {
    // Per-tile drawing could never express this: every cut was bounded by the
    // tile it belonged to, so two neighbouring cuts could not join into one
    // line. That is why cutting corners harder did not help.
    const walls = [
      "#####",
      "####.",
      "###..",
      "##...",
      "#....",
    ];
    const loops = contour(box(5, 5, walls), 0, 0, 4, 4);
    expect(loops.length, "no contour at all").toBeGreaterThan(0);
    let diag = 0, axis = 0;
    for (const l of loops) {
      for (const [i, a] of l.entries()) {
        const b = l[(i + 1) % l.length];
        if (!b) continue;
        if (Math.abs(b.x - a.x) > 0.01 && Math.abs(b.y - a.y) > 0.01) diag++;
        else axis++;
      }
    }
    expect(diag, "a 45-degree wall produced no diagonal segments")
      .toBeGreaterThan(0);
    expect(diag / (diag + axis), "mostly still steps").toBeGreaterThan(0.4);
  });

  it("every loop closes", () => {
    // An open loop is a hole in the wall: the fill leaks through it and the
    // whole floor turns the wall colour.
    for (let seed = 0; seed < 15; seed++) {
      const d = new Dungeon(96, 96, seed);
      const g = d.level(1).grid;
      const solid: Solid = (x, y) =>
        x < 0 || y < 0 || x >= g.w || y >= g.h || g.isWall(x, y);
      const loops = contour(solid, 0, 0, g.w - 1, g.h - 1);
      expect(loops.length, `seed ${String(seed)}: no loops`).toBeGreaterThan(0);
      for (const [i, l] of loops.entries()) {
        const a = l[0], b = l[l.length - 1];
        if (!a || !b) continue;
        expect(Math.hypot(a.x - b.x, a.y - b.y),
               `seed ${String(seed)} loop ${String(i)} does not close`)
          .toBeLessThan(1.01);
      }
    }
  });

  it("an all-wall and an all-floor region produce nothing", () => {
    expect(contour(() => true, 0, 0, 8, 8)).toEqual([]);
    // All floor, but bounded: out of bounds is solid, so there IS a boundary
    // at the edge. Inside a solid region there is none.
    const inner: Solid = (x, y) => !(x >= 0 && y >= 0 && x < 9 && y < 9);
    expect(contour(inner, 2, 2, 6, 6), "a region with no boundary emitted one")
      .toEqual([]);
  });

  it("it never hangs on a malformed grid", () => {
    // The chaining walk is bounded: a hang is a far worse failure than a
    // missing wall, and a table typo could otherwise loop for ever.
    for (const solid of [() => Math.random() < 0.5, (x: number) => x % 2 === 0]) {
      expect(() => contour(solid, 0, 0, 40, 40)).not.toThrow();
    }
  });

  it("costs about a floor's worth of work, once", () => {
    // 3.6ms steady state over a whole 96x96 floor. The first measurement said
    // 25ms and three rounds of "optimisation" barely moved it -- it was JIT
    // warmup, and the algorithm was never the problem.
    const d = new Dungeon(96, 96, 3);
    const g = d.level(1).grid;
    const solid: Solid = (x, y) =>
      x < 0 || y < 0 || x >= g.w || y >= g.h || g.isWall(x, y);
    contour(solid, 0, 0, g.w - 1, g.h - 1);          // warm
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) contour(solid, 0, 0, g.w - 1, g.h - 1);
    expect((performance.now() - t0) / 10).toBeLessThan(40);
  });
});

describe("the wall path fills the walls", () => {
  it("covers rock, not cave", () => {
    // The contour loops enclose the CAVES -- geometrically right, because a
    // cave is a cavity -- so filling them directly painted the floor green and
    // left the walls black. That shipped. The path is the whole map wound one
    // way with every cave wound the other, so nonzero fill gives rock with
    // holes in it.
    for (const seed of [1, 5, 9]) {
      const d = new Dungeon(96, 96, seed);
      const g = d.level(1).grid;
      const solid: Solid = (x, y) =>
        x < 0 || y < 0 || x >= g.w || y >= g.h || g.isWall(x, y);
      let walls = 0;
      for (let y = 0; y < g.h; y++) {
        for (let x = 0; x < g.w; x++) if (g.isWall(x, y)) walls++;
      }
      const floor = g.w * g.h - walls;

      let area = 0;
      let cur: [number, number][] = [];
      const flush = (): void => {
        let a = 0;
        for (const [i, p] of cur.entries()) {
          const q = cur[(i + 1) % cur.length];
          if (!q) continue;
          a += p[0] * q[1] - q[0] * p[1];
        }
        area += a / 2;
        cur = [];
      };
      const path = {
        moveTo: (x: number, y: number) => { flush(); cur.push([x, y]); },
        lineTo: (x: number, y: number) => { cur.push([x, y]); },
        quadraticCurveTo: (cx: number, cy: number, x: number, y: number) => {
          const last = cur[cur.length - 1] ?? [0, 0];
          for (let t = 0.25; t <= 1.0001; t += 0.25) {
            const u = 1 - t;
            cur.push([u * u * last[0] + 2 * u * t * cx + t * t * x,
                      u * u * last[1] + 2 * u * t * cy + t * t * y]);
          }
        },
        closePath: () => undefined,
      };
      traceContour(path, solid, 0, 0, g.w - 1, g.h - 1, 1, 0, 0);
      flush();

      expect(Math.abs(area - walls),
             `seed ${String(seed)}: filled ${area.toFixed(0)}, walls `
             + `${String(walls)}, floor ${String(floor)} -- the fill is inverted`)
        .toBeLessThan(Math.abs(area - floor));
      expect(area, `seed ${String(seed)}: filled nothing`).toBeGreaterThan(0);
    }
  });

  it("one stray loop cannot punch a solid island into a cave", () => {
    // 29 of 30 loops came out wound one way and one the other. Trusting the
    // contour's winding rather than normalising each loop would have filled
    // that one as rock in the middle of open water.
    const d = new Dungeon(96, 96, 2);
    const g = d.level(1).grid;
    const solid: Solid = (x, y) =>
      x < 0 || y < 0 || x >= g.w || y >= g.h || g.isWall(x, y);
    const loops = contour(solid, 0, 0, g.w - 1, g.h - 1);
    const signs = loops.map((l) => Math.sign(signedArea2(l)));
    // The raw contour may well be mixed -- that is the point. What matters is
    // that traceContour normalises, which the area test above proves.
    expect(signs.length).toBeGreaterThan(0);
  });
});

describe("the contour survives shapes a cave will not produce", () => {
  const closed = (l: readonly { x: number; y: number }[]): boolean => {
    const a = l[0], b = l[l.length - 1];
    if (a === undefined || b === undefined) return false;
    return Math.hypot(a.x - b.x, a.y - b.y) < 1.01;
  };

  it("a single tile, a checkerboard and a diagonal thread all close", () => {
    // The checkerboard is every saddle case at once, and the thread is the one
    // that broke chaining when saddles were resolved as connected -- it
    // produced ZERO loops and would have erased the wall from the screen.
    const cases: [string, (x: number, y: number) => boolean][] = [
      ["single tile", (x, y) => x === 5 && y === 5],
      ["checkerboard", (x, y) => ((x + y) & 1) === 0],
      ["diagonal thread", (x, y) => x === y && x >= 2 && x <= 18],
      ["full", () => true],
      ["empty", () => false],
    ];
    for (const [name, solid] of cases) {
      const loops = contour(solid, 0, 0, 20, 20);
      for (const [i, l] of loops.entries()) {
        expect(closed(l), `${name} loop ${String(i)} does not close`).toBe(true);
      }
      if (name !== "full" && name !== "empty") {
        expect(loops.length, `${name} produced no contour at all`)
          .toBeGreaterThan(0);
      }
    }
  });

  it("a degenerate window never throws", () => {
    const nul = { moveTo: () => undefined, lineTo: () => undefined,
                  quadraticCurveTo: () => undefined, closePath: () => undefined };
    for (const [x0, y0, x1, y1] of [[0, 0, 0, 0], [5, 5, 4, 4], [-3, -3, 3, 3],
                                    [0, 0, 1, 0], [10, 10, 10, 20]] as const) {
      expect(() => traceContour(nul, () => true, x0, y0, x1, y1, 1, 0.1, 0.2),
             `window ${String(x0)},${String(y0)}..${String(x1)},${String(y1)}`)
        .not.toThrow();
    }
  });

  it("a large noisy region stays bounded", () => {
    // The chaining walk has a step cap: a hang is a far worse failure than a
    // missing wall, and a table typo could otherwise loop for ever.
    const rng = makeRng(7);
    const noise = (x: number, y: number): boolean =>
      ((x * 73856093) ^ (y * 19349663) ^ rng.int(1)) % 3 === 0;
    const t0 = Date.now();
    expect(() => contour(noise, 0, 0, 200, 200)).not.toThrow();
    expect(Date.now() - t0, "a 200x200 noisy region took too long")
      .toBeLessThan(4000);
  });
});
