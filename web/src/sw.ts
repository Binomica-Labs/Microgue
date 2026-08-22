/// <reference lib="webworker" />
// Service worker: precache everything, then serve cache-first.
//
// This is what turns the home-screen icon into a real app -- after the first
// visit the game launches with no network at all, and instantly. Written in
// TypeScript and compiled to public/sw.js like the rest of the source.

declare const self: ServiceWorkerGlobalScope;

const VERSION = "microgue-v6";
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
      .then(async () => { await self.clients.claim(); }),
  );
});

self.addEventListener("fetch", (event: FetchEvent) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // Any navigation resolves to the shell, so a deep link works offline too.
  if (req.mode === "navigate") {
    event.respondWith(
      caches.match("./index.html").then((hit) => hit ?? fetch(req)),
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
    }),
  );
});

export {};
