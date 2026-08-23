// Multi-tile bodies.
//
// Size in this game is not decorative. A Beggiatoa filament reaches 200 um
// across and can be millimetres long, against about 1 um for a Synechococcus
// cell; drawing both inside one tile is the lie. Filaments occupy a line of
// tiles oriented along their own long axis, and colonial packets occupy a
// block, which makes them genuinely hard to slip past.

import type { Point } from "./mapgen.js";
import { snap8, TAU } from "./motion.js";

export type Footprint = "single" | "line2" | "line3" | "block2";

export const FOOTPRINT_TILES: Readonly<Record<Footprint, number>> = {
  single: 1, line2: 2, line3: 3, block2: 4,
};

/** Unit step for the nearest of eight compass directions. */
function axisStep(heading: number | null): Point {
  if (heading === null || !Number.isFinite(heading)) return { x: 1, y: 0 };
  const a = snap8(heading);
  const step = TAU / 8;
  const k = Math.round(a / step);
  const dirs: readonly Point[] = [
    { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: -1, y: 1 },
    { x: -1, y: 0 }, { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
  ];
  return dirs[((k % 8) + 8) % 8] ?? { x: 1, y: 0 };
}

/**
 * Tiles a body occupies, anchored at (x, y).
 *
 * Lines are centred on the anchor and lie along the heading, so a filament
 * turning sweeps the tiles it needs -- which is why turning in a tight
 * corridor can be impossible for one.
 */
export function tilesOf(fp: Footprint, x0: number, y0: number, heading: number | null): Point[] {
  // Anchors come from mob positions; a non-finite one would put a body at a
  // NaN tile, which is invisible, unhittable and never garbage-collected.
  // Clamped, not merely checked: 1e308 is finite but still puts a body at a
  // coordinate no grid contains, and the bounds reduce turns it into Infinity.
  const lim = 1e6;
  const x = Number.isFinite(x0) ? Math.min(Math.max(x0, -lim), lim) : 0;
  const y = Number.isFinite(y0) ? Math.min(Math.max(y0, -lim), lim) : 0;
  switch (fp) {
    case "single":
      return [{ x, y }];
    case "line2": {
      const d = axisStep(heading);
      return [{ x, y }, { x: x + d.x, y: y + d.y }];
    }
    case "line3": {
      const d = axisStep(heading);
      return [{ x: x - d.x, y: y - d.y }, { x, y }, { x: x + d.x, y: y + d.y }];
    }
    case "block2":
      return [{ x, y }, { x: x + 1, y }, { x, y: y + 1 }, { x: x + 1, y: y + 1 }];
  }
}

/** Does this body cover the given tile? */
export function covers(
  fp: Footprint, ax: number, ay: number, heading: number | null,
  x: number, y: number,
): boolean {
  return tilesOf(fp, ax, ay, heading).some((t) => t.x === x && t.y === y);
}

/** Bounding box in tiles, for rendering and for stretch. */
export function boundsOf(
  fp: Footprint, x: number, y: number, heading: number | null,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const ts = tilesOf(fp, x, y, heading);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const t of ts) {
    minX = Math.min(minX, t.x); maxX = Math.max(maxX, t.x);
    minY = Math.min(minY, t.y); maxY = Math.max(maxY, t.y);
  }
  return { minX, minY, maxX, maxY };
}

/** Centre of the footprint in tile coordinates, for drawing. */
export function centreOf(
  fp: Footprint, x: number, y: number, heading: number | null,
): Point {
  const b = boundsOf(fp, x, y, heading);
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

/** How far along its own axis a body should be stretched when drawn. */
export function stretchOf(fp: Footprint): number {
  switch (fp) {
    case "single": return 1;
    case "line2": return 1.8;
    case "line3": return 2.6;
    case "block2": return 1;
  }
}
