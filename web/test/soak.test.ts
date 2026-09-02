import { SLOTS } from "../src/plasmid.js";
import * as bio from "../src/biology.js";
import { BASE_SLOTS } from "../src/chromosome.js";
import { offers } from "../src/lab.js";
import { findPath } from "../src/path.js";
import { WILD_TYPE } from "../src/allele.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A long session through the REAL game object. Unit tests on pure modules
// cannot see state that accumulates across thousands of frames, and that is
// exactly where a leak or a slow desync lives.

interface Rec { calls: number }

function stubContext(rec: Rec): CanvasRenderingContext2D {
  const noop = (name: string) => (...a: unknown[]): unknown => {
    rec.calls++;
    if (name === "measureText") {
      return { width: (typeof a[0] === "string" ? a[0].length : 0) * 6 };
    }
    if (name === "createRadialGradient" || name === "createLinearGradient") {
      return { addColorStop: () => undefined };
    }
    return undefined;
  };
  return new Proxy({} as CanvasRenderingContext2D, {
    get: (_t, p: string) => (["fillStyle", "strokeStyle", "font", "textAlign",
      "textBaseline", "globalAlpha", "lineWidth", "lineCap", "lineJoin",
      "filter", "imageSmoothingEnabled"].includes(p) ? "" : noop(p)),
    set: () => true,
  });
}

function setupEnv(rec: Rec): void {
  rec = { calls: 0 };
  const store = new Map<string, string>();
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("addEventListener", () => undefined);
  vi.stubGlobal("innerWidth", 400);
  vi.stubGlobal("innerHeight", 800);
  vi.stubGlobal("devicePixelRatio", 2);
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  vi.stubGlobal("performance", { now: () => 0 });
  // A new run seeds from Date.now(). Without pinning it every soak gets a
  // DIFFERENT dungeon, so anything that depends on level shape -- how long
  // exploring takes, whether a mob is reachable -- passes or fails by luck.
  vi.stubGlobal("Date", Object.assign(function DateStub() { return new Date(0); },
                                      { now: () => 1700000000000 }));
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  });
  vi.stubGlobal("navigator", {});
  vi.stubGlobal("HTMLCanvasElement", function Stub() { /* marker */ });
  vi.stubGlobal("Path2D", class { moveTo(): void { /* */ } lineTo(): void { /* */ }
    quadraticCurveTo(): void { /* */ }
    arc(): void { /* */ } closePath(): void { /* */ } rect(): void { /* */ } });
  vi.stubGlobal("getComputedStyle", () => ({ top: "0px", right: "0px",
                                             bottom: "0px", left: "0px" }));
  vi.stubGlobal("document", {
    getElementById: () => null,
    createElement: () => ({ style: {} as CSSStyleDeclaration, width: 0, height: 0,
                            remove: () => undefined, getContext: () => stubContext(rec) }),
    body: { appendChild: () => undefined },
    addEventListener: () => undefined,
    visibilityState: "visible",
  });
  }

describe("soak", () => {
  let rec: Rec = { calls: 0 };

  beforeEach(() => { rec = { calls: 0 }; setupEnv(rec); });

  const makeGame = async () => {
    const { Game } = await import("../src/main.js");
    return new Game({
      width: 400, height: 800, style: {} as CSSStyleDeclaration,
      getContext: () => stubContext(rec),
      addEventListener: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    } as unknown as HTMLCanvasElement);
  };

  it("survives two thousand frames of play with no recovered errors", async () => {
    const g = await makeGame();
    g.startRun(0);
    for (let t = 0; t < 2000; t++) {
      if (t % 7 === 0) g.press("wait");
      g.frame(t * 16);
    }
    // Death is a legitimate outcome of two thousand turns; a CRASH is not.
    const errors = g.toasts.all().filter((x) => x.level === "error");
    expect(errors.map((x) => x.text)).toEqual([]);
  });

  it("nothing unbounded accumulates over a long session", async () => {
    const g = await makeGame();
    g.startRun(0);
    for (let t = 0; t < 1500; t++) { g.press("wait"); g.frame(t * 16); }
    expect(g.fx.count(), "effect queue").toBeLessThanOrEqual(160);
    expect(g.toasts.count(), "toast queue").toBeLessThanOrEqual(4);
    expect(g.packets.length, "packets").toBeLessThan(200);
    expect(g.clouds.length, "clouds").toBeLessThan(200);
    expect(g.drops.length, "floor drops").toBeLessThanOrEqual(60);
    expect(g.player.status.length, "player statuses").toBeLessThanOrEqual(8);
    expect(g.genome.bin.length, "parts bin").toBeLessThanOrEqual(18);
    expect(g.genome.slots).toHaveLength(SLOTS);
  });

  it("the player never ends up in an impossible state", async () => {
    const g = await makeGame();
    g.startRun(0);
    for (let t = 0; t < 1500; t++) { g.press("wait"); g.frame(t * 16); }
    for (const [k, v] of Object.entries(g.player)) {
      if (typeof v === "number") {
        expect(Number.isFinite(v), `player.${k} = ${String(v)}`).toBe(true);
      }
    }
    expect(g.player.hp).toBeGreaterThan(0);
    expect(g.player.hp).toBeLessThanOrEqual(g.player.maxhp);
    expect(g.player.atp).toBeGreaterThanOrEqual(0);
    expect(g.player.atp).toBeLessThanOrEqual(g.player.atpMax);
    expect(g.level.grid.isFloor(g.player.x, g.player.y), "player inside rock").toBe(true);
    expect(g.genome.has("ori"), "origin lost during play").toBe(true);
  });

  it("cycling every screen a hundred times leaks nothing and throws nothing", async () => {
    const g = await makeGame();
    g.startRun(0);
    // No `wait` here: this test is about the SCREENS. Passing a hundred turns
    // next to hostiles is a survival test, and at current mob density it can
    // legitimately end in death -- which made this fail intermittently on an
    // assertion that had nothing to do with what it was checking.
    for (let i = 0; i < 100; i++) {
      g.press("plasmid"); g.frame(i * 32);
      g.press("plasmid"); g.press("map"); g.frame(i * 32 + 8);
      g.press("map"); g.press("notes"); g.frame(i * 32 + 16);
      g.press("notes"); g.press("research"); g.frame(i * 32 + 24);
      g.press("research"); g.frame(i * 32 + 28);
    }
    const errors = g.toasts.all().filter((x) => x.level === "error");
    expect(errors.map((x) => x.text)).toEqual([]);
    expect(g.showPlasmid || g.showMap || g.showNotes || g.showResearch).toBe(false);
  });

  it("descending the whole column never breaks an invariant", async () => {
    const g = await makeGame();
    g.startRun(0);
    for (let f = 1; f < 24; f++) {
      // clear whatever holds the floor, then go down
      for (const m of g.level.mobs) m.alive = false;
      g.descend();
      g.frame(f * 100);
      expect(g.level.grid.isFloor(g.player.x, g.player.y), `floor ${String(f)}`).toBe(true);
      expect(Number.isFinite(g.player.hp), `floor ${String(f)} hp`).toBe(true);
    }
    expect(g.dungeon.floor).toBe(24);
    expect(g.toasts.all().filter((t) => t.level === "error")).toHaveLength(0);
  });
});

describe("the save carries the whole game", () => {
  // Every time state has been added it has been forgotten in the save: the
  // run notebook at v31, and now held modifiers -- which are the RARE drops,
  // so losing them is the worst version of this bug.
  it("held modifiers, the clock and the win flag all survive a reload", async () => {
    const { Game } = await import("../src/main.js");
    const canvas = {
      width: 400, height: 800, style: {} as CSSStyleDeclaration,
      getContext: () => stubContext({ calls: 0 }),
      addEventListener: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    } as unknown as HTMLCanvasElement;

    const a = new Game(canvas);
    a.startRun(0);
    a.mods.push("chaperone", "fusion");
    a.clock.turn = 517;
    a.won = true;
    a.genome.put(5, { kind: "gene", id: "mtrC", level: 3, mods: ["codon"], allele: WILD_TYPE });
    a.save();

    const b = new Game(canvas);
    b.startRun(0);
    expect(b.mods, "held modifiers were lost").toEqual(["chaperone", "fusion"]);
    expect(b.clock.turn, "the diel cycle restarted").toBe(517);
    expect(b.won, "the win was forgotten").toBe(true);
    const gene = b.genome.slots.find((p) => p?.kind === "gene" && p.id === "mtrC");
    expect(gene?.kind).toBe("gene");
    if (gene?.kind === "gene") {
      expect(gene.level).toBe(3);
      expect(gene.mods).toEqual(["codon"]);
    }
  });

  it("the saved snapshot does not alias the live plasmid", async () => {
    // `{ ...part }` copies a gene's `mods` ARRAY BY REFERENCE, so the snapshot
    // kept changing along with the plasmid after it was written.
    const { Game } = await import("../src/main.js");
    const canvas = {
      width: 400, height: 800, style: {} as CSSStyleDeclaration,
      getContext: () => stubContext({ calls: 0 }),
      addEventListener: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    } as unknown as HTMLCanvasElement;

    const a = new Game(canvas);
    a.startRun(0);
    a.genome.put(5, { kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE });
    a.save();
    // Mutate AFTER saving. The stored copy must not follow.
    a.genome.addModifier("mtrC", "codon");
    a.genome.evolve("mtrC");

    const b = new Game(canvas);
    b.startRun(0);
    const gene = b.genome.slots.find((p) => p?.kind === "gene" && p.id === "mtrC");
    if (gene?.kind !== "gene") { expect(gene?.kind).toBe("gene"); return; }
    expect(gene.mods, "the snapshot followed the live plasmid").toEqual([]);
    expect(gene.level).toBe(1);
  });
});

