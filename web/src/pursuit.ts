// Chasing a target.
//
// Tapping a microbe should mean "go kill that", not "walk to where it was".
// A static path is wrong the moment the target moves, so the route is
// recomputed every turn against its CURRENT body. Because both sides move one
// tile per turn, re-pathing each turn converges on the meeting point without
// needing to predict anything.

import { SIZES, chebyshev } from "./behaviour.js";
import type { Mob } from "./dungeon.js";
import { tilesOf } from "./footprint.js";
import type { Grid, Point } from "./mapgen.js";
import { findPath } from "./path.js";

export type Action =
  | { kind: "attack"; target: Mob }
  | { kind: "step"; to: Point; target: Mob }
  | { kind: "idle" };

/** Distance from a point to the nearest tile of a body. */
export function distanceTo(p: Point, m: Mob): number {
  return Math.min(...tilesOf(SIZES[m.size].footprint, m.x, m.y, m.heading)
    .map((t) => chebyshev(p.x, p.y, t.x, t.y)));
}

export function nearestMob(from: Point, mobs: readonly Mob[]): Mob | null {
  let best: Mob | null = null;
  let bd = Infinity;
  for (const m of mobs) {
    if (!m.alive) continue;
    const d = distanceTo(from, m);
    if (d < bd) { bd = d; best = m; }
  }
  return best;
}

export interface PursuitOpts {
  readonly reach: number;
  /** Give up on a target further away than this. */
  readonly maxRange: number;
}

/**
 * What to do this turn.
 *
 * `target` is the microbe already being chased; pass null with `autoSeek` to
 * pick the nearest. Returns `idle` when there is nothing to do, which is also
 * the signal to clear the target.
 */
export function nextAction(
  player: Point, mobs: readonly Mob[], grid: Grid,
  target: Mob | null, autoSeek: boolean, opts: PursuitOpts,
): Action {
  let t = target?.alive === true ? target : null;
  if (!t && autoSeek) t = nearestMob(player, mobs);
  if (!t) return { kind: "idle" };

  const dist = distanceTo(player, t);
  if (dist > opts.maxRange) return { kind: "idle" };
  if (dist <= opts.reach) return { kind: "attack", target: t };

  // Route to the closest tile adjacent to the body, not into it.
  const body = tilesOf(SIZES[t.size].footprint, t.x, t.y, t.heading);
  const occupied = new Set(body.map((b) => `${b.x},${b.y}`));
  const goals: Point[] = [];
  for (const b of body) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const g = { x: b.x + dx, y: b.y + dy };
        if (!grid.isFloor(g.x, g.y)) continue;
        if (occupied.has(`${g.x},${g.y}`)) continue;
        goals.push(g);
      }
    }
  }
  goals.sort((a, b) => chebyshev(player.x, player.y, a.x, a.y)
                     - chebyshev(player.x, player.y, b.x, b.y));

  for (const g of goals.slice(0, 8)) {
    if (g.x === player.x && g.y === player.y) return { kind: "attack", target: t };
    const path = findPath(grid, player, g);
    if (path && path.length > 1) {
      const step = path[1];
      if (step) return { kind: "step", to: step, target: t };
    }
  }
  return { kind: "idle" };
}
