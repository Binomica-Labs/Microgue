import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A golden trace of what a frame actually DRAWS.
//
// 573 tests proved the refactor did not crash. They could not prove it did not
// CHANGE anything -- a moved line that draws at the wrong coordinate passes
// every assertion in the suite. This records every canvas call in order, with
// rounded arguments, and hashes the sequence. It caught nothing when written,
// because the refactor was clean; it exists so the NEXT one cannot be silently
// wrong.
//
// When this fails: if the change was deliberate, look at the diff, satisfy
// yourself it is what you meant, and update the hash. Never update it blind.

/** sha256 of the canvas call sequence for the scenario in `play()`.
 *
 *  Recorded at v0.55. The equivalence with the PRE-refactor build was proven
 *  separately, by running the same tracer against both trees outside vitest:
 *  42220 calls, identical. This constant is the in-suite anchor.
 *
 *  Re-recorded once since, and the diff was read before it was: 18 lines of
 *  77575 moved, all of them the two things that were meant to move. The strain
 *  progress bar had been drawing `fillRect(42,783.59,0,2)` -- width ZERO, on
 *  every frame of every run -- because `run.deepest` was never advanced by
 *  descending, and the notebook header read "deepest D1" after three floors.
 *  Nothing else in the frame changed.
 *
 *  And re-recorded for the wall pass: the corner radius now varies per grid
 *  vertex and exposed faces bow, so the wall geometry legitimately moved.
 *
 *  Re-recorded again at the sprite/status-line pass. Diff read first: 117
 *  lines of 77680, and every one of them either a measureText from ellipsising
 *  the status line -- which real Chrome showed running off the right edge of
 *  every phone -- or a fill in Nitzschia's pigment, from the striae its sprite
 *  had been missing. */
const GOLDEN = "4fb3d25a05fa5633";

const trace: string[] = [];

const round = (v: unknown): string =>
  typeof v === "number" ? String(Math.round(v * 100) / 100)
    : typeof v === "object" && v !== null ? "obj" : String(v);

function stubCtx(): CanvasRenderingContext2D {
  const props = ["fillStyle", "strokeStyle", "font", "textAlign", "textBaseline",
                 "globalAlpha", "lineWidth", "lineCap", "lineJoin", "filter",
                 "imageSmoothingEnabled"];
  return new Proxy({} as CanvasRenderingContext2D, {
    get: (_t, p: string) => {
      if (props.includes(p)) return "";
      return (...a: unknown[]) => {
        trace.push(`${p}(${a.map(round).join(",")})`);
        if (p === "measureText") return { width: 40 };
        if (p === "createRadialGradient" || p === "createLinearGradient") {
          return { addColorStop: () => undefined };
        }
        return undefined;
      };
    },
    set: (_t, p: string, v: unknown) => { trace.push(`set ${p}=${String(v)}`); return true; },
  });
}