describe("the new systems are reachable from play", () => {
  // Same environment as the soak above. A describe without this gets whatever
  // globals the previous one left, so startRun loads a stale save and every
  // assertion measures the wrong game.
  beforeEach(() => { setupEnv({ calls: 0 }); });

  // Three systems were built and none was wired into the loop: strain never
  // advanced, and there was no way to change replicon at all. The tests passed
  // because they exercised the modules directly. These go through the Game.
  const canvas = () => ({
    width: 400, height: 800, style: {} as CSSStyleDeclaration,
    getContext: () => stubContext({ calls: 0 }),
    addEventListener: () => undefined,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
  } as unknown as HTMLCanvasElement);

  it("strain advances as the lineage catalogues and descends", async () => {
    const { Game } = await import("../src/main.js");
    const g = new Game(canvas());
    g.startRun(0);
    expect(g.genome.strain).toBe(1);
    g.run.bestiary.push(...bio.MICROBES.slice(0, 14).map((m) => m.id));
    g.run.deepest = 20;
    g.press("wait");
    expect(g.genome.strain, "strain never advanced").toBeGreaterThan(1);
  });




  // The test above SETS run.deepest by hand, which is why it never noticed
  // that nothing in the game ever set it. Only t_win did, so the depth term
  // of strainLevel -- 45% of the formula -- was zero for every real run, and
  // no strain could pass L5 of 8 however much of the column it catalogued.
  it("descending actually advances the deepest floor reached", async () => {
    const { Game } = await import("../src/main.js");
    const g = new Game(canvas());
    g.startRun(0);
    expect(g.run.deepest).toBe(1);
    for (let i = 0; i < 5; i++) {
      for (const m of g.level.mobs) m.alive = false;
      g.descend();
    }
    expect(g.dungeon.floor, "the scenario did not descend").toBeGreaterThan(1);
    expect(g.run.deepest, "run.deepest did not follow the descent")
      .toBe(g.dungeon.floor);
  });

  it("climbing back up never lowers the deepest reached", async () => {
    const { Game } = await import("../src/main.js");
    const g = new Game(canvas());
    g.startRun(0);
    for (let i = 0; i < 3; i++) {
      for (const m of g.level.mobs) m.alive = false;
      g.descend();
    }
    const deepest = g.run.deepest;
    g.ascend();
    expect(g.run.deepest, "ascending erased the record").toBe(deepest);
  });

  // "start at strain L8" is bought with escalating credit and was destroyed
  // one turn into the run: upkeep recomputed the level from an empty notebook
  // and silently downgraded it, taking three ring positions with it.
  it("a strain level the lab paid for survives the first turn", async () => {
    const { LAB_KEY } = await import("../src/lab_save.js");
    localStorage.setItem(LAB_KEY, JSON.stringify({
      credit: 0, deepestEver: 20, ledger: [], stock: [],
      startSites: 4, startStrain: 8,
    }));
    const { Game } = await import("../src/main.js");
    const g = new Game(canvas());
    g.startRun(0);
    const slots = g.genome.usableSlots;
    g.press("wait");
    expect(g.genome.strain, "the lab's purchased strain was downgraded").toBe(8);
    expect(g.genome.usableSlots, "ring positions were lost with it").toBe(slots);
    g.press("wait");
    expect(g.genome.strain, "and again on the second turn").toBe(8);
  });

  it("a purchased strain survives a save and reload", async () => {
    const { LAB_KEY } = await import("../src/lab_save.js");
    localStorage.setItem(LAB_KEY, JSON.stringify({
      credit: 0, deepestEver: 1, ledger: [], stock: [],
      startSites: 0, startStrain: 5,
    }));
    const { Game } = await import("../src/main.js");
    const a = new Game(canvas());
    a.startRun(0);
    a.press("wait");
    a.save();
    const b = new Game(canvas());
    b.startRun(0);
    expect(b.genome.strain, "reloading undid what credit bought").toBe(5);
  });

  it("catabolising a cassette heals and is reachable", async () => {
    const { Game } = await import("../src/main.js");
    const g = new Game(canvas());
    g.startRun(0);
    g.player.hp = 5;
    g.genome.stash({ kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE });
    const i = g.genome.bin.findIndex((p) => p.kind === "gene");
    const before = g.genome.bin.length;
    g.catabolise(i);
    expect(g.player.hp, "eating DNA should heal").toBeGreaterThan(5);
    expect(g.genome.bin.length, "and consume the cassette").toBe(before - 1);
  });

  it("the origin is never edible", async () => {
    const { Game } = await import("../src/main.js");
    const g = new Game(canvas());
    g.startRun(0);
    g.genome.bin.push({ kind: "gene", id: "ori", level: 1, mods: [], allele: WILD_TYPE });
    const i = g.genome.bin.length - 1;
    g.catabolise(i);
    expect(g.genome.bin.length - 1, "the origin was eaten").toBe(i);
  });
});

describe("permadeath and the lab", () => {
  const canvas2 = () => ({
    width: 400, height: 800, style: {} as CSSStyleDeclaration,
    getContext: () => stubContext({ calls: 0 }),
    addEventListener: () => undefined,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
  } as unknown as HTMLCanvasElement);

  beforeEach(() => { setupEnv({ calls: 0 }); });

  it("death is final: the strain does not resynthesise and carry on", async () => {
    const { Game } = await import("../src/main.js");
    const g = new Game(canvas2());
    g.startRun(0);
    g.dungeon.floor = 7;
    g.player.hp = 1;
    g.die();
    expect(g.dead, "the strain should be gone").toBe(true);
    expect(g.deathRecord).not.toBeNull();
    // and it cannot keep playing
    const where = { x: g.player.x, y: g.player.y };
    g.step(where.x + 1, where.y);
    expect({ x: g.player.x, y: g.player.y }).toEqual(where);
  });

  it("the run's slot is cleared, so a dead strain cannot be resumed", async () => {
    const { Game } = await import("../src/main.js");
    const g = new Game(canvas2());
    g.startRun(0);
    g.dungeon.floor = 5;
    g.die();
    const { loadSlot } = await import("../src/saves.js");
    expect(loadSlot(0), "the dead strain is still loadable").toBeNull();
  });

  it("credit is banked and survives into the next strain", async () => {
    const { Game } = await import("../src/main.js");
    const a = new Game(canvas2());
    a.startRun(0);
    a.dungeon.floor = 11;
    a.run.bestiary.push("geobacter", "shewanella");
    a.die();
    const earned = a.lab.credit;
    expect(earned).toBeGreaterThan(0);

    const b = new Game(canvas2());
    b.startRun(1);
    expect(b.lab.credit, "the lab did not persist").toBe(earned);
    expect(b.lab.ledger.length).toBe(1);
    expect(b.lab.deepestEver).toBe(11);
  });

  it("an ordered gene is on the next strain from turn one", async () => {
    const { Game } = await import("../src/main.js");
    const a = new Game(canvas2());
    a.startRun(0);
    a.lab.credit = 5000;
    const offer = offers(a.lab, ["mtrC"])[0];
    expect(offer).toBeDefined();
    if (!offer) return;
    a.order(offer);
    expect(a.lab.stock).toContain("mtrC");

    const b = new Game(canvas2());
    b.startRun(2);
    expect(b.genome.inBin("mtrC") || b.genome.has("mtrC"),
           "the ordered construct is not on the new strain").toBe(true);
  });

  it("ordered sites and strain level apply to the next strain", async () => {
    const { Game } = await import("../src/main.js");
    const a = new Game(canvas2());
    a.startRun(0);
    a.lab.credit = 9000;
    for (const o of offers(a.lab, [])) {
      if (o.id.kind === "sites") a.order(o);
      if (o.id.kind === "strain") a.order(o);
    }
    expect(a.lab.startSites).toBeGreaterThan(0);
    expect(a.lab.startStrain).toBeGreaterThan(1);

    const b = new Game(canvas2());
    b.startRun(3);
    expect(b.genome.integrated).toBeGreaterThan(0);
    expect(b.genome.strain).toBeGreaterThan(1);
  });

  it("the lab survives deleting every save slot", async () => {
    const { Game } = await import("../src/main.js");
    const a = new Game(canvas2());
    a.startRun(0);
    a.lab.credit = 777;
    const { writeLab } = await import("../src/lab_save.js");
    writeLab(a.lab);
    const { deleteSlot } = await import("../src/saves.js");
    for (let i = 0; i < 4; i++) deleteSlot(i);

    const b = new Game(canvas2());
    b.startRun(0);
    expect(b.lab.credit, "the lab lived in a slot file").toBe(777);
  });
});

describe("the ledger tells the truth about what killed you", () => {
  beforeEach(() => { setupEnv({ calls: 0 }); });

  const g0 = async () => {
    const { Game } = await import("../src/main.js");
    return new Game({
      width: 400, height: 800, style: {} as CSSStyleDeclaration,
      getContext: () => stubContext({ calls: 0 }),
      addEventListener: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    } as unknown as HTMLCanvasElement);
  };

  it("every damage path records its own cause", async () => {
    // Five paths reduced hp and exactly ONE set lastAttacker, so hazards,
    // status effects, toxic intermediates and real kills all reported
    // "starvation". A run history that lies is worse than none.
    const { hurt } = await import("../src/turn.js");
    const g = await g0();
    g.startRun(0);
    for (const cause of ["a cloud of exudate", "ATP starvation", "a toxic intermediate"]) {
      g.player.hp = 50;
      hurt(g, 3, cause);
      expect(g.lastAttacker).toBe(cause);
    }
  });

  it("hurt clamps and never reports a cause for nothing", async () => {
    const { hurt } = await import("../src/turn.js");
    const g = await g0();
    g.startRun(0);
    g.lastAttacker = null;
    for (const n of [0, -5, NaN]) {
      expect(hurt(g, n, "x")).toBe(0);
      expect(g.lastAttacker, "no damage means no killer").toBeNull();
    }
    g.player.hp = 3;
    expect(hurt(g, 999, "y")).toBe(999);
    expect(g.player.hp, "hp must not go negative").toBe(0);
  });

  it("the death screen does not report the death as a bug", async () => {
    // The audit ran on a dead strain and flagged hp 0/20 as an invariant
    // violation -- the first thing shown on the death screen.
    const g = await g0();
    g.startRun(0);
    g.player.hp = 0;
    g.die();
    g.audit();
    const errors = g.toasts.all().filter((t) => t.level === "error");
    expect(errors.map((t) => t.text)).toEqual([]);
  });
});

describe("the death screen is clean", () => {
  beforeEach(() => { setupEnv({ calls: 0 }); });

  it("dying raises no error toast", async () => {
    // hp 0 is the CORRECT state for a lost strain. Auditing it as a live world
    // put "invariant: player is alive" over the obituary, every single death.
    const { Game } = await import("../src/main.js");
    const g = new Game({
      width: 400, height: 800, style: {} as CSSStyleDeclaration,
      getContext: () => stubContext({ calls: 0 }),
      addEventListener: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    } as unknown as HTMLCanvasElement);
    g.startRun(0);
    // Killed directly. Setting hp to 0 and waiting does not work: upkeep runs
    // regeneration BEFORE the death check, so the player heals off zero -- in
    // real play the check fires immediately after the damage that caused it.
    g.die();
    expect(g.dead).toBe(true);
    const errors = g.toasts.all().filter((t) => t.level === "error");
    expect(errors.map((t) => t.text)).toEqual([]);
  });

  it("and the death screen keeps drawing without error", async () => {
    const { Game } = await import("../src/main.js");
    const g = new Game({
      width: 400, height: 800, style: {} as CSSStyleDeclaration,
      getContext: () => stubContext({ calls: 0 }),
      addEventListener: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    } as unknown as HTMLCanvasElement);
    g.startRun(0);
    g.die();
    for (let i = 0; i < 40; i++) g.frame(i * 16);
    const errs = g.toasts.all().filter((t) => t.level === "error");
    expect(errs.map((t) => t.text)).toEqual([]);
  });
});

describe("death really is permanent", () => {
  beforeEach(() => { setupEnv({ calls: 0 }); });

  const game = async () => {
    const { Game } = await import("../src/main.js");
    return new Game({
      width: 400, height: 800, style: {} as CSSStyleDeclaration,
      getContext: () => stubContext({ calls: 0 }),
      addEventListener: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    } as unknown as HTMLCanvasElement);
  };

  it("no later save can resurrect the slot", async () => {
    // die() deletes the slot and mobTurn called save() on the very next line,
    // writing it straight back. Permadeath was not permanent.
    const { loadSlot } = await import("../src/saves.js");
    const g = await game();
    g.startRun(0);
    g.die();
    g.save();                     // the exact call that used to undo it
    for (let i = 0; i < 20; i++) g.frame(i * 16);
    expect(loadSlot(0), "the dead strain came back").toBeNull();
  });

  it("the slot stays gone across a fresh Game", async () => {
    const { loadSlot } = await import("../src/saves.js");
    const a = await game();
    a.startRun(0);
    a.dungeon.floor = 9;
    a.die();
    const b = await game();
    b.startRun(0);
    expect(loadSlot(0), "a new strain should occupy the slot").not.toBeNull();
    expect(b.dungeon.floor, "it resumed the dead strain").toBe(1);
  });

  it("every mutating action refuses once the strain is dead", async () => {
    const g = await game();
    g.startRun(0);
    const floorBefore = g.dungeon.floor;
    g.die();
    // Only step and takeTurn used to be guarded, so a dead strain could walk
    // down the column after its run was already in the ledger.
    g.step(g.player.x + 1, g.player.y);
    g.descend();
    g.ascend();
    g.press("wait");
    g.press("descend");
    expect(g.dungeon.floor, "a dead strain moved").toBe(floorBefore);
  });
});

