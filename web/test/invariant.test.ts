import { WILD_TYPE } from "../src/allele.js";
import { describe, expect, it } from "vitest";
import * as bio from "../src/biology.js";
import { Dungeon, MAX_FLOOR } from "../src/dungeon.js";
import { Plasmid } from "../src/plasmid.js";
import { makeRng } from "../src/rng.js";
import { microbeTurn } from "../src/combat.js";
import { INVARIANTS, INVARIANT_COUNT, check, type WorldView }
  from "../src/invariants.js";
import type { Status } from "../src/status.js";
import type { Packet, Cloud } from "../src/projectile.js";
import { newRun } from "../src/run.js";
import { SIZES } from "../src/behaviour.js";
import { tilesOf } from "../src/footprint.js";
import { BARRIERS, blockedBy, degrade } from "../src/barrier.js";

// The invariants are the thing that must never be false. These tests do two
// jobs: prove each one CAN fail (an invariant that cannot fail is decoration),
// and prove none of them fails during real play.

const world = (over: Partial<WorldView> = {}): WorldView => {
  const d = new Dungeon(96, 96, 5);
  const level = d.level(1);
  return {
    plasmid: new Plasmid(),
    level,
    player: { x: level.up.x, y: level.up.y, hp: 20, maxhp: 20, atp: 50, atpMax: 100 },
    drops: [], packets: [], clouds: [], barriers: level.barriers,
    run: newRun(), floor: 1, dead: false,
    ...over,
  };
};

describe("sacred invariants", () => {
  it("a sound world violates nothing", () => {
    const v = check(world());
    expect(v.map((x) => `${x.name}: ${x.detail}`)).toEqual([]);
  });

  it("there are a meaningful number of them, and each is named", () => {
    expect(INVARIANT_COUNT).toBeGreaterThan(15);
    for (const name of Object.keys(INVARIANTS)) {
      expect(name.length, "an invariant must say what it protects")
        .toBeGreaterThan(10);
    }
  });

  // --- and none of them fires during real play ----------------------------
  it("holds through a long turn sequence on every stratum", () => {
    for (const seed of [3, 29]) {
      const d = new Dungeon(96, 96, seed);
      for (let f = 1; f <= MAX_FLOOR; f += 6) {
        const level = d.level(f);
        const p = new Plasmid();
        const player = {
          x: level.up.x, y: level.up.y, hp: 999, maxhp: 999, atp: 100, atpMax: 100,
        };
        const packets: Packet[] = [];
        const clouds: Cloud[] = [];
        for (let t = 0; t < 120; t++) {
          microbeTurn({
            grid: level.grid, mobs: level.mobs,
            player: { ...player, status: [] as Status[] },
            rng: makeRng(t + f), armour: 1, packets, clouds,
          });
          const v = check({
            plasmid: p, level, player, drops: [], packets, clouds,
            barriers: level.barriers, run: newRun(), floor: f, dead: false,
          });
          expect(v.map((x) => `${x.name}: ${x.detail}`),
                 `seed ${String(seed)} floor ${String(f)} turn ${String(t)}`).toEqual([]);
        }
      }
    }
  });

  it("holds for a freshly generated floor at every depth", () => {
    for (let f = 1; f <= MAX_FLOOR; f++) {
      const d = new Dungeon(96, 96, 11);
      const level = d.level(f);
      const v = check({
        plasmid: new Plasmid(), level,
        player: { x: level.up.x, y: level.up.y, hp: 20, maxhp: 20, atp: 1, atpMax: 100 },
        drops: [], packets: [], clouds: [], barriers: level.barriers,
        run: newRun(), floor: f, dead: false,
      });
      expect(v.map((x) => x.name), `floor ${String(f)}`).toEqual([]);
    }
  });

  it("checking is cheap enough to run every turn", () => {
    const w = world();
    const t0 = performance.now();
    for (let i = 0; i < 300; i++) check(w);
    const per = (performance.now() - t0) / 300;
    expect(per, `${(per * 1000).toFixed(0)} us per audit`).toBeLessThan(4);
  });
});