describe("golden render trace", () => {
  /** Storage is reset per play, not per test: the second run of a
   *  determinism check would otherwise LOAD the save the first one wrote and
   *  legitimately draw something different. */
  const store = new Map<string, string>();

  beforeEach(() => {
    trace.length = 0;
    store.clear();
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("addEventListener", () => undefined);
    vi.stubGlobal("innerWidth", 400);
    vi.stubGlobal("innerHeight", 800);
    vi.stubGlobal("devicePixelRatio", 2);
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    vi.stubGlobal("performance", { now: () => 0 });
    // A new slot seeds from Date.now(); without pinning it the dungeon differs
    // between runs and the trace is noise.
    vi.stubGlobal("Date", Object.assign(function DateStub() { return new Date(0); },
                                        { now: () => 1700000000000 }));
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    });
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("HTMLCanvasElement", function Stub() { /* marker */ });
    // Path2D RECORDS. The fog moved to a compound path, and a stub that
    // silently swallowed its rects would have taken the whole fog layer out of
    // the golden -- a coverage hole that looks exactly like a passing test.
    vi.stubGlobal("Path2D", class {
      moveTo(...a: number[]): void { trace.push(`path.moveTo(${a.map(round).join(",")})`); }
      lineTo(...a: number[]): void { trace.push(`path.lineTo(${a.map(round).join(",")})`); }
      // Recorded in full, not collapsed to its end point. The wall faces bow
      // with a quadratic; a stub that logged only where the curve ENDS would
      // take the control point out of the golden entirely -- the same coverage
      // hole the fog had when Path2D was first stubbed.
      quadraticCurveTo(...a: number[]): void { trace.push(`path.quad(${a.map(round).join(",")})`); }
      arc(...a: number[]): void { trace.push(`path.arc(${a.map(round).join(",")})`); }
      closePath(): void { trace.push("path.closePath()"); }
      rect(...a: number[]): void { trace.push(`path.rect(${a.map(round).join(",")})`); }
    });
    vi.stubGlobal("getComputedStyle", () => ({
      top: "0px", right: "0px", bottom: "0px", left: "0px",
    }));
    vi.stubGlobal("document", {
      getElementById: () => null,
      createElement: () => ({ style: {} as CSSStyleDeclaration, width: 0, height: 0,
                              remove: () => undefined, getContext: () => stubCtx() }),
      body: { appendChild: () => undefined },
      addEventListener: () => undefined,
      visibilityState: "visible",
    });
  });

  const play = async (): Promise<void> => {
    store.clear();
    const { Game } = await import("../src/main.js");
    const g = new Game({
      width: 400, height: 800, style: {} as CSSStyleDeclaration,
      getContext: () => stubCtx(),
      addEventListener: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    } as unknown as HTMLCanvasElement);
    g.startRun(0);
    for (let t = 0; t < 40; t++) { if (t % 5 === 0) g.press("wait"); g.frame(t * 16); }

    // Reveal floor 1 and draw it. Barriers ring ROOMS, which are never
    // adjacent to the arrival tile, so no amount of ordinary play brings them
    // into view -- and a golden is meant to exercise the drawing code, not
    // simulate a plausible session. This must happen BEFORE descending: the
    // deeper floors in this seed have no barriers to draw.
    g.level.sight.seen.fill(1);
    g.level.sight.visible.fill(1);
    g.frame(700);

    // Descend so barriers, room washes and floor loot are actually DRAWN. A
    // one-pixel shift in barrier rendering did not fail this test until the
    // scenario reached a floor that has one.
    for (let f = 0; f < 3; f++) {
      for (const m of g.level.mobs) m.alive = false;
      g.descend();
      g.frame(2000 + f * 16);
    }
    g.level.sight.seen.fill(1);
    g.level.sight.visible.fill(1);
    g.frame(3000);

    for (const s of ["plasmid", "map", "notes", "research"]) {
      g.press(s); g.frame(999); g.press(s);
    }
  };

  it("a fixed scenario draws the same thing every time", async () => {
    await play();
    const first = trace.join("\n");
    trace.length = 0;
    vi.resetModules();
    await play();
    expect(trace.join("\n"), "rendering is not deterministic").toBe(first);
  });

  it("covers the screens it claims to", async () => {
    // A golden only guards what its scenario EXERCISES. Injecting a one-pixel
    // shift into barrier rendering did NOT fail this test, because floor 1 in
    // the traced run has no barriers in view. Shifting HUD text by one pixel
    // did. So: this anchors the world, the HUD and the four screens, and
    // nothing else. Widen `play()` before trusting it further.
    await play();
    const text = trace.join("\n");
    for (const marker of ["FIELD NOTEBOOK", "PARTS BIN", "THE BENCH"]) {
      expect(text, `${marker} never drawn -- the scenario missed a screen`)
        .toContain(marker);
    }
  });

  it("draws a substantial, non-trivial scene", async () => {
    await play();
    expect(trace.length, "far too few calls to be a real frame").toBeGreaterThan(20000);
    // Not just fills: the scene must include text, paths and sprites.
    const kinds = new Set(trace.map((c) => c.split("(")[0]));
    for (const k of ["fillRect", "fillText", "drawImage", "beginPath", "stroke"]) {
      expect([...kinds], `no ${k} in the frame`).toContain(k);
    }
  });

  it("the frame matches the recorded golden", async () => {
    // Verified identical, call for call, against the PRE-REFACTOR build across
    // 42220 canvas calls. That is the evidence the split changed nothing.
    //
    // A test that reads its expectation from an env var nobody sets asserts
    // nothing at all, so the value is recorded here.
    await play();
    const hash = createHash("sha256").update(trace.join("\n")).digest("hex").slice(0, 16);
    expect(hash, "the rendered frame changed -- look at what and why before "
      + "updating this").toBe(GOLDEN);
  });
});
