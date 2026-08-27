import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Layout across every form factor anyone will actually use.
 *
 * Not "does it throw" -- that is already covered. This records where things
 * are DRAWN and checks they are on screen, inside their container and clear of
 * the reserved areas. A phone in landscape and a desktop monitor are further
 * apart than any two devices this has been tested on by hand.
 */

const VIEWPORTS: readonly (readonly [string, number, number])[] = [
  ["small android", 320, 640],
  ["iPhone SE", 375, 667],
  ["iPhone 15", 393, 852],
  ["fold closed", 344, 882],
  ["Pixel 8", 412, 915],
  ["phone landscape", 852, 393],
  ["iPad mini", 744, 1133],
  ["iPad Pro", 1024, 1366],
  ["iPad landscape", 1366, 1024],
  ["desktop", 1920, 1080],
  ["ultrawide", 2560, 1080],
];

interface Rect { x: number; y: number; w: number; h: number }

/** Every rect and text position a frame produced. */
interface Trace {
  rects: Rect[];
  texts: { x: number; y: number; text: string; size: number; align: string }[];
  /** cx, cy, r, a0, a1 -- so a drawn ring can be measured, not inferred. */
  arcs: number[][];
}

function stubCtx(t: Trace): CanvasRenderingContext2D {
  let font = "10px x";
  const state: { align: string } = { align: "left" };
  // The world is drawn inside a camera transform, in TILE coordinates. Only
  // record while no transform is active, which is where the HUD, the screens
  // and everything else that must fit on the display are drawn.
  let depth = 0;
  return new Proxy({} as CanvasRenderingContext2D, {
    get: (_o, p: string) => {
      if (p === "font") return font;
      if (p === "textAlign") return state.align;
      if (["fillStyle", "strokeStyle", "textBaseline", "globalAlpha", "lineWidth",
           "lineCap", "lineJoin", "filter", "imageSmoothingEnabled"].includes(p)) return "";
      return (...a: unknown[]) => {
        if (p === "save") depth++;
        if (p === "restore") depth = Math.max(depth - 1, 0);
        if (depth > 0) {
          if (p === "measureText") {
            const s = parseFloat(font) || 10;
            return { width: (typeof a[0] === "string" ? a[0].length : 0) * s * 0.6 };
          }
          if (p === "createRadialGradient" || p === "createLinearGradient") {
            return { addColorStop: () => undefined };
          }
          return undefined;
        }
        if (p === "fillRect" || p === "strokeRect") {
          const [x, y, w, h] = a as number[];
          t.rects.push({ x: x ?? 0, y: y ?? 0, w: w ?? 0, h: h ?? 0 });
        }
        if (p === "arc") t.arcs.push(a as number[]);
        if (p === "fillText" || p === "strokeText") {
          const [text, x, y] = a as [string, number, number];
          t.texts.push({ x, y, text, size: parseFloat(font) || 10, align: state.align });
        }
        if (p === "measureText") {
          const s = parseFloat(font) || 10;
          return { width: (typeof a[0] === "string" ? a[0].length : 0) * s * 0.6 };
        }
        if (p === "createRadialGradient" || p === "createLinearGradient") {
          return { addColorStop: () => undefined };
        }
        return undefined;
      };
    },
    set: (_o, p: string, v: unknown) => {
      if (p === "font") font = String(v);
      if (p === "textAlign") state.align = String(v);
      return true;
    },
  });
}

async function play(W: number, H: number, t: Trace) {
  const store = new Map<string, string>();
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("addEventListener", () => undefined);
  vi.stubGlobal("innerWidth", W);
  vi.stubGlobal("innerHeight", H);
  vi.stubGlobal("devicePixelRatio", 2);
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  vi.stubGlobal("performance", { now: () => 0 });
  vi.stubGlobal("Date", Object.assign(function D() { return new Date(0); },
                                      { now: () => 1700000000000 }));
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  });
  vi.stubGlobal("navigator", {});
  vi.stubGlobal("HTMLCanvasElement", function S() { /* marker */ });
  vi.stubGlobal("Path2D", class {
    moveTo(): void { /* */ } lineTo(): void { /* */ }
    quadraticCurveTo(): void { /* */ }
    arc(): void { /* */ } closePath(): void { /* */ }
    rect(): void { /* */ }
  });
  // A real notch and home indicator: the values a phone actually reports.
  vi.stubGlobal("getComputedStyle", () => ({
    top: H > W ? "47px" : "0px", right: H > W ? "0px" : "44px",
    bottom: H > W ? "34px" : "21px", left: H > W ? "0px" : "44px",
  }));
  vi.stubGlobal("document", {
    getElementById: () => null,
    createElement: () => ({ style: {} as CSSStyleDeclaration, width: 0, height: 0,
                            remove: () => undefined, getContext: () => stubCtx(t) }),
    body: { appendChild: () => undefined },
    addEventListener: () => undefined,
    visibilityState: "visible",
  });

  const { Game } = await import("../src/main.js");
  const g = new Game({
    width: W, height: H, style: {} as CSSStyleDeclaration,
    getContext: () => stubCtx(t),
    addEventListener: () => undefined,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: W, height: H }),
  } as unknown as HTMLCanvasElement);
  return g;
}

