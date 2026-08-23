import { describe, expect, it, vi } from "vitest";

// Regression guard for the class of failure that produced a black screen: the
// module throwing, or boot() touching state that does not exist yet. This runs
// the real bundle entry against a minimal DOM.
describe("boot", () => {
  it("evaluates and is inert when there is no canvas", async () => {
    const raf = vi.fn();
    vi.stubGlobal("requestAnimationFrame", raf);
    vi.stubGlobal("addEventListener", vi.fn());
    vi.stubGlobal("innerWidth", 400);
    vi.stubGlobal("innerHeight", 800);
    vi.stubGlobal("devicePixelRatio", 2);
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    vi.stubGlobal("localStorage", {
      getItem: () => null, setItem: () => undefined, removeItem: () => undefined,
    });
    vi.stubGlobal("navigator", {});
    // Always present in a browser; the instanceof check in boot() is correct,
    // it just cannot be evaluated outside one.
    vi.stubGlobal("HTMLCanvasElement", function HTMLCanvasElementStub() { /* marker */ });
    vi.stubGlobal("document", {
      getElementById: () => null,
      createElement: () => ({ style: {}, remove: () => undefined,
                              getContext: () => null }),
      body: { appendChild: () => undefined },
    });
    // The element is absent, so boot() must return without constructing a Game.
    await expect(import("../src/main.js")).resolves.toBeDefined();
    expect(raf).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
