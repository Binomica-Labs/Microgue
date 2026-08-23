// Shape painter + offscreen sprite cache. Sprites are rasterised once per
// (organism, size, palette) and blitted thereafter, so per-frame cost is a
// drawImage rather than dozens of path operations.

import { MORPHOLOGY, type Role, type Shape } from "./shapes.js";
import { PIXELS, PX_SIZE } from "./pixels.js";
import type { Facing, Squash } from "./motion.js";

export interface Palette { body: string; dark: string; accent: string; hi: string; }

/** Shift a hex colour toward black or white by `t`. */
function mix(hex: string, target: number, t: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map((c) => Math.round(c + (target - c) * t));
  return `#${ch.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** Built from the organism's own pigment. Deriving it from the stratum made
 *  every mob the same colour as the wall it was standing on. */
export function paletteForPigment(pigment: string): Palette {
  return {
    body: pigment,
    dark: mix(pigment, 0, 0.72),
    accent: mix(pigment, 255, 0.45),
    hi: mix(pigment, 255, 0.78),
  };
}

const PLAYER_PALETTE: Palette =
  { body: "#ffffff", dark: "#1d2b33", accent: "#cfe8f5", hi: "#6fe6ff" };

function colour(role: Role, p: Palette): string {
  switch (role) {
    case "body": return p.body;
    case "dark": return p.dark;
    case "accent": return p.accent;
    case "hi": return p.hi;
    case "thread": return p.accent;
  }
}

export function paintShapes(
  ctx: CanvasRenderingContext2D,
  shapes: readonly Shape[],
  ox: number, oy: number, size: number, p: Palette,
): void {
  for (const s of shapes) {
    ctx.fillStyle = colour(s.role, p);
    ctx.strokeStyle = ctx.fillStyle;
    if (s.k === "ellipse") {
      ctx.beginPath();
      ctx.ellipse(ox + s.cx * size, oy + s.cy * size,
                  s.rx * size, s.ry * size, s.rot ?? 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (s.k === "poly") {
      ctx.beginPath();
      s.pts.forEach(([x, y], i) => {
        if (i === 0) ctx.moveTo(ox + x * size, oy + y * size);
        else ctx.lineTo(ox + x * size, oy + y * size);
      });
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.lineWidth = Math.max(s.w * size, 1);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      s.pts.forEach(([x, y], i) => {
        if (i === 0) ctx.moveTo(ox + x * size, oy + y * size);
        else ctx.lineTo(ox + x * size, oy + y * size);
      });
      ctx.stroke();
    }
  }
}

const cache = new Map<string, HTMLCanvasElement>();

const ROLE_OF: Readonly<Record<string, Role>> =
  { "1": "dark", "2": "body", "3": "accent", "4": "hi" };

/** Paint a 16x16 role grid at 1 canvas pixel per art pixel. Scaling happens
 *  on blit with smoothing off, so edges stay hard. */
function paintPixels(
  ctx: CanvasRenderingContext2D, art: readonly string[], p: Palette,
): void {
  for (let y = 0; y < art.length; y++) {
    const row = art[y];
    if (row === undefined) continue;
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === undefined || ch === ".") continue;
      const role = ROLE_OF[ch];
      if (role === undefined) continue;
      ctx.fillStyle = colour(role, p);
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

/** Rasterised sprite, cached. Supersampled 2x then drawn down for clean edges. */
export function sprite(id: string, size: number, p: Palette): HTMLCanvasElement | null {
  const art = PIXELS[id];
  const shapes = MORPHOLOGY[id];
  if (!art && !shapes) return null;
  const px = Math.max(Math.round(size), 4);
  const key = `${id}:${px}:${p.body}${p.dark}${p.accent}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const c = document.createElement("canvas");
  const ss = art ? 1 : 2;                   // pixel art is authored at 1:1
  c.width = art ? PX_SIZE : px * ss;
  c.height = art ? PX_SIZE : px * ss;
  const cx = c.getContext("2d");
  if (!cx) return null;

  // Soft halo. Without separation a pale organism on a pale wall -- or a
  // purple one in the purple sulfur band -- disappears. A hard disc read as a
  // sticker, so this fades out instead.
  if (art) {
    paintPixels(cx, art, p);
  } else if (shapes) {
    const r = px * ss * 0.5;
    const g = cx.createRadialGradient(r, r, r * 0.34, r, r, r);
    g.addColorStop(0, "rgba(0,0,0,0.55)");
    g.addColorStop(0.72, "rgba(0,0,0,0.34)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    cx.fillStyle = g;
    cx.fillRect(0, 0, px * ss, px * ss);
    paintShapes(cx, shapes, 0, 0, px * ss, p);
  }

  const out = document.createElement("canvas");
  out.width = px;
  out.height = px;
  const ox = out.getContext("2d");
  if (!ox) return null;
  // Hard edges for pixel art, smoothed downscale for vector.
  ox.imageSmoothingEnabled = !art;
  if (art) {
    // Separation halo behind the art, since a pale organism on a pale wall
    // otherwise vanishes. Drawn on the OUTPUT canvas so it stays soft.
    const r = px * 0.5;
    const g = ox.createRadialGradient(r, r, r * 0.3, r, r, r);
    g.addColorStop(0, "rgba(0,0,0,0.5)");
    g.addColorStop(0.7, "rgba(0,0,0,0.3)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ox.fillStyle = g;
    ox.fillRect(0, 0, px, px);
    ox.imageSmoothingEnabled = false;
  }
  ox.drawImage(c, 0, 0, px, px);

  if (cache.size > 120) cache.clear();
  cache.set(key, out);
  return out;
}

export function playerSprite(size: number): HTMLCanvasElement | null {
  return sprite("player", size, PLAYER_PALETTE);
}

// --------------------------------------------------------------- wall motif
// Each stratum gets a motif drawn from the actual material: bubbles in the
// oxic water, mat streaks at the Beggiatoa front, angular rust in the
// ferruginous zone, framboidal pyrite in the black sulfidic layer.

/** Deterministic per-tile hash, so texture never shimmers between frames. */
function hash(x: number, y: number, k: number): number {
  let h = Math.imul(x * 374761393 + y * 668265263 + k * 2147483647, 1274126177);
  h = (h ^ (h >>> 15)) >>> 0;
  return h / 4294967296;
}

export function paintWallMotif(
  ctx: CanvasRenderingContext2D,
  depth: number, tx: number, ty: number,
  rx: number, ry: number, px: number, floor: string,
): void {
  // Below about 40px a tile has no room for texture and the marks merge into
  // stripes -- exactly what the hatch ticks did before. Skip it entirely.
  if (px < 40) return;

  ctx.save();
  ctx.fillStyle = floor;
  const dot = (fx: number, fy: number, r: number): void => {
    ctx.beginPath();
    ctx.arc(rx + fx * px, ry + fy * px, r * px, 0, Math.PI * 2);
    ctx.fill();
  };

  switch (depth) {
    case 1: { // oxygen bubbles
      ctx.globalAlpha = 0.16;
      for (let i = 0; i < 3; i++) {
        dot(0.2 + hash(tx, ty, i) * 0.6, 0.2 + hash(tx, ty, i + 9) * 0.6, 0.05);
      }
      break;
    }
    case 2: { // fine sediment grain
      ctx.globalAlpha = 0.18;
      for (let i = 0; i < 5; i++) {
        dot(0.12 + hash(tx, ty, i) * 0.76, 0.12 + hash(tx, ty, i + 5) * 0.76, 0.035);
      }
      break;
    }
    case 3: { // Beggiatoa mat: horizontal filament streaks
      ctx.globalAlpha = 0.22;
      for (let i = 0; i < 3; i++) {
        const y = 0.2 + i * 0.3 + hash(tx, ty, i) * 0.06;
        ctx.fillRect(rx + 0.1 * px, ry + y * px, 0.8 * px, Math.max(0.035 * px, 1));
      }
      break;
    }
    case 4: { // angular rust mottling
      ctx.globalAlpha = 0.2;
      for (let i = 0; i < 3; i++) {
        const cx = 0.18 + hash(tx, ty, i) * 0.64;
        const cy = 0.2 + hash(tx, ty, i + 3) * 0.6;
        const s = 0.05 + hash(tx, ty, i + 7) * 0.045;
        ctx.beginPath();
        ctx.moveTo(rx + cx * px, ry + (cy - s) * px);
        ctx.lineTo(rx + (cx + s) * px, ry + cy * px);
        ctx.lineTo(rx + cx * px, ry + (cy + s) * px);
        ctx.lineTo(rx + (cx - s) * px, ry + cy * px);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 5: { // sulfur globules
      ctx.globalAlpha = 0.18;
      for (let i = 0; i < 3; i++) {
        dot(0.18 + hash(tx, ty, i) * 0.64, 0.18 + hash(tx, ty, i + 4) * 0.64, 0.042);
      }
      break;
    }
    case 6: { // dense stipple -- light-starved, packed cells
      ctx.globalAlpha = 0.17;
      for (let i = 0; i < 7; i++) {
        dot(0.1 + hash(tx, ty, i) * 0.8, 0.1 + hash(tx, ty, i + 11) * 0.8, 0.03);
      }
      break;
    }
    case 7: { // framboidal pyrite: tight clusters of microcrystals
      ctx.globalAlpha = 0.3;
      for (let f = 0; f < 2; f++) {
        const fx = 0.25 + hash(tx, ty, f) * 0.5;
        const fy = 0.25 + hash(tx, ty, f + 6) * 0.5;
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          dot(fx + Math.cos(a) * 0.055, fy + Math.sin(a) * 0.055, 0.021);
        }
      }
      break;
    }
    case 8: { // methane vesicles
      ctx.globalAlpha = 0.17;
      for (let i = 0; i < 3; i++) {
        const cx = 0.18 + hash(tx, ty, i) * 0.64;
        const cy = 0.18 + hash(tx, ty, i + 8) * 0.64;
        ctx.beginPath();
        ctx.ellipse(rx + cx * px, ry + cy * px, 0.075 * px, 0.045 * px, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    default: break;
  }
  ctx.restore();
}


/**
 * Draw a body with facing and squash applied.
 *
 * The sprite is authored pointing NORTH, so a heading of 0 (east) needs a
 * quarter turn. Squash acts along the body's own forward axis after rotation,
 * which is what makes a cell look like it is launching rather than just
 * getting wider.
 */
export function drawBody(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  cx: number, cy: number, size: number,
  facing: Facing, heading: number | null, squash: Squash,
  alpha = 1,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = false;
  ctx.translate(cx, cy);

  if (facing === "rotate" && heading !== null) {
    ctx.rotate(heading + Math.PI / 2);
    ctx.scale(squash.sy, squash.sx);          // stretch along local forward
  } else if (facing === "flip") {
    if (heading !== null && Math.cos(heading) < 0) ctx.scale(-1, 1);
    ctx.scale(squash.sx, squash.sy);
  } else {
    // No long axis, or anchored. A gentle bob only.
    ctx.scale(1 + (squash.sx - 1) * 0.35, 1 + (squash.sy - 1) * 0.35);
  }

  ctx.drawImage(img, -size / 2, -size / 2, size, size);
  ctx.restore();
}
