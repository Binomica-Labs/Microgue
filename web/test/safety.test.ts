import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { installGlobalHandlers, on, safe, safeAsync } from "../src/safety.js";

// Guarding call sites one at a time does not work. I wrapped three gesture
// listeners and missed the four pinch ones directly below them, and nothing
// complained for several versions. These tests make the unsafe form a build
// failure rather than a thing to remember.

const SRC = readdirSync("src").filter((f) => f.endsWith(".ts"));
const read = (f: string): string => readFileSync(join("src", f), "utf8");

describe("no listener escapes the wrapper", () => {
  it("only safety.ts and the worker register listeners directly", () => {
    // sw.ts is a separate bundle with no toast queue; it guards its handlers
    // internally instead. sw_client.ts wraps every callback in `swallow`.
    const allowed = new Set(["safety.ts", "sw.ts", "sw_client.ts"]);
    const offenders: string[] = [];
    for (const f of SRC) {
      if (allowed.has(f)) continue;
      read(f).split("\n").forEach((l, i) => {
        // Strip line comments first, then match the call ANYWHERE on the line.
        // An earlier version anchored to line start or a preceding dot, so a
        // call nested inside an expression slipped straight through -- and a
        // guard that does not guard is worse than none.
        const code = l.replace(/\/\/.*$/, "");
        if (/(^|[^\w$.])addEventListener\s*\(|\.addEventListener\s*\(/.test(code)) {
          offenders.push(`${f}:${String(i + 1)} ${l.trim().slice(0, 50)}`);
        }
      });
    }
    expect(offenders, "use on() from safety.ts instead").toEqual([]);
  });

  it("every worker handler contains its own failure", () => {
    // A throw in `install` means the new worker never activates: the app is
    // stuck on an old build with nothing to say so. A throw in `fetch` turns
    // every request into a network error.
    const sw = read("sw.ts");
    for (const handler of ["install", "activate", "fetch"]) {
      const i = sw.indexOf(`addEventListener("${handler}"`);
      expect(i, `${handler} handler missing`).toBeGreaterThan(-1);
      const body = sw.slice(i, sw.indexOf("\n});", i));
      expect(body, `${handler} has no catch`).toContain("catch");
    }
  });

  it("every sw_client callback is swallowed", () => {
    const c = read("sw_client.ts");
    expect(c).toContain("const swallow");
    // Match the REGISTRATION, not any mention: a comment naming the event
    // otherwise satisfies the search and the real call goes unchecked.
    for (const call of [
      /addEventListener\("controllerchange",\s*swallow\(/,
      /addEventListener\("visibilitychange",\s*swallow\(/,
      /addEventListener\("focus",\s*swallow\(/,
      /setInterval\(swallow\(/,
    ]) {
      expect(c, `unwrapped: ${call.source}`).toMatch(call);
    }
  });
});

describe("the wrappers actually contain a throw", () => {
  const listenable = () => {
    const handlers: ((e: Event) => void)[] = [];
    return {
      handlers,
      addEventListener: (_t: string, fn: (e: Event) => void) => { handlers.push(fn); },
    };
  };

  it("on() reports instead of propagating", () => {
    const seen: string[] = [];
    const t = listenable();
    on(t, "click", () => { throw new Error("boom"); }, "click", (m) => seen.push(m));
    expect(() => t.handlers[0]?.(new Event("click"))).not.toThrow();
    expect(seen[0]).toContain("click");
    expect(seen[0]).toContain("boom");
  });

  it("on() still delivers events that do not throw", () => {
    let got = 0;
    const t = listenable();
    on(t, "click", () => { got++; }, "click", () => undefined);
    t.handlers[0]?.(new Event("click"));
    expect(got).toBe(1);
  });

  it("a non-Error throw is described, not swallowed as undefined", () => {
    const seen: string[] = [];
    const t = listenable();
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- the point
    on(t, "x", () => { throw "a bare string"; }, "x", (m) => seen.push(m));
    t.handlers[0]?.(new Event("x"));
    expect(seen[0]).toContain("a bare string");
  });

  it("safe() wraps an ordinary function", () => {
    const seen: string[] = [];
    const f = safe("job", () => { throw new Error("nope"); }, (m) => seen.push(m));
    expect(() => { f(); }).not.toThrow();
    expect(seen[0]).toContain("nope");
  });

  it("safeAsync catches a rejection and a synchronous throw", async () => {
    const seen: string[] = [];
    safeAsync("fetching", () => Promise.reject(new Error("offline")), (m) => seen.push(m));
    await Promise.resolve();
    await Promise.resolve();
    expect(seen[0]).toContain("offline");

    safeAsync("building", () => { throw new Error("sync"); }, (m) => seen.push(m));
    expect(seen.some((s) => s.includes("sync"))).toBe(true);
  });
});

describe("the global net catches what escapes everything else", () => {
  it("reports uncaught errors and unhandled rejections", () => {
    const seen: string[] = [];
    const listeners = new Map<string, (e: Event) => void>();
    vi.stubGlobal("addEventListener", (t: string, fn: (e: Event) => void) => {
      listeners.set(t, fn);
    });
    vi.stubGlobal("removeEventListener", () => undefined);

    const h = installGlobalHandlers((m) => seen.push(m));
    expect(listeners.has("error"), "no error handler").toBe(true);
    expect(listeners.has("unhandledrejection"), "no rejection handler").toBe(true);

    listeners.get("error")?.({
      message: "kaboom", filename: "microgue.js", lineno: 42,
    } as unknown as Event);
    expect(seen[0]).toContain("kaboom");
    expect(seen[0]).toContain("microgue.js:42");

    listeners.get("unhandledrejection")?.({
      reason: new Error("dropped promise"),
    } as unknown as Event);
    expect(seen[1]).toContain("dropped promise");

    h.uninstall();
    vi.unstubAllGlobals();
  });

  it("is installed at boot", () => {
    expect(read("main.ts"), "the global net is never installed")
      .toContain("installGlobalHandlers");
  });
});

describe("the module split holds", () => {
  const size = (f: string): number => read(f).split("\n").length;

  it("no module has grown back into a god object", () => {
    // main.ts reached 2272 lines and was where every save and state bug in
    // this project hid. The split is only worth anything if it stays split.
    for (const f of SRC) {
      expect(size(f), `${f} is too large to reason about`).toBeLessThan(900);
    }
  });

  it("main.ts holds state and lifecycle, not turns, input or drawing", () => {
    const m = read("main.ts");
    // The bodies moved; only thin delegates remain. If a body comes back it
    // will blow the line budget above, but check the shape directly too.
    for (const marker of ["ctx.fillRect(", "ctx.drawImage(", "microbeTurn("]) {
      expect(m, `main.ts is doing its own work again: ${marker}`)
        .not.toContain(marker);
    }
  });

  it("no extracted module still refers to `this`", () => {
    // The mechanical rename replaced `this.` but not bare `this`, so
    // `const { ctx } = this` survived in eighteen places and would have been
    // a runtime error the moment those functions ran.
    for (const f of ["turn.ts", "input.ts", "render.ts"]) {
      // Strip BLOCK comments as well as line comments: a `/** ... this ... */`
      // doc comment was flagged as binding `this`, which is a false positive
      // that teaches you to ignore the test.
      const code = read(f)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      const stray = code.split("\n")
        .filter((l) => /(?<![\w.$])this(?![\w$])/.test(l));
      expect(stray, `${f} still binds \`this\``).toEqual([]);
    }
  });

  it("the extracted modules take the game, they do not import it at runtime", () => {
    // A value import of main.js from these would make a real circular
    // dependency. A type-only import is erased, so it cannot.
    for (const f of ["turn.ts", "input.ts", "render.ts"]) {
      const src = read(f);
      expect(src, `${f} must import Game as a type only`)
        .toMatch(/import type \{ Game \} from "\.\/main\.js";/);
      expect(src, `${f} has a runtime import of main.js`)
        .not.toMatch(/^import \{[^}]*\} from "\.\/main\.js";/m);
    }
  });
});
