// The lab, as a real floor.
//
// The first version of this was a painted scene with its own state machine and
// its own input handling. It looked right and taught nothing: the player
// watched an animation and then met tap-to-move, the camera, the buttons and
// the log for the first time on D1, with things that bite.
//
// So it is a LEVEL. Same grid, same movement, same camera, same controls --
// and no hostiles, so the twenty turns it takes to cross the room are twenty
// turns of learning them for free. The bench is a tile you walk onto.
//
// Hand-drawn rather than generated. A room has right angles and a generator
// that makes caves will not produce one, and the point is that this place is
// unlike everything below it.

import { FLOOR, Grid, WALL } from "./mapgen.js";
import type { Stratum } from "./biology.js";

/**
 * The room, as text.
 *
 *   #  wall        .  floor        B  the bench (and the column on it)
 *   d  a desk other people work at   @  where you come in
 */
const PLAN = [
  "########################",
  "#......................#",
  "#..dd....dd....dd......#",
  "#..dd....dd....dd......#",
  "#......................#",
  "#......................#",
  "#.......######.........#",
  "#.......#....#.........#",
  "#.......#.BB.#.........#",
  "#.......#.BB.#.........#",
  "#.......#....#.........#",
  "#.......##..##.........#",
  "#......................#",
  "#..dd....dd....dd......#",
  "#..dd....dd....dd......#",
  "#......................#",
  "#..........@...........#",
  "########################",
];

export interface LabPlan {
  readonly grid: Grid;
  readonly entry: { x: number; y: number };
  /** Every tile of the bench. Stepping on one opens the choice. */
  readonly bench: { x: number; y: number }[];
  /** Where colleagues stand, so they are at desks rather than in the way. */
  readonly desks: { x: number; y: number }[];
}

export function labGrid(): LabPlan {
  const h = PLAN.length;
  const w = PLAN[0]?.length ?? 1;
  const grid = new Grid(w, h, WALL);
  const bench: { x: number; y: number }[] = [];
  const desks: { x: number; y: number }[] = [];
  let entry = { x: 1, y: 1 };

  for (let y = 0; y < h; y++) {
    const row = PLAN[y] ?? "";
    for (let x = 0; x < w; x++) {
      const c = row[x] ?? "#";
      if (c === "#") continue;
      // A desk is FLOOR you can walk over. Blocking them would turn the room
      // into a maze, and a tutorial whose first lesson is pathfinding round
      // furniture is teaching the wrong thing.
      grid.set(x, y, FLOOR);
      if (c === "B") bench.push({ x, y });
      if (c === "d") desks.push({ x, y });
      if (c === "@") entry = { x, y };
    }
  }
  return { grid, entry, bench, desks };
}

/**
 * The lab's palette.
 *
 * Cold and bright, so the first frame of D1 lands as a change of world. The
 * shape matches a real stratum because the renderer takes one, and giving it a
 * depth of 0 keeps it out of every depth-indexed table without a special case.
 */
export const LAB_STRATUM: Stratum = {
  depth: 0,
  name: "Preparation lab",
  teap: "O2",
  e0: 820,
  light: 1,
  wall: "#e8eeeb",
  floor: "#f6f9f8",
  accent: "#2a3a34",
  hatch: 0,
  density: 0.5,
  passes: 1,
  blurb: "Bench, benchtop, and a column that has been settling for weeks.",
  donor: "glucose",
  donorFrom: "the medium",
};