describe("the order form is reachable", () => {
  beforeEach(() => { setupEnv({ calls: 0 }); });

  const game = async () => {
    const { Game } = await import("../src/main.js");
    return new Game({
      width: 400, height: 800, style: {} as CSSStyleDeclaration,
      getContext: () => stubContext({ calls: 0 }),
      addEventListener: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    } as unknown as HTMLCanvasElement);
  };

  it("every offer can be reached by scrolling", async () => {
    // With 69 genes the form runs past 70 rows and only about 15 fit. It used
    // to truncate with "more available than fits", so most of what a run
    // earned credit for was unbuyable.
    const g = await game();
    g.startRun(0);
    g.run.bestiary.push(...bio.MICROBES.map((m) => m.id));
    g.lab.credit = 99999;
    g.showLab = true;
    g.frame(16);
    expect(g.shopMaxScroll, "the form does not scroll at all")
      .toBeGreaterThan(0);

    const total = offers(g.lab, g.known()).length;
    const seen = new Set<string>();
    for (let s = 0; s <= g.shopMaxScroll; s++) {
      g.shopScroll = s;
      g.frame(100 + s);
      for (const r of g.shopRows) seen.add(r.offer.name);
    }
    expect(seen.size, `${String(total - seen.size)} offers unreachable`).toBe(total);
  });

  it("scrolling is clamped to the list", async () => {
    const g = await game();
    g.startRun(0);
    g.showLab = true;
    g.frame(16);
    for (const s of [-50, 1e6, NaN]) {
      g.shopScroll = s;
      expect(() => { g.frame(20); }).not.toThrow();
      expect(g.shopRows.length, `scroll ${String(s)} emptied the form`)
        .toBeGreaterThan(0);
    }
  });

  it("a drag scrolls and does not buy", async () => {
    const g = await game();
    g.startRun(0);
    g.run.bestiary.push(...bio.MICROBES.map((m) => m.id));
    g.lab.credit = 99999;
    g.showLab = true;
    g.frame(16);
    const before = g.lab.stock.length;
    const row = g.shopRows[0];
    expect(row).toBeDefined();
    if (!row) return;
    g.pointerDown(row.box.x + 5, row.box.y + 5);
    g.pointerMove(row.box.x + 5, row.box.y - 90);
    g.pointerUp(row.box.x + 5, row.box.y - 90);
    expect(g.lab.stock.length, "a scroll bought something").toBe(before);
    expect(g.shopScroll, "a drag did not scroll").toBeGreaterThan(0);
  });

  it("a tap on a row still orders", async () => {
    const g = await game();
    g.startRun(0);
    g.run.bestiary.push(...bio.MICROBES.map((m) => m.id));
    g.lab.credit = 99999;
    g.showLab = true;
    g.frame(16);
    const row = g.shopRows.find((r) => r.offer.id.kind === "gene");
    expect(row).toBeDefined();
    if (!row) return;
    g.pointerDown(row.box.x + 5, row.box.y + 5);
    g.pointerUp(row.box.x + 5, row.box.y + 5);
    expect(g.lab.stock.length, "a tap did not order").toBeGreaterThan(0);
  });
});

describe("the plasmid screen cannot break the ring", () => {
  beforeEach(() => { setupEnv({ calls: 0 }); });

  it("spinning and dragging raises no invariant violation", async () => {
    // The reported bug: dragging the ring pushed a part to position 16 on a
    // 16-slot replicon, and the audit fired on the next turn.
    const { Game } = await import("../src/main.js");
    const g = new Game({
      width: 400, height: 800, style: {} as CSSStyleDeclaration,
      getContext: () => stubContext({ calls: 0 }),
      addEventListener: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    } as unknown as HTMLCanvasElement);
    g.startRun(0);
    g.openPlasmid(true);
    g.frame(16);
    for (let i = 0; i < 120; i++) {
      g.genome.rotate(i % 2 === 0 ? 1 : -3);
      g.frame(20 + i);
    }
    g.openPlasmid(false);
    g.press("wait");
    const errors = g.toasts.all().filter((t) => t.level === "error");
    expect(errors.map((t) => t.text)).toEqual([]);
  });
});

describe("travel and explore stop when they should", () => {
  beforeEach(() => { setupEnv({ calls: 0 }); });

  const game = async () => {
    const { Game } = await import("../src/main.js");
    return new Game({
      width: 400, height: 800, style: {} as CSSStyleDeclaration,
      getContext: () => stubContext({ calls: 0 }),
      addEventListener: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    } as unknown as HTMLCanvasElement);
  };

  it("auto-explore moves, then stops on its own", async () => {
    const g = await game();
    g.startRun(0);
    const from = { x: g.player.x, y: g.player.y };
    g.press("explore");
    for (let t = 0; t < 4000; t += 40) g.frame(t);
    expect({ x: g.player.x, y: g.player.y }, "never moved").not.toEqual(from);
    expect(g.exploring, "still exploring after 4000ms").toBe(false);
    expect(g.toasts.all().filter((x) => x.level === "error")).toEqual([]);
  });

  it("pressing explore again halts it immediately", async () => {
    const g = await game();
    g.startRun(0);
    g.press("explore");
    g.frame(50);
    g.press("explore");
    expect(g.exploring).toBe(false);
    expect(g.walk, "the queued path survived the halt").toBeNull();
  });

  it("exploring never leaves the player inside rock", async () => {
    const g = await game();
    g.startRun(0);
    for (let round = 0; round < 6; round++) {
      g.press("explore");
      for (let t = 0; t < 1500; t += 40) g.frame(round * 2000 + t);
      expect(g.level.grid.isFloor(g.player.x, g.player.y),
             `round ${String(round)}`).toBe(true);
    }
    expect(g.toasts.all().filter((x) => x.level === "error")).toEqual([]);
  });

  it("travel to a creature lands exactly one blow and stops", async () => {
    const g = await game();
    g.startRun(0);
    // Put something adjacent and reachable, then travel onto it.
    const m = g.level.mobs.find((x) => x.alive);
    expect(m).toBeDefined();
    if (!m) return;
    g.strikeAfterTravel = m;
    g.walk = { nodes: [{ x: g.player.x, y: g.player.y }, { x: m.x, y: m.y }], i: 0 };
    const before = m.hp;
    for (let t = 0; t < 800; t += 40) g.frame(t);
    expect(m.hp, "no blow landed").toBeLessThan(before);
    expect(g.walk, "travel continued past the strike").toBeNull();
    expect(g.strikeAfterTravel, "the strike target was not cleared").toBeNull();
  });
});

describe("death shows the lysis before the ledger", () => {
  beforeEach(() => { setupEnv({ calls: 0 }); });

  it("the world is still drawn while the cell is coming apart", async () => {
    // The bug: r_drawLysis calls r_draw to paint the world, and r_draw's death
    // branch was only guarded on the INNER condition -- so it fell through and
    // drew the lab instead. The shop appeared instantly and no death was seen.
    const rec = { calls: 0 };
    const { Game } = await import("../src/main.js");
    const g = new Game({
      width: 400, height: 800, style: {} as CSSStyleDeclaration,
      getContext: () => stubContext(rec),
      addEventListener: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    } as unknown as HTMLCanvasElement);
    g.startRun(0);
    g.frame(1000);
    g.die();
    // Early in the sequence the ledger must NOT be up yet.
    g.frame(1100);
    expect(g.closeBox.w, "the lab drew during the still beat").toBe(0);
    // And by the end it must be.
    g.frame(1000 + 2100);
    expect(g.closeBox.w, "the lab never appeared").toBeGreaterThan(0);
  });

  it("the whole sequence draws without error", async () => {
    const { Game } = await import("../src/main.js");
    const g = new Game({
      width: 400, height: 800, style: {} as CSSStyleDeclaration,
      getContext: () => stubContext({ calls: 0 }),
      addEventListener: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    } as unknown as HTMLCanvasElement);
    g.startRun(0);
    g.frame(500);
    g.die();
    for (let t = 500; t < 3200; t += 33) g.frame(t);
    expect(g.toasts.all().filter((x) => x.level === "error")).toEqual([]);
  });
});

describe("auto-explore refuses while something is in view", () => {
  beforeEach(() => { setupEnv({ calls: 0 }); });

  it("is greyed out and will not start", async () => {
    const { Game } = await import("../src/main.js");
    const g = new Game({
      width: 400, height: 800, style: {} as CSSStyleDeclaration,
      getContext: () => stubContext({ calls: 0 }),
      addEventListener: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    } as unknown as HTMLCanvasElement);
    g.startRun(0);
    // Put something right next to the player and light it.
    const m = g.level.mobs[0];
    expect(m).toBeDefined();
    if (!m) return;
    m.x = g.player.x + 1; m.y = g.player.y;
    m.alive = true;
    g.level.sight.visible[m.y * g.level.grid.w + m.x] = 1;
    g.frame(16);

    const btn = g.buttons.find((b) => b.id === "explore");
    expect(btn?.enabled, "explore was not greyed out").toBe(false);
    g.press("explore");
    expect(g.exploring, "explore started with something in view").toBe(false);
  });
});

describe("a damaged cell recovers between fights", () => {
  beforeEach(() => { setupEnv({ calls: 0 }); });

  it("waiting closes a wound, and spends ATP doing it", async () => {
    const { Game } = await import("../src/main.js");
    const g = new Game({
      width: 400, height: 800, style: {} as CSSStyleDeclaration,
      getContext: () => stubContext({ calls: 0 }),
      addEventListener: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    } as unknown as HTMLCanvasElement);
    g.startRun(0);
    // Take one turn first: upkeep recomputes maxhp from vitality, so the
    // starting maxhp is not the one the run actually has.
    g.press("wait");
    g.player.hp = Math.max(g.player.maxhp - 6, 1);
    g.player.atp = g.player.atpMax;
    const hp0 = g.player.hp;
    const atp0 = g.player.atp;
    for (let i = 0; i < 120; i++) g.press("wait");
    expect(g.player.hp, "no repair happened at all").toBeGreaterThan(hp0);
    expect(g.player.atp, "repair was free").toBeLessThan(atp0);
    expect(g.player.hp).toBeLessThanOrEqual(g.player.maxhp);
  });

  it("a starving cell does not repair itself to death", async () => {
    const { Game } = await import("../src/main.js");
    const g = new Game({
      width: 400, height: 800, style: {} as CSSStyleDeclaration,
      getContext: () => stubContext({ calls: 0 }),
      addEventListener: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    } as unknown as HTMLCanvasElement);
    g.startRun(0);
    g.player.hp = 2;
    g.player.atp = 1;
    for (let i = 0; i < 40; i++) g.press("wait");
    expect(g.player.atp, "repair drained the reserve").toBeGreaterThanOrEqual(0);
    expect(g.toasts.all().filter((x) => x.level === "error")).toEqual([]);
  });
});

