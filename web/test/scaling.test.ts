import { beforeEach, describe, expect, it, vi } from "vitest";
import { Plasmid } from "../src/plasmid.js";
import { WILD_TYPE } from "../src/allele.js";
import { PATHWAY_COLOUR, drawRing } from "../src/plasmid_ui.js";

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
  texts: { x: number; y: number; text: string; size: number; align: string;
           rotated: boolean;
           /** Nesting depth when drawn. The WORLD is drawn inside a save, in
            *  tile coordinates under a camera; screen furniture is not. */
           depth: number }[];
  /** cx, cy, r, a0, a1 -- so a drawn ring can be measured, not inferred. */
  arcs: number[][];
  gradients: number;
}

/**
 * A context stub that TRACKS THE TRANSFORM.
 *
 * The first version simply ignored anything drawn inside a `save()`, because
 * the world is drawn under a camera transform in tile coordinates and those
 * readings are meaningless in screen space. That silently excluded the plasmid
 * screen's own readout, which is also drawn inside a save -- so the layout
 * tests were checking the world's HUD and passing on a screen they never saw.
 *
 * Tracking translate and scale means every recording is in screen coordinates
 * and nothing has to be excluded. Rotated text is flagged rather than dropped:
 * the ring labels are rotated by design and their bounding box is not the
 * thing any of these tests are about.
 */
