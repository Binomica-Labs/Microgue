import { SLOTS } from "../src/plasmid.js";
import * as bio from "../src/biology.js";
import { availableAt } from "../src/replicon.js";
import { offers } from "../src/lab.js";
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
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  });
  vi.stubGlobal("navigator", {});
  vi.stubGlobal("HTMLCanvasElement", function Stub() { /* marker */ });
  vi.stubGlobal("Path2D", class { moveTo(): void { /* */ } lineTo(): void { /* */ }
    arc(): void { /* */ } closePath(): void { /* */ } });
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

  it("a better replicon becomes reachable and subcloning moves onto it", async () => {
    const { Game } = await import("../src/main.js");
    const g = new Game(canvas());
    g.startRun(0);
    g.run.bestiary.push(...bio.MICROBES.map((m) => m.id));
    g.run.deepest = 24;
    g.press("wait");
    expect(availableAt(g.genome.strain).map((r) => r.id)).toContain("bac");

    g.player.atpMax = 500;
    g.player.atp = 400;
    const before = g.genome.usableSlots;
    g.subclone("bac");
    expect(g.genome.replicon, "subcloning did nothing").toBe("bac");
    expect(g.genome.usableSlots, "a BAC should give more room")
      .toBeGreaterThan(before);
    expect(g.player.atp, "subcloning should cost").toBeLessThan(400);
  });

  it("subcloning onto a smaller backbone strands nothing", async () => {
    const { Game } = await import("../src/main.js");
    const g = new Game(canvas());
    g.startRun(0);
    g.run.bestiary.push(...bio.MICROBES.map((m) => m.id));
    g.run.deepest = 24;
    g.press("wait");
    g.player.atpMax = 900; g.player.atp = 800;
    g.subclone("bac");
    // Fill the big backbone, then move to the small one.
    for (let i = 0; i < g.genome.usableSlots; i++) {
      if (g.genome.at(i) === null) g.genome.put(i, { kind: "terminator", id: "rrnbt1" });
    }
    g.subclone("puc");
    expect(g.genome.replicon).toBe("puc");
    for (let i = 0; i < g.genome.slots.length; i++) {
      if (!g.genome.usable(i)) {
        expect(g.genome.at(i), `a part was stranded at ${String(i)}`).toBeNull();
      }
    }
    expect(g.toasts.all().filter((t) => t.level === "error")).toEqual([]);
  });

  it("subcloning is refused without the strain or the ATP", async () => {
    const { Game } = await import("../src/main.js");
    const g = new Game(canvas());
    g.startRun(0);
    g.subclone("bac");                       // strain 1: locked
    expect(g.genome.replicon).not.toBe("bac");
    g.player.atp = 0;
    g.subclone("psc101");                    // unlocked, but no ATP
    expect(g.genome.replicon).not.toBe("psc101");
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

  it("an ordered backbone and strain level apply to the next strain", async () => {
    const { Game } = await import("../src/main.js");
    const a = new Game(canvas2());
    a.startRun(0);
    a.lab.credit = 9000;
    for (const o of offers(a.lab, [])) {
      if (o.id.kind === "replicon" && o.id.id === "puc") a.order(o);
      if (o.id.kind === "strain") a.order(o);
    }
    expect(a.lab.startReplicon).toBe("puc");
    expect(a.lab.startStrain).toBeGreaterThan(1);

    const b = new Game(canvas2());
    b.startRun(3);
    expect(b.genome.replicon).toBe("puc");
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