describe("tapping a creature crosses the gap", () => {
  beforeEach(() => { setupEnv({ calls: 0 }); });

  it("walks all the way there and strikes once, not one square per tap", async () => {
    // The bug: tap() called takeTurn() directly, which is a SINGLE step. A
    // creature four tiles away meant four taps to reach it.
    const { Game } = await import("../src/main.js");
    const g = new Game({
      width: 400, height: 800, style: {} as CSSStyleDeclaration,
      getContext: () => stubContext({ calls: 0 }),
      addEventListener: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    } as unknown as HTMLCanvasElement);
    g.startRun(0);

    // Find somewhere open several tiles away and put a creature on it.
    const m = g.level.mobs.find((x) => x.alive);
    expect(m).toBeDefined();
    if (!m) return;
    // Scan outward properly: the arrival tile is often in a narrow passage,
    // so the four cardinal points at a fixed distance are frequently all rock.
    let placed = false;
    for (let d = 3; d <= 12 && !placed; d++) {
      for (let dx = -d; dx <= d && !placed; dx++) {
        for (const dy of [-d + Math.abs(dx), d - Math.abs(dx)]) {
          const nx = g.player.x + dx, ny = g.player.y + dy;
          if (!g.level.grid.isFloor(nx, ny) || g.dungeon.mobAt(nx, ny)) continue;
          if (!findPath(g.level.grid, { x: g.player.x, y: g.player.y },
                        { x: nx, y: ny })) continue;
          m.x = nx; m.y = ny; placed = true; break;
        }
      }
    }
    expect(placed, "nowhere open to place a target").toBe(true);

    const start = { x: g.player.x, y: g.player.y };
    const hp0 = m.hp;
    g.tap(m.x, m.y);
    expect(g.walk, "no path was built").not.toBeNull();
    for (let t = 0; t < 3000; t += 40) g.frame(t);

    const moved = Math.abs(g.player.x - start.x) + Math.abs(g.player.y - start.y);
    expect(moved, "the player barely moved").toBeGreaterThan(1);
    expect(m.hp, "never landed a blow").toBeLessThan(hp0);
    expect(g.walk, "kept travelling after the strike").toBeNull();
    expect(g.strikeAfterTravel).toBeNull();
  });

  it("a creature in reach is struck immediately without a walk", async () => {
    const { Game } = await import("../src/main.js");
    const g = new Game({
      width: 400, height: 800, style: {} as CSSStyleDeclaration,
      getContext: () => stubContext({ calls: 0 }),
      addEventListener: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    } as unknown as HTMLCanvasElement);
    g.startRun(0);
    const m = g.level.mobs.find((x) => x.alive);
    if (!m) return;
    m.x = g.player.x + 1; m.y = g.player.y;
    const hp0 = m.hp;
    g.tap(m.x, m.y);
    expect(m.hp).toBeLessThan(hp0);
    expect(g.walk).toBeNull();
  });
});

describe("the parts list shows whole parts", () => {
  beforeEach(() => { setupEnv({ calls: 0 }); });

  it("every part in the bin is reachable by scrolling", async () => {
    // The grid showed six four-character tiles. Allele names run to
    // "psychrophilic mtrC of high copy" and a tile showed half of "rrnB T1".
    const { Game } = await import("../src/main.js");
    const g = new Game({
      width: 400, height: 800, style: {} as CSSStyleDeclaration,
      getContext: () => stubContext({ calls: 0 }),
      addEventListener: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    } as unknown as HTMLCanvasElement);
    g.startRun(0);
    g.openPlasmid(true);
    g.frame(16);

    const seen = new Set<number>();
    for (let s = 0; s <= g.binMaxScroll; s++) {
      g.binScroll = s;
      g.frame(100 + s);
      for (const r of g.binRows) seen.add(r.index);
    }
    expect(seen.size, "some parts cannot be reached").toBe(g.genome.bin.length);
  });

  it("scrolling is clamped and survives absurd values", async () => {
    const { Game } = await import("../src/main.js");
    const g = new Game({
      width: 400, height: 800, style: {} as CSSStyleDeclaration,
      getContext: () => stubContext({ calls: 0 }),
      addEventListener: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    } as unknown as HTMLCanvasElement);
    g.startRun(0);
    g.openPlasmid(true);
    for (const s of [-99, 1e7, NaN]) {
      g.binScroll = s;
      expect(() => { g.frame(50); }).not.toThrow();
      expect(g.binRows.length, `scroll ${String(s)} emptied the list`)
        .toBeGreaterThan(0);
    }
    expect(g.toasts.all().filter((x) => x.level === "error")).toEqual([]);
  });
});

describe("the plasmid screen responds", () => {
  beforeEach(() => { setupEnv({ calls: 0 }); });

  const game = async () => {
    const { Game } = await import("../src/main.js");
    return new Game({
      width: 400, height: 800, style: {} as CSSStyleDeclaration,
      getContext: () => stubContext({ calls: 0 }),
      addEventListener: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    } as unknown as HTMLCanvasElement);
  };

  it("a vertical drag on the list scrolls it", async () => {
    // Pressing a row sets dragBin immediately, so the scroll branch could
    // never run -- and releasing the "scroll" outside a slot DISCARDED the
    // part, so trying to scroll destroyed loot.
    const g = await game();
    g.startRun(0);
    g.openPlasmid(true);
    g.frame(16);
    const row = g.binRows[0];
    expect(row).toBeDefined();
    if (!row) return;
    const before = g.genome.bin.length;
    g.pointerDown(row.box.x + 20, row.box.y + 10);
    g.pointerMove(row.box.x + 20, row.box.y - 110);
    g.pointerUp(row.box.x + 20, row.box.y - 110);
    expect(g.binScroll, "the list did not scroll").toBeGreaterThan(0);
    expect(g.genome.bin.length, "scrolling discarded a part").toBe(before);
  });

  it("a downward scroll does not discard either", async () => {
    const g = await game();
    g.startRun(0);
    g.openPlasmid(true);
    g.frame(16);
    g.binScroll = g.binMaxScroll;
    g.frame(40);
    const row = g.binRows[0];
    if (!row) return;
    const before = g.genome.bin.length;
    g.pointerDown(row.box.x + 20, row.box.y + 10);
    g.pointerMove(row.box.x + 20, row.box.y + 160);
    g.pointerUp(row.box.x + 20, row.box.y + 160);
    expect(g.genome.bin.length, "a downward scroll discarded a part").toBe(before);
  });

  it("the close target works even with an item card open", async () => {
    // The card is modal and swallowed the tap, so closing took two presses
    // and looked broken.
    const g = await game();
    g.startRun(0);
    g.openPlasmid(true);
    g.frame(16);
    const row = g.binRows[0];
    if (!row) return;
    g.pointerDown(row.box.x + 20, row.box.y + 10);
    g.pointerUp(row.box.x + 20, row.box.y + 10);      // tap: opens the card
    g.frame(40);

    const cb = g.closeBox;
    g.pointerDown(cb.x + cb.w / 2, cb.y + cb.h / 2);
    g.pointerUp(cb.x + cb.w / 2, cb.y + cb.h / 2);
    expect(g.showPlasmid, "one press should close it").toBe(false);
  });

  it("closes on a plain tap of the X", async () => {
    const g = await game();
    g.startRun(0);
    g.openPlasmid(true);
    g.frame(16);
    const cb = g.closeBox;
    g.pointerDown(cb.x + cb.w / 2, cb.y + cb.h / 2);
    g.pointerUp(cb.x + cb.w / 2, cb.y + cb.h / 2);
    expect(g.showPlasmid).toBe(false);
  });
});

describe("a death is never a dead end", () => {
  beforeEach(() => { setupEnv({ calls: 0 }); });

  const game = async () => {
    const { Game } = await import("../src/main.js");
    return new Game({
      width: 400, height: 800, style: {} as CSSStyleDeclaration,
      getContext: () => stubContext({ calls: 0 }),
      addEventListener: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    } as unknown as HTMLCanvasElement);
  };

  it("an affliction that kills is NAMED, not called 'an affliction'", async () => {
    // tickStatus removes what has expired, so a status that killed you on its
    // last turn was already gone by the time it was read -- every such death
    // reported "killed by an affliction", which you cannot act on.
    const { apply } = await import("../src/status.js");
    const g = await game();
    g.startRun(0);
    apply(g.player.status, "oxidative", 1, 3);
    g.player.hp = 1;
    g.press("wait");
    const said = g.trace.dump();
    expect(said.toLowerCase(), "the cause was not named")
      .not.toMatch(/killed by an affliction/);
    expect(said, "the status name is missing").toMatch(/xidative/);
  });

  it("the recorder captures a whole session in order", async () => {
    const g = await game();
    g.startRun(0);
    for (let i = 0; i < 30; i++) { g.press("wait"); g.frame(i * 40); }
    const all = g.trace.all();
    expect(all.length, "nothing was recorded").toBeGreaterThan(10);
    for (let i = 1; i < all.length; i++) {
      expect(all[i]?.t ?? 0, "events out of order")
        .toBeGreaterThanOrEqual(all[i - 1]?.t ?? 0);
    }
    expect(all.some((e) => e.kind === "input"), "presses were not recorded").toBe(true);
  });

  it("the death record carries what happened at the end", async () => {
    const g = await game();
    g.startRun(0);
    for (let i = 0; i < 6; i++) g.press("wait");
    g.die();
    expect(g.deathRecord?.epitaph.length, "no epitaph was recorded")
      .toBeGreaterThan(0);
    // The death event is pushed by t_die itself, so it is the last thing in
    // the buffer when the record is built.
    expect(g.deathRecord?.epitaph.join(" ")).toContain("death:");
  });

  it("the epitaph survives a reload", async () => {
    const g = await game();
    g.startRun(0);
    g.press("wait");
    g.die();
    const { parseLab } = await import("../src/lab_save.js");
    const round = parseLab(JSON.parse(JSON.stringify(g.lab)));
    expect(round.ledger[0]?.epitaph.length).toBeGreaterThan(0);
  });
});

