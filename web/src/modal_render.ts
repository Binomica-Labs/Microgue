// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// The full-screen modals drawn over a paused world: research and the field
// notebook.
//
// Split from render.ts at the ceiling. Each is a screen the player opens with a
// button and closes to return to the game; none of them animates or depends on
// the frame past the state it reads. `r_drawModals` returns true when it has
// taken the frame, so the caller stops.

import { stage } from "./chrome.js";
import { drawNotes, drawResearch } from "./screens.js";
import type { Game } from "./main.js";

export function r_drawModals(_g: Game, W: number, H: number): boolean {
  const ctx = _g.ctx;
  if (_g.showResearch) {
    const u = Math.max(Math.min(W, H) / 420, 1);
    _g.closeBox = drawResearch(ctx, W, H, stage(W, _g.insets(), u), u,
      _g.genome.slots.flatMap((p) =>
        p?.kind === "gene" && p.id !== "ori"
          ? [{ id: p.id, level: p.level, mods: p.mods }] : []),
      _g.mods, _g.player.atp, _g.researchPick, _g.researchRows,
      _g.genome.strain, _g.genome.usableSlots,
      _g.genome.capacityKb(), _g.genome.traits);
    _g.drawToasts(W, H);
    return true;
  }
  if (_g.showNotes) {
    _g.closeBox = drawNotes(ctx, W, H, stage(W, _g.insets(), Math.max(Math.min(W, H) / 420, 1)),
      Math.max(Math.min(W, H) / 420, 1), _g.run,
      (t, w) => _g.wrap(t, w));
    _g.drawToasts(W, H);
    return true;
  }
  return false;
}
