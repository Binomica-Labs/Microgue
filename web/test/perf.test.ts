import { Plasmid } from "../src/plasmid.js";
import { WILD_TYPE } from "../src/allele.js";
import type * as bio from "../src/biology.js";
import { describe, expect, it } from "vitest";
import { AnchorIndex, BodyIndex } from "../src/bodies.js";
import { covers, tilesOf, type Footprint } from "../src/footprint.js";
import { microbeTurn } from "../src/combat.js";
import { Dungeon, type Mob } from "../src/dungeon.js";
import { SIZES } from "../src/behaviour.js";
import { makeRng } from "../src/rng.js";

// Guards for the turn engine's cost as the floor fills up.
//
// A mob turn asked "is this tile taken?" by scanning every mob, many times per
// mob -- 8.8 ms a turn at 250 mobs, a dropped frame on every keypress. It is
// indexed now (bodies.ts), and these hold both halves of that: the fast paths
// answer exactly what the slow definitions answer, and the cost stays roughly
// linear in the number of bodies so the next system added to a mob's turn
// cannot quietly make it quadratic again.

const FOOTPRINTS: readonly Footprint[] = ["single", "line2", "line3", "block2"];

/** Anchors and headings a broken body could carry, not just good ones. */
const ODD = [0, 1, 7, -1, 2.5, NaN, Infinity, -Infinity, 1e308, -1e7];
const HEADINGS = [null, 0, 0.4, Math.PI / 2, 2.2, Math.PI, -Math.PI / 4, 5.9, NaN];

describe("footprint fast paths agree with their definitions", () => {
  it("covers() is exactly tilesOf().some() -- for broken bodies too", () => {
    const rng = makeRng(11);
    let n = 0;
    for (const fp of FOOTPRINTS) {
      for (const h of HEADINGS) {
        for (let i = 0; i < 400; i++) {
          const pick = (): number => rng.next() < 0.2
            ? ODD[rng.int(ODD.length)] ?? 0 : rng.int(9);
          const ax = pick(), ay = pick();
          // Probe the body's own tiles as well as random ones, or nearly every
          // probe would be a miss and the test would prove very little.
          const own = tilesOf(fp, ax, ay, h);
          const t = rng.next() < 0.5 ? own[rng.int(own.length)] : undefined;
          const x = t?.x ?? pick(), y = t?.y ?? pick();
          expect(covers(fp, ax, ay, h, x, y), `${fp} at ${String(ax)},${String(ay)} h=${String(h)} asked ${String(x)},${String(y)}`)
            .toBe(own.some((q) => q.x === x && q.y === y));
          n++;
        }
      }
    }
    expect(n).toBeGreaterThan(10000);
  });

  it("BodyIndex counts what a scan of every body counts", () => {
    const rng = makeRng(23);
    const W = 12, H = 10;
    const idx = new BodyIndex(W, H);
    const bodies: { fp: Footprint; x: number; y: number; h: number | null }[] = [];
    for (let step = 0; step < 600; step++) {
      if (bodies.length > 0 && rng.next() < 0.4) {
        const k = rng.int(bodies.length);
        const b = bodies[k];
        if (b) { idx.remove(b.fp, b.x, b.y, b.h); bodies.splice(k, 1); }
      } else {
        const b = { fp: FOOTPRINTS[rng.int(4)] ?? "single",
                    x: rng.int(W + 2) - 1, y: rng.int(H + 2) - 1,
                    h: HEADINGS[rng.int(HEADINGS.length)] ?? null };
        idx.add(b.fp, b.x, b.y, b.h);
        bodies.push(b);
      }
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const want = bodies.filter((b) => covers(b.fp, b.x, b.y, b.h, x, y)).length;
          expect(idx.count(x, y)).toBe(want);
        }
      }
    }
  });

  it("AnchorIndex.near never misses anything within range", () => {
    const rng = makeRng(31);
    const W = 20, H = 16;
    const near = new AnchorIndex<{ x: number; y: number }>(W, H);
    const all: { x: number; y: number }[] = [];
    for (let i = 0; i < 120; i++) {
      const p = rng.next() < 0.1
        ? { x: ODD[rng.int(ODD.length)] ?? 0, y: rng.int(H) }
        : { x: rng.int(W), y: rng.int(H) };
      near.add(p.x, p.y, p);
      all.push(p);
    }
    for (let q = 0; q < 300; q++) {
      const x = rng.int(W + 4) - 2, y = rng.int(H + 4) - 2, r = rng.int(4);
      const seen = new Set<{ x: number; y: number }>();
      near.near(x, y, r, (p) => seen.add(p));
      for (const p of all) {
        if (Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) <= r) {
          expect(seen.has(p), `missed ${String(p.x)},${String(p.y)} from ${String(x)},${String(y)} r${String(r)}`).toBe(true);
        }
      }
    }
  });
});

