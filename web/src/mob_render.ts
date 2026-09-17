// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// Drawing the microbes.
//
// Split from render.ts, whose r_draw had grown to 537 lines. This is the
// per-mob pass: sprite, facing, the motion squash, the idle life from
// life.ts, and the status tints. It closes over only the tile size, the
// high-contrast flag and the sight buffer, which is why it lifts cleanly.

import { isVisible, type Sight } from "./fov.js";
import { SIZES } from "./behaviour.js";
import { centreOf, stretchOf } from "./footprint.js";
import { drawBody, paletteForPigment, sprite } from "./paint.js";
import { squashFor, travel, wake } from "./motion.js";
import { lifeOf } from "./life.js";
import { eliteHalo } from "./fx_render.js";
import type { Game } from "./main.js";

export function r_drawMobs(
  _g: Game, ctx: CanvasRenderingContext2D, px: number, hc: boolean,
  sight: Sight,
  /** Per-mob lunge offsets, built by the caller from the effect queue. */
  lunges: ReadonlyMap<string, { x: number; y: number }>,
): void {
  for (const m of _g.level.mobs) {
    if (!m.alive) continue;
    // A remembered room is not knowledge of what is standing in it now.
    if (!isVisible(sight, m.x, m.y)) continue;
    const f = Math.max(m.hp / m.maxhp, 0);
    const ml = lunges.get(m.id);
    const mx = ml?.x ?? 0, my = ml?.y ?? 0;
    // Size is real: Synechococcus is about 1 um, a Beggiatoa filament 200.
    // A multi-tile body is drawn across its whole footprint and stretched
    // along its own axis, so a filament reads as one long organism rather
    // than a large blob on a single square.
    const fp = SIZES[m.size].footprint;
    const scale = SIZES[m.size].scale;
    const spread = fp === "block2" ? 2 : 1;
    const c = centreOf(fp, m.ax, m.ay, m.heading);
    const img = hc ? null : sprite(m.id, px * scale * spread,
                                   paletteForPigment(m.pigment));
    if (img) {
      const v = travel(m.ax, m.ay, m.x, m.y);
      const mv = squashFor(v, 0.16);
      // Idle life on top of motion: breath, drift, and a flinch on a hit.
      // Multiplied in, so a swimming cell still breathes.
      const life = lifeOf(_g.now, m.uid, m.hurtAt ?? -Infinity,
                          m.behaviour !== "sessile" && m.behaviour !== "wire",
                          _g.settings.reduceMotion);
      const sq = { sx: mv.sx * life.sx, sy: mv.sy * life.sy };
      const bx = (c.x + mx + 0.5 + life.dx) * px, by = (c.y + my + 0.5 + life.dy) * px;
      for (const w of wake(m.heading, v, 2)) {
        drawBody(ctx, img, bx + w.dx * px, by + w.dy * px, px * scale * spread,
                 m.facing, m.heading, sq, w.alpha * 0.7, "east", stretchOf(fp));
      }
      if (m.elite) eliteHalo(ctx, bx, by, px, _g.now, m.uid);
      drawBody(ctx, img, bx, by, px * scale * spread, m.facing, m.heading, sq,
               1, "east", stretchOf(fp));
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(m.x * px + px * 0.15, m.y * px + px * 0.15, px * 0.7, px * 0.7);
      ctx.fillStyle = "#000000";
      ctx.font = `bold ${px * 0.5}px ui-monospace,monospace`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(m.glyph, m.x * px + px / 2, m.y * px + px * 0.4);
    }
    // Only once damaged, so a fresh level is not wallpapered in gauges.
    if (f < 1) {
      const bx = c.x * px + px * 0.2;
      const by = c.y * px + px * 0.87;
      const bw = px * 0.6;
      const bh = Math.max(px * 0.08, 3);
      ctx.fillStyle = "rgba(0,0,0,0.8)";
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = "#ffd08a";
      ctx.fillRect(bx, by, bw * f, bh);
    }
  }
}
