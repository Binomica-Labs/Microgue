// The minimap.
//
// The map screen already exists and shows everything; this is the glanceable
// version -- where am I in the floor I have uncovered, and which way is the
// way down. It answers that without a screen transition, which is the whole
// point of it.
//
// A floor is 96x96, so 9216 tiles. Redrawing that per frame is not affordable
// at sixty frames a second, and it does not change per frame: it changes when
// you uncover something. So the explored terrain is rasterised to an offscreen
// canvas and reused, and only the markers -- you, the stairs -- are drawn live
// on top. That is the same trick the sprite cache uses.

import type { Grid } from "./mapgen.js";
import type { Sight } from "./fov.js";
import { isSeen } from "./fov.js";

export interface MiniBox { x: number; y: number; w: number; h: number }

/**
 * Where the minimap goes.
 *
 * Top right, but LEFT of the button column, because that column already owns
 * the right edge and overlapping it would put a decoration on top of a
 * control. Sized to the room actually available: on some phones the buttons
 * wrap to two columns and start 180px down, on others they start at 56px.
 */
export function miniBox(
  W: number, H: number,
  ins: { top: number; right: number; left: number },
  buttonsLeft: number, buttonsTop: number,
): MiniBox | null {
  void buttonsTop;
  const gap = 8;
  // SQUARE, and the constraint is horizontal only. The first version also
  // refused to extend below where the buttons START, which on most phones is
  // 56px down -- so it produced a letterbox 140x56 sliver. The buttons own the
  // right EDGE, not the whole right half; the column of space to their left is
  // tall and empty, so the map just has to stop short of them.
  const side = Math.min(
    buttonsLeft - ins.left - gap * 2,   // clear of the controls
    W * 0.30,                           // never dominate the view
    H * 0.20,
  );
  // Below this it is not readable, and a map you have to squint at costs
  // pixels and gives nothing back.
  if (side < 56) return null;
  return { x: buttonsLeft - gap - side, y: ins.top + gap, w: side, h: side };
}

/** Scale and offset that fit the explored bounds into the box. */
export interface MiniView { scale: number; ox: number; oy: number;
                            x0: number; y0: number; x1: number; y1: number }

/**
 * Fit the EXPLORED region, not the whole grid.
 *
 * A floor is mostly untouched rock, so fitting the full 96x96 leaves the
 * player as a speck in a field of nothing. Framing what has been uncovered
 * uses the whole box from the first room onward.
 */
export function miniView(grid: Grid, sight: Sight, box: MiniBox): MiniView {
  let x0 = grid.w, y0 = grid.h, x1 = 0, y1 = 0;
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      if (!isSeen(sight, x, y)) continue;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < x0 || y1 < y0) {          // nothing seen yet
    x0 = 0; y0 = 0; x1 = grid.w - 1; y1 = grid.h - 1;
  }
  // A margin so the edge of the explored region is not flush with the frame.
  const pad = 1;
  x0 = Math.max(x0 - pad, 0); y0 = Math.max(y0 - pad, 0);
  x1 = Math.min(x1 + pad, grid.w - 1); y1 = Math.min(y1 + pad, grid.h - 1);

  const spanX = x1 - x0 + 1, spanY = y1 - y0 + 1;
  const scale = Math.min(box.w / spanX, box.h / spanY);
  return {
    scale,
    ox: box.x + (box.w - spanX * scale) / 2,
    oy: box.y + (box.h - spanY * scale) / 2,
    x0, y0, x1, y1,
  };
}

/** Grid coordinates to a point inside the box. */
export function miniPoint(v: MiniView, x: number, y: number): { x: number; y: number } {
  return { x: v.ox + (x - v.x0 + 0.5) * v.scale,
           y: v.oy + (y - v.y0 + 0.5) * v.scale };
}

// --------------------------------------------------------------- rendering