function stubCtx(t: Trace): CanvasRenderingContext2D {
  let font = "10px x";
  const state: { align: string } = { align: "left" };
  interface Xf { tx: number; ty: number; sx: number; sy: number; rot: boolean }
  const stack: Xf[] = [{ tx: 0, ty: 0, sx: 1, sy: 1, rot: false }];
  const top = (): Xf => stack[stack.length - 1] ?? { tx: 0, ty: 0, sx: 1, sy: 1, rot: false };

  return new Proxy({} as CanvasRenderingContext2D, {
    get: (_o, p: string) => {
      if (p === "font") return font;
      if (p === "textAlign") return state.align;
      if (["fillStyle", "strokeStyle", "textBaseline", "globalAlpha", "lineWidth",
           "lineCap", "lineJoin", "filter", "imageSmoothingEnabled"].includes(p)) return "";
      return (...a: unknown[]) => {
        const x0 = top();
        if (p === "save") stack.push({ ...x0 });
        if (p === "restore" && stack.length > 1) stack.pop();
        if (p === "translate") {
          const [dx, dy] = a as number[];
          x0.tx += (dx ?? 0) * x0.sx;
          x0.ty += (dy ?? 0) * x0.sy;
        }
        if (p === "scale") {
          const [sx, sy] = a as number[];
          x0.sx *= sx ?? 1;
          x0.sy *= sy ?? 1;
        }
        if (p === "rotate") x0.rot = true;
        if (p === "setTransform" || p === "resetTransform") {
          stack.length = 1;
          stack[0] = { tx: 0, ty: 0, sx: 1, sy: 1, rot: false };
        }
        if (p === "fillRect" || p === "strokeRect") {
          const [x, y, w, h] = a as number[];
          t.rects.push({ x: (x ?? 0) * x0.sx + x0.tx, y: (y ?? 0) * x0.sy + x0.ty,
                         w: (w ?? 0) * x0.sx, h: (h ?? 0) * x0.sy });
        }
        if (p === "arc") t.arcs.push(a as number[]);
        if (p === "createLinearGradient") t.gradients++;
        if (p === "fillText" || p === "strokeText") {
          const [text, x, y] = a as [string, number, number];
          t.texts.push({ x: x * x0.sx + x0.tx, y: y * x0.sy + x0.ty, text,
                         size: (parseFloat(font) || 10) * Math.abs(x0.sx),
                         align: state.align, rotated: x0.rot,
                         depth: stack.length - 1 });
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
    const t: Trace = { rects: [], texts: [], arcs: [], gradients: 0 };
    const g = await play(W, H, t);
    g.startRun(0);
    for (const screen of ["", "plasmid", "map", "notes", "research"]) {
      t.rects.length = 0; t.texts.length = 0;
      if (screen !== "") g.press(screen);
      g.frame(100);
      // Nothing may be drawn off the right or bottom by more than a hair.
      // The WORLD scrolls under a camera, so a marker on a tile outside the
      // view is legitimately off-screen -- the canvas clips it. Only screen
      // FURNITURE has to stay in bounds, and that is what is drawn at the
      // outermost level rather than inside the camera's save.
      const off = t.texts.filter((x) => x.depth === 0
        && (x.x > W + 4 || x.y > H + 4 || x.x < -80));
      expect(off.slice(0, 3).map((x) => `${x.text} at ${Math.round(x.x)},${Math.round(x.y)} in ${W}x${H}`),
             `${name} ${screen}: text off-screen`).toEqual([]);

      // The ORIGIN being on screen is not the same as the STRING fitting.
      // This only checked x, so the status line -- left-aligned, starting well
      // inside the frame -- ran off the right edge of every phone and passed:
      // real Chrome rendered "before dawn" as "before da". Measured the same
      // way the stub measures, so a string that overflows is a failure here.
      const over = t.texts.filter((x) => {
        if (x.depth !== 0) return false;      // world-space, camera-clipped
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

  it("the world shows the same amount on every platform", async () => {
    // This is a fairness rule, not a layout one. The default zoom used to show
    // 13 tiles across the short axis on a coarse pointer and 30 on a fine one
    // -- 2.3x per axis, about five times the area. More of the level, more
    // creatures, more targets within reach of a tap. And sight radius reaches
    // 11, so the lit disc is 23 tiles across: a phone could not show even the
    // player's own field of view.
    const seen: number[] = [];
    for (const [name, W, H] of VIEWPORTS) {
      for (const coarse of [true, false]) {
        const t: Trace = { rects: [], texts: [], arcs: [], gradients: 0 };
        vi.stubGlobal("matchMedia", () => ({ matches: coarse }));
        const g = await play(W, H, t);
        g.startRun(0);
        g.frame(50);
        const across = Math.min(W, H) / (32 * g.zoom);
        expect(across, `${name}: short axis hides part of the lit disc`)
          .toBeGreaterThanOrEqual(23);
        seen.push(across);
      }
    }
    // Identical whatever the pointer, and the same on every viewport.
    expect(Math.max(...seen) - Math.min(...seen),
           "the visible world differs between platforms").toBeLessThan(0.01);
  });

  it.each(VIEWPORTS)("%s (%ix%i): overlay content is centred, not shoved left", async (name, W, H) => {
    // `u` comes off the SHORTER dimension, so on a 2000x1200 desktop it is
    // nearly three, and a phone-first single column was drawn at triple size
    // hard against the left edge with half the screen empty beside it.
    //
    // Asserted on strings the OVERLAY owns. Every overlay composites over the
    // living world, so the trace also carries the status line and the log
    // underneath -- measuring the leftmost text of the whole frame measures
    // those, which is a false positive I hit before writing it this way.
    const u = Math.max(Math.min(W, H) / 420, 1);
    const avail = W - 40;
    const padded = Math.max((avail - Math.min(avail, 470 * u)) / 2, 0);
    if (padded < 60) return;                    // narrow enough to fill legitimately

    const t: Trace = { rects: [], texts: [], arcs: [], gradients: 0 };
    const g = await play(W, H, t);
    g.startRun(0);
    for (const [screen, own] of [["plasmid", "PARTS BIN"], ["research", "THE BENCH"],
                                 ["notes", "FIELD NOTEBOOK"]] as const) {
      t.texts.length = 0;
      g.press(screen);
      g.frame(100);
      const hit = t.texts.find((x) => x.text.startsWith(own));
      g.press(screen);
      expect(hit, `${name} ${screen}: "${own}" was never drawn`).toBeDefined();
      expect(hit?.x ?? 0,
             `${name} ${screen}: "${own}" hugs the left edge; stage pads ${String(Math.round(padded))}`)
        .toBeGreaterThan(padded * 0.6);
    }
  });

  it.each(VIEWPORTS)("%s (%ix%i): buttons fit and stay tappable", async (name, W, H) => {
    const t: Trace = { rects: [], texts: [], arcs: [], gradients: 0 };
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
    const t: Trace = { rects: [], texts: [], arcs: [], gradients: 0 };
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
    const t: Trace = { rects: [], texts: [], arcs: [], gradients: 0 };
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
    const t: Trace = { rects: [], texts: [], arcs: [], gradients: 0 };
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

describe("the operon highlight says what it means", () => {
  /** Record the ring's arcs with the colour and line width in force. */
  function arcs(p: Plasmid) {
    const out: { colour: string; width: number }[] = [];
    let colour = "";
    let width = 0;
    const ctx = new Proxy({} as CanvasRenderingContext2D, {
      get: (_t, k: string) => {
        if (["strokeStyle", "fillStyle", "font", "textAlign", "textBaseline"].includes(k)) {
          return colour;
        }
        if (k === "lineWidth") return width;
        return () => {
          if (k === "arc") out.push({ colour, width });
          if (k === "measureText") return { width: 20 };
          return undefined;
        };
      },
      set: (_t, k: string, v: unknown) => {
        if (k === "strokeStyle") colour = String(v);
        if (k === "lineWidth") width = Number(v);
        return true;
      },
    });
    drawRing(ctx, { cx: 200, cy: 200, rInner: 90, rOuter: 130, used: p.usableSlots, rot: 0 }, p,
             { u: 1, depth: 1, dragFrom: null, dragXY: null, selected: null });
    // The transcript band is drawn wider than the slot band, which is how it
    // sits UNDER the slots. That is what identifies it -- not its colour,
    // which is the thing the second test is about.
    const widest = Math.max(...out.map((a) => a.width));
    return { all: out, operon: out.filter((a) => a.width === widest) };
  }

  const laid = (): Plasmid => {
    const p = new Plasmid();
    for (let i = 0; i < p.usableSlots; i++) p.put(i, null);
    p.put(0, { kind: "promoter", id: "j23106" });
    p.put(1, { kind: "gene", id: "ori", level: 1, mods: [], allele: WILD_TYPE });
    p.put(2, { kind: "terminator", id: "rrnbt1" });
    return p;
  };

  it("reaches the terminator that closes the transcript", () => {
    // The span used to be `(genes.length + 1) * step` from the promoter, which
    // assumes promoter-then-genes with nothing after. The hairpin that ends
    // the operon fell outside it, and only appeared to be inside when the
    // arithmetic happened to reach that far -- so pulling a terminator out and
    // putting it back changed the highlight, which reads as a glitch.
    const { operon } = arcs(laid());
    expect(operon.length, "the highlight does not cover promoter, gene and terminator")
      .toBe(3);
  });

  it("is a colour no PART uses", () => {
    // It was #ffd166, which is exactly a promoter's own colour, so the
    // annotation and the thing it annotated were indistinguishable.
    const { operon } = arcs(laid());
    const parts = new Set(Object.values(PATHWAY_COLOUR).map((c) => c.toLowerCase()));
    parts.add("#ffd166");                     // promoter
    parts.add("#8a8f96");                     // terminator
    for (const a of operon) {
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(a.colour);
      expect(m, `operon colour ${a.colour} is not rgba`).not.toBeNull();
      const hex = "#" + [1, 2, 3].map((i) =>
        Number(m?.[i] ?? 0).toString(16).padStart(2, "0")).join("");
      expect(parts.has(hex), `the operon highlight is ${hex}, which is a part colour`)
        .toBe(false);
    }
  });

  it("fades along the transcript, so attenuation is visible", () => {
    // A single bar at one alpha said "all of this is transcribed" about a run
    // whose genes past a leaky hairpin express at 2.5% while the ones in front
    // of it express at 50. Six bright wedges, and three of them contributing
    // almost nothing to the power figure beside them.
    const p = new Plasmid();
    p.integrated = 4;
    for (let i = 0; i < p.slots.length; i++) p.put(i, null);
    p.put(0, { kind: "promoter", id: "j23106" });
    p.put(1, { kind: "gene", id: "ori", level: 1, mods: [], allele: WILD_TYPE });
    p.put(2, { kind: "terminator", id: "rrnbt1" });
    p.put(3, { kind: "gene", id: "katG", level: 1, mods: [], allele: WILD_TYPE });
    p.put(4, { kind: "terminator", id: "rrnbt1" });

    const alpha = (c: string): number => Number(/,\s*([\d.]+)\)/.exec(c)?.[1] ?? 0);
    const { operon } = arcs(p);
    expect(operon.length, "the transcript was not drawn across its whole span")
      .toBeGreaterThanOrEqual(4);
    const first = alpha(operon[1]?.colour ?? "");     // the gene at the promoter
    const past = alpha(operon[3]?.colour ?? "");      // the gene past the hairpin
    expect(first, "no alpha recorded").toBeGreaterThan(0);
    expect(past, "a gene past a 90% terminator is drawn as brightly as one in front of it")
      .toBeLessThan(first * 0.6);
  });
});

describe("the ring draws a whole circle", () => {
  beforeEach(() => { vi.resetModules(); });

  it("wedge arcs cover 360 degrees at every chromosome size", async () => {
    // The angle maths agreeing with itself is not enough: `slotAt` and
    // `slotCentre` agreed while the DRAWING disagreed with both, and the ring
    // rendered as a quarter-circle. This measures what is actually drawn.
    const t: Trace = { rects: [], texts: [], arcs: [], gradients: 0 };
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
    const t: Trace = { rects: [], texts: [], arcs: [], gradients: 0 };
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

describe("text stays inside the thing it is drawn in", () => {
  beforeEach(() => { vi.resetModules(); });

  it.each(VIEWPORTS)("%s (%ix%i): the ring readout fits the ring's hole",
    async (name, W, H) => {
    // The suite checked text was ON SCREEN and that buttons did not overlap
    // each other. It never checked that text stayed inside its CONTAINER, so
    // it passed on a landscape phone where the readout was drawn straight
    // across the plasmid: the text was sized `15 * u`, scaled by the smaller
    // screen dimension, while the ring hole is sized from `H * 0.46`. On a
    // wide, short screen the hole shrinks and the text does not.
    const t: Trace = { rects: [], texts: [], arcs: [], gradients: 0 };
    const g = await play(W, H, t);
    g.startRun(0);

    // The WORST case, not the opening one. A fresh strain reads "0.7/9.0 kb",
    // which fits anywhere; the readout that actually overflowed in play was a
    // grown chromosome carrying burden and a brownout. Testing the default
    // state is how this passed on a screen it was visibly broken on.
    g.genome.integrated = 16;
    g.genome.strain = 8;
    g.player.atp = 143;
    g.player.atpMax = 350;
    for (let i = 0; i < g.genome.usableSlots; i++) {
      if (g.genome.at(i) === null) {
        g.genome.put(i, { kind: "gene", id: "cdhA", level: 1, mods: [],
                          allele: WILD_TYPE });
      }
    }
    g.openPlasmid(true);
    t.texts.length = 0;
    g.frame(100);

    const { cx, cy, rInner } = g.ring;
    expect(rInner, `${name}: no ring`).toBeGreaterThan(0);
    // Anything centred in the hole: within a line-height of the middle.
    const inHole = t.texts.filter(
      (x) => Math.abs(x.x - cx) < 4 && Math.abs(x.y - cy) < rInner);
    expect(inHole.length, `${name}: nothing drawn in the ring`).toBeGreaterThan(0);
    for (const x of inHole) {
      const width = x.text.length * x.size * 0.6;   // the stub's metric
      expect(width, `${name}: "${x.text}" is ${Math.round(width)}px wide `
        + `in a ${Math.round(rInner * 2)}px hole`)
        .toBeLessThanOrEqual(rInner * 2);
    }
  });

  it.each(VIEWPORTS)("%s (%ix%i): the parts list does not run under the ring",
    async (name, W, H) => {
    const t: Trace = { rects: [], texts: [], arcs: [], gradients: 0 };
    const g = await play(W, H, t);
    g.startRun(0);
    g.openPlasmid(true);
    g.frame(100);
    const ringBottom = g.ring.cy + g.ring.rOuter;
    for (const row of g.binRows) {
      expect(row.box.y, `${name}: a bin row starts above the ring's bottom edge`)
        .toBeGreaterThanOrEqual(ringBottom - 2);
    }
  });
});

describe("the minimap fits beside the controls", () => {
  beforeEach(() => { vi.resetModules(); });

  it.each(VIEWPORTS)("%s (%ix%i): it never overlaps a button",
    async (name, W, H) => {
    // The right edge already belongs to the button column. A decoration drawn
    // on top of a control is worse than no decoration.
    const t: Trace = { rects: [], texts: [], arcs: [], gradients: 0 };
    const g = await play(W, H, t);
    g.startRun(0);
    g.frame(100);
    const box = g.miniBox;
    if (!box) return;              // too little room: it declines to draw
    for (const b of g.buttons) {
      const apart = box.x + box.w <= b.x + 1 || b.x + b.w <= box.x + 1
        || box.y + box.h <= b.y + 1 || b.y + b.h <= box.y + 1;
      expect(apart, `${name}: the minimap covers ${b.id}`).toBe(true);
    }
    expect(box.x, `${name}: off the left edge`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.w, `${name}: off the right edge`).toBeLessThanOrEqual(W + 1);
    expect(box.y + box.h, `${name}: off the bottom`).toBeLessThanOrEqual(H + 1);
  });

  it.each(VIEWPORTS)("%s (%ix%i): it is readable or absent, never a sliver",
    async (name, W, H) => {
    const t: Trace = { rects: [], texts: [], arcs: [], gradients: 0 };
    const g = await play(W, H, t);
    g.startRun(0);
    g.frame(100);
    const box = g.miniBox;
    if (!box) return;
    expect(Math.min(box.w, box.h),
           `${name}: ${Math.round(box.w)}x${Math.round(box.h)} is too small to read`)
      .toBeGreaterThanOrEqual(56);
  });
});

describe("the minimap costs one rasterise, not one per frame", () => {
  beforeEach(() => { vi.resetModules(); });

  it("the terrain is cached and reused while nothing is uncovered", async () => {
    // A floor is 96x96 -- 9216 tiles. Redrawing that sixty times a second is
    // not affordable, and it does not change per frame: it changes when you
    // uncover something.
    let created = 0;
    const t: Trace = { rects: [], texts: [], arcs: [], gradients: 0 };
    const g = await play(393, 852, t);
    const doc = (globalThis as unknown as { document: { createElement: () => unknown } }).document;
    const real = doc.createElement.bind(doc);
    doc.createElement = () => { created++; return real(); };
    g.startRun(0);
    g.frame(50);
    const afterFirst = created;
    for (let i = 0; i < 60; i++) g.frame(100 + i * 16);
    expect(created - afterFirst,
           `${String(created - afterFirst)} canvases for 60 still frames`)
      .toBeLessThanOrEqual(1);
  });
});

describe("the walls are a mass, not a cut-out", () => {
  beforeEach(() => { vi.resetModules(); });

  it("depth shading and stratum texture both reach the frame", async () => {
    // Both were gated behind `px >= 40` while a tile is 32px at the default
    // zoom, so neither drew for anyone playing normally -- eight hand-written
    // stratum textures and the entire sense of solidity, invisible.
    const t: Trace = { rects: [], texts: [], arcs: [], gradients: 0 };
    const g = await play(393, 852, t);
    g.startRun(0);
    g.frame(100);
    // A tile is ~15px at the default zoom on a phone, not 32: the view is
    // zoomed out to about 0.47 so you can see the room you are in. The old
    // gate wanted 40px, which is nearly three times what the game ever shows.
    expect(g.zoom * 32, "the fixture is at an unexpected tile size")
      .toBeLessThan(40);
    expect(t.gradients, "no gradient: the walls are still one flat fill")
      .toBeGreaterThan(0);
  });

  it("shading is skipped in high contrast, where flat is the point", async () => {
    const t: Trace = { rects: [], texts: [], arcs: [], gradients: 0 };
    const g = await play(393, 852, t);
    g.startRun(0);
    g.settings = { ...g.settings, highContrast: true };
    g.frame(100);
    const after = t.gradients;
    g.frame(140);
    expect(t.gradients - after,
           "high contrast should not be paying for gradients").toBe(0);
  });
});

describe("a frame costs what it should", () => {
  beforeEach(() => { vi.resetModules(); });

  it("the wall texture is ONE fill, not thousands", async () => {
    // Fixing the `px >= 40` gate made the motif draw for the first time -- and
    // it cost about five thousand canvas operations a frame, an arc and a fill
    // per mark per wall tile. That is the whole budget on a phone, and it is
    // why the game went from smooth to unplayable in one version.
    const t: Trace = { rects: [], texts: [], arcs: [], gradients: 0 };
    const g = await play(393, 852, t);
    g.startRun(0);
    g.frame(50);                       // first frame builds the pattern
    const base = t.arcs.length;
    for (let i = 0; i < 10; i++) g.frame(100 + i * 16);
    const arcs = t.arcs.length - base;
    expect(arcs / 10, `${String(Math.round(arcs / 10))} arcs per frame`)
      .toBeLessThan(200);
  });

  it("the pattern is rasterised once, not per frame", async () => {
    let made = 0;
    const t: Trace = { rects: [], texts: [], arcs: [], gradients: 0 };
    const g = await play(393, 852, t);
    const doc = (globalThis as unknown as
      { document: { createElement: () => unknown } }).document;
    const real = doc.createElement.bind(doc);
    doc.createElement = () => { made++; return real(); };
    g.startRun(0);
    g.frame(50);
    const after = made;
    for (let i = 0; i < 30; i++) g.frame(100 + i * 16);
    expect(made - after,
           `${String(made - after)} canvases across 30 still frames`)
      .toBeLessThanOrEqual(1);
  });
});

describe("the HUD's own labels are on screen", () => {
  beforeEach(() => { vi.resetModules(); });

  it.each(VIEWPORTS)("%s (%ix%i): the strain label is visible", async (name, W, H) => {
    // The bar has been advancing and granting ring positions since the first
    // floor. It is labelled -- but a label drawn past the bottom edge is the
    // same as no label, and that is indistinguishable from decoration.
    const t: Trace = { rects: [], texts: [], arcs: [], gradients: 0 };
    const g = await play(W, H, t);
    g.startRun(0);
    t.texts.length = 0;
    g.frame(100);
    const label = t.texts.find((x) => x.text.startsWith("strain L")
      || x.text.startsWith("fully adapted"));
    expect(label, `${name}: no strain label drawn at all`).toBeDefined();
    if (!label) return;
    expect(label.y, `${name}: the strain label is drawn at y=`
      + `${Math.round(label.y)} on a ${String(H)}px screen`)
      .toBeLessThanOrEqual(H - 4);
  });
});

describe("the wall silhouette is a contour", () => {
  beforeEach(() => { vi.resetModules(); });

  it("is built once per floor, not once per frame", async () => {
    // The contour costs about 3.6ms over a floor -- fine once, impossible
    // sixty times a second. The grid is immutable after generation, so the
    // floor number alone is a sufficient key.
    const { forgetSilhouette, wallSilhouette } = await import("../src/wall_path.js");
    forgetSilhouette();
    let built = 0;
    const solid = (x: number, y: number): boolean =>
      x < 2 || y < 2 || x > 30 || y > 30 || (x % 7 === 0 && y % 5 === 0);
    const make = (): Path2D => {
      built++;
      return { moveTo: () => undefined, lineTo: () => undefined,
               quadraticCurveTo: () => undefined,
               closePath: () => undefined } as unknown as Path2D;
    };
    for (let i = 0; i < 40; i++) {
      wallSilhouette(solid, 32, 32, 3, 99, 0.1, 0.2, false, make);
    }
    expect(built, `${String(built)} rebuilds across 40 frames on one floor`)
      .toBe(1);
    // A different floor must rebuild.
    wallSilhouette(solid, 32, 32, 4, 99, 0.1, 0.2, false, make);
    expect(built, "changing floor did not rebuild").toBe(2);
    // So must high contrast, which draws a different shape entirely.
    wallSilhouette(solid, 32, 32, 4, 99, 0, 0, true, make);
    expect(built, "high contrast reused the organic path").toBe(3);
  });

  it("a straight run stays straight and a diagonal stays diagonal", async () => {
    // Quadratic curves through EDGE MIDPOINTS with the vertex as control
    // point: three collinear points give a straight line, because the control
    // point lies on it. That is the property that lets a long wall stay flat
    // and a 45-degree run stay a clean 45 with no special cases.
    const { addLoop } = await import("../src/wall_path.js");
    const pts: [number, number][] = [];
    const path = {
      moveTo: (x: number, y: number) => { pts.push([x, y]); },
      lineTo: (x: number, y: number) => { pts.push([x, y]); },
      quadraticCurveTo: (cx: number, cy: number, x: number, y: number) => {
        // Sample the curve, not just its ends.
        const [x0, y0] = pts[pts.length - 1] ?? [0, 0];
        for (let t = 0.25; t <= 1.0001; t += 0.25) {
          const u = 1 - t;
          pts.push([u * u * x0 + 2 * u * t * cx + t * t * x,
                    u * u * y0 + 2 * u * t * cy + t * t * y]);
        }
      },
      closePath: () => undefined,
    };
    // A long straight edge, as a loop.
    const loop = [];
    for (let x = 0; x <= 20; x++) loop.push({ x, y: 0 });
    for (let x = 20; x >= 0; x--) loop.push({ x, y: 4 });
    addLoop(path, loop, 1, 0, 0);
    // The MIDDLE of the top edge, away from the corners -- which are supposed
    // to round, and do. Anything between x=4 and x=16 has collinear
    // neighbours and must stay exactly on y = 0.
    const middle = pts.filter(([x, y]) => x > 4 && x < 16 && y < 2);
    expect(middle.length, "the fixture sampled no straight run")
      .toBeGreaterThan(10);
    for (const [x, y] of middle) {
      expect(Math.abs(y),
             `a straight wall bowed to y=${y.toFixed(2)} at x=${x.toFixed(1)}`)
        .toBeLessThan(0.02);
    }
  });
});