describe("installing and catabolising from the card", () => {
  beforeEach(() => { setupEnv({ calls: 0 }); });

  const game = async () => {
    const { Game } = await import("../src/main.js");
    return new Game({
      width: 400, height: 800, style: {} as CSSStyleDeclaration,
      getContext: () => stubContext({ calls: 0 }),
      addEventListener: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    } as unknown as HTMLCanvasElement);
  };

  /** Open the card for the first bin row. */
  const openCard = async () => {
    const g = await game();
    g.startRun(0);
    g.openPlasmid(true);
    g.frame(16);
    const row = g.binRows[0];
    if (row) {
      g.pointerDown(row.box.x + 20, row.box.y + 10);
      g.pointerUp(row.box.x + 20, row.box.y + 10);
      g.frame(40);
    }
    return g;
  };

  it("the install button puts the part on the ring", async () => {
    // The ring sits ABOVE the list, so dragging to it is a vertical gesture --
    // and vertical gestures scroll. Drag-to-install was impossible in the only
    // direction the ring is in.
    const g = await openCard();
    expect(g.card, "the card did not open").not.toBeNull();
    const box = g.cardBoxes.install;
    expect(box, "no install button").not.toBeNull();
    if (!box) return;
    const onRing = g.genome.slots.filter((s) => s !== null).length;
    const inBin = g.genome.bin.length;
    g.pointerDown(box.x + box.w / 2, box.y + box.h / 2);
    g.pointerUp(box.x + box.w / 2, box.y + box.h / 2);
    expect(g.genome.slots.filter((s) => s !== null).length).toBe(onRing + 1);
    expect(g.genome.bin.length).toBe(inBin - 1);
  });

  it("catabolise ASKS before it destroys anything", async () => {
    const g = await openCard();
    const eat = g.cardBoxes.eat;
    expect(eat, "no catabolise button").not.toBeNull();
    if (!eat) return;
    const before = g.genome.bin.length;
    g.pointerDown(eat.x + eat.w / 2, eat.y + eat.h / 2);
    g.pointerUp(eat.x + eat.w / 2, eat.y + eat.h / 2);
    expect(g.cardConfirm, "it did not ask").toBe(true);
    expect(g.genome.bin.length, "it destroyed the part without asking")
      .toBe(before);
  });

  it("the confirm is NOT where the eat button was", async () => {
    // A second tap in the same place must never be able to destroy something.
    // "Keep it" deliberately takes the bottom slot the eat button occupied;
    // this asserts the geometry has not drifted since.
    const g = await openCard();
    const eat = g.cardBoxes.eat;
    if (!eat) return;
    const spot = { x: eat.x + eat.w / 2, y: eat.y + eat.h / 2 };
    g.pointerDown(spot.x, spot.y);
    g.pointerUp(spot.x, spot.y);
    g.frame(60);
    const before = g.genome.bin.length;
    g.pointerDown(spot.x, spot.y);        // exactly the same place again
    g.pointerUp(spot.x, spot.y);
    expect(g.genome.bin.length, "double-tapping the same spot ate it")
      .toBe(before);
  });

  it("confirming actually eats it", async () => {
    const g = await openCard();
    const eat = g.cardBoxes.eat;
    if (!eat) return;
    g.pointerDown(eat.x + eat.w / 2, eat.y + eat.h / 2);
    g.pointerUp(eat.x + eat.w / 2, eat.y + eat.h / 2);
    g.frame(60);
    const yes = g.cardBoxes.confirm;
    expect(yes, "no confirm target").not.toBeNull();
    if (!yes) return;
    const before = g.genome.bin.length;
    g.pointerDown(yes.x + yes.w / 2, yes.y + yes.h / 2);
    g.pointerUp(yes.x + yes.w / 2, yes.y + yes.h / 2);
    expect(g.genome.bin.length).toBe(before - 1);
  });

  it("cancelling keeps it", async () => {
    const g = await openCard();
    const eat = g.cardBoxes.eat;
    if (!eat) return;
    g.pointerDown(eat.x + eat.w / 2, eat.y + eat.h / 2);
    g.pointerUp(eat.x + eat.w / 2, eat.y + eat.h / 2);
    g.frame(60);
    const no = g.cardBoxes.cancel;
    if (!no) return;
    const before = g.genome.bin.length;
    g.pointerDown(no.x + no.w / 2, no.y + no.h / 2);
    g.pointerUp(no.x + no.w / 2, no.y + no.h / 2);
    expect(g.genome.bin.length).toBe(before);
    expect(g.cardConfirm).toBe(false);
  });

  it("the origin can be neither installed twice nor eaten", async () => {
    const g = await game();
    g.startRun(0);
    g.genome.bin.push({ kind: "gene", id: "ori", level: 1, mods: [],
                        allele: WILD_TYPE });
    g.openPlasmid(true);
    g.frame(16);
    const row = g.binRows.find((r) => {
      const p = g.genome.bin[r.index];
      return p?.kind === "gene" && p.id === "ori";
    });
    if (!row) return;
    g.pointerDown(row.box.x + 20, row.box.y + 10);
    g.pointerUp(row.box.x + 20, row.box.y + 10);
    g.frame(40);
    expect(g.cardBoxes.eat, "the origin was edible").toBeNull();
  });
});


describe("an installed part can be moved", () => {
  beforeEach(() => { setupEnv({ calls: 0 }); });

  const game = async () => {
    const { Game } = await import("../src/main.js");
    return new Game({
      width: 400, height: 800, style: {} as CSSStyleDeclaration,
      getContext: () => stubContext({ calls: 0 }),
      addEventListener: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    } as unknown as HTMLCanvasElement);
  };

  it("dragging a promoter to another position moves it", async () => {
    const { slotCentre } = await import("../src/plasmid_ui.js");
    const g = await game();
    g.startRun(0);
    g.openPlasmid(true);
    g.frame(16);
    const from = g.genome.slots.findIndex((s) => s?.kind === "promoter");
    expect(from).toBeGreaterThanOrEqual(0);
    const to = g.genome.slots.findIndex((s, k) => s === null && g.genome.usable(k));
    expect(to).toBeGreaterThanOrEqual(0);

    const a = slotCentre(g.ring, from);
    const b = slotCentre(g.ring, to);
    g.pointerDown(a.x, a.y);
    g.pointerMove(b.x, b.y);
    g.pointerUp(b.x, b.y);
    expect(g.genome.at(to)?.kind, "the promoter did not move").toBe("promoter");
    expect(g.genome.at(from)).toBeNull();
  });

  it("every drawn wedge is a position the plasmid actually has", async () => {
    // The ring drew all 24 array positions while pBR322 owns 16, so eight
    // phantom wedges were on screen. Tapping one selected an "empty slot" that
    // could never hold anything -- which is what made an installed promoter
    // look immovable.
    const { slotAt, slotCentre } = await import("../src/plasmid_ui.js");
    const g = await game();
    g.startRun(0);
    g.openPlasmid(true);
    g.frame(16);
    expect(g.ring.used, "the ring is not the replicon's")
      .toBe(g.genome.usableSlots);
    for (let i = 0; i < g.ring.used; i++) {
      const c = slotCentre(g.ring, i);
      expect(slotAt(g.ring, c.x, c.y), `wedge ${String(i)}`).toBe(i);
      expect(g.genome.usable(i), `wedge ${String(i)} is not a real position`)
        .toBe(true);
    }
  });

  it("the ring resizes when the backbone does", async () => {
    const g = await game();
    g.startRun(0);
    g.run.bestiary.push(...bio.MICROBES.map((m) => m.id));
    g.run.deepest = 24;
    g.press("wait");
    g.player.atpMax = 900; g.player.atp = 800;
    g.expand();
    g.openPlasmid(true);
    g.frame(40);
    expect(g.ring.used).toBe(g.genome.usableSlots);
    expect(g.ring.used).toBeGreaterThan(BASE_SLOTS);
  });
});

describe("a mobilisable plasmid survives its host", () => {
  beforeEach(() => { setupEnv({ calls: 0 }); });

  const game = async () => {
    const { Game } = await import("../src/main.js");
    return new Game({
      width: 400, height: 800, style: {} as CSSStyleDeclaration,
      getContext: () => stubContext({ calls: 0 }),
      addEventListener: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    } as unknown as HTMLCanvasElement);
  };

  it("half its genes reach the next strain", async () => {
    // Real: IncQ plasmids transfer themselves into another cell, which is how
    // resistance crosses species. It is the one way anything survives a death.
    const g = await game();
    g.startRun(0);
    g.genome.acquire("mobilisable");
    for (const id of ["mtrC", "omcS", "cymA", "dsrA"] as bio.GeneId[]) {
      const free = g.genome.slots.findIndex((s, k) => s === null && g.genome.usable(k));
      if (free >= 0) {
        g.genome.put(free, { kind: "gene", id, level: 1, mods: [], allele: WILD_TYPE });
      }
    }
    g.die();
    expect(g.lab.stock.length, "nothing was mobilised").toBeGreaterThan(0);
    expect(g.lab.stock.length, "everything survived, which is not the deal")
      .toBeLessThan(4);
  });

  it("a plain backbone loses everything", async () => {
    const g = await game();
    g.startRun(0);

    const free = g.genome.slots.findIndex((s, k) => s === null && g.genome.usable(k));
    if (free >= 0) {
      g.genome.put(free, { kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE });
    }
    g.die();
    expect(g.lab.stock).toEqual([]);
  });

  it("mobilisation cannot overfill the manifest", async () => {
    const g = await game();
    g.startRun(0);
    g.genome.acquire("mobilisable");
    const all = (Object.keys(bio.GENES) as bio.GeneId[]).filter((x) => x !== "ori");
    for (const id of all.slice(0, 20)) {
      const free = g.genome.slots.findIndex((s, k) => s === null && g.genome.usable(k));
      if (free < 0) break;
      g.genome.put(free, { kind: "gene", id, level: 1, mods: [], allele: WILD_TYPE });
    }
    g.die();
    const { stockCap } = await import("../src/lab.js");
    expect(g.lab.stock.length).toBeLessThanOrEqual(stockCap(g.lab.startSites));
    expect(new Set(g.lab.stock).size, "duplicates got in").toBe(g.lab.stock.length);
  });
});

describe("the chromosome is reachable from play", () => {
  beforeEach(() => { setupEnv({ calls: 0 }); });

  const game = async () => {
    const { Game } = await import("../src/main.js");
    return new Game({
      width: 400, height: 800, style: {} as CSSStyleDeclaration,
      getContext: () => stubContext({ calls: 0 }),
      addEventListener: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    } as unknown as HTMLCanvasElement);
  };

  it("the bench offers growth and architecture, and both act", async () => {
    // Built is not wired: this system has been shipped inert once already.
    const g = await game();
    g.startRun(0);
    g.press("research");
    g.frame(20);
    const kinds = new Set(g.researchRows.map((r) => r.kind));
    expect([...kinds], "the bench does not offer growth").toContain("expand");
    expect([...kinds], "the bench does not offer architecture").toContain("trait");

    const before = g.genome.usableSlots;
    g.player.atp = g.player.atpMax;
    const row = g.researchRows.find((r) => r.kind === "expand");
    if (!row) return;
    g.pointerDown(row.box.x + 10, row.box.y + 10);
    g.pointerUp(row.box.x + 10, row.box.y + 10);
    expect(g.genome.usableSlots, "integrating did nothing").toBe(before + 1);
  });

  it("the ATP ceiling grows with the cell", async () => {
    const g = await game();
    g.startRun(0);
    g.press("wait");
    const base = g.player.atpMax;
    g.genome.integrated = 10;
    g.run.bestiary.push(...bio.MICROBES.map((m) => m.id));
    g.run.deepest = 24;
    g.press("wait");
    expect(g.player.atpMax, "the pool did not grow with the cell")
      .toBeGreaterThan(base);
  });

  it("a trait can actually be acquired, and only once", async () => {
    const g = await game();
    g.startRun(0);
    g.genome.integrated = 12;
    g.run.bestiary.push(...bio.MICROBES.map((m) => m.id));
    g.run.deepest = 24;
    g.press("wait");
    g.player.atp = g.player.atpMax;
    const spent = g.player.atp;
    g.acquire("partitioned");
    expect(g.genome.traits.has("partitioned"), "the trait was not acquired").toBe(true);
    expect(g.player.atp, "it was free").toBeLessThan(spent);
    const after = g.player.atp;
    g.acquire("partitioned");
    expect(g.player.atp, "it charged twice for the same trait").toBe(after);
  });

  it("growth and traits survive a reload", async () => {
    const g = await game();
    g.startRun(0);
    g.genome.integrated = 5;
    g.genome.acquire("partitioned");
    g.genome.acquire("runaway");
    g.save();
    const b = await game();
    b.startRun(0);
    expect(b.genome.integrated, "growth was lost").toBe(5);
    expect([...b.genome.traits].sort(), "architecture was lost")
      .toEqual(["partitioned", "runaway"]);
  });

  it("a save from before the chromosome loads without its fields", async () => {
    const { parseSave, SCHEMA } = await import("../src/save.js");
    const s = parseSave({
      version: SCHEMA, depth: 1, floor: 1, seed: 1, px: 5, py: 5, hp: 20, atp: 50,
      ring: [], bin: [], run: {}, settings: {}, heldMods: [], turn: 0, stocked: [],
      replicon: "bac",                      // the field that used to be there
    });
    expect(s?.integrated).toBe(0);
    expect(s?.traits).toEqual([]);
  });

  it("a starting strain can still build a working operon", async () => {
    // Eight positions and the vector uses three. If a promoter, a gene and a
    // terminator do not fit, the opening move is impossible.
    const g = await game();
    g.startRun(0);
    expect(g.genome.free(), "no room to build anything").toBeGreaterThanOrEqual(3);
    // Give it a gene to work with -- assemble builds from the BIN.
    g.genome.stash({ kind: "gene", id: "psbA", level: 1, mods: [], allele: WILD_TYPE });
    const r = g.genome.assemble(["psbA"]);
    expect(r.ok, `cannot lay down one operon: ${r.ok ? "" : r.err}`).toBe(true);
    expect(g.genome.expression("psbA", 1), "it laid down but does not express")
      .toBeGreaterThan(0);
  });
});

