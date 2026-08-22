// Organic wall contours.
//
// A grid of filled squares reads as a grid of filled squares. This traces the
// wall region instead, giving each tile a path whose corners depend on its
// neighbours:
//
//   * CONVEX — both orthogonal neighbours are floor, so the corner is exposed
//     and gets rounded off.
//   * CONCAVE — both orthogonal neighbours are wall but the diagonal is floor,
//     so three tiles meet in an L. A sharp 270° notch there is the single
//     biggest giveaway that the world is a grid, so it gets a meniscus fillet
//     that bridges the two edges.
//   * SQUARE — anything else. The edge continues into a neighbour and any
//     rounding would open a seam.
//
// Every tile is emitted as its own subpath and filled together under the
// nonzero winding rule, so shared edges merge with no seam. Each fillet is
// emitted exactly once: the three tiles around an L see the corner under
// different conditions and only one of them matches.

import type { Grid } from "./mapgen.js";

const HALF_PI = Math.PI / 2;

/**
 * Trace the wall region over a tile range into the current path, in TILE units.
 * Scale the context by the tile size before filling.
 */
export function traceWalls(
  ctx: CanvasRenderingContext2D,
  g: Grid,
  x0: number, y0: number, x1: number, y1: number,
  radius = 0.5,
): void {
  const r = Math.min(Math.max(Number.isFinite(radius) ? radius : 0.5, 0), 0.5);
  // At r = 0 every corner is square, so skip the arc calls entirely rather
  // than emitting degenerate zero-radius ones. High-contrast mode takes this
  // path and was paying for four no-op arcs per tile.
  const round = r > 0;
  const w = (x: number, y: number): boolean => g.isWall(x, y);

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!w(x, y)) continue;
      const n = w(x, y - 1), s = w(x, y + 1);
      const e = w(x + 1, y), wl = w(x - 1, y);
      const nw = w(x - 1, y - 1), ne = w(x + 1, y - 1);
      const sw = w(x - 1, y + 1), se = w(x + 1, y + 1);

      ctx.moveTo(x, y + (round && !n && !wl ? r : 0));

      // top-left
      if (round && !n && !wl) ctx.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
      else ctx.lineTo(x, y);
      // top-right
      if (round && !n && !e) ctx.arc(x + 1 - r, y + r, r, Math.PI * 1.5, Math.PI * 2);
      else ctx.lineTo(x + 1, y);
      // bottom-right
      if (round && !s && !e) ctx.arc(x + 1 - r, y + 1 - r, r, 0, HALF_PI);
      else ctx.lineTo(x + 1, y + 1);
      // bottom-left
      if (round && !s && !wl) ctx.arc(x + r, y + 1 - r, r, HALF_PI, Math.PI);
      else ctx.lineTo(x, y + 1);
      ctx.closePath();

      // Meniscus fillets at inside corners. Each is a small patch between the
      // corner point and an arc bulging into the empty diagonal.
      if (round && n && wl && !nw) {
        ctx.moveTo(x, y - r);
        ctx.lineTo(x, y);
        ctx.lineTo(x - r, y);
        ctx.arc(x - r, y - r, r, HALF_PI, 0, true);
        ctx.closePath();
      }
      if (round && n && e && !ne) {
        ctx.moveTo(x + 1, y - r);
        ctx.lineTo(x + 1, y);
        ctx.lineTo(x + 1 + r, y);
        ctx.arc(x + 1 + r, y - r, r, HALF_PI, Math.PI, false);
        ctx.closePath();
      }
      if (round && s && e && !se) {
        ctx.moveTo(x + 1, y + 1 + r);
        ctx.lineTo(x + 1, y + 1);
        ctx.lineTo(x + 1 + r, y + 1);
        ctx.arc(x + 1 + r, y + 1 + r, r, Math.PI * 1.5, Math.PI, true);
        ctx.closePath();
      }
      if (round && s && wl && !sw) {
        ctx.moveTo(x, y + 1 + r);
        ctx.lineTo(x, y + 1);
        ctx.lineTo(x - r, y + 1);
        ctx.arc(x - r, y + 1 + r, r, Math.PI * 1.5, Math.PI * 2, false);
        ctx.closePath();
      }
    }
  }
}

/** Corner classification, exposed so it can be tested without a canvas. */
export type Corner = "convex" | "concave" | "square";

export function classify(
  g: Grid, x: number, y: number, which: "tl" | "tr" | "br" | "bl",
): Corner {
  const w = (dx: number, dy: number): boolean => g.isWall(x + dx, y + dy);
  const [a, b, d] =
    which === "tl" ? [w(0, -1), w(-1, 0), w(-1, -1)] :
    which === "tr" ? [w(0, -1), w(1, 0), w(1, -1)] :
    which === "br" ? [w(0, 1), w(1, 0), w(1, 1)] :
                     [w(0, 1), w(-1, 0), w(-1, 1)];
  if (!a && !b) return "convex";
  if (a && b && !d) return "concave";
  return "square";
}
