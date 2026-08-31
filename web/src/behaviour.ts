// How a microbe moves and attacks.
//
// Motility is a real, diagnostic property. Pseudomonas is a flagellated
// chemotaxing swimmer; Beggiatoa glides along a surface and cannot leave it;
// Thiothrix is anchored by a holdfast and never moves at all; Geobacter
// reaches down a conductive pilus instead of closing distance. Making those
// distinct is both accurate and the whole of the combat design.

import type { Grid, Point } from "./mapgen.js";
import type { Rng } from "./rng.js";
import { tilesOf, type Footprint } from "./footprint.js";

export type Behaviour =
  | "chase"    // flagellated, chemotactic: heads straight for you
  | "glide"    // gliding motility along surfaces: only moves adjacent to wall
  | "drift"    // non-motile: Brownian wander, closes only by luck
  | "sessile"  // anchored: never moves, strikes what comes adjacent
  | "wire"     // sessile but reaches: nanowire strike at range
  | "swarm";   // faster when its own kind is near -- quorum behaviour

/** Physical size. Real spread here is enormous: Synechococcus is about 1 um,
 *  Beggiatoa filaments reach 200 um across. */
export type Size = "pico" | "small" | "medium" | "large" | "filament";

export interface SizeDef {
  readonly scale: number;    // sprite scale relative to a tile
  readonly hp: number;       // hp multiplier
  readonly cooldown: number; // turns between actions; big bodies are slow
  readonly reach: number;    // tiles it can strike from
  readonly footprint: Footprint;
}

export const SIZES: Readonly<Record<Size, SizeDef>> = {
  pico:     { scale: 0.55, hp: 0.7, cooldown: 0, reach: 1, footprint: "single" },
  small:    { scale: 0.72, hp: 0.85, cooldown: 0, reach: 1, footprint: "single" },
  medium:   { scale: 0.92, hp: 1.0, cooldown: 0, reach: 1, footprint: "single" },
  // Colonial packets are genuinely hard to slip past.
  large:    { scale: 1.05, hp: 2.2, cooldown: 1, reach: 1, footprint: "block2" },
  // A filament lies along its own long axis across three tiles.
  filament: { scale: 1.1, hp: 3.0, cooldown: 1, reach: 2, footprint: "line3" },
};

export interface Sensed {
  readonly px: number; readonly py: number;   // player tile
  readonly dist: number;
  readonly alliesNear: number;
}

/** Chebyshev distance -- the grid is 8-connected. */
export const chebyshev = (ax: number, ay: number, bx: number, by: number): number =>
  Math.max(Math.abs(ax - bx), Math.abs(ay - by));

/** How far a behaviour can notice you. Sessile things still sense contact. */
/** How often a pursuing cell re-orients instead of holding its heading. */
export const TUMBLE = 0.35;
/** How often it tumbles in place, losing a step. */
export const PAUSE = 0.12;

export function senseRange(b: Behaviour): number {
  switch (b) {
    case "chase": return 9;
    case "swarm": return 8;
    case "glide": return 6;
    case "wire": return 4;
    case "drift": return 3;
    case "sessile": return 1;
  }
}

/** The step a microbe wants to take. `null` means hold position. */
/** Heading implied by a single step. */
function headingTo(from: Point, to: Point): number | null {
  const dx = to.x - from.x, dy = to.y - from.y;
  return dx === 0 && dy === 0 ? null : Math.atan2(dy, dx);
}

