// Auto-explore, and travel that ends in a blow.
//
// Both are one INPUT that spends many turns, and both stop the moment
// something happens. That is the shape Crawl uses and it is the right one: the
// tedium of crossing an empty room is not gameplay, but the moment something
// walks into view absolutely is, so the interrupt has to be immediate and
// total.
//
// The pure part lives here -- picking where to go -- so it can be tested
// without a game.

import { isSeen, type Sight } from "./fov.js";
import { findPath } from "./path.js";
import type { Grid, Point } from "./mapgen.js";

/**
 * The nearest floor tile worth walking to, by straight-line distance from the
 * player, that is adjacent to something unseen.
 *
 * Targeting unseen tiles directly is wrong: you cannot path INTO the unknown,
 * because as far as the pathfinder is concerned it might be solid. Targeting
 * the frontier -- known floor next to unknown -- is what actually reveals it.
 */
export function frontier(grid: Grid, sight: Sight, from: Point): Point | null {
  return frontierExcluding(grid, sight, from, new Set());
}

export type ExploreResult =
  | { kind: "go"; path: readonly Point[] }
  | { kind: "done"; why: string };

/**
 * Where to go next when exploring.
 *
 * Tries the nearest frontier and then progressively further ones, because the
 * nearest is sometimes behind a wall the pathfinder cannot get through and
 * giving up on the first failure would strand you next to a doorway.
 */
export function nextExplore(
  grid: Grid, sight: Sight, from: Point,
): ExploreResult {
  const tried = new Set<string>();
  for (let attempt = 0; attempt < 6; attempt++) {
    const target = frontierExcluding(grid, sight, from, tried);
    if (!target) break;
    tried.add(`${String(target.x)},${String(target.y)}`);
    const path = findPath(grid, from, target);
    if (path && path.length > 1) return { kind: "go", path };
  }
  return { kind: "done", why: "Nothing left within reach to explore." };
}

/** Nearest frontier tile not in `skip`. One implementation, used by both. */
function frontierExcluding(
  grid: Grid, sight: Sight, from: Point, skip: ReadonlySet<string>,
): Point | null {
  let best: Point | null = null;
  let bestD = Infinity;
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      if (skip.has(`${String(x)},${String(y)}`)) continue;
      if (!isSeen(sight, x, y) || !grid.isFloor(x, y)) continue;
      let edge = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= grid.w || ny >= grid.h) continue;
        if (!isSeen(sight, nx, ny)) { edge = true; break; }
      }
      if (!edge) continue;
      const d = (x - from.x) ** 2 + (y - from.y) ** 2;
      if (d < bestD && d > 0) { bestD = d; best = { x, y }; }
    }
  }
  return best;
}

/** How much of the level is still unknown, 0..1. Used to say when it is done. */
export function unexplored(grid: Grid, sight: Sight): number {
  let floor = 0, unseen = 0;
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      if (!grid.isFloor(x, y)) continue;
      floor++;
      if (!isSeen(sight, x, y)) unseen++;
    }
  }
  return floor === 0 ? 0 : unseen / floor;
}
