// Routing a tap on the front-of-game menus.
//
// The confirm logic lives here and is the point of the whole feature: an
// overwrite or a delete is a point of no return, and it happens only when the
// player taps the row AND THEN taps yes on a modal whose default is no. A
// modal that is up swallows every tap but its own two buttons.

import { loadSlot, deleteSlot } from "./saves.js";
import { labEnabled } from "./lab_level.js";
import { mainRows, type MenuMode } from "./menu.js";
import { inBox } from "./chrome.js";
import type { Game } from "./main.js";

function inside(box: { x: number; y: number; w: number; h: number } | null,
                x: number, y: number): boolean {
  return box !== null && inBox(box, x, y);
}

export function i_menuTap(_g: Game, x: number, y: number): void {
  const b = _g.menuBoxes;
  if (!b) return;
  const m = _g.menu;

  // A confirm modal is modal: only its two buttons respond, and NO is the
  // safe default, so a tap anywhere but yes cancels.
  if (m.confirm && b.confirm) {
    if (inside(b.confirm.yes, x, y)) {
      const c = m.confirm;
      m.confirm = null;
      if (c.kind === "delete") {
        deleteSlot(c.slot);           // and stay on the continue screen
      } else {
        // Overwrite: the slot is cleared as a side effect of starting a fresh
        // culture in it, which the class picker then does.
        deleteSlot(c.slot);
        _g.pickingClassFor = c.slot;
      }
    } else {
      m.confirm = null;               // cancel on no, or on a tap outside
    }
    return;
  }

  if (m.mode === "main") {
    const hit = b.rows.find((r) => inside(r.box, x, y));
    if (hit?.mode) m.mode = hit.mode;
    return;
  }

  if (inside(b.back, x, y)) { m.mode = "main"; return; }

  const hit = b.rows.find((r) => inside(r.box, x, y));
  if (hit?.toggle) {
    // Applied to live state now, persisted when a run starts writing its slot.
    // There is no global settings store -- settings live inside a save -- so a
    // change made at the menu with no active run holds for this session and is
    // written the moment a strain is inoculated.
    _g.settings = { ..._g.settings, [hit.toggle]: !_g.settings[hit.toggle] };
    _g.autoAttack = _g.settings.autoAttack;
    return;
  }
  if (hit?.slot === undefined) return;
  const slot = hit.slot;

  if (m.mode === "newGame") {
    // A used slot warns before it is overwritten; an empty one goes straight
    // to the choice (or the lab, if it is ever re-enabled).
    if (loadSlot(slot)) {
      m.confirm = { kind: "overwrite", slot };
    } else if (labEnabled()) {
      _g.enterLab(slot);
    } else {
      _g.pickingClassFor = slot;
    }
    return;
  }

  if (m.mode === "continue") {
    if (hit.del) {
      m.confirm = { kind: "delete", slot };
    } else if (loadSlot(slot)) {
      _g.startRun(slot);              // resume: the class was chosen long ago
    }
  }
}

/** The rows visible on the main screen right now, for tests. */
export function menuMainRows(hasSave: boolean): MenuMode[] {
  return mainRows(hasSave);
}