interface Cached {
  canvas: HTMLCanvasElement;
  /** What the cache was built for. A miss on any of these rebuilds it. */
  seen: number; floor: number; w: number; h: number; x0: number; y0: number;
}
let cache: Cached | null = null;

/**
 * Rasterise the explored terrain, once per change.
 *
 * Keyed on the COUNT of seen tiles, which rises monotonically within a floor
 * and so changes exactly when there is something new to draw -- plus the floor
 * number and the box, because both invalidate everything.
 */
function terrain(
  grid: Grid, sight: Sight, view: MiniView, box: MiniBox,
  floor: number, seen: number,
  make: () => HTMLCanvasElement | null,
): HTMLCanvasElement | null {
  const w = Math.max(Math.round(box.w), 1), h = Math.max(Math.round(box.h), 1);
  if (cache?.seen === seen && cache.floor === floor
      && cache.w === w && cache.h === h
      && cache.x0 === view.x0 && cache.y0 === view.y0) {
    return cache.canvas;
  }
  const c = make();
  if (!c) return null;
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  if (!g) return null;

  const s = Math.max(view.scale, 0.75);   // never thinner than a visible mark
  for (let y = view.y0; y <= view.y1; y++) {
    for (let x = view.x0; x <= view.x1; x++) {
      if (!isSeen(sight, x, y)) continue;
      g.fillStyle = grid.isWall(x, y) ? "rgba(120,200,150,0.30)"
                                      : "rgba(190,235,205,0.62)";
      g.fillRect((x - view.x0) * view.scale, (y - view.y0) * view.scale, s, s);
    }
  }
  cache = { canvas: c, seen, floor, w, h, x0: view.x0, y0: view.y0 };
  return c;
}

export interface MiniMarks {
  readonly player: { x: number; y: number };
  readonly stairs: { x: number; y: number } | null;
  /** Only what is currently visible: a minimap that shows every creature on
   *  the floor is a cheat sheet, not a map. */
  readonly hostiles: readonly { x: number; y: number }[];
}

export function drawMinimap(
  ctx: CanvasRenderingContext2D,
  grid: Grid, sight: Sight, box: MiniBox, floor: number, seen: number,
  marks: MiniMarks, u: number,
  make: () => HTMLCanvasElement | null,
): void {
  const view = miniView(grid, sight, box);

  ctx.save();
  ctx.fillStyle = "rgba(6,10,8,0.72)";
  ctx.strokeStyle = "rgba(160,200,175,0.30)";
  ctx.lineWidth = Math.max(u, 1);
  ctx.beginPath();
  ctx.roundRect(box.x, box.y, box.w, box.h, 4 * u);
  ctx.fill();
  ctx.stroke();

  // Clip so the terrain cannot spill past the frame at any zoom.
  ctx.beginPath();
  ctx.roundRect(box.x, box.y, box.w, box.h, 4 * u);
  ctx.clip();

  const c = terrain(grid, sight, view, box, floor, seen, make);
  if (c) ctx.drawImage(c, view.ox, view.oy);

  const dot = (p: { x: number; y: number }, colour: string, r: number): void => {
    const q = miniPoint(view, p.x, p.y);
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
    ctx.fill();
  };

  if (marks.stairs) dot(marks.stairs, "#cfe04a", Math.max(1.6 * u, 1.6));
  for (const m of marks.hostiles) dot(m, "#e8705a", Math.max(1.2 * u, 1.2));
  // The player last and largest: it is the one thing you look for.
  dot(marks.player, "#8fe6ff", Math.max(2.1 * u, 2));
  ctx.restore();
}

/* `seenCount` lives on Sight and is maintained incrementally by fov.ts.
   Counting it here meant walking 9216 bytes once a frame to discover, almost
   always, that nothing had changed. */

/** An offscreen canvas, or null where there is no document (tests, workers). */
export function makeCanvas(): HTMLCanvasElement | null {
  try {
    return document.createElement("canvas");
  } catch {
    return null;
  }
}
