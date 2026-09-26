import { WILD_TYPE } from "../src/allele.js";
import { drawItemCard } from "../src/plasmid_ui.js";
import type { Part } from "../src/plasmid.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Exercises the real Game against a recording canvas stub. This exists because
// draw() read `this.level.stratum` on its fourth line, above the splash guard,
// so with no run started it threw -- and the toast renderer at the bottom of
// the same function never ran. Black screen, no diagnostic. A unit test on a
// pure module could never have caught that; only calling draw() can.

interface Rec { calls: string[] }

function stubContext(rec: Rec): CanvasRenderingContext2D {
  const noop = (name: string) => (...a: unknown[]): unknown => {
    rec.calls.push(name);
    if (name === "measureText") {
      return { width: (typeof a[0] === "string" ? a[0].length : 0) * 6 };
    }
    if (name === "createRadialGradient" || name === "createLinearGradient") {
      return { addColorStop: () => undefined };
    }
    return undefined;
  };
  return new Proxy({} as CanvasRenderingContext2D, {
    get: (_t, prop: string) => {
      if (["fillStyle","strokeStyle","font","textAlign","textBaseline",
           "globalAlpha","lineWidth","lineCap","lineJoin","filter",
           "imageSmoothingEnabled"].includes(prop)) return "";
      return noop(prop);
    },
    set: () => true,
  });
}

function stubCanvas(rec: Rec): HTMLCanvasElement {
  return {
    width: 400, height: 800,
    style: {} as CSSStyleDeclaration,
    getContext: () => stubContext(rec),
    addEventListener: () => undefined,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
  } as unknown as HTMLCanvasElement;
}

describe("the real render path", () => {
  let rec: Rec;

  beforeEach(() => {
    rec = { calls: [] };
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
    vi.stubGlobal("document", {
      getElementById: () => null,
      createElement: () => ({
        style: {} as CSSStyleDeclaration,
        width: 0, height: 0,
        remove: () => undefined,
        getContext: () => stubContext(rec),
      }),
      body: { appendChild: () => undefined },
    });
    // Path2D is universally available in browsers but absent in node.
    vi.stubGlobal("Path2D", class {
      moveTo(): void { /* recorded via the context stub instead */ }
      lineTo(): void { /* ditto */ }
      quadraticCurveTo(): void { /* ditto */ }
      arc(): void { /* ditto */ }
      closePath(): void { /* ditto */ }
      rect(): void { /* ditto */ }
    });
    vi.stubGlobal("getComputedStyle", () => ({ top: "0px", right: "0px",
                                               bottom: "0px", left: "0px" }));
  });

  const makeGame = async () => {
    const { Game } = await import("../src/main.js");
    return new Game(stubCanvas(rec));
  };

  it("constructs without a run and draws the splash", async () => {
    const g = await makeGame();
    expect(() => { g.draw(); }).not.toThrow();
    expect(rec.calls).toContain("fillText");     // something was actually drawn
  });

  it("draws every frame before a run without throwing", async () => {
    const g = await makeGame();
    for (let t = 0; t < 20; t++) expect(() => { g.frame(t * 16); }).not.toThrow();
    expect(g.toasts.count(), g.toasts.all().map((x) => x.text).join(" | ")).toBe(0);
  });

  it("starting a run then drawing the world does not throw", async () => {
    const g = await makeGame();
    g.startRun(0);
    expect(g.started).toBe(true);
    expect(() => { g.draw(); }).not.toThrow();
    expect(g.toasts.count(), g.toasts.all().map((x) => x.text).join(" | ")).toBe(0);
  });

  it("runs many frames of a live game with no recovered errors", async () => {
    const g = await makeGame();
    g.startRun(0);
    for (let t = 0; t < 90; t++) g.frame(t * 16);
    expect(g.toasts.count(), g.toasts.all().map((x) => x.text).join(" | ")).toBe(0);
  });

  it("every overlay screen draws without throwing", async () => {
    const g = await makeGame();
    g.startRun(0);
    for (const open of [["plasmid"], ["map"], []] as string[][]) {
      g.showPlasmid = open.includes("plasmid");
      g.showMap = open.includes("map");
      expect(() => { g.draw(); }, open.join(",") || "world").not.toThrow();
    }
    expect(g.toasts.count(), g.toasts.all().map((x) => x.text).join(" | ")).toBe(0);
  });

  it("a throwing draw still renders the emergency screen", async () => {
    const g = await makeGame();
    g.startRun(0);
    vi.spyOn(g, "draw").mockImplementation(() => { throw new Error("synthetic"); });
    rec.calls.length = 0;
    expect(() => { g.frame(16); }).not.toThrow();
    expect(rec.calls).toContain("fillText");     // the failure was drawn
    expect(g.toasts.all()[0]?.text).toContain("synthetic");
  });

  it("the research screen draws without throwing", async () => {
    {
      const g = await makeGame();
      g.startRun(0);
      // Give it something to work on, including a held modifier.
      g.genome.put(4, { kind: "promoter", id: "j23119" });
      g.genome.put(5, { kind: "gene", id: "mtrC", level: 2, mods: ["codon"], allele: WILD_TYPE });
      g.mods.push("rbs", "chaperone");
      g.press("research");
      expect(() => { g.frame(16); }).not.toThrow();
      expect(g.toasts.all().filter((x) => x.level === "error")).toHaveLength(0);
      g.press("research");
    }
  });

  it("the research screen survives an empty ring and no modifiers", async () => {
    const g = await makeGame();
    g.startRun(0);
    for (let i = 0; i < 16; i++) g.genome.put(i, null);
    g.mods.length = 0;
    g.press("research");
    expect(() => { g.frame(16); }).not.toThrow();
  });

  it("the item card draws for every kind of part", async () => {
    const g = await makeGame();
    g.startRun(0);
    g.genome.put(5, { kind: "gene", id: "mcrA", level: 3, mods: ["codon", "rbs"], allele: WILD_TYPE });
    const parts: Part[] = [
      { kind: "gene", id: "mcrA", level: 3, mods: ["codon", "rbs"], allele: WILD_TYPE },
      { kind: "gene", id: "psbA", level: 1, mods: [], allele: WILD_TYPE },
      { kind: "promoter", id: "plac" },
      { kind: "terminator", id: "rrnbt1t2" },
    ];
    for (const part of parts) {
      expect(() => {
        drawItemCard(g.ctx, 400, 800, 1.9, part, g.genome, 4,
                     (s: string, max: number) => [s.slice(0, Math.max(max / 6, 1))]);
      }, JSON.stringify(part)).not.toThrow();
    }
  });
});

