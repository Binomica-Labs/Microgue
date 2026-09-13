// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// Opening and closing the chromosome screen.
//
// Split from main.ts at the 900-line ceiling. It is more than a toggle: every
// in-progress gesture has to be dropped, or a drag begun on the ring resumes
// against a ring that has since been rebuilt.

import type { Game } from "./main.js";

export function g_openPlasmid(_g: Game, open: boolean): void {

  _g.trace.push(_g.clock.turn, "ui", `plasmid ${open ? "open" : "close"}`);
  _g.showPlasmid = open;
  _g.selected = null;
  _g.dragFrom = null;
  _g.dragXY = null;
  _g.spinFrom = null;
  if (open) {
    _g.walk = null;                     // stop mid-path movement
    _g.path = null;
  }
}
