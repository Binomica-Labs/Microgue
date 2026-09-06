// Walking into the lab.
//
// Split from main.ts at the 900-line ceiling. The lab is a Level like any
// other, which is the whole design: same grid, same movement, same camera,
// same controls, so the twenty turns it takes to cross the room are twenty
// turns of learning them with nothing that can bite.

import { makeSight } from "./fov.js";
import { LAB_STRATUM, labGrid } from "./lab_level.js";
import type { Level } from "./dungeon.js";
import type { Game } from "./main.js";

export function g_enterLab(_g: Game, slot: number): void {

  const plan = labGrid();
  _g.introSlot = slot;
  _g.introBench = plan.bench;
  const lvl: Level = {
    depth: 0, floor: 0, grid: plan.grid, stratum: LAB_STRATUM,
    up: plan.entry, down: null, mobs: [], visited: true, boss: false,
    rooms: [], barriers: [], cleared: true, stockedAt: 0,
    sight: makeSight(plan.grid.w, plan.grid.h),
  };
  _g.intro = lvl;
  _g.showSplash = false;
  // TRUE. The lab is a Level being played, and `started` is what gates the
  // frame loop, the input handler and the movement queue -- so leaving it
  // false disabled tap-to-move, the camera and auto-explore. The controls the
  // lab exists to teach were the exact controls it turned off.
  //
  // What must NOT happen is a save: `saveable` is the flag for that, and it
  // stays false until a class is chosen and a real strain exists.
  _g.started = true;
  _g.enter(lvl, plan.entry);
  _g.note("Preparation lab. Walk to the bench -- tap where you want to go.");
}