describe("every failing mutation is atomic", () => {
  // A partial mutation is worse than a refusal: the part is gone and nothing
  // said so. Every Result-returning mutator is forced down its failure path
  // and the whole plasmid is compared before and after.
  const snap = (p: Plasmid): string =>
    JSON.stringify({ slots: p.slots, bin: p.bin, supply: p.supply });

  const cases: [string, () => Plasmid, (p: Plasmid) => { ok: boolean }][] = [
    ["stash a duplicate", () => {
      const p = new Plasmid();
      p.stash({ kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE });
      return p;
    }, (p) => p.stash({ kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE })],

    ["stash into a full bin", () => {
      const p = new Plasmid();
      while (p.stash({ kind: "terminator", id: "rrnbt1" }).ok) { /* fill */ }
      return p;
    }, (p) => p.stash({ kind: "gene", id: "psbA", level: 1, mods: [], allele: WILD_TYPE })],

    ["add to a full ring", () => {
      const p = new Plasmid();
      // Only the USABLE positions: filling past the replicon's last slot puts
      // parts where the plasmid cannot reach them, which is itself a violation.
      for (let i = 0; i < p.usableSlots; i++) p.put(i, { kind: "terminator", id: "rrnbt1" });
      return p;
    }, (p) => p.add({ kind: "gene", id: "psbA", level: 1, mods: [], allele: WILD_TYPE })],

    ["install onto the origin", () => {
      const p = new Plasmid();
      p.stash({ kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE });
      return p;
    }, (p) => p.install(p.bin.findIndex((x) => x.kind === "gene"),
                        p.slots.findIndex((s) => s?.kind === "gene" && s.id === "ori"))],

    ["install a nonexistent bin index", () => new Plasmid(), (p) => p.install(99, 5)],

    ["uninstall the origin", () => new Plasmid(),
     (p) => p.uninstall(p.slots.findIndex((s) => s?.kind === "gene" && s.id === "ori"))],

    ["uninstall an empty slot", () => new Plasmid(), (p) => p.uninstall(9)],

    ["uninstall into a full bin", () => {
      const p = new Plasmid();
      p.put(9, { kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE });
      while (p.stash({ kind: "terminator", id: "rrnbt1" }).ok) { /* fill */ }
      return p;
    }, (p) => p.uninstall(9)],

    ["remove the origin", () => new Plasmid(),
     (p) => p.remove(p.slots.findIndex((s) => s?.kind === "gene" && s.id === "ori"))],

    ["optimise a gene not carried", () => new Plasmid(), (p) => p.optimise("mtrC")],

    ["assemble without the genes", () => new Plasmid(),
     (p) => p.assemble(["sat", "aprA", "dsrA"])],

    ["assemble with no spare promoter", () => {
      const p = new Plasmid();
      for (const g of ["sat", "aprA", "dsrA"] as bio.GeneId[]) {
        p.stash({ kind: "gene", id: g, level: 1, mods: [], allele: WILD_TYPE });
      }
      while (p.bin.some((x) => x.kind === "promoter")) {
        p.bin.splice(p.bin.findIndex((x) => x.kind === "promoter"), 1);
      }
      return p;
    }, (p) => p.assemble(["sat", "aprA", "dsrA"])],

    ["assemble with no contiguous room", () => {
      const p = new Plasmid();
      for (const g of ["sat", "aprA", "dsrA"] as bio.GeneId[]) {
        p.stash({ kind: "gene", id: g, level: 1, mods: [], allele: WILD_TYPE });
      }
      for (let i = 0; i < p.usableSlots; i++) {
        if (p.at(i) === null) p.put(i, { kind: "terminator", id: "rrnbt1" });
      }
      return p;
    }, (p) => p.assemble(["sat", "aprA", "dsrA"])],
  ];

  it("a refused mutation changes nothing at all", () => {
    for (const [label, build, act] of cases) {
      const p = build();
      const before = snap(p);
      const r = act(p);
      expect(r.ok, `${label} was expected to fail`).toBe(false);
      expect(snap(p), `${label} mutated state despite failing`).toBe(before);
    }
  });

  it("and the invariants still hold after every refusal", () => {
    for (const [label, build, act] of cases) {
      const p = build();
      act(p);
      const d = new Dungeon(96, 96, 5);
      const level = d.level(1);
      const v = check({
        plasmid: p, level,
        player: { x: level.up.x, y: level.up.y, hp: 20, maxhp: 20, atp: 1, atpMax: 100 },
        drops: [], packets: [], clouds: [], barriers: level.barriers,
        run: newRun(), floor: 1, dead: false,
      });
      expect(v.map((x) => x.name), label).toEqual([]);
    }
  });

  it("a successful mutation always changes something", () => {
    const p = new Plasmid();
    const before = snap(p);
    expect(p.stash({ kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE }).ok).toBe(true);
    expect(snap(p), "success must not be a no-op").not.toBe(before);
  });
});



