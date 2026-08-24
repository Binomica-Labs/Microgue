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
      arc(): void { /* ditto */ }
      closePath(): void { /* ditto */ }
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
      g.genome.put(5, { kind: "gene", id: "mtrC", level: 2, mods: ["codon"] });
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
    g.genome.put(5, { kind: "gene", id: "mcrA", level: 3, mods: ["codon", "rbs"] });
    const parts: Part[] = [
      { kind: "gene", id: "mcrA", level: 3, mods: ["codon", "rbs"] },
      { kind: "gene", id: "psbA", level: 1, mods: [] },
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