describe("layout holds on every form factor", () => {
  beforeEach(() => { vi.resetModules(); });

  it.each(VIEWPORTS)("%s (%ix%i): every screen draws in bounds", async (name, W, H) => {
    const t: Trace = { rects: [], texts: [], arcs: [] };
    const g = await play(W, H, t);
    g.startRun(0);
    for (const screen of ["", "plasmid", "map", "notes", "research"]) {
      t.rects.length = 0; t.texts.length = 0;
      if (screen !== "") g.press(screen);
      g.frame(100);
      // Nothing may be drawn off the right or bottom by more than a hair.
      const off = t.texts.filter((x) => x.x > W + 4 || x.y > H + 4 || x.x < -80);
      expect(off.slice(0, 3).map((x) => `${x.text} at ${Math.round(x.x)},${Math.round(x.y)} in ${W}x${H}`),
             `${name} ${screen}: text off-screen`).toEqual([]);

      // The ORIGIN being on screen is not the same as the STRING fitting.
      // This only checked x, so the status line -- left-aligned, starting well
      // inside the frame -- ran off the right edge of every phone and passed:
      // real Chrome rendered "before dawn" as "before da". Measured the same
      // way the stub measures, so a string that overflows is a failure here.
      const over = t.texts.filter((x) => {
        const w = x.text.length * x.size * 0.6;
        const right = x.align === "center" ? x.x + w / 2
          : x.align === "right" ? x.x : x.x + w;
        return right > W + 4;
      });
      expect(over.slice(0, 3).map((x) =>
        `"${x.text}" runs to ${Math.round(x.align === "center" ? x.x + x.text.length * x.size * 0.3 : x.x + x.text.length * x.size * 0.6)} in ${W}x${H}`),
             `${name} ${screen}: text overflows the right edge`).toEqual([]);
      if (screen !== "") g.press(screen);
    }
  });

  it.each(VIEWPORTS)("%s (%ix%i): buttons fit and stay tappable", async (name, W, H) => {
    const t: Trace = { rects: [], texts: [], arcs: [] };
    const g = await play(W, H, t);
    g.startRun(0);
    g.frame(50);
    const bs = g.buttons;
    expect(bs.length).toBeGreaterThan(0);
    for (const b of bs) {
      expect(b.w, `${name}: button smaller than a finger`).toBeGreaterThanOrEqual(40);
      expect(b.y, `${name}: ${b.id} above the top`).toBeGreaterThanOrEqual(-1);
      expect(b.y + b.h, `${name}: ${b.id} runs off the bottom`)
        .toBeLessThanOrEqual(H + 1);
      expect(b.x + b.w, `${name}: ${b.id} runs off the right`)
        .toBeLessThanOrEqual(W + 1);
    }
    // No two may overlap. Checked as rectangles, not by assuming a single
    // column: wrapping to more columns is exactly how it fits on a landscape
    // phone, so a column assumption would fail on the correct layout.
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i], c = bs[j];
        if (!a || !c) continue;
        const apart = a.x + a.w <= c.x + 1 || c.x + c.w <= a.x + 1
          || a.y + a.h <= c.y + 1 || c.y + c.h <= a.y + 1;
        expect(apart, `${name}: ${a.id} overlaps ${c.id}`).toBe(true);
      }
    }
  });

  it.each(VIEWPORTS)("%s (%ix%i): the close target is reachable", async (name, W, H) => {
    const t: Trace = { rects: [], texts: [], arcs: [] };
    const g = await play(W, H, t);
    g.startRun(0);
    for (const screen of ["plasmid", "map", "notes", "research"]) {
      g.press(screen);
      g.frame(60);
      const cb = g.closeBox;
      expect(cb.w, `${name} ${screen}: no close target`).toBeGreaterThanOrEqual(40);
      expect(cb.x + cb.w, `${name} ${screen}: close runs off the right`)
        .toBeLessThanOrEqual(W + 1);
      expect(cb.y, `${name} ${screen}: close is under the notch`)
        .toBeGreaterThanOrEqual(H > W ? 40 : 0);
      g.press(screen);
    }
  });
});

