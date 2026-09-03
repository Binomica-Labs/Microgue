// Barriers, as material.
//
// They were drawn one `fillRect` per tile, which read as a grid of doors --
// and looked especially wrong once the walls stopped being square. A crust or
// a mat grew into a gap; it has an edge like anything else that grew.
//
// Each MATERIAL is contoured separately, so two different crusts meeting in
// one gap stay two shapes rather than merging into one blob of the first
// colour.

import { BARRIERS } from "./barrier.js";
import { isSeen, isVisible } from "./fov.js";
import { jitter } from "./fx.js";
import { traceContour } from "./wall_path.js";
import type { Game } from "./main.js";

export function r_barriers(_g: Game, px: number, hc: boolean): void {
  const list = _g.level.barriers;
  if (list.length === 0) return;
  const ctx = _g.ctx;
  const sight = _g.level.sight;

  // Group by material. A Map keyed on the barrier id keeps the draw order
  // stable, which matters because two crusts can overlap at a corner.
  const byId = new Map<string, typeof list>();
  for (const b of list) {
    if (!isSeen(sight, b.x, b.y)) continue;
    const bucket = byId.get(b.id);
    if (bucket) bucket.push(b);
    else byId.set(b.id, [b]);
  }

  for (const [id, group] of byId) {
    const def = BARRIERS[id as keyof typeof BARRIERS];
    const here = new Set(group.map((b) => `${String(b.x)},${String(b.y)}`));
    const solid = (x: number, y: number): boolean =>
      here.has(`${String(x)},${String(y)}`);

    let lo = Infinity, hi = -Infinity, top = Infinity, bot = -Infinity;
    for (const b of group) {
      if (b.x < lo) lo = b.x;
      if (b.x > hi) hi = b.x;
      if (b.y < top) top = b.y;
      if (b.y > bot) bot = b.y;
    }

    // Any of the group visible lights the whole patch: a crust is one object,
    // and half of it dimmed at a fog boundary reads as two materials.
    const lit = group.some((b) => isVisible(sight, b.x, b.y));

    let path: Path2D;
    try {
      path = new Path2D();
    } catch {
      return;                       // no Path2D: nothing to draw into
    }
    // No outer rectangle here, unlike the walls: a barrier IS the filled
    // region, where a cave is the hole in one.
    traceContour(path, solid, lo, top, hi, bot,
                 (lo * 31 + top) | 0, hc ? 0 : 0.10, hc ? 0 : 0.22);

    ctx.save();
    ctx.scale(px, px);
    ctx.globalAlpha = lit ? 0.85 : 0.4;
    ctx.fillStyle = def.colour;
    ctx.fill(path);
    ctx.restore();

    // The grain, clipped to the shape so it cannot spill past a rounded edge.
    ctx.save();
    ctx.scale(px, px);
    ctx.clip(path);
    ctx.scale(1 / px, 1 / px);
    ctx.globalAlpha = lit ? 0.35 : 0.15;
    ctx.fillStyle = "#000000";
    for (const b of group) {
      for (let i = 0; i < 4; i++) {
        const j = jitter(b.x * 31 + b.y, i);
        ctx.fillRect((b.x + 0.5 + j.x * 0.32) * px, (b.y + 0.5 + j.y * 0.32) * px,
                     px * 0.2, px * 0.2);
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    // Digestion in progress, per tile: it is progress on THAT tile, not on the
    // patch, so it stays square where the material does not.
    for (const b of group) {
      if (b.work <= 0) continue;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = Math.max(px * 0.05, 1);
      ctx.strokeRect(b.x * px + px * 0.12, b.y * px + px * 0.12,
                     px * 0.76, px * 0.76);
    }
  }
}