export function decideStep(
  b: Behaviour, at: Point, s: Sensed, grid: Grid, rng: Rng,
  occupied: (x: number, y: number) => boolean,
  fp: Footprint = "single",
): Point | null {
  const free = (x: number, y: number): boolean => {
    // A multi-tile body needs its WHOLE footprint clear, which is why a
    // filament cannot turn in a tight corridor.
    for (const t of tilesOf(fp, x, y, headingTo(at, { x, y }))) {
      if (!grid.isFloor(t.x, t.y)) return false;
      if (occupied(t.x, t.y)) return false;
    }
    return true;
  };

  /**
   * Toward the player, as a BIASED RANDOM WALK rather than a straight line.
   *
   * Perfect tracking made every chaser at a similar bearing pick the same step,
   * so a group moved in flawless lockstep -- which reads as one creature drawn
   * several times, and was the single most artificial thing on screen.
   *
   * The fix is also what actually happens. Chemotaxis is run-and-tumble: a
   * cell cannot steer, it swims straight and randomly re-orients, suppressing
   * the tumble while conditions improve. It goes the right way on average and
   * never in a straight line, and two cells side by side take different paths.
   */
  const toward = (): Point | null => {
    const dx = Math.sign(s.px - at.x);
    const dy = Math.sign(s.py - at.y);

    // A tumble re-orients to ANY free neighbour, weighted toward the player.
    //
    // Shuffling the three candidates toward the player was not enough and
    // measuring said so: for a cell directly left of the player, [dx,dy] and
    // [dx,0] are the SAME step and [0,dy] is a no-op, so the shuffle had
    // nothing to choose between and four cells in a row still moved as one,
    // sixty turns out of sixty.
    if (rng.next() < TUMBLE) {
      const opts: { p: Point; w: number }[] = [];
      for (let cy = -1; cy <= 1; cy++) {
        for (let cx = -1; cx <= 1; cx++) {
          if (cx === 0 && cy === 0) continue;
          if (!free(at.x + cx, at.y + cy)) continue;
          // Weight by agreement with the bearing: a step the right way is
          // several times likelier than one the wrong way, so it still closes
          // distance without ever tracking perfectly.
          const agree = (cx === dx ? 1 : cx === 0 ? 0 : -1)
            + (cy === dy ? 1 : cy === 0 ? 0 : -1);
          opts.push({ p: { x: at.x + cx, y: at.y + cy }, w: 1 + agree * 1.6 });
        }
      }
      const total = opts.reduce((a, o) => a + Math.max(o.w, 0.05), 0);
      let r = rng.next() * total;
      for (const o of opts) {
        r -= Math.max(o.w, 0.05);
        if (r <= 0) return o.p;
      }
    }

    for (const [cx, cy] of [[dx, dy], [dx, 0], [0, dy]] as const) {
      if ((cx !== 0 || cy !== 0) && free(at.x + cx, at.y + cy)) {
        return { x: at.x + cx, y: at.y + cy };
      }
    }
    return null;
  };

  switch (b) {
    case "sessile":
    case "wire":
      return null;                                  // anchored

    case "chase":
      if (s.dist > senseRange(b)) return null;
      // A pause is a tumble too: a cell that re-orients loses ground. Without
      // it a pack stays in perfect formation however much the steps vary.
      return rng.next() < PAUSE ? null : toward();

    case "swarm":
      // Quorum: only commits once enough of its own kind are around.
      if (s.dist > senseRange(b)) return null;
      return s.alliesNear >= 2 ? toward() : (rng.next() < 0.4 ? toward() : null);

    case "glide": {
      // Gliding motility needs a surface. Only steps to tiles that touch wall.
      if (s.dist > senseRange(b)) return null;
      const want = toward();
      if (want && touchesWall(grid, want.x, want.y)) return want;
      // otherwise shuffle along the surface it is already on
      const opts: Point[] = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = at.x + dx, ny = at.y + dy;
          if (free(nx, ny) && touchesWall(grid, nx, ny)) opts.push({ x: nx, y: ny });
        }
      }
      return opts.length > 0 ? rng.pick(opts) : null;
    }

    case "drift": {
      // Non-motile: Brownian. Closes distance only by luck.
      if (rng.next() < 0.55) return null;
      const dx = rng.int(3) - 1, dy = rng.int(3) - 1;
      if (dx === 0 && dy === 0) return null;
      return free(at.x + dx, at.y + dy) ? { x: at.x + dx, y: at.y + dy } : null;
    }
  }
}

export function touchesWall(grid: Grid, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if ((dx !== 0 || dy !== 0) && grid.isWall(x + dx, y + dy)) return true;
    }
  }
  return false;
}

/** Can it strike the player from where it stands? */
export function canStrike(b: Behaviour, size: Size, dist: number): boolean {
  const reach = b === "wire" ? 3 : SIZES[size].reach;
  return dist <= reach;
}