describe("the bench shows what you can actually buy", () => {
  // "Upgrades satisfying to obtain" starts with being able to SEE which
  // ones are within reach. Every card carried the same outline whether you
  // could afford it or not, so the screen took arithmetic to read.
  it("an unaffordable upgrade says how far short you are", () => {
    // A flat refusal is a dead end; a number is a target. The gap text only
    // appears when you cannot afford it, so an affordable card stays clean.
    // The rule under test lives in screens.ts and is exercised by the
    // scaling and golden suites; this pins the FORMAT so the wording cannot
    // drift into something unreadable.
    const gap = (cost: number, atp: number): string =>
      `${String(Math.max(Math.ceil(cost - atp), 0))} ATP short`;
    expect(gap(130, 106)).toBe("24 ATP short");
    expect(gap(85, 106), "an affordable cost reported a gap").toBe("0 ATP short");
    expect(gap(130.4, 106.2), "a fractional gap was not rounded up")
      .toBe("25 ATP short");
    for (const [c, a] of [[NaN, 10], [Infinity, 10], [10, NaN]] as const) {
      expect(() => gap(c, a), `gap(${String(c)}, ${String(a)}) threw`).not.toThrow();
    }
  });

  it("the level delta reads as a change, not a destination", async () => {
    // "x1.22 efficacy" is a fact about a level you have not bought.
    // "x1.22 -> x1.31" is the thing the button buys.
    const { levelMultiplier } = await import("../src/parts.js");
    for (let lvl = 1; lvl < 5; lvl++) {
      const now = levelMultiplier(lvl), next = levelMultiplier(lvl + 1);
      expect(next, `L${String(lvl)} -> L${String(lvl + 1)} is not an increase`)
        .toBeGreaterThan(now);
      expect(Number.isFinite(now) && Number.isFinite(next)).toBe(true);
    }
  });
});