describe("a save is two keys but one outcome", () => {
  beforeEach(() => { setupEnv({ calls: 0 }); });

  const mkData = async () => {
    const { parseSave, SCHEMA } = await import("../src/save.js");
    return parseSave({
      version: SCHEMA, depth: 3, floor: 3, seed: 1, px: 5, py: 5, hp: 20, atp: 50,
      ring: [], bin: [], run: {}, settings: {}, heldMods: [], turn: 0,
      stocked: [], integrated: 0, traits: [],
    });
  };

  it("a save the index refuses is rolled back, not left orphaned", async () => {
    // An index without its save shows a slot that will not load; a save
    // without its index is invisible on the splash. Reporting failure is not
    // enough on its own -- the half-written state stays on disk.
    const { saveSlot, loadSlot } = await import("../src/saves.js");
    const data = await mkData();
    expect(data).not.toBeNull();
    if (!data) return;

    const store = new Map<string, string>();
    let failIndex = false;
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (failIndex && k.includes("index")) throw new Error("full");
        store.set(k, v);
      },
      removeItem: (k: string) => { store.delete(k); },
    });

    expect(saveSlot(1, "first", data, 2), "the good write failed").toBe(true);
    const good = JSON.stringify(loadSlot(1));

    failIndex = true;
    expect(saveSlot(1, "second", { ...data, floor: 9 }, 2)).toBe(false);
    expect(JSON.stringify(loadSlot(1)), "the refused save overwrote the old one")
      .toBe(good);
  });

  it("nothing is written at all when the save itself is refused", async () => {
    const { saveSlot, listSlots } = await import("../src/saves.js");
    const data = await mkData();
    if (!data) return;
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string) => {
        if (k.includes("slot")) throw new Error("full");
        store.set(k, "[]");
      },
      removeItem: (k: string) => { store.delete(k); },
    });
    expect(saveSlot(2, "nope", data, 1)).toBe(false);
    expect(listSlots()[2], "an index entry was written for a save that failed")
      .toBeFalsy();
  });

  it("saving does not throw when storage refuses even to be read", async () => {
    const { saveSlot } = await import("../src/saves.js");
    const data = await mkData();
    if (!data) return;
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => { throw new Error("blocked"); },
    });
    expect(() => saveSlot(0, "x", data, 0)).not.toThrow();
    expect(saveSlot(0, "x", data, 0)).toBe(false);
  });

  it("a full quota is reported to the player, once, and play continues", async () => {
    // The whole chain returned void, so every save failed, nothing said so,
    // and the run vanished when the tab closed.
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: () => { throw new Error("QuotaExceededError"); },
      removeItem: (k: string) => { store.delete(k); },
    });
    const { Game } = await import("../src/main.js");
    const g = new Game({
      width: 400, height: 800, style: {} as CSSStyleDeclaration,
      getContext: () => stubContext({ calls: 0 }),
      addEventListener: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    } as unknown as HTMLCanvasElement);
    g.startRun(0);
    for (let i = 0; i < 30; i++) { g.press("wait"); g.frame(i * 40); }

    const warned = g.toasts.all().filter((t) => t.text.toLowerCase().includes("storage"));
    expect(warned.length, "storage failed silently").toBeGreaterThan(0);
    expect(warned.length, `${String(warned.length)} identical warnings is noise`)
      .toBeLessThanOrEqual(1);
    expect(g.dead, "it stopped playing because it could not save").toBe(false);
  });
});

describe("a surplus cassette is a choice, not a refusal", () => {
  beforeEach(() => { setupEnv({ calls: 0 }); });

  const game = async () => {
    const { Game } = await import("../src/main.js");
    return new Game({
      width: 400, height: 800, style: {} as CSSStyleDeclaration,
      getContext: () => stubContext({ calls: 0 }),
      addEventListener: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    } as unknown as HTMLCanvasElement);
  };

  /** Stand on a cassette of a gene whose stack is already full. */
  const setup = async () => {
    const { MAX_STACK } = await import("../src/stack.js");
    const g = await game();
    g.startRun(0);
    g.genome.integrated = 8;
    for (let i = 0; i < MAX_STACK; i++) {
      g.genome.stash({ kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE });
    }
    g.drops.push({ x: g.player.x, y: g.player.y,
                   items: [{ kind: "cassette", gene: "mtrC", allele: WILD_TYPE }] });
    // Arriving on the TILE, not on the level: `enter` is the level transition.
    g.onTile(g.player.x, g.player.y);
    return g;
  };

  it("offers rather than silently refusing", async () => {
    const g = await setup();
    expect(g.offer, "no offer was made").not.toBeNull();
    g.frame(40);
    expect(g.offerBoxes, "the offer has no targets, so it is unanswerable")
      .not.toBeNull();
  });

  it("catabolising it pays, and takes it off the floor", async () => {
    const g = await setup();
    g.frame(40);
    g.player.hp = 1;
    const boxes = g.offerBoxes;
    expect(boxes).not.toBeNull();
    if (!boxes) return;
    g.pointerDown(boxes.eat.x + 4, boxes.eat.y + 4);
    g.pointerUp(boxes.eat.x + 4, boxes.eat.y + 4);
    expect(g.player.hp, "eating it healed nothing").toBeGreaterThan(1);
    expect(g.offer, "the offer stayed open").toBeNull();
    const here = g.drops.find((d) => d.x === g.player.x && d.y === g.player.y);
    expect(here?.items.some((i) => i.kind === "cassette"),
           "it was eaten but is still lying there").toBeFalsy();
  });

  it("leaving it keeps it on the floor and closes the prompt", async () => {
    const g = await setup();
    g.frame(40);
    const boxes = g.offerBoxes;
    if (!boxes) return;
    g.pointerDown(boxes.leave.x + 4, boxes.leave.y + 4);
    g.pointerUp(boxes.leave.x + 4, boxes.leave.y + 4);
    expect(g.offer).toBeNull();
    const here = g.drops.find((d) => d.x === g.player.x && d.y === g.player.y);
    expect(here?.items.length, "leaving it destroyed it").toBeGreaterThan(0);
  });

  it("a full BIN is still a plain refusal, not an offer", async () => {
    // The distinction matters: a full stack means "you have enough of this",
    // which is a choice. A full bin means "no room", which is not.
    const g = await game();
    g.startRun(0);
    while (g.genome.stash({ kind: "terminator", id: "rrnbt1" }).ok) { /* fill */ }
    g.drops.push({ x: g.player.x, y: g.player.y,
                   items: [{ kind: "cassette", gene: "psbA", allele: WILD_TYPE }] });
    g.onTile(g.player.x, g.player.y);
    expect(g.offer, "a full bin produced an offer").toBeNull();
  });
});

describe("state that should persist, does", () => {
  beforeEach(() => { setupEnv({ calls: 0 }); });

  /**
   * Fields deliberately NOT persisted, with the reason.
   *
   * Adding a system means four coordinated edits: a field on Game, a delegate,
   * a line in the save writer, a line in `applySave`. The last has been
   * forgotten three times, and each time the symptom was an inventory or a
   * setting that silently reset. This test makes the omission explicit: a new
   * field either round-trips, or it is listed here with a reason.
   */
  const TRANSIENT: Record<string, string> = {
    // Rebuilt on load.
    level: "regenerated from the seed", dungeon: "rebuilt from depth and seed",
    genome: "rebuilt from the ring", ctx: "the canvas context",
    canvas: "the canvas", buttons: "laid out per frame",
    // Presentation only.
    fx: "in-flight effects", toasts: "transient messages", trace: "flight recorder",
    ring: "geometry, recomputed per frame", bin: "geometry, recomputed per frame",
    view: "camera, recomputed per frame", boxes: "hit boxes, per frame",
    binRows: "hit boxes, per frame", shopRows: "hit boxes, per frame",
    researchRows: "hit boxes, per frame", dropBoxes: "hit boxes, per frame",
    closeBox: "hit box, per frame", cardBoxes: "hit boxes, per frame",
    offerBoxes: "hit boxes, per frame", miniBox: "layout, per frame",
    classRows: "hit boxes, per frame",
    pickingClassFor: "a choice in progress, before anything is created",
    // Momentary interaction state: meaningless after a reload.
    gesture: "a pointer gesture in progress", gestureBtn: "ditto",
    dragFrom: "a drag in progress", dragBin: "ditto", dragXY: "ditto",
    binFrom: "ditto", binAnchor: "ditto", shopFrom: "ditto", shopAnchor: "ditto",
    shopMoved: "ditto", panFrom: "ditto", panMoved: "ditto", pinching: "ditto",
    spinFrom: "a spin in progress", walk: "a path being walked",
    path: "a computed path", cursor: "the tap target", target: "the current quarry",
    strikeAfterTravel: "a pending strike", chaseLegs: "a chase in progress",
    exploring: "auto-explore in progress", offer: "an unanswered prompt",
    card: "an open card", cardIndex: "ditto", cardConfirm: "ditto",
    openDrop: "an open container", selected: "the selected slot",
    // Screens: you come back to the world, not to a menu.
    showPlasmid: "a screen", showMap: "a screen", showLab: "a screen",
    showNotes: "a screen", showResearch: "a screen", showSplash: "a screen",
    showHelp: "a screen", started: "set by startRun", dead: "a run outcome",
    // Timing and derived.
    now: "wall clock", last: "wall clock", autoAt: "wall clock",
    deathAt: "wall clock", lysisAt: "wall clock", clock: "turn counter, saved separately",
    storageWarned: "a warning already given", repairDebt: "sub-hp accumulator",
    repairSpend: "last turn only; recomputed every upkeep",
    lastAttacker: "for the obituary only", deathRecord: "written to the lab",
    inRoom: "derived from position", drops: "part of the level",
    lab: "its own storage key", slot: "which slot this IS",
    runName: "written with the slot", seed: "saved as part of the run",
    binScroll: "a scroll position", binMaxScroll: "derived",
    shopScroll: "a scroll position", shopMaxScroll: "derived",
    mapScale: "a view setting", zoom: "a view setting",
    // Mirrors settings.autoAttack, which IS saved. Kept as a field because the
    // turn loop reads it every frame.
    autoAttack: "mirrors settings.autoAttack",
    // Presentation and derived state with no meaning after a reload.
    log: "the message log", slotBoxes: "hit boxes, per frame",
    spinStart: "a spin in progress", barH: "layout, per frame",
    logH: "layout, per frame", turnSeed: "derived from the turn",
    exporting: "an export in flight", spotted: "who has been noticed this run",
    researchPick: "a bench selection", packets: "in-flight effects",
    clouds: "in-flight effects", insetCache: "a cached measurement",
  };

  it("every field on Game either round-trips or is listed as transient", async () => {
    const { Game } = await import("../src/main.js");
    const mk = () => new Game({
      width: 400, height: 800, style: {} as CSSStyleDeclaration,
      getContext: () => stubContext({ calls: 0 }),
      addEventListener: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    } as unknown as HTMLCanvasElement);

    const g = mk();
    g.startRun(0);
    const fields = Object.keys(g) as (keyof typeof g)[];
    const unexplained = fields.filter(
      (f) => !(f in TRANSIENT) && typeof g[f] !== "function");

    // Anything not listed must be something the save actually carries.
    const { SCHEMA } = await import("../src/save.js");
    void SCHEMA;
    const carried = ["player", "run", "settings", "mods", "won", "turn",
                     "strainClass"];
    const missing = unexplained.filter((f) => !carried.includes(f));
    expect(missing,
           "new field(s) on Game with no persistence decision recorded -- add "
           + "them to the save, or to TRANSIENT with a reason")
      .toEqual([]);
  });

  it("the things that DO persist actually survive a reload", async () => {
    const { Game } = await import("../src/main.js");
    const mk = () => new Game({
      width: 400, height: 800, style: {} as CSSStyleDeclaration,
      getContext: () => stubContext({ calls: 0 }),
      addEventListener: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    } as unknown as HTMLCanvasElement);

    const a = mk();
    a.startRun(0);
    a.genome.integrated = 5;
    (a.genome.traits as Set<"partitioned">).add("partitioned");
    a.genome.stash({ kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE });
    a.genome.stash({ kind: "gene", id: "mtrC", level: 1, mods: [], allele: WILD_TYPE });
    a.settings = { ...a.settings, diagonal: !a.settings.diagonal };
    a.autoAttack = true;
    a.settings = { ...a.settings, autoAttack: true };
    a.player.hp = 7;
    a.save();

    const b = mk();
    b.startRun(0);
    expect(b.genome.integrated, "chromosome growth").toBe(5);
    expect([...b.genome.traits], "architecture").toEqual(["partitioned"]);
    expect(b.settings.diagonal, "settings").toBe(a.settings.diagonal);
    expect(b.player.hp, "hp").toBe(7);
    expect(b.autoAttack, "auto-attack silently reset").toBe(true);
    const row = b.genome.bin.find((x) => x.kind === "gene" && x.id === "mtrC");
    expect(row, "the stashed gene").toBeDefined();
  });
});

