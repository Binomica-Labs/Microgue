// The class picker's frame.
//
// Split from render.ts when that hit the 900-line ceiling `spec` enforces.
// It is a pre-game screen like the splash: no world, no camera, no HUD, and
// nothing on it depends on a run existing. The splash lives here for the
// same reason -- the two are one flow, and a tap on an empty slot moves
// between them.

import { drawClassPicker } from "./class_ui.js";
import { drawClose, stage } from "./chrome.js";
import { drawSplash } from "./screens.js";
import type { Game } from "./main.js";

export function r_drawPicker(_g: Game, W: number, H: number): void {
  const slot = _g.pickingClassFor;
  if (slot === null) return;
  const ctx = _g.ctx;

    const uu = Math.max(Math.min(W, H) / 420, 1);
    drawClassPicker(ctx, W, H, _g.insets(), uu, _g.classRows,
                    slot);
    _g.closeBox = drawClose(ctx, W, _g.insets(), uu);
    _g.drawToasts(W, H);
    return;
  }

export function r_drawSplash(_g: Game, W: number, H: number): void {
  const ctx = _g.ctx;
  _g.closeBox = drawSplash(ctx, W, H, stage(W, _g.insets(), Math.max(Math.min(W, H) / 420, 1)),
    Math.max(Math.min(W, H) / 420, 1), _g.slotBoxes, _g.lab);
  _g.drawToasts(W, H);
}
