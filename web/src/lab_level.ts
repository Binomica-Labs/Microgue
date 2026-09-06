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
 *   #  wall     .  floor     d  a desk other people work at     @  the door
 *
 * Four STATIONS, each one part of preparing a culture. They are separate
 * benches rather than one because character creation is several decisions and
 * a single bench that opened a menu of menus is a menu with a floor around it:
 *
 *   C  culture bench     which organism goes in -- the class
 *   S  sequencer         the strain designation
 *   N  notes             the field notebook: what is known so far
 *   I  the incubator     the column itself. Walking here sends it down.
 */
const PLAN = [
  "##########################",
  "#........................#",
  "#..dd...............dd...#",
  "#..dd...............dd...#",
  "#........................#",
  "#..CCCC.......SSSS.......#",
  "#..CCCC.......SSSS.......#",
  "#........................#",
  "#........................#",
  "#........................#",
  "#.......########.........#",
  "#.......#......#.........#",
  "#.......#.IIII.#.........#",
  "#.......#.IIII.#.........#",
  "#.......#......#.........#",
  "#.......###..###.........#",
  "#........................#",
  "#..NNNN.............dd...#",
  "#..NNNN.............dd...#",
  "#........................#",
  "#...........@............#",
  "##########################",
];

export type StationId = "culture" | "sequencer" | "notes" | "incubator";

const STATION_OF: Readonly<Record<string, StationId | undefined>> = {
  C: "culture", S: "sequencer", N: "notes", I: "incubator",
};

/** What each station says when you reach it. */
export const STATION_NOTE: Readonly<Record<StationId, string>> = {
  culture: "Culture bench. Pick what goes into the column.",
  sequencer: "Sequencer. Give the strain a designation.",
  notes: "Field notebook. Everything the lab has recorded so far.",
  incubator: "The column. Walk in when the culture is ready.",
};

export interface LabPlan {
  readonly grid: Grid;
  readonly entry: { x: number; y: number };
  /** Each station's tiles, by what it does. Stepping on one opens it. */
  readonly stations: Record<StationId, { x: number; y: number }[]>;
  /** Where colleagues stand, so they are at desks rather than in the way. */
  readonly desks: { x: number; y: number }[];
}

export function labGrid(): LabPlan {
  const h = PLAN.length;
  const w = PLAN[0]?.length ?? 1;
  const grid = new Grid(w, h, WALL);
  const stations: Record<StationId, { x: number; y: number }[]> =
    { culture: [], sequencer: [], notes: [], incubator: [] };
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
      const st = STATION_OF[c];
      if (st) stations[st].push({ x, y });
      if (c === "d") desks.push({ x, y });
      if (c === "@") entry = { x, y };
    }
  }
  return { grid, entry, stations, desks };
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

/**
 * Which station a tile belongs to, if any.
 *
 * Stations are several tiles each -- a bench you can only reach from one
 * square is a bench you spend a turn lining up with, and lining up is not
 * something this room should teach.
 */
export function stationAt(
  stations: Readonly<Record<StationId, { x: number; y: number }[]>>,
  x: number, y: number,
): StationId | null {
  for (const id of Object.keys(stations) as StationId[]) {
    if (stations[id].some((t) => t.x === x && t.y === y)) return id;
  }
  return null;
}

/** An empty station map. Written once because it is spelled out in three
 *  places otherwise, and a missing key there is a silent crash. */
export function noStations(): Record<StationId, { x: number; y: number }[]> {
  return { culture: [], sequencer: [], notes: [], incubator: [] };
}
