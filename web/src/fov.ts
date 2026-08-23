// Field of view, by recursive shadowcasting.
//
// Until now the whole level was visible at once, which removes exploration,
// ambush and any reason for the map to unfold. Shadowcasting is the standard
// solution and it is symmetric enough to feel fair: if you can see a tile, a
// thing standing on it could see you.
//
// Two layers of state per level:
//   VISIBLE   lit right now, recomputed every time you move
//   SEEN      remembered. Terrain stays drawn once discovered; creatures and
//             loot do not, because memory of a room is not knowledge of what
//             is currently standing in it.

import type { Grid } from "./mapgen.js";

export interface Sight {
  readonly w: number;
  readonly h: number;
  readonly visible: Uint8Array;
  readonly seen: Uint8Array;
}

export function makeSight(w: number, h: number): Sight {
  return { w, h, visible: new Uint8Array(w * h), seen: new Uint8Array(w * h) };
}

export const isVisible = (s: Sight, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < s.w && y < s.h && s.visible[y * s.w + x] === 1;

export const isSeen = (s: Sight, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < s.w && y < s.h && s.seen[y * s.w + x] === 1;

/** The eight octant transforms, as [xx, xy, yx, yy]. */
const OCTANTS: readonly (readonly [number, number, number, number])[] = [
  [1, 0, 0, 1], [0, 1, 1, 0], [0, -1, 1, 0], [-1, 0, 0, 1],
  [-1, 0, 0, -1], [0, -1, -1, 0], [0, 1, -1, 0], [1, 0, 0, -1],
];

function castLight(
  s: Sight, grid: Grid, cx: number, cy: number, radius: number,
  row: number, startSlope: number, endSlope: number,
  xx: number, xy: number, yx: number, yy: number,
): void {
  if (startSlope < endSlope) return;
  let nextStart = startSlope;

  for (let d = row; d <= radius; d++) {
    let blocked = false;
    for (let dx = -d, dy = -d; dx <= 0; dx++) {
      const lSlope = (dx - 0.5) / (dy + 0.5);
      const rSlope = (dx + 0.5) / (dy - 0.5);
      if (rSlope > startSlope) continue;
      if (lSlope < endSlope) break;

      const mx = cx + dx * xx + dy * xy;
      const my = cy + dx * yx + dy * yy;
      if (mx < 0 || my < 0 || mx >= s.w || my >= s.h) continue;

      // Round radius, so vision is a disc rather than a square.
      if (dx * dx + dy * dy <= radius * radius) {
        const i = my * s.w + mx;
        s.visible[i] = 1;
        s.seen[i] = 1;
      }

      const wall = grid.isWall(mx, my);
      if (blocked) {
        if (wall) { nextStart = rSlope; continue; }
        blocked = false;
        startSlope = nextStart;
      } else if (wall && d < radius) {
        blocked = true;
        castLight(s, grid, cx, cy, radius, d + 1, startSlope, lSlope, xx, xy, yx, yy);
        nextStart = rSlope;
      }
    }
    if (blocked) break;
  }
}

/** Recompute what is lit from a position. Remembered tiles are never cleared. */
export function computeFov(
  s: Sight, grid: Grid, cx: number, cy: number, radius: number,
): void {
  s.visible.fill(0);
  if (cx < 0 || cy < 0 || cx >= s.w || cy >= s.h) return;
  const i = cy * s.w + cx;
  s.visible[i] = 1;
  s.seen[i] = 1;
  for (const [xx, xy, yx, yy] of OCTANTS) {
    castLight(s, grid, cx, cy, radius, 1, 1, 0, xx, xy, yx, yy);
  }
}

/** How far you can see. Light dies with depth, which is the column's own
 *  gradient: the photic zone is bright, the methanogenic floor is not. */
export function sightRadius(light: number): number {
  return Math.round(6 + light * 5);
}

export function fractionSeen(s: Sight): number {
  let n = 0;
  for (const v of s.seen) n += v;
  return n / s.seen.length;
}