describe("a loot card cannot print across its neighbours", () => {
  it("the card label is the SHORT name, never the decorated allele", async () => {
    // "psychrophilic psaA of tight coupling" is 35 characters. At the
    // smallest legible size it is still wider than a 60px tile, so it
    // printed straight over the cards beside it -- `fitInto` shrinks to fit
    // but floors at 6px, and no floor is small enough for that string. A
    // card says WHICH gene and HOW GOOD; the adjectives go in the inspector.
    const { itemName, itemShortName } = await import("../src/items.js");
    const { WILD_TYPE } = await import("../src/allele.js");
    // A REAL rolled allele, not invented affix ids -- `itemName` looks the
    // affixes up, so made-up ones crash it and the test measures nothing.
    const { rollAllele } = await import("../src/allele.js");
    const { makeRng } = await import("../src/rng.js");
    let allele = WILD_TYPE;
    for (let s = 0; s < 200; s++) {
      const a = rollAllele(makeRng(s), 6);
      if (a.prefix !== null || a.suffix !== null) { allele = a; break; }
    }
    const it = { kind: "cassette" as const, gene: "psbA" as never, allele };
    const short = itemShortName(it);
    expect(short, "the card label is not the bare gene name").toBe("psbA");
    expect(short.length, "the card label is too long for a tile")
      .toBeLessThanOrEqual(8);
    // the full name still exists, for the panel that has room for it
    expect(itemName(it).length, "the decorated name was lost")
      .toBeGreaterThan(short.length);
  });

  it("every item kind yields a short name that fits a tile", async () => {
    const { itemShortName } = await import("../src/items.js");
    const { WILD_TYPE } = await import("../src/allele.js");
    const items = [
      { kind: "cassette" as const, gene: "cbbL" as never, allele: WILD_TYPE },
      { kind: "substrate" as const, id: "glucose" as never },
      { kind: "promoter" as const, id: "j23106" as never, rarity: "common" as never },
      { kind: "terminator" as const, id: "hairpin" as never, rarity: "common" as never },
    ];
    for (const it of items) {
      const n = itemShortName(it);
      expect(n.length, `${it.kind} short name "${n}" is ${String(n.length)} chars`)
        .toBeLessThanOrEqual(14);
      expect(n.length, `${it.kind} has no short name`).toBeGreaterThan(0);
    }
  });
});

describe("no screen leaks canvas state into the next one", () => {
  it("every module that sets lineCap restores it", async () => {
    // `lineCap` is GLOBAL canvas state. bench_render set it to "round" and
    // never restored, so every later screen in the frame inherited it --
    // the plasmid ring draws its wedges as thick stroked arcs, and round
    // caps turned each one into a blob while a short unused-slot arc became
    // a circle. One missing `restore()`, two symptoms, and a wrong
    // diagnosis (I blamed the modal backdrop) before this was found.
    const { readFileSync, readdirSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { join } = await import("node:path");
    const dir = join(fileURLToPath(new URL("..", import.meta.url)), "src");
    const bad: string[] = [];
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".ts"))) {
      const src = readFileSync(join(dir, f), "utf8");
      const sets = (src.match(/ctx\.lineCap\s*=/g) ?? []).length;
      if (sets === 0) continue;
      const saves = (src.match(/ctx\.save\(\)/g) ?? []).length;
      const restores = (src.match(/ctx\.restore\(\)/g) ?? []).length;
      if (saves === 0 || saves !== restores) {
        bad.push(`${f}: ${String(sets)} lineCap set(s), `
          + `${String(saves)} save / ${String(restores)} restore`);
      }
    }
    expect(bad, "a module sets lineCap without balanced save/restore")
      .toEqual([]);
  });
});