describe("the fog has no seams", () => {
  beforeEach(() => { vi.resetModules(); });

  it("is drawn as ONE fill per shade, not per tile", async () => {
    // Two earlier attempts failed the same way: per-tile rects overlapped and
    // two passes of a 62% black composited to 86%, drawing a grid of dark
    // lines across every remembered area. Rounding to whole pixels did not
    // help because this is inside a FRACTIONAL camera translate -- the
    // rounding was in tile space and the transform undid it.
    //
    // A single fill composites once per pixel however much its subpaths
    // overlap, and does not care what transform is active.
    const rects: number[] = [];
    class RecordingPath {
      moveTo(): void { /* */ }
      lineTo(): void { /* */ }
      quadraticCurveTo(): void { /* */ }
      arc(): void { /* */ }
      closePath(): void { /* */ }
      rect(...a: number[]): void { rects.push(a.length); }
    }
    const t: Trace = { rects: [], texts: [], arcs: [] };
    const g = await play(400, 800, t);
    // After play(), which replaces the globals wholesale.
    vi.stubGlobal("Path2D", RecordingPath);
    g.startRun(0);
    g.frame(100);
    expect(rects.length, "the fog is not using a path at all")
      .toBeGreaterThan(0);
  });

  it("adjacent runs overlap rather than abut", async () => {
    // Abutting rects leave sub-pixel gaps once a fractional transform is
    // applied. Overlapping is free inside one fill, and closes them.
    const seen: number[][] = [];
    class RecordingPath {
      moveTo(): void { /* */ }
      lineTo(): void { /* */ }
      quadraticCurveTo(): void { /* */ }
      arc(): void { /* */ }
      closePath(): void { /* */ }
      rect(...a: number[]): void { seen.push(a); }
    }
    const t: Trace = { rects: [], texts: [], arcs: [] };
    const g = await play(400, 800, t);
    vi.stubGlobal("Path2D", RecordingPath);
    g.startRun(0);
    g.frame(100);
    const rows = seen.filter((r) => r.length === 4);
    expect(rows.length).toBeGreaterThan(4);
    // Every rect must be padded: height strictly greater than one tile.
    const tile = 32 * g.zoom;
    for (const r of rows.slice(0, 40)) {
      expect(r[3] ?? 0, "a fog rect is exactly one tile tall, so it will seam")
        .toBeGreaterThan(tile);
    }
  });
});

describe("the ring draws a whole circle", () => {
  beforeEach(() => { vi.resetModules(); });

  it("wedge arcs cover 360 degrees at every chromosome size", async () => {
    // The angle maths agreeing with itself is not enough: `slotAt` and
    // `slotCentre` agreed while the DRAWING disagreed with both, and the ring
    // rendered as a quarter-circle. This measures what is actually drawn.
    const t: Trace = { rects: [], texts: [], arcs: [] };
    const g = await play(400, 800, t);
    g.startRun(0);

    for (const sites of [0, 4, 8, 16]) {
      t.arcs.length = 0;
      g.genome.integrated = sites;
      g.openPlasmid(true);
      g.frame(100 + sites);
      g.openPlasmid(false);

      const used = g.genome.usableSlots;
      // The slot wedges are the arcs whose sweep is one step.
      const step = (Math.PI * 2) / used;
      const wedges = t.arcs.filter((a) =>
        Math.abs(((a[4] ?? 0) - (a[3] ?? 0)) - step) < step * 0.35);
      expect(wedges.length, `${String(sites)} sites: expected ${String(used)} wedges`)
        .toBeGreaterThanOrEqual(used - 1);

      // Their DISTRIBUTION, not their total. Summing the sweeps still reads
      // 360 when eight wedges overlap inside a quarter-circle, which is
      // exactly the bug -- the sum was never the thing that was wrong.
      const norm = (a: number): number => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const starts = wedges.map((a) => norm(a[3] ?? 0)).sort((x, y) => x - y);
      let biggestGap = starts.length > 0
        ? (starts[0] ?? 0) + Math.PI * 2 - (starts[starts.length - 1] ?? 0) : Math.PI * 2;
      for (let i = 1; i < starts.length; i++) {
        biggestGap = Math.max(biggestGap, (starts[i] ?? 0) - (starts[i - 1] ?? 0));
      }
      expect(biggestGap, `${String(sites)} sites: the wedges leave a `
        + `${((biggestGap / Math.PI) * 180).toFixed(0)} degree gap`)
        .toBeLessThan(step * 1.6);
    }
  });
});

describe("the fog stays cheap", () => {
  beforeEach(() => { vi.resetModules(); });

  it("builds a bounded number of rects, not one per tile", async () => {
    // Run-length encoding is the whole reason this is affordable: a 96x96
    // floor is 9216 tiles and the visible window alone is hundreds. A path is
    // only cheap if what goes into it is.
    let rects = 0;
    class CountingPath {
      moveTo(): void { /* */ }
      lineTo(): void { /* */ }
      quadraticCurveTo(): void { /* */ }
      arc(): void { /* */ }
      closePath(): void { /* */ }
      rect(): void { rects++; }
    }
    const t: Trace = { rects: [], texts: [], arcs: [] };
    const g = await play(400, 800, t);
    vi.stubGlobal("Path2D", CountingPath);
    g.startRun(0);
    g.frame(100);
    expect(rects, "the fog drew nothing").toBeGreaterThan(0);

    // Fully remembered is the worst case for run-length encoding, because
    // visible and remembered then interleave along every row.
    g.level.sight.seen.fill(1);
    rects = 0;
    g.frame(200);
    expect(rects, `${String(rects)} rects for one frame of fog`).toBeLessThan(400);
  });
});
