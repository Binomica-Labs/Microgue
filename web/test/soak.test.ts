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

describe("soak", () => {
  let rec: Rec;

  beforeEach(() => {
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
  });

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
    expect(g.toasts.count(), g.toasts.all().map((x) => x.text).join(" | ")).toBe(0);
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
    expect(g.genome.slots).toHaveLength(16);
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
    for (let i = 0; i < 100; i++) {
      g.press("plasmid"); g.frame(i * 32);
      g.press("plasmid"); g.press("map"); g.frame(i * 32 + 8);
      g.press("map"); g.press("notes"); g.frame(i * 32 + 16);
      g.press("notes"); g.press("wait"); g.frame(i * 32 + 24);
    }
    expect(g.toasts.count(), g.toasts.all().map((x) => x.text).join(" | ")).toBe(0);
    expect(g.showPlasmid || g.showMap || g.showNotes).toBe(false);
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