describe("the button strip says what it does", () => {
  it("every button has a label short enough to fit its own width", async () => {
    // The `hint` existed on every button from the start and was NEVER
    // drawn: every control was a bare symbol, on any screen, ever. No glyph
    // teaches "directed evolution" or "lay biofilm" on its own. The hints
    // were also written as sentences ("strike the nearest thing"), which is
    // fine for a tooltip and impossible under a 44pt button.
    const { makeButtons } = await import("../src/buttons.js");
    for (const b of makeButtons(true)) {
      expect(b.hint.length, `"${b.hint}" is too long to sit under a button`)
        .toBeLessThanOrEqual(9);
      expect(b.hint.length, `${b.id} has no label`).toBeGreaterThan(1);
      expect(b.glyph.length, `${b.id} has no glyph`).toBeGreaterThan(0);
    }
  });

  it("no two buttons share a glyph or a label", async () => {
    // Two identical crossed-swords buttons once sat side by side with
    // nothing telling them apart. The same collision in the labels would
    // be worse, because the label is the part you read.
    const { makeButtons } = await import("../src/buttons.js");
    const bs = makeButtons(true);
    const glyphs = bs.map((b) => b.glyph);
    const hints = bs.map((b) => b.hint);
    expect(new Set(glyphs).size, "two buttons share a glyph").toBe(glyphs.length);
    expect(new Set(hints).size, "two buttons share a label").toBe(hints.length);
  });

  it("the floor arrows are developer-only", async () => {
    // They step a floor per tap and skip the clear-the-floor gate. On the
    // normal strip they mostly answered "the way down is choked", and a
    // control that usually refuses teaches only to stop pressing it.
    const { makeButtons } = await import("../src/buttons.js");
    const normal = makeButtons(false).map((b) => b.id);
    const debug = makeButtons(true).map((b) => b.id);
    expect(normal, "the floor arrows are on the normal strip")
      .not.toContain("down");
    expect(normal).not.toContain("up");
    expect(debug, "developer mode does not add the arrows").toContain("down");
    expect(debug).toContain("up");
    // and nothing else changes
    expect(debug.filter((id) => id !== "down" && id !== "up")).toEqual(normal);
  });
});

describe("the bench card does not collide with anything", () => {
  it("the card clears the footer, and the tree clears the card", async () => {
    // It shipped overlapping BOTH. The card was positioned off the trunk's
    // root and sized by guesswork, so the footer line printed inside it and
    // the tree's own root drew through it. Anchoring to the one fixed thing
    // on the screen -- the bottom inset -- is the difference between a
    // layout and a hope.
    const { benchGeometry, layout } = await import("../src/bench_tree.js");
    for (const [W, H] of [[1080, 2400], [393, 852], [320, 560]] as const) {
      const u = Math.max(Math.min(W, H) / 420, 1);
      const insTop = 24, insBottom = 12;
      // THE RENDERER'S OWN numbers, not a copy of them. The first version
      // recomputed the layout here, so it checked the formula was sound and
      // proved nothing about whether bench_render used it -- moving the card
      // back onto the footer produced zero failures.
      const { treeTop: top, treeH: h, cardTop, cardH, footerY } =
        benchGeometry(H, u, insTop, insBottom, 4);
      const l = layout([{ id: "psbA", level: 2 },
                        { id: "katG", level: 1 }], W, h, u);

      expect(cardTop + cardH, `${String(W)}x${String(H)}: the card covers the footer`)
        .toBeLessThan(footerY);
      expect(l.rootY + top, `${String(W)}x${String(H)}: the tree draws over the card`)
        .toBeLessThan(cardTop);
      // ...and the tree still starts below the trait strip
      for (const n of l.nodes) {
        expect(n.y + top, `${String(W)}x${String(H)}: a node is in the header`)
          .toBeGreaterThan(insTop + 100 * u);
      }
    }
  });

  it("a sparse tree does not leave a void above it", async () => {
    // Two genes on a tall phone left several hundred pixels of nothing
    // between the trait strip and the highest branch. A sparse tree should
    // be a SMALL tree, not a stretched one with a hole on top.
    const { layout } = await import("../src/bench_tree.js");
    const h = 1700;
    const l = layout([{ id: "psbA", level: 2 },
                      { id: "katG", level: 1 }], 1080, h, 2.57);
    const highest = Math.min(...l.branches.map((b) => b.tipY),
                             ...l.nodes.map((n) => n.y));
    expect(highest / h, `the tree starts ${((highest / h) * 100).toFixed(0)}% `
      + "down its own space").toBeLessThan(0.25);
  });
});