// Coverage proven by EXECUTION, not by grepping the test file for words. Each
// entry breaks exactly one invariant; the suite asserts every invariant has an
// entry and that each entry fires the one it claims. An invariant nobody has
// seen fail may be checking nothing at all.
const BREAKERS: Readonly<Record<string, () => WorldView>> = {
  "ring is exactly SLOTS long": () => {
    const p = new Plasmid();
    p.slots.push(null);
    return world({ plasmid: p });
  },
  "the origin exists": () => {
    const p = new Plasmid();
    p.slots[p.slots.findIndex((s) => s?.kind === "gene" && s.id === "ori")] = null;
    return world({ plasmid: p });
  },
  "the bin is within capacity": () => {
    const p = new Plasmid();
    for (let i = 0; i < 40; i++) p.bin.push({ kind: "terminator", id: "rrnbt1" });
    return world({ plasmid: p });
  },
  "no gene is carried twice": () => {
    const p = new Plasmid();
    p.slots[5] = { kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE };
    p.bin.push({ kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE });
    return world({ plasmid: p });
  },
  "expression supply is a fraction": () => {
    const p = new Plasmid();
    p.supply = 4;
    return world({ plasmid: p });
  },
  "no gene carries more modifiers than its level allows": () => {
    const p = new Plasmid();
    p.slots[5] = { kind: "gene", id: "mtrC", level: 1,
                   mods: ["codon", "rbs", "chaperone"], allele: WILD_TYPE };
    return world({ plasmid: p });
  },
  "no gene is evolved past the cap": () => {
    const p = new Plasmid();
    p.slots[5] = { kind: "gene", id: "mtrC", level: 99, mods: [], allele: WILD_TYPE };
    return world({ plasmid: p });
  },
  "expression is finite and non-negative everywhere": () => {
    const p = new Plasmid();
    p.put(4, { kind: "promoter", id: "j23119" });
    p.slots[5] = { kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE };
    // Reach past the clamp: the invariant is the last line of defence.
    Object.defineProperty(p, "supply", { value: NaN, writable: true });
    (p as unknown as { rawExpression: unknown }).rawExpression = () => NaN;
    return world({ plasmid: p });
  },
  "the chromosome is no larger than it has been grown to": () => {
    const p = new Plasmid();
    p.integrated = 999;
    return world({ plasmid: p });
  },
  "strain level is within its band": () => {
    const p = new Plasmid();
    p.strain = 99;
    return world({ plasmid: p });
  },
  "nothing occupies a slot the replicon does not have": () => {
    const p = new Plasmid();
    p.slots[20] = { kind: "terminator", id: "rrnbt1" };
    return world({ plasmid: p });
  },
  "wasted transcription is finite and non-negative": () => {
    const p = new Plasmid();
    Object.defineProperty(p, "wastedTranscription", { value: () => NaN });
    return world({ plasmid: p });
  },
  "a living player is alive and not over-healed": () => {
    const w = world();
    return { ...w, player: { ...w.player, hp: 0 } };
  },
  "atp is within its pool": () => {
    const w = world();
    return { ...w, player: { ...w.player, atp: -1 } };
  },
  "player state is finite": () => {
    const w = world();
    return { ...w, player: { ...w.player, hp: NaN } };
  },
  "player stands on floor": () => {
    const w = world();
    return { ...w, player: { ...w.player, x: 0, y: 0 } };
  },
  "every living body stands entirely on floor": () => {
    const w = world();
    const m = w.level.mobs[0];
    if (m) { m.x = 0; m.y = 0; }
    return w;
  },
  "no two bodies share a tile": () => {
    const w = world();
    const [a, b] = w.level.mobs;
    if (a && b) { b.x = a.x; b.y = a.y; b.heading = a.heading; }
    return w;
  },
  "a boss floor actually holds a boss": () => {
    const w = world();
    const level = { ...w.level, boss: true, mobs: w.level.mobs.map((m) => ({ ...m, elite: false })) };
    return { ...w, level };
  },
  "no body stands on a stair": () => {
    const w = world();
    const m = w.level.mobs[0];
    if (m) { m.x = w.level.up.x; m.y = w.level.up.y; }
    return w;
  },
  "bodies never stand on the player": () => {
    const w = world();
    const m = w.level.mobs[0];
    return m ? { ...w, player: { ...w.player, x: m.x, y: m.y } } : w;
  },
  "body identities are unique": () => {
    const w = world();
    const [a, b] = w.level.mobs;
    if (a && b) Object.assign(b, { uid: a.uid });
    return w;
  },
  "body state is finite": () => {
    const w = world();
    const m = w.level.mobs[0];
    if (m) m.heading = NaN;
    return w;
  },
  "the stairs are on floor": () => {
    const w = world();
    return { ...w, level: { ...w.level, up: { x: 0, y: 0 } } };
  },
  "the level matches the floor it claims": () => world({ floor: 7 }),
  "the stratum is a real one": () => {
    const w = world();
    return { ...w, level: { ...w.level, depth: 99 } };
  },
  "sight buffers match the grid": () => {
    const w = world();
    return { ...w, level: { ...w.level,
      sight: { ...w.level.sight, visible: new Uint8Array(3) } } };
  },
  "nothing transient grows without bound": () => {
    const w = world();
    return { ...w, drops: Array.from({ length: 99 }, (_v, i) => ({ x: i, y: 0, items: [] })) };
  },
  "barriers stand on floor and off the stairs": () => {
    const w = world();
    return { ...w, barriers: [{ x: w.level.up.x, y: w.level.up.y,
                                id: "biofilm" as const, work: 0 }] };
  },
  "the notebook holds no duplicates": () => {
    const run = newRun();
    run.bestiary.push("geobacter", "geobacter");
    return world({ run });
  },
  "the deepest reached is within the column": () => {
    const run = newRun();
    run.deepest = 9999;
    return world({ run });
  },
};

