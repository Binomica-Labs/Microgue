import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The update path is three separate failures stacked, and each is invisible on
// its own: a stale sw.js from the HTTP cache, a check that never re-runs, and
// a page that keeps executing the JavaScript it already parsed. These assert
// each one, because "close the app twice and it works" is not a bug report
// anyone can act on.

interface FakeReg {
  update: ReturnType<typeof vi.fn>;
  waiting: object | null;
}

function setup(opts: { hasController: boolean }) {
  const listeners = new Map<string, (() => void)[]>();
  const reg: FakeReg = { update: vi.fn(() => Promise.resolve()), waiting: null };
  const register = vi.fn(() => Promise.resolve(reg));
  const swListeners: (() => void)[] = [];

  vi.stubGlobal("navigator", {
    serviceWorker: {
      controller: opts.hasController ? {} : null,
      register,
      getRegistration: () => Promise.resolve(reg),
      addEventListener: (t: string, fn: () => void) => {
        if (t === "controllerchange") swListeners.push(fn);
      },
    },
  });
  vi.stubGlobal("document", {
    visibilityState: "visible",
    addEventListener: (t: string, fn: () => void) => {
      listeners.set(t, [...(listeners.get(t) ?? []), fn]);
    },
  });
  vi.stubGlobal("addEventListener", (t: string, fn: () => void) => {
    listeners.set(t, [...(listeners.get(t) ?? []), fn]);
  });
  vi.stubGlobal("setInterval", () => 0);
  vi.stubGlobal("location", { reload: vi.fn() });
  return { reg, register, listeners, swListeners };
}

describe("service worker updates", () => {
  beforeEach(() => { vi.resetModules(); vi.unstubAllGlobals(); });

  it("registers with the HTTP cache bypassed", async () => {
    const { register } = setup({ hasController: true });
    const { installUpdater } = await import("../src/sw_client.js");
    installUpdater();
    await Promise.resolve();
    expect(register).toHaveBeenCalledWith("./sw.js",
      expect.objectContaining({ updateViaCache: "none" }));
  });

  it("checks for an update when the app becomes visible again", async () => {
    const { reg, listeners } = setup({ hasController: true });
    const { installUpdater } = await import("../src/sw_client.js");
    installUpdater();
    await Promise.resolve(); await Promise.resolve();
    const before = reg.update.mock.calls.length;
    for (const fn of listeners.get("visibilitychange") ?? []) fn();
    expect(reg.update.mock.calls.length,
      "a resumed PWA never fires load, so it must check on visibility")
      .toBeGreaterThan(before);
  });

  it("reloads when a new worker takes control", async () => {
    const { swListeners } = setup({ hasController: true });
    const { installUpdater } = await import("../src/sw_client.js");
    const reload = vi.fn();
    installUpdater({ reload });
    for (const fn of swListeners) fn();
    expect(reload, "the running page keeps the old bundle until it reloads")
      .toHaveBeenCalledTimes(1);
  });

  it("does NOT reload on the very first install", async () => {
    const { swListeners } = setup({ hasController: false });
    const { installUpdater } = await import("../src/sw_client.js");
    const reload = vi.fn();
    installUpdater({ reload });
    for (const fn of swListeners) fn();
    expect(reload, "the initial claim is not an update").not.toHaveBeenCalled();
  });

  it("reloads at most once, so it cannot loop", async () => {
    const { swListeners } = setup({ hasController: true });
    const { installUpdater } = await import("../src/sw_client.js");
    const reload = vi.fn();
    installUpdater({ reload });
    for (let i = 0; i < 10; i++) for (const fn of swListeners) fn();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("announces the update before reloading", async () => {
    const { swListeners } = setup({ hasController: true });
    const { installUpdater } = await import("../src/sw_client.js");
    const order: string[] = [];
    installUpdater({
      onUpdating: () => order.push("announce"),
      reload: () => order.push("reload"),
    });
    for (const fn of swListeners) fn();
    expect(order).toEqual(["announce", "reload"]);
  });

  it("is inert where service workers do not exist", async () => {
    vi.stubGlobal("navigator", {});
    const { installUpdater } = await import("../src/sw_client.js");
    expect(() => { installUpdater(); }).not.toThrow();
  });

  it("survives a registration that rejects", async () => {
    setup({ hasController: true });
    vi.stubGlobal("navigator", {
      serviceWorker: {
        controller: {},
        register: () => Promise.reject(new Error("blocked")),
        addEventListener: () => undefined,
      },
    });
    const { installUpdater } = await import("../src/sw_client.js");
    expect(() => { installUpdater(); }).not.toThrow();
    await Promise.resolve();
  });
});

describe("the worker itself", () => {
  it("its cache name is derived from the build, never hand-written", () => {
    // A constant here was forgotten twice, and a forgotten bump ships a deploy
    // that CI passes and nobody receives.
    const src = readFileSync("src/sw.ts", "utf8");
    expect(src).toContain("__BUILD__");
    expect(src).not.toMatch(/const VERSION = "microgue-v\d+"/);
  });

  it("takes over immediately rather than waiting for every tab to close", () => {
    const src = readFileSync("src/sw.ts", "utf8");
    expect(src).toContain("skipWaiting");
    expect(src).toContain("clients.claim");
  });

  it("drops every cache that is not the current one", () => {
    const src = readFileSync("src/sw.ts", "utf8");
    expect(src).toMatch(/caches\.delete/);
  });
});
