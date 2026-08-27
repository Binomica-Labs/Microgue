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

/** The subset of the path API this needs. Both CanvasRenderingContext2D and
 *  Path2D satisfy it structurally, so the caller can trace into either without
 *  a cast. */
export interface PathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  arc(cx: number, cy: number, r: number, a0: number, a1: number, ccw?: boolean): void;
  closePath(): void;
}

const HALF_PI = Math.PI / 2;

/**
 * How much the corner radius varies, per stratum, indexed by `hatch`.
 *
 * One constant radius made every convex corner the same quarter circle: a
 * one-tile bump was always a perfect circle and a corridor always a perfect
 * stadium. A tiny shape vocabulary, repeated, is what reads as cookie-cutter.
 * Varying it by stratum means the layers do not all weather alike -- the oxic
 * column stays smooth and mucoid, the ferruginous zone comes out tighter and
 * more crystalline -- and `hatch` is already the per-stratum material cue.
 */
export const WALL_SPREAD: Readonly<Record<0 | 1 | 2 | 3, number>> =
  { 0: 0.22, 1: 0.62, 2: 0.38, 3: 0.5 };

/** Deterministic hash. Keyed so the silhouette never shimmers between frames. */
function hash(a: number, b: number, k: number): number {
  let h = Math.imul(a * 374761393 + b * 668265263 + k * 2147483647, 1274126177);
  h = (h ^ (h >>> 15)) >>> 0;
  return h / 4294967296;
}

/**
 * Corner radius, hashed on the grid VERTEX rather than on the tile.
 *
 * The three tiles around an inside corner all put geometry there -- a tile's
 * own arc and its neighbour's meniscus fillet -- so they have to agree. Hash
 * the tile and they disagree by a fraction of a tile and the seam reopens,
 * which is the whole reason everything goes into one path under nonzero
 * winding to begin with.
 *
 * Floored at (1 - spread) of base. Below about 0.4 of a tile the grid starts
 * coming back through the silhouette; HANDOVER records that from the sweep
 * that chose 0.5, and `spread` is what keeps the variation inside the band.
 */
function radiusAt(vx: number, vy: number, base: number, seed: number, spread: number): number {
  return base * (1 - spread + spread * hash(vx, vy, seed));
}

/**
 * How far one exposed face bows, in tiles.
 *
 * Hashed per tile per side, so consecutive tiles along the same wall face bow
 * differently and the face scallops instead of running straight. That
 * undulation is most of what stops a long wall reading as a rounded rectangle,
 * and it is where the nooks come from.
 *
 * Always INWARD. Bowing out would cover part of a walkable tile in wall
 * colour, which lies to the player about where they can go. Bowing in only
 * shows more floor colour on a tile that is already solid -- the same small
 * untruth the corner rounding has always told.
 */
function bowAt(x: number, y: number, side: number, seed: number, amp: number): number {
  return amp * (0.15 + hash(x * 3 + side, y * 7, seed + 31) * 0.85);
}

/**
 * Trace the wall region over a tile range into the current path, in TILE units.
 * Scale the context by the tile size before filling.
 */
