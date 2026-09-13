// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// Walking onto a station.
//
// Each one is a part of preparing a culture, and stepping on it IS the
// interaction -- there are no lab controls to learn, only the ones the column
// uses. Split from turn.ts both for the ceiling and because none of this is
// about a turn passing.

import { STATION_NOTE, stationAt } from "./lab_level.js";
import type { Game } from "./main.js";

/** @returns true if the step was consumed by a station. */
export function labStation(_g: Game, x: number, y: number): boolean {
  const st = stationAt(_g.introStations, x, y);
  if (st !== null && st !== _g.atStation) {
    _g.atStation = st;
    _g.walk = null;
    _g.exploring = false;
    _g.note(STATION_NOTE[st]);
    if (st === "culture") _g.pickingClassFor = _g.introSlot;
    if (st === "notes") _g.showNotes = true;
    // The incubator is the way out, but only once there is something to
    // send: walking in before choosing would inoculate a default nobody
    // picked.
    if (st === "incubator" && _g.introChosen) {
      _g.startRun(_g.introSlot, _g.introClass);
    } else if (st === "incubator") {
      _g.note("Nothing to inoculate yet. The culture bench first.");
    }
    return true;
  }
  if (st === null) _g.atStation = null;
  return false;
}