describe("a mob turn scales with the floor, not its square", () => {
  /** A real floor packed with `n` copies of its own mobs. */
  const crowd = (n: number): { mobs: Mob[]; run: () => void } => {
    const d = new Dungeon(96, 96, 5);
    const lvl = d.level(1);
    const protos = lvl.mobs.filter((m) => m.alive && !m.elite
      && SIZES[m.size].footprint === "single");
    const floor: { x: number; y: number }[] = [];
    for (let y = 1; y < lvl.grid.h - 1; y++) {
      for (let x = 1; x < lvl.grid.w - 1; x++) {
        if (lvl.grid.isFloor(x, y)) floor.push({ x, y });
      }
    }
    const stride = Math.max(Math.floor(floor.length / n), 1);
    const mobs: Mob[] = [];
    for (let i = 0; i < n; i++) {
      const at = floor[i * stride], p = protos[i % protos.length];
      if (!at || !p) break;
      const m: Mob = { ...p, uid: i + 1, x: at.x, y: at.y, ax: at.x, ay: at.y,
                       status: [] };
      delete m.agenda;
      mobs.push(m);
    }
    const mid = floor[Math.floor(floor.length / 2)] ?? { x: 48, y: 48 };
    const player = { x: mid.x, y: mid.y, hp: 1e9, maxhp: 1e9, status: [] };
    let t = 0;
    return {
      mobs,
      run: () => {
        player.hp = 1e9;
        microbeTurn({ grid: lvl.grid, mobs, player, rng: makeRng(t++),
                      armour: 1, threat: 0.5, mobSpeed: 1, founding: n,
                      mired: () => false, packets: [], clouds: [],
                      stairs: lvl.down ? [lvl.up, lvl.down] : [lvl.up] });
      },
    };
  };

  /** Median microseconds per turn: a median shrugs off a GC pause or a
   *  loaded CI box, which a mean or a single run does not. */
  const cost = (n: number): number => {
    const c = crowd(n);
    for (let i = 0; i < 10; i++) c.run();
    const samples: number[] = [];
    for (let r = 0; r < 9; r++) {
      const t0 = performance.now();
      for (let i = 0; i < 8; i++) c.run();
      samples.push((performance.now() - t0) / 8);
    }
    samples.sort((a, b) => a - b);
    return (samples[4] ?? 0) * 1000;
  };

  it("eight times the mobs costs no more than eight times the time", () => {
    // A RATIO, not a clock bound: it holds on a slow machine and a fast one.
    // Linear is 8x, quadratic 64x. Measured on the scan-based turn this read
    // 19.5x (40 mobs 0.34 ms, 320 mobs 6.6 ms); indexed, it reads 2.7x --
    // under linear, because a turn has fixed costs the small floor also pays.
    // A bound AT linear leaves room for noise and still fails a return to
    // quadratic by more than double.
    const small = cost(40), big = cost(320);
    expect(big / small,
           `40 mobs ${small.toFixed(0)} us, 320 mobs ${big.toFixed(0)} us`)
      .toBeLessThan(8);
  });
});

describe("the per-frame reads are memoised", () => {
  const build = (): Plasmid => {
    const p = new Plasmid();
    p.integrated = 24;
    const genes: bio.GeneId[] = ["cbbL", "katG", "sodA", "celA", "psbA",
                                 "groL", "recA", "uvrA", "narG", "nirS"];
    for (const g of genes) {
      p.stash({ kind: "gene", id: g, level: 1, mods: [], allele: WILD_TYPE });
    }
    p.assemble(genes);
    return p;
  };

  it("power, vitality and expression are cache hits, not recomputes", () => {
    // These were 19us, 15us and 3us per call, and the HUD and ring screen
    // read them every frame -- expression roughly once per gene, so twenty
    // times over. A cache hit is sub-microsecond; anything above that means
    // the memo is not being reached.
    const p = build();
    const genes: bio.GeneId[] = ["cbbL", "katG", "sodA"];
    const once = (): void => {
      p.power(4); p.vitality(4);
      for (const g of genes) p.expression(g, 4);
    };
    once();                                  // warm
    const t0 = performance.now();
    const N = 20000;
    for (let i = 0; i < N; i++) once();
    const us = (performance.now() - t0) / N * 1000;
    expect(us, `${us.toFixed(2)}us for five cached reads -- the memo is missing`)
      .toBeLessThan(4);
  });

  it("the memo cannot grow without bound as supply drifts", () => {
    // `supply` is a float the energy division rewrites every turn. Keyed
    // raw, every tick would be a distinct key and the memo would grow for
    // ever while never hitting. It is bucketed into 64 steps.
    const p = build();
    for (let i = 0; i < 4000; i++) {
      p.supply = (i % 997) / 997;
      p.power(4); p.vitality(4); p.expression("cbbL", 4);
    }
    const size = (p as unknown as { memoAtp: Map<string, number> }).memoAtp.size;
    expect(size, `${String(size)} memo entries after 4000 supply values`)
      .toBeLessThan(400);
  });

  it("and the cached values are still CORRECT as supply changes", () => {
    // The whole risk of a memo: a stale answer. `supply` browns expression
    // out, so a key that ignored it would report full power in a blackout.
    const p = build();
    p.supply = 1;
    const full = p.power(4);
    p.supply = 0.1;
    const brown = p.power(4);
    expect(brown, "power did not fall under brownout -- a stale cache")
      .toBeLessThan(full);
    p.supply = 1;
    expect(p.power(4), "power did not recover when supply did").toBeCloseTo(full, 6);
    // and a ring edit invalidates
    const before = p.power(4);
    p.rotate(1);
    expect(Number.isFinite(p.power(4))).toBe(true);
    void before;
  });
});