describe("a full descent holds together", () => {
  beforeEach(() => { setupEnv({ calls: 0 }); });

  it("survives being driven to the bottom", async () => {
    // The release check. Every floor generated, entered, drawn and played --
    // twenty-four strata, each with its own generator, palette, hazards and
    // organisms. A bug in the deepest stratum is not something a unit test
    // finds, because nothing else ever goes there.
    const { Game } = await import("../src/main.js");
    const { MAX_FLOOR } = await import("../src/dungeon.js");
    const g = new Game({
      width: 400, height: 800, style: {} as CSSStyleDeclaration,
      getContext: () => stubContext({ calls: 0 }),
      addEventListener: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    } as unknown as HTMLCanvasElement);
    g.startRun(0);

    let t = 0;
    for (let floor = 1; floor <= MAX_FLOOR; floor++) {
      for (let i = 0; i < 40; i++) {
        // Topped up EVERY turn, not once per floor: forty turns among the
        // deep fauna kills a strain, and this is about the code holding up
        // rather than about surviving.
        g.player.hp = g.player.maxhp;
        g.player.atp = g.player.atpMax;
        g.press("wait");
        g.frame((t += 40));
      }
      g.openPlasmid(true);
      g.frame((t += 40));
      g.openPlasmid(false);
      // Dying is not a failure of this test. A lytic phage kills outright
      // regardless of hp, and reaching the deep strata and being lysed is the
      // code WORKING. What must hold is that every floor generates, enters,
      // plays and draws without an error -- so a dead strain is replaced and
      // the descent continues.
      if (g.dead) {
        g.dead = false;
        g.player.status.length = 0;
      }
      if (floor < MAX_FLOOR) {
        const r = g.dungeon.descend();
        expect("err" in r ? r.err : "", `could not leave floor ${String(floor)}`)
          .toBe("");
        if (!("err" in r)) g.enter(r.level, r.arrive);
      }
    }
    expect(g.dungeon.floor, "did not reach the bottom").toBe(MAX_FLOOR);
    expect(g.toasts.all().filter((x) => x.level === "error"),
           "an error surfaced during the descent").toEqual([]);
  });

  it("every stratum draws without an error", async () => {
    const { Game } = await import("../src/main.js");
    const { MAX_FLOOR } = await import("../src/dungeon.js");
    const g = new Game({
      width: 400, height: 800, style: {} as CSSStyleDeclaration,
      getContext: () => stubContext({ calls: 0 }),
      addEventListener: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    } as unknown as HTMLCanvasElement);
    g.startRun(1);
    for (let floor = 1; floor <= MAX_FLOOR; floor++) {
      g.enter(g.dungeon.level(floor), { x: g.player.x, y: g.player.y });
      for (const screen of ["", "plasmid", "map", "notes", "research"]) {
        if (screen !== "") g.press(screen);
        expect(() => { g.frame(floor * 1000 + screen.length); })
          .not.toThrow();
        if (screen !== "") g.press(screen);
      }
    }
    expect(g.toasts.all().filter((x) => x.level === "error")).toEqual([]);
  });
});

describe("auto-explore stops for threats, not for scenery", () => {
  beforeEach(() => { setupEnv({ calls: 0 }); });

  const game = async () => {
    const { Game } = await import("../src/main.js");
    return new Game({
      width: 400, height: 800, style: {} as CSSStyleDeclaration,
      getContext: () => stubContext({ calls: 0 }),
      addEventListener: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    } as unknown as HTMLCanvasElement);
  };

  /** Put one organism a few tiles away, in plain sight. */
  const withNeighbour = async (over: Record<string, unknown>) => {
    const g = await game();
    g.startRun(0);
    const proto = g.level.mobs[0];
    if (!proto) return null;
    g.level.mobs.length = 0;
    g.level.mobs.push({ ...proto, ...over, alive: true, hp: 9,
                        x: g.player.x + 2, y: g.player.y,
                        ax: g.player.x + 2, ay: g.player.y });
    g.look();
    return g;
  };

  it("a drifting alga does not halt it", async () => {
    // The oxic column is five harmless drifters to one predator. Halting for
    // each one made auto-explore useless on the first stratum, and the message
    // named something that was already off the edge of the screen.
    const g = await withNeighbour({ behaviour: "drift", atk: 0 });
    if (!g) return;
    expect(g.visibleHostile(), "a harmless drifter counted as a threat")
      .toBeNull();
  });

  it("a pursuer does halt it, wherever it is", async () => {
    const g = await withNeighbour({ behaviour: "chase", atk: 3 });
    if (!g) return;
    expect(g.visibleHostile(), "a chaser did not count as a threat")
      .not.toBeNull();
  });

  it("something harmless but ADJACENT still halts it", async () => {
    // A sessile thing with an attack is no threat across the room and every
    // threat next to you.
    const g = await game();
    g.startRun(0);
    const proto = g.level.mobs[0];
    if (!proto) return;
    g.level.mobs.length = 0;
    g.level.mobs.push({ ...proto, behaviour: "sessile", atk: 4, alive: true,
                        hp: 9, x: g.player.x + 1, y: g.player.y,
                        ax: g.player.x + 1, ay: g.player.y });
    g.look();
    expect(g.visibleHostile(), "an adjacent striker was ignored").not.toBeNull();
  });

  it("a sessile thing across the room does not", async () => {
    const g = await game();
    g.startRun(0);
    const proto = g.level.mobs[0];
    if (!proto) return;
    let spot: { x: number; y: number } | null = null;
    for (let d = 4; d <= 7 && !spot; d++) {
      if (g.level.grid.isFloor(g.player.x + d, g.player.y)) {
        spot = { x: g.player.x + d, y: g.player.y };
      }
    }
    if (!spot) return;
    g.level.mobs.length = 0;
    g.level.mobs.push({ ...proto, behaviour: "sessile", atk: 4, alive: true,
                        hp: 9, x: spot.x, y: spot.y, ax: spot.x, ay: spot.y });
    g.look();
    expect(g.visibleHostile(), "a distant sessile organism halted exploring")
      .toBeNull();
  });
});

describe("killing advances the strain", () => {
  beforeEach(() => { setupEnv({ calls: 0 }); });

  it("a kill increments the counter and survives a reload", async () => {
    const { Game } = await import("../src/main.js");
    const mk = () => new Game({
      width: 400, height: 800, style: {} as CSSStyleDeclaration,
      getContext: () => stubContext({ calls: 0 }),
      addEventListener: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    } as unknown as HTMLCanvasElement);

    const g = mk();
    g.startRun(0);
    expect(g.run.killed).toBe(0);
    const m = g.level.mobs.find((x) => x.alive);
    expect(m).toBeDefined();
    if (!m) return;
    m.x = g.player.x + 1;
    m.y = g.player.y;
    m.hp = 1;
    g.attack(m);
    expect(m.alive, "the fixture did not kill it").toBe(false);
    expect(g.run.killed, "the kill was not counted").toBe(1);

    g.save();
    const b = mk();
    b.startRun(0);
    expect(b.run.killed, "the kill count did not survive a reload").toBe(1);
  });

  it("an old save without the counter loads as zero, not NaN", async () => {
    const { parseSave, SCHEMA } = await import("../src/save.js");
    const s = parseSave({
      version: SCHEMA, depth: 1, floor: 1, seed: 1, px: 5, py: 5, hp: 20, atp: 50,
      ring: [], bin: [], settings: {}, heldMods: [], turn: 0, stocked: [],
      integrated: 0, traits: [],
      run: { deepest: 4, deaths: 1, bestiary: [], library: [] },
    });
    expect(s?.run.killed, "a lineage predating the counter broke the bar").toBe(0);
  });
});

