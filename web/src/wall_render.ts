// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// Drawing the wall mass: silhouette, depth gradient, lit lip, and sediment
// texture.
//
// Split from render.ts at the 900-line ceiling. It is one coherent pass -- the
// walls are a MASS, not a shape, and every layer here (the fill, the gradient
// that says which side is solid, the lip that catches light at the boundary,
// the stratum texture) works to that. Reads the camera window and stratum from
// the caller; owns nothing else.

import { WALL_SPREAD } from "./walls.js";
import { wallEdge, wallSilhouette } from "./wall_path.js";
import { wallPattern, wallPatternSize } from "./paint.js";
import type { Stratum } from "./biology.js";
import type { Game } from "./main.js";

export function r_drawWalls(
  _g: Game, ctx: CanvasRenderingContext2D, s: Stratum, px: number,
  x0: number, y0: number, x1: number, y1: number, hc: boolean, inLab: boolean,
): void {
  const grid = _g.level.grid;
  const solidAt = (gx: number, gy: number): boolean =>
    gx < 0 || gy < 0 || gx >= grid.w || gy >= grid.h || grid.isWall(gx, gy);
  const wallPath = wallSilhouette(
    solidAt, grid.w, grid.h, _g.level.floor,
    _g.dungeon.seed ^ (_g.level.floor * 9176),
    // The lab is a ROOM. The organic bulge and the per-vertex jitter exist
    // to stop caves looking cut from a stencil, and applied to right angles
    // they rounded a 26x22 room into a lozenge -- which is why it read as a
    // blob rather than a lab.
    hc || inLab ? 0 : WALL_SPREAD[s.hatch] * 0.14,
    hc || inLab ? 0 : 0.20, hc,
    () => {
      try { return new Path2D(); } catch { return null; }
    }) ?? new Path2D();

  ctx.fillStyle = hc ? "#ffffff" : s.wall;
  ctx.save();
  ctx.scale(px, px);
  ctx.fill(wallPath);
  ctx.restore();

  // Depth, so the wall is a MASS rather than a shape.
  //
  // One flat fill reads as a cut-out however good the outline is: nothing
  // says which side is solid. A rim lit from above and a darker interior is
  // the cheapest thing that does -- one clipped gradient, no per-tile work,
  // and it survives any zoom because it is drawn in screen space.
  if (!hc) {
    ctx.save();
    ctx.scale(px, px);
    ctx.clip(wallPath);
    ctx.scale(1 / px, 1 / px);

    // Sediment settles in layers, so the shading runs horizontally: light
    // catches the upper face of every bank.
    const top = y0 * px, bot = (y1 + 1) * px;
    const g2 = ctx.createLinearGradient(0, top, 0, bot);
    g2.addColorStop(0, "rgba(255,255,255,0.10)");
    g2.addColorStop(0.35, "rgba(255,255,255,0.02)");
    g2.addColorStop(1, "rgba(0,0,0,0.22)");
    ctx.fillStyle = g2;
    ctx.fillRect((x0 - 1) * px, top, (x1 - x0 + 3) * px, bot - top);
    ctx.restore();

    // And a lip along the boundary itself: the edge where wall meets floor
    // is where a real bank catches the most light.
    // Stroke the cave loops WITHOUT the outer rectangle -- stroking the
    // grid-edge rectangle drew a bright line across the map top. See wallEdge.
    const edge = wallEdge(solidAt, grid.w, grid.h, _g.level.floor,
      _g.dungeon.seed ^ (_g.level.floor * 9176),
      WALL_SPREAD[s.hatch] * 0.14, 0.20,
      () => { try { return new Path2D(); } catch { return null; } });
    if (edge) {
      ctx.save();
      ctx.scale(px, px);
      ctx.strokeStyle = "rgba(255,255,255,0.13)";
      ctx.lineWidth = Math.max(2 / px, 0.02);
      ctx.stroke(edge);
      ctx.restore();
    }
  }

  // ONE fill for the whole wall area. Drawing the motif per tile cost about
  // five thousand canvas operations a frame -- an arc and a fill per mark,
  // per wall tile -- which is the entire budget on a phone. It is rasterised
  // once per stratum and tile size now; see wallPattern.
  if (!hc) {
    // No motif on a lab wall. The eight stratum textures are sediment --
    // grains, laminae, framboids -- and painting them on plaster is what
    // made the room look like a cave someone had whitewashed.
    const pat = inLab ? null
      : wallPattern(ctx, s.depth, px, s.floor, s.wall, s.accent);
    if (pat) {
      // The pattern is rasterised at a ROUNDED tile size, because rebuilding
      // it on every frame of a pinch would cost more than it saves. The
      // walls are drawn at the true fractional size. Filling one with the
      // other lets the texture slide against the tile grid -- 8px of drift
      // over twenty tiles at minimum zoom, which is the texture visibly
      // coming unstuck from the wall it belongs to.
      //
      // Scaling by px/q maps the pattern's q-pixel cells onto real tiles, so
      // it stays locked to the grid at any zoom, and lands on a tile
      // boundary every PATTERN_TILES.
      const k = px / wallPatternSize(px);
      ctx.save();
      ctx.scale(px, px);
      ctx.clip(wallPath);
      ctx.scale(k / px, k / px);
      ctx.fillStyle = pat;
      ctx.fillRect((x0 - 1) * px / k, (y0 - 1) * px / k,
                   (x1 - x0 + 3) * px / k, (y1 - y0 + 3) * px / k);
      ctx.restore();
    }
  }

}
