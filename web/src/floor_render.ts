// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// The cave floor.
//
// It was not drawn at all: the wall silhouette sat on the black surround, so
// every floor tile was the same #010303 as unexplored fog. Flat black reads
// as "nothing here", which is wrong -- it is sediment you are swimming over.
//
// A faint mottle in the stratum's own floor colour: a few lighter and darker
// grains per tile, placed by a hash so they do not swim frame to frame. It
// is rasterised ONCE per stratum and tile size into a small pattern tile,
// the way the wall texture is -- per-tile drawing was the whole frame budget
// on a phone. Deliberately quiet: the walls carry the texture; the floor
// only needs to stop being a void.

import { shade } from "./relief.js";

const cache = new Map<string, CanvasPattern | null>();

/** Deterministic 0..1 from a tile coordinate. */
function grain(x: number, y: number, k: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

export function floorPattern(
  ctx: CanvasRenderingContext2D, depth: number, px: number, floor: string,
): CanvasPattern | null {
  const size = Math.max(Math.round(px), 4);
  const key = `${String(depth)}:${String(size)}:${floor}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  // A 4x4 tile block, so the repeat is not visible at every tile edge.
  const N = 4;
  let pat: CanvasPattern | null = null;
  try {
    const c = document.createElement("canvas");
    c.width = size * N; c.height = size * N;
    const g = c.getContext("2d");
    if (g) {
      g.fillStyle = floor;
      g.fillRect(0, 0, c.width, c.height);
      const light = shade(floor, 0.16), dark = shade(floor, -0.30);
      for (let ty = 0; ty < N; ty++) {
        for (let tx = 0; tx < N; tx++) {
          // three grains per tile, at hashed positions and sizes
          for (let k = 0; k < 3; k++) {
            const gx = tx * size + grain(tx, ty, k) * size;
            const gy = ty * size + grain(ty, tx, k + 7) * size;
            const r = size * (0.05 + grain(tx + ty, k, 3) * 0.07);
            g.fillStyle = grain(tx, ty, k + 11) < 0.5 ? light : dark;
            g.beginPath();
            g.arc(gx, gy, Math.max(r, 0.6), 0, Math.PI * 2);
            g.fill();
          }
        }
      }
      // A stub context returns undefined here; coerce so the miss is CACHED
      // as null and not re-rasterised every frame. That exact leak cost one
      // canvas per frame in the allocation test.
      pat = ctx.createPattern(c, "repeat") ?? null;
    }
  } catch {
    pat = null;
  }
  cache.set(key, pat);
  return pat;
}

/** Drop the cache -- on a stratum or zoom change the tile is stale. */
export function forgetFloor(): void { cache.clear(); }