describe("every way you kill something counts", () => {
  beforeEach(() => { setupEnv({ calls: 0 }); });

  const game = async () => {
    const { Game } = await import("../src/main.js");
    return new Game({
      width: 400, height: 800, style: {} as CSSStyleDeclaration,
      getContext: () => stubContext({ calls: 0 }),
      addEventListener: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    } as unknown as HTMLCanvasElement);
  };

  it("a kill by a status the player applied counts", async () => {
    // It died inside combat.ts, which is pure and has no run to write to, so
    // nothing outside ever knew. A build that wins by poisoning things earned
    // no adaptation from any of its kills.
    const { apply } = await import("../src/status.js");
    const g = await game();
    g.startRun(0);
    const m = g.level.mobs.find((x) => x.alive);
    if (!m) return;
    m.hp = 1;
    apply(m.status, "oxidative", 3, 5);
    const before = g.run.killed;
    for (let i = 0; i < 6 && m.alive; i++) g.mobTurn();
    expect(m.alive, "the fixture did not kill it").toBe(false);
    expect(g.run.killed, "a status kill was not counted").toBeGreaterThan(before);
  });

  // A test for the aura path was written and REMOVED: it drove the counter by
  // hand rather than the aura, so it asserted 1 === 1. Building a genome that
  // actually emits H2S is the only honest version and it belongs with the
  // other genome fixtures, not here.

  it("the counter never counts the same corpse twice", async () => {
    const g = await game();
    g.startRun(0);
    const m = g.level.mobs.find((x) => x.alive);
    if (!m) return;
    m.x = g.player.x + 1;
    m.y = g.player.y;
    m.hp = 1;
    g.attack(m);
    const once = g.run.killed;
    for (let i = 0; i < 10; i++) g.mobTurn();
    expect(g.run.killed, "a dead mob kept being counted").toBe(once);
  });
});

describe("a kill costs a turn and nothing more", () => {
  beforeEach(() => { setupEnv({ calls: 0 }); });

  it("killing an isolated mob does no damage to the player", async () => {
    // Reported as "there is always damage after an enemy is killed". There is
    // not: attacking spends a turn and every OTHER mob acts on it, which is
    // the ordinary roguelike exchange. With nothing else on the floor, a kill
    // costs nothing.
    //
    // Two false leads worth recording. A freshly constructed Game has a stale
    // `maxhp` -- it is derived from the genome and corrected on the first
    // upkeep -- so an unsettled fixture shows 30 -> 20 and looks like damage.
    // And `lastAttacker` persists from earlier turns, so reading it after an
    // action attributes an old hit to a new one.
    const { Game } = await import("../src/main.js");
    const g = new Game({
      width: 400, height: 800, style: {} as CSSStyleDeclaration,
      getContext: () => stubContext({ calls: 0 }),
      addEventListener: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    } as unknown as HTMLCanvasElement);
    g.startRun(0);
    const proto = g.level.mobs.find((x) => x.alive);
    if (!proto) return;
    for (let i = 0; i < 3; i++) g.press("wait");     // settle maxhp

    g.level.mobs.length = 0;
    g.level.mobs.push({ ...proto, alive: true, hp: 1,
                        x: g.player.x + 1, y: g.player.y,
                        ax: g.player.x + 1, ay: g.player.y });
    g.player.hp = g.player.maxhp;
    g.lastAttacker = null;
    const before = g.player.hp;
    g.attack(g.level.mobs[0] as never);

    expect(g.level.mobs[0]?.alive, "the fixture did not kill it").toBe(false);
    expect(g.player.hp, "a solo kill cost hp").toBe(before);
    expect(g.lastAttacker, "something attacked that should not have").toBeNull();
  });

  it("maxhp does not drift, so hp is never silently clamped", async () => {
    // When vitality changes, `maxhp` follows and hp is clamped to it -- with
    // no message. If that oscillated it would read as a steady unexplained
    // drain. Measured over 400 turns with a photosystem running: one value,
    // zero drops.
    const { Game } = await import("../src/main.js");
    const g = new Game({
      width: 400, height: 800, style: {} as CSSStyleDeclaration,
      getContext: () => stubContext({ calls: 0 }),
      addEventListener: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    } as unknown as HTMLCanvasElement);
    g.startRun(0);
    g.genome.stash({ kind: "gene", id: "psbA", level: 1, mods: [], allele: WILD_TYPE });
    g.genome.assemble(["psbA"]);
    let drops = 0, prev = -1;
    for (let i = 0; i < 200; i++) {
      g.press("wait");
      if (prev >= 0 && g.player.maxhp < prev) drops++;
      prev = g.player.maxhp;
    }
    expect(drops, "maxhp fell during ordinary play, clamping hp silently").toBe(0);
  });
});

describe("a class is chosen once, before inoculation", () => {
  beforeEach(() => { setupEnv({ calls: 0 }); });

  const game = async () => {
    const { Game } = await import("../src/main.js");
    return new Game({
      width: 400, height: 800, style: {} as CSSStyleDeclaration,
      getContext: () => stubContext({ calls: 0 }),
      addEventListener: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    } as unknown as HTMLCanvasElement);
  };

  it("an empty slot asks; an occupied one resumes without asking", async () => {
    const g = await game();
    g.frame(16);
    const slot = g.slotBoxes[0];
    expect(slot, "no slots drawn").toBeDefined();
    if (!slot) return;

    g.pointerDown(slot.x + 10, slot.y + 10);
    g.pointerUp(slot.x + 10, slot.y + 10);
    expect(g.pickingClassFor, "an empty slot started a run without asking")
      .toBe(0);
    expect(g.started, "it started the run anyway").toBe(false);

    // Choose one.
    g.frame(40);
    const row = g.classRows[2];
    expect(row, "the picker drew no classes").toBeDefined();
    if (!row) return;
    g.pointerDown(row.box.x + 10, row.box.y + 10);
    g.pointerUp(row.box.x + 10, row.box.y + 10);
    expect(g.started, "choosing a class did not start the run").toBe(true);
    expect(g.strainClass, "the choice was not applied").toBe(row.id);
    expect(g.pickingClassFor).toBeNull();

    // Now the slot is occupied: tapping it must RESUME, not re-ask. The class
    // is fixed for the life of the strain and offering a choice that cannot be
    // honoured is worse than offering none.
    const h = await game();
    h.frame(16);
    const s2 = h.slotBoxes[0];
    if (!s2) return;
    h.pointerDown(s2.x + 10, s2.y + 10);
    h.pointerUp(s2.x + 10, s2.y + 10);
    expect(h.pickingClassFor, "an occupied slot asked again").toBeNull();
    expect(h.started).toBe(true);
  });

  it("the class it started with is the class it has after a reload", async () => {
    const g = await game();
    g.startRun(0, "methanogen");
    expect(g.strainClass).toBe("methanogen");
    expect(g.genome.has("mcrA"), "its opening operon was not laid down").toBe(true);
    g.save();

    const b = await game();
    b.startRun(0);
    expect(b.strainClass, "the class did not survive a reload").toBe("methanogen");
  });

  it("every class starts with room left to build", async () => {
    const { CLASS_IDS } = await import("../src/classes.js");
    // A slot PER class. Reusing slot 0 meant the second iteration found the
    // first one's save and resumed it -- so the class was never applied and
    // the failure looked like a broken operon rather than a broken fixture.
    for (const [i, id] of CLASS_IDS.entries()) {
      const g = await game();
      g.startRun(i, id);
      expect(g.genome.free(), `${id} has nowhere to build`)
        .toBeGreaterThanOrEqual(2);
      // And its opening is RUNNING, not sitting in the bin.
      const { CLASSES } = await import("../src/classes.js");
      for (const gene of CLASSES[id].genes) {
        expect(g.genome.has(gene), `${id} left ${gene} uninstalled`).toBe(true);
      }
    }
  });
});

describe("the ATP readout accounts for everything that spends it", () => {
  beforeEach(() => { setupEnv({ calls: 0 }); });

  it("a damaged cell showing a positive balance can still be draining", async () => {
    // Reported as "still losing ATP despite +0.1". The displayed balance is
    // METABOLIC -- gain minus expression -- and repair is spent on top of it.
    // With a chaperone suite running, repair costs about 1.1 ATP a turn, so a
    // cell reading +0.1 was really at about -1.0 and nothing said so.
    const { Game } = await import("../src/main.js");
    const g = new Game({
      width: 400, height: 800, style: {} as CSSStyleDeclaration,
      getContext: () => stubContext({ calls: 0 }),
      addEventListener: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    } as unknown as HTMLCanvasElement);
    g.startRun(0);
    for (let i = 0; i < 3; i++) g.press("wait");

    g.player.hp = Math.max(g.player.maxhp - 8, 1);
    const atp0 = g.player.atp;
    g.press("wait");

    expect(g.repairSpend, "repair reported no cost while healing")
      .toBeGreaterThan(0);
    // The pool must move by exactly the sum the game claims, within rounding.
    const claimed = g.genome.atpBalance(g.dungeon.depth) - g.repairSpend;
    const actual = g.player.atp - atp0;
    expect(Math.abs(actual - claimed),
           `the pool moved ${actual.toFixed(2)} but the sum says `
           + claimed.toFixed(2))
      .toBeLessThan(0.35);
  });

  it("a full-health cell pays nothing for repair", async () => {
    const { Game } = await import("../src/main.js");
    const g = new Game({
      width: 400, height: 800, style: {} as CSSStyleDeclaration,
      getContext: () => stubContext({ calls: 0 }),
      addEventListener: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    } as unknown as HTMLCanvasElement);
    g.startRun(0);
    g.press("wait");
    g.player.hp = g.player.maxhp;
    g.press("wait");
    expect(g.repairSpend, "an undamaged cell was charged for repair").toBe(0);
  });

  it("a draining turn is written to the log", async () => {
    // The recorder tracked everything that HITS you and nothing that DRAINS
    // you, so "where is my ATP going" was unanswerable from the flight log.
    //
    // Driven through `upkeepRepair` directly rather than by building a cell
    // that loses money. Three attempts at constructing one all came out
    // POSITIVE -- the economy is generous once anything is expressed -- and a
    // fixture that cannot reach the state under test is not a test of it.
    const { upkeepRepair } = await import("../src/repair_turn.js");
    const { Game } = await import("../src/main.js");
    const g = new Game({
      width: 400, height: 800, style: {} as CSSStyleDeclaration,
      getContext: () => stubContext({ calls: 0 }),
      addEventListener: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    } as unknown as HTMLCanvasElement);
    g.startRun(0);
    g.press("wait");
    g.player.hp = Math.max(g.player.maxhp - 10, 1);

    // A turn where metabolism made almost nothing.
    upkeepRepair(g, g.dungeon.depth, 0.1, 0.0);
    const lines = g.trace.all().filter((e) => e.kind === "atp");
    expect(lines.length, "nothing was logged while the pool drained")
      .toBeGreaterThan(0);
    const l = lines[lines.length - 1]?.what ?? "";
    for (const part of ["gain", "expression", "repair"]) {
      expect(l.includes(part), `the log line omits ${part}: "${l}"`).toBe(true);
    }
  });

  it("a turn that is NOT draining writes nothing", async () => {
    // A line every turn would fill the 400-entry ring in seven minutes and
    // push out everything else in it.
    const { upkeepRepair } = await import("../src/repair_turn.js");
    const { Game } = await import("../src/main.js");
    const g = new Game({
      width: 400, height: 800, style: {} as CSSStyleDeclaration,
      getContext: () => stubContext({ calls: 0 }),
      addEventListener: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    } as unknown as HTMLCanvasElement);
    g.startRun(0);
    g.press("wait");
    g.player.hp = Math.max(g.player.maxhp - 10, 1);
    const before = g.trace.all().filter((e) => e.kind === "atp").length;
    upkeepRepair(g, g.dungeon.depth, 40, 0);      // comfortably positive
    expect(g.trace.all().filter((e) => e.kind === "atp").length,
           "a healthy turn was logged").toBe(before);
  });

});