export function traceWalls(
  ctx: PathSink,
  g: Grid,
  x0: number, y0: number, x1: number, y1: number,
  radius = 0.5,
  seed = 0,
  spread = 0,
  bow = 0,
): void {
  const r = Math.min(Math.max(Number.isFinite(radius) ? radius : 0.5, 0), 0.5);
  const sd = Number.isFinite(seed) ? Math.round(seed) : 0;
  const sp = Math.min(Math.max(Number.isFinite(spread) ? spread : 0, 0), 1);
  const bw = Math.min(Math.max(Number.isFinite(bow) ? bow : 0, 0), 0.3);
  const rAt = (vx: number, vy: number): number =>
    sp === 0 ? r : radiusAt(vx, vy, r, sd, sp);
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

      const rtl = rAt(x, y), rtr = rAt(x + 1, y);
      const rbr = rAt(x + 1, y + 1), rbl = rAt(x, y + 1);
      const cTL = round && !n && !wl, cTR = round && !n && !e;
      const cBR = round && !s && !e, cBL = round && !s && !wl;

      // Faces are walked EXPLICITLY. `arc` lines to its own start point, so
      // the straight runs between corners used to be implicit -- and an
      // implicit edge cannot be bowed. `at` tracks the current point because
      // the path API does not expose it, and the control point has to sit at
      // the MIDPOINT of the face: hanging it off the end point instead makes
      // a lopsided curve that reads as chewed rather than as rock.
      let ax = x, ay = y + (cTL ? rtl : 0);
      const face = (exposed: boolean, side: number,
                    tx: number, ty: number, nx: number, ny: number): void => {
        if (bw > 0 && exposed) {
          const a = bowAt(x, y, side, sd, bw) * 2;
          ctx.quadraticCurveTo((ax + tx) / 2 + nx * a, (ay + ty) / 2 + ny * a, tx, ty);
        } else ctx.lineTo(tx, ty);
        ax = tx; ay = ty;
      };
      /** Corner arcs move the point too. */
      const at = (px_: number, py_: number): void => { ax = px_; ay = py_; };

      ctx.moveTo(x, y + (cTL ? rtl : 0));
      if (cTL) { ctx.arc(x + rtl, y + rtl, rtl, Math.PI, Math.PI * 1.5); at(x + rtl, y); }
      else { ctx.lineTo(x, y); at(x, y); }

      face(!n, 0, x + 1 - (cTR ? rtr : 0), y, 0, 1);            // top -> down
      if (cTR) { ctx.arc(x + 1 - rtr, y + rtr, rtr, Math.PI * 1.5, Math.PI * 2); at(x + 1, y + rtr); }
      else { ctx.lineTo(x + 1, y); at(x + 1, y); }

      face(!e, 1, x + 1, y + 1 - (cBR ? rbr : 0), -1, 0);       // right -> left
      if (cBR) { ctx.arc(x + 1 - rbr, y + 1 - rbr, rbr, 0, HALF_PI); at(x + 1 - rbr, y + 1); }
      else { ctx.lineTo(x + 1, y + 1); at(x + 1, y + 1); }

      face(!s, 2, x + (cBL ? rbl : 0), y + 1, 0, -1);           // bottom -> up
      if (cBL) { ctx.arc(x + rbl, y + 1 - rbl, rbl, HALF_PI, Math.PI); at(x, y + 1 - rbl); }
      else { ctx.lineTo(x, y + 1); at(x, y + 1); }

      face(!wl, 3, x, y + (cTL ? rtl : 0), 1, 0);               // left -> right
      ctx.closePath();

      // Meniscus fillets at inside corners. Each is a small patch between the
      // corner point and an arc bulging into the empty diagonal.
      if (round && n && wl && !nw) {
        ctx.moveTo(x, y - rtl);
        ctx.lineTo(x, y);
        ctx.lineTo(x - rtl, y);
        ctx.arc(x - rtl, y - rtl, rtl, HALF_PI, 0, true);
        ctx.closePath();
      }
      if (round && n && e && !ne) {
        ctx.moveTo(x + 1, y - rtr);
        ctx.lineTo(x + 1, y);
        ctx.lineTo(x + 1 + rtr, y);
        ctx.arc(x + 1 + rtr, y - rtr, rtr, HALF_PI, Math.PI, false);
        ctx.closePath();
      }
      if (round && s && e && !se) {
        ctx.moveTo(x + 1, y + 1 + rbr);
        ctx.lineTo(x + 1, y + 1);
        ctx.lineTo(x + 1 + rbr, y + 1);
        ctx.arc(x + 1 + rbr, y + 1 + rbr, rbr, Math.PI * 1.5, Math.PI, true);
        ctx.closePath();
      }
      if (round && s && wl && !sw) {
        ctx.moveTo(x, y + 1 + rbl);
        ctx.lineTo(x, y + 1);
        ctx.lineTo(x - rbl, y + 1);
        ctx.arc(x - rbl, y + 1 + rbl, rbl, Math.PI * 1.5, Math.PI * 2, false);
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
