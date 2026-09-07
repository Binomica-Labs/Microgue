// The menu's frame.
//
// A pre-game screen like the picker: no world, no camera, no HUD. It reads the
// menu state and the save slots and hands the resulting hit boxes back to the
// Game, so input.ts can route a tap by what it landed on.

import { drawMenu } from "./menu_render.js";
import { listSlots } from "./saves.js";
import type { Game } from "./main.js";

export function r_drawMenu(_g: Game, W: number, H: number): void {
  const u = Math.max(Math.min(W, H) / 420, 1);
  _g.menuBoxes = drawMenu(_g.ctx, W, H, _g.insets(), u,
                          _g.menu.mode, listSlots(), _g.menu.confirm, {
    autoAttack: _g.settings.autoAttack, minimap: _g.settings.minimap,
    diagonal: _g.settings.diagonal, highContrast: _g.settings.highContrast,
    reduceMotion: _g.settings.reduceMotion,
  });
}
