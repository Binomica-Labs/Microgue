/// <reference lib="webworker" />
// Service worker: precache everything, then serve cache-first.
//
// This is what turns the home-screen icon into a real app -- after the first
// visit the game launches with no network at all, and instantly. Written in
// TypeScript and compiled to public/sw.js like the rest of the source.

declare const self: ServiceWorkerGlobalScope;

// Injected at build time from a hash of the bundled assets. Bumping this by
// hand was the single most reliable way to ship a change that never reached
// anyone: the deploy goes green and the cache keeps serving the old bundle.
declare const __BUILD__: string;
const VERSION = `microgue-${__BUILD__}`;
const ASSETS: readonly string[] = [
  "./",
  "./index.html",
  "./microgue.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-192.png",
  "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
];

// The worker's own handlers are the update path. A throw in `install` means
// the new worker never activates and the app is stuck on an old build with no
// way to say so -- so each one swallows its own failures.
self.addEventListener("install", (event: ExtendableEvent) => {
  event.waitUntil(
    caches.open(VERSION)
      .then(async (cache) => { await cache.addAll([...ASSETS]); })
      // A single 404 must not wedge the whole install.
      .catch(() => undefined)
      .then(async () => { await self.skipWaiting(); }),
  );
});

self.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(
    caches.keys()
      .then(async (keys) => {
        await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
      })
      .then(async () => { await self.clients.claim(); })
      // Failing to sweep old caches must not stop the new worker taking over.
      // An activate that rejects leaves the app on the previous build.
      .catch(() => undefined),
  );
});

self.addEventListener("fetch", (event: FetchEvent) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // Any navigation resolves to the shell, so a deep link works offline too.
  if (req.mode === "navigate") {
    event.respondWith(
      caches.match("./index.html")
        .then((hit) => hit ?? fetch(req))
        // A cache read that throws would otherwise turn every navigation into
        // a network error, offline or not.
        .catch(() => fetch(req)),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        // Only cache our own successful same-origin responses.
        if (res.ok && new URL(req.url).origin === self.location.origin) {
          const copy = res.clone();
          void caches.open(VERSION).then(async (c) => { await c.put(req, copy); });
        }
        return res;
      });
    }).catch(() => fetch(req)),
  );
});

export {};
