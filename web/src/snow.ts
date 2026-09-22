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

export interface Mote {
  x: number; y: number; r: number; a: number;
  /** Stable identity: the same mote at another time or through another window. */
  id: number;
}

/** Motes per 100 tiles of visible area, by depth. Deeper is murkier. */
const DENSITY = [0, 0.9, 1.1, 1.4, 1.6, 1.9, 2.2, 2.6, 3.0];

/** World strips are this many tiles wide... */
const STRIP = 8;
/** ...and the fall repeats every PERIOD tiles down. Every period of a strip
 *  holds the SAME motes, so one leaving the bottom of a period is exactly the
 *  one entering the top of the next: no seam, and nothing pops. */
const PERIOD = 32;

const hash = (n: number): number => {
  let h = Math.imul(n * 374761393 + 668265263, 1274126177);
  h = (h ^ (h >>> 15)) >>> 0;
  return h / 4294967296;
};

/**
 * Motes visible in a tile window, at time `now`.
 *
 * Positions are in WORLD tiles and depend only on (time, seed, strip): the
 * window chooses which motes are returned, never where they are. It used to
 * lay the lanes across the window and wrap the fall over its height, and the
 * window is the camera -- so the whole snowfield travelled with the player
 * and sank "relative to" them, like a shadow. Snow is the fixed medium the
 * eye reads motion against; it must stay put while you move through it.
 *
 * A slight sideways sway gives the wobble of something falling through water
 * rather than air.
 */
export function motes(
  now: number, seed: number, s: Stratum,
  x0: number, y0: number, x1: number, y1: number,
): Mote[] {
  // A non-finite clock yields NaN positions; say so explicitly.
  if (!Number.isFinite(now)) return [];
  if (!(x1 - x0 + 1 > 0) || !(y1 - y0 + 1 > 0)) return [];   // inverted or empty
  const per = Math.round((STRIP * PERIOD / 100) * (DENSITY[s.depth] ?? 1));
  const out: Mote[] = [];
  const t = now / 1000;
  for (let sx = Math.floor((x0 - 1) / STRIP); sx <= Math.floor((x1 + 1) / STRIP); sx++) {
    for (let i = 0; i < per; i++) {
      const k = (seed * 131 + sx * 7919) * 64 + i;
      const lane = sx * STRIP + hash(k) * STRIP;
      const sway = Math.sin(now / 1400 + hash(k + 3) * 6.28) * 0.15;
      const x = lane + sway;
      if (x < x0 - 0.5 || x > x1 + 1.5) continue;
      const rate = 0.12 + hash(k + 1) * 0.25;               // tiles per second
      const f = (t * rate + hash(k + 2) * PERIOD) % PERIOD;  // 0..PERIOD
      // Every copy of this mote, one per period, that falls in the window.
      for (let py = Math.floor((y0 - 1 - f) / PERIOD); ; py++) {
        const y = py * PERIOD + f;
        if (y > y1 + 1) break;
        if (y < y0 - 1) continue;
        out.push({ x, y, r: 0.04 + hash(k + 4) * 0.05, a: 0.10 + hash(k + 5) * 0.14,
                   id: k * 4096 + py });
      }
    }
  }
  return out;
}