describe("the invariant set is itself guarded", () => {
  it("every invariant has a breaker, and every breaker names a real invariant", () => {
    const names = new Set(Object.keys(INVARIANTS));
    const broken = new Set(Object.keys(BREAKERS));
    const missing = [...names].filter((n) => !broken.has(n));
    const orphaned = [...broken].filter((n) => !names.has(n));
    expect(missing, "invariants with no failure case").toEqual([]);
    expect(orphaned, "breakers for invariants that no longer exist").toEqual([]);
  });

  it("each breaker actually trips the invariant it claims", () => {
    for (const [name, build] of Object.entries(BREAKERS)) {
      const violations = check(build()).map((v) => v.name);
      expect(violations, `breaking "${name}" did not trip it`).toContain(name);
    }
  });

  it("no invariant is silently disabled", () => {
    for (const [name, fn] of Object.entries(INVARIANTS)) {
      expect(typeof fn, name).toBe("function");
      expect(fn.length, `${name} must take the world`).toBeGreaterThan(0);
    }
  });
});

describe("hardening: things the density and stair changes disturbed", () => {
  it("every boss floor holds an elite, across many seeds", () => {
    // Excluding stairs from placement and raising mob density together made
    // the tight local search around the stairs fail outright -- leaving a boss
    // floor with no boss, which `isCleared` waves you straight through.
    for (let seed = 1; seed <= 24; seed++) {
      const d = new Dungeon(96, 96, seed);
      for (let f = 3; f <= MAX_FLOOR; f += 3) {
        const L = d.level(f);
        expect(L.mobs.some((m) => m.elite),
               `seed ${String(seed)} floor ${String(f)} has no elite`).toBe(true);
        expect(L.bossName, `seed ${String(seed)} floor ${String(f)}`).toBeDefined();
      }
    }
  });

  it("no body ever occupies a stair, on any floor of any seed", () => {
    for (const seed of [1, 17, 33]) {
      const d = new Dungeon(96, 96, seed);
      for (let f = 1; f <= MAX_FLOOR; f++) {
        const L = d.level(f);
        for (const m of L.mobs) {
          for (const t of tilesOf(SIZES[m.size].footprint, m.x, m.y, m.heading)) {
            expect(`${String(t.x)},${String(t.y)}`,
                   `${m.name} on the up stair, seed ${String(seed)} f${String(f)}`)
              .not.toBe(`${String(L.up.x)},${String(L.up.y)}`);
            if (L.down) {
              expect(`${String(t.x)},${String(t.y)}`, `${m.name} on the down stair`)
                .not.toBe(`${String(L.down.x)},${String(L.down.y)}`);
            }
          }
        }
      }
    }
  });

  it("a barrier with a corrupt work count is repaired, not stuck forever", () => {
    // NaN never reaches the threshold, so the barrier could never be opened by
    // anything at all.
    const b = { x: 0, y: 0, id: "biofilm" as const, work: NaN };
    const r = degrade(b, () => true);
    expect(r.kind).not.toBe("blocked");
    expect(Number.isFinite(b.work)).toBe(true);
    for (let i = 0; i < 10; i++) degrade(b, () => true);
    expect(Number.isFinite(b.work)).toBe(true);
  });

  it("an over-worked barrier opens rather than counting past its threshold", () => {
    const b = { x: 0, y: 0, id: "ferric" as const, work: 1e9 };
    expect(degrade(b, () => true).kind).toBe("opened");
  });

  it("blocked attempts never advance the work count", () => {
    const b = { x: 0, y: 0, id: "chitin" as const, work: 0 };
    for (let i = 0; i < 100; i++) degrade(b, () => false);
    expect(b.work).toBe(0);
  });

  it("every barrier message names the material and the way through", () => {
    for (const def of Object.values(BARRIERS)) {
      const m = blockedBy(def, (g) => bio.GENES[g].name);
      expect(m, def.id).toContain(def.name);
      expect(m.length, `${def.id}: too terse to act on`).toBeGreaterThan(40);
      for (const g of def.opens) expect(m, def.id).toContain(bio.GENES[g].name);
    }
  });

  it("the audit reports a half-built world instead of throwing", () => {
    const broken = {
      plasmid: new Plasmid(), level: {} as never,
      player: { x: 0, y: 0, hp: 1, maxhp: 1, atp: 0, atpMax: 1 },
      drops: [], packets: [], clouds: [], barriers: [], run: newRun(), floor: 1, dead: false,
    };
    expect(() => check(broken)).not.toThrow();
    expect(check(broken).length, "a broken world reported as sound")
      .toBeGreaterThan(0);
  });

  it("the audit is cheap enough to run every turn at full density", () => {
    const d = new Dungeon(96, 96, 5);
    const level = d.level(12);
    const w: WorldView = {
      plasmid: new Plasmid(), level,
      player: { x: level.up.x, y: level.up.y, hp: 20, maxhp: 20, atp: 1, atpMax: 100 },
      drops: [], packets: [], clouds: [], barriers: level.barriers,
      run: newRun(), floor: 12, dead: false,
    };
    expect(level.mobs.length, "not actually a dense floor").toBeGreaterThan(30);
    for (let i = 0; i < 50; i++) check(w);
    const t0 = performance.now();
    for (let i = 0; i < 400; i++) check(w);
    const per = (performance.now() - t0) / 400;
    expect(per, `${(per * 1000).toFixed(0)} us per audit`).toBeLessThan(2);
  });
});
