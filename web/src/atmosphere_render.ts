// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// The atmosphere: marine snow under the walls, and the water tint over them.
//
// Split from render.ts at the 900-line ceiling. Both are "paint something
// across the fog window": snow is motes on seen floor, drawn BEFORE the walls
// so they sit in the water; the tint is day/night, the run's weather and the
// strain's own aura, drawn AFTER the walls and before the fog so unexplored
// stays black. Neither runs in the lab or in high-contrast.

import { isSeen } from "./fov.js";
import { motes } from "./snow.js";
import { conditionTint, dayTint, strainAura } from "./water.js";
import { daylight } from "./cycle.js";
import { CONDITIONS } from "./conditions.js";
import type { Stratum } from "./biology.js";
import type { Phenotype } from "./phenotype.js";
import type { Game } from "./main.js";

export function r_drawSnow(
  _g: Game, ctx: CanvasRenderingContext2D, s: Stratum, px: number,
  x0: number, y0: number, x1: number, y1: number, hc: boolean, inLab: boolean,
): void {
  // Marine snow: motes sinking through the water, so the medium reads as
  // fluid. Only on seen tiles -- a mote in the fog would give away the map.
  if (!hc && !inLab && !_g.settings.reduceMotion) {
    ctx.fillStyle = s.depth <= 2 ? "rgba(220,240,230,1)" : "rgba(180,170,140,1)";
    for (const m of motes(_g.now, _g.dungeon.seed, s, x0, y0, x1, y1)) {
      const tx = Math.floor(m.x), ty = Math.floor(m.y);
      if (!isSeen(_g.level.sight, tx, ty) || !_g.level.grid.isFloor(tx, ty)) continue;
      ctx.globalAlpha = m.a;
      ctx.beginPath();
      ctx.arc(m.x * px, m.y * px, Math.max(m.r * px, 0.8), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

export function r_drawWater(
  _g: Game, ctx: CanvasRenderingContext2D, s: Stratum, px: number,
  x0: number, y0: number, x1: number, y1: number, hc: boolean, inLab: boolean,
  ph: Phenotype,
): void {
  // The water: day/night, the run's weather, and the strain's own aura --
  // one tint pass over the fog window, before the fog so unexplored stays
  // black. What the game knew but never showed.
  if (!hc && !inLab) {
    const win = { x: x0 * px, y: y0 * px, w: (x1 - x0 + 1) * px, h: (y1 - y0 + 1) * px };
    const still = _g.settings.reduceMotion;
    for (const t of [dayTint(daylight(_g.clock), s.depth),
                     conditionTint(CONDITIONS[_g.run.condition], _g.now, still)]) {
      if (t) { ctx.fillStyle = t; ctx.fillRect(win.x, win.y, win.w, win.h); }
    }
    const aura = strainAura(ph, _g.now, still);
    if (aura) {
      const cx = (_g.player.ax + 0.5) * px, cy = (_g.player.ay + 0.5) * px;
      const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, aura.r * px);
      rg.addColorStop(0, `rgba(${aura.colour},${aura.alpha.toFixed(3)})`);
      rg.addColorStop(1, `rgba(${aura.colour},0)`);
      ctx.fillStyle = rg;
      ctx.fillRect(cx - aura.r * px, cy - aura.r * px, aura.r * px * 2, aura.r * px * 2);
    }
  }

}
