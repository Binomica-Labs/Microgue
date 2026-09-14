// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// Marine snow: the water is not empty.
//
// A stratified column is full of sinking detritus -- dead cells, faecal
// pellets, flocculated organic matter -- drifting down through the light
// and settling into the sediment. Real Winogradsky columns are cloudy with
// it. On screen, a slow rain of faint motes across the visible area does two
// things: it says "this is fluid you are suspended in", and it gives the
// fixed things (biofilm, secretions, walls) a moving reference so the eye
// reads depth.
//
// Deterministic in (time, seed): every mote's position is a function, not
// state, so there is nothing to update and nothing to save. Density and
// colour are the stratum's -- an oxic surface has sparse bright flecks, a
// sulfidic layer thick dark ones. Reduce-motion turns it off.

import type { Stratum } from "./biology.js";

export interface Mote { x: number; y: number; r: number; a: number }

/** Motes per 100 tiles of visible area, by depth. Deeper is murkier. */
const DENSITY = [0, 0.9, 1.1, 1.4, 1.6, 1.9, 2.2, 2.6, 3.0];

const hash = (n: number): number => {
  let h = Math.imul(n * 374761393 + 668265263, 1274126177);
  h = (h ^ (h >>> 15)) >>> 0;
  return h / 4294967296;
};

/**
 * Motes in a tile window, at time `now`.
 *
 * Each mote has a fixed lane (x) and sinks at its own rate; its y is time
 * wrapped over the window height plus a margin, so they enter at the top
 * and leave at the bottom. A slight sideways sway gives them the wobble of
 * something falling through water rather than air.
 */
export function motes(
  now: number, seed: number, s: Stratum,
  x0: number, y0: number, x1: number, y1: number,
): Mote[] {
  // A non-finite clock yields NaN positions, which `arc()` draws nowhere but
  // `isSeen(floor(NaN))` reads as false anyway; still, make it explicit.
  if (!Number.isFinite(now)) return [];
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  if (!(w > 0) || !(h > 0)) return [];      // inverted or empty window
  const n = Math.round((w * h / 100) * (DENSITY[s.depth] ?? 1));
  const out: Mote[] = [];
  for (let i = 0; i < n; i++) {
    const k = seed * 131 + i;
    const lane = x0 + hash(k) * w;
    const rate = 0.12 + hash(k + 1) * 0.25;           // tiles per second
    const span = h + 2;
    const y = y0 - 1 + ((now / 1000) * rate + hash(k + 2) * span) % span;
    const sway = Math.sin(now / 1400 + hash(k + 3) * 6.28) * 0.15;
    out.push({
      x: lane + sway, y,
      r: 0.04 + hash(k + 4) * 0.05,
      a: 0.10 + hash(k + 5) * 0.14,
    });
  }
  return out;
}
