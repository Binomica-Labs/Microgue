// Shape painter + offscreen sprite cache. Sprites are rasterised once per
// (organism, size, palette) and blitted thereafter, so per-frame cost is a
// drawImage rather than dozens of path operations.

import { MORPHOLOGY, type Role, type Shape } from "./shapes.js";
import { PIXELS, PX_SIZE } from "./pixels.js";
import type { Phenotype } from "./phenotype.js";
import { WALL_MATERIALS, WALL_PX, materialFor } from "./wall_pixels.js";
import type { Facing, Squash } from "./motion.js";

export interface Palette { body: string; dark: string; accent: string; hi: string; }

/** Shift a hex colour toward black or white by `t`. */
function mix(hex: string, target: number, t: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map((c) => Math.round(c + (target - c) * t));
  return `#${ch.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

const paletteCache = new Map<string, Palette>();

/** Built from the organism's own pigment. Deriving it from the stratum made
 *  every mob the same colour as the wall it was standing on.
 *
 *  Memoised: this parses a hex string four times, and it was being called once
 *  per mob per frame -- 33 us a frame, the largest single cost in the draw
 *  path. The input set is the twenty organism pigments, so the cache is tiny
 *  and never needs invalidating. */
export function paletteForPigment(pigment: string): Palette {
  const hit = paletteCache.get(pigment);
  if (hit) return hit;
  const pal: Palette = {
    body: pigment,
    dark: mix(pigment, 0, 0.72),
    accent: mix(pigment, 255, 0.45),
    hi: mix(pigment, 255, 0.78),
  };
  paletteCache.set(pigment, pal);
  return pal;
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

const CACHE_MAX = 96;
const cache = new Map<string, HTMLCanvasElement>();

/** Sprite cache size, for tests and diagnostics. */
export const spriteCacheSize = (): number => cache.size;

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

/**
 * Rasterised sprite, cached.
 *
 * Pixel art is cached at its AUTHORED size and scaled on draw, so the cache is
 * independent of zoom. Keying it on the on-screen size meant a single pinch
 * rasterised a fresh canvas at every intermediate size -- 198 for one organism
 * across a hundred-step gesture, 784 with four in view -- and then blew the
 * cache cap and full-flushed it, repeatedly, mid-gesture.
 *
 * Vector fallbacks still need a real raster, so their size is quantised to
 * powers of two: at most a handful of entries per organism instead of one per
 * pixel of zoom.
 */
export function sprite(
  id: string, size: number, p: Palette, artId = id,
): HTMLCanvasElement | null {
  // `artId` lets a caller reuse one drawing under many cache keys -- the
  // player's body is the same pixels whatever pigment it is expressing, and
  // giving each palette its own key is how the cache stays correct.
  const art = PIXELS[artId];
  const shapes = MORPHOLOGY[artId];
  if (!art && !shapes) return null;
  const want = Math.max(Math.round(size), 4);
  // Pixel art: one entry per organism per palette, whatever the zoom.
  const px = art ? PX_SIZE : Math.min(2 ** Math.ceil(Math.log2(want)), 256);
  const key = `${id}:${px}:${p.body}${p.dark}${p.accent}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const c = document.createElement("canvas");
  const ss = art ? 1 : 2;                   // pixel art is authored at 1:1
  c.width = px * ss;
  c.height = px * ss;
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

  // Pixel art needs no second canvas: `c` already holds the art at exactly its
  // authored size, and the separation halo is drawn per-frame in drawBody so
  // it stays soft at any zoom instead of being baked at 16px and stretched.
  let out = c;
  if (!art) {
    out = document.createElement("canvas");
    out.width = px;
    out.height = px;
    const ox = out.getContext("2d");
    if (!ox) return null;
    ox.imageSmoothingEnabled = true;        // smoothed downscale for vector
    ox.drawImage(c, 0, 0, px, px);
  }

  // Evict the oldest rather than flushing everything: a full clear mid-pinch
  // throws away sprites that are about to be needed again.
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, out);
  return out;
}

/**
 * The player's body, tinted by what it is EXPRESSING.
 *
 * Keyed on the phenotype so the offscreen cache is reused between frames --
 * the palette only changes when the build does, and `Phenotype.key` is
 * quantised so a drifting expression value does not rasterise a new sprite
 * every frame.
 */
export function playerSprite(
  size: number, ph?: Phenotype,
): HTMLCanvasElement | null {
  if (!ph) return sprite("player", size, PLAYER_PALETTE);
  return sprite(`player~${ph.key}`, size,
                { body: ph.body, dark: ph.dark, accent: ph.accent, hi: ph.hi },
                "player");
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
  // A tile is 32px at the default zoom, and this used to skip below 40 -- so
  // the motif never drew unless you had deliberately zoomed in, and the walls
  // were a flat colour for everyone playing normally. The original worry was
  // sound (small marks merge into stripes); the answer is FEWER, BIGGER marks
  // rather than none.
  if (px < 10) return;
  const tight = px < 44;
  // Drop the count and grow each mark as the tile shrinks, so the texture
  // stays legible instead of turning into noise.
  const count = (n: number): number => tight ? Math.max(Math.round(n * 0.55), 1) : n;
  const scale = tight ? 1.7 : 1;

  ctx.save();
  ctx.fillStyle = floor;
  const dot = (fx: number, fy: number, r: number): void => {
    ctx.beginPath();
    ctx.arc(rx + fx * px, ry + fy * px, Math.max(r * scale * px, 0.6), 0, Math.PI * 2);
    ctx.fill();
  };

  // A faint mark on a small tile reads as nothing at all.
  const A = tight ? 1.5 : 1;

  switch (depth) {
    case 1: { // oxygen bubbles
      ctx.globalAlpha = 0.16 * A;
      for (let i = 0; i < count(3); i++) {
        dot(0.2 + hash(tx, ty, i) * 0.6, 0.2 + hash(tx, ty, i + 9) * 0.6, 0.05);
      }
      break;
    }
    case 2: { // fine sediment grain
      ctx.globalAlpha = 0.18 * A;
      for (let i = 0; i < count(5); i++) {
        dot(0.12 + hash(tx, ty, i) * 0.76, 0.12 + hash(tx, ty, i + 5) * 0.76, 0.035);
      }
      break;
    }
    case 3: { // Beggiatoa mat: horizontal filament streaks
      ctx.globalAlpha = 0.22 * A;
      for (let i = 0; i < count(3); i++) {
        const y = 0.2 + i * 0.3 + hash(tx, ty, i) * 0.06;
        ctx.fillRect(rx + 0.1 * px, ry + y * px, 0.8 * px, Math.max(0.035 * px, 1));
      }
      break;
    }
    case 4: { // angular rust mottling
      ctx.globalAlpha = 0.2 * A;
      for (let i = 0; i < count(3); i++) {
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
      ctx.globalAlpha = 0.18 * A;
      for (let i = 0; i < count(3); i++) {
        dot(0.18 + hash(tx, ty, i) * 0.64, 0.18 + hash(tx, ty, i + 4) * 0.64, 0.042);
      }
      break;
    }
    case 6: { // dense stipple -- light-starved, packed cells
      ctx.globalAlpha = 0.17 * A;
      for (let i = 0; i < count(7); i++) {
        dot(0.1 + hash(tx, ty, i) * 0.8, 0.1 + hash(tx, ty, i + 11) * 0.8, 0.03);
      }
      break;
    }
    case 7: { // framboidal pyrite: tight clusters of microcrystals
      ctx.globalAlpha = 0.3 * A;
      // A framboid is a raspberry of microcrystals, so it is drawn as a ring
      // of them -- but seven dots on a 32px tile is a smudge. One framboid of
      // five when the tile is small, two of seven when there is room.
      const crystals = tight ? 5 : 7;
      for (let f = 0; f < count(2); f++) {
        const fx = 0.25 + hash(tx, ty, f) * 0.5;
        const fy = 0.25 + hash(tx, ty, f + 6) * 0.5;
        for (let i = 0; i < crystals; i++) {
          const a = (i / crystals) * Math.PI * 2;
          dot(fx + Math.cos(a) * 0.06, fy + Math.sin(a) * 0.06, 0.021);
        }
      }
      break;
    }
    case 8: { // methane vesicles
      ctx.globalAlpha = 0.17 * A;
      for (let i = 0; i < count(3); i++) {
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


/** Which way the art itself points. Organism sprites are drawn as horizontal
 *  rods, so their long axis is EAST; the player nanobot has a prow drawn
 *  pointing NORTH. Getting this wrong renders every rod perpendicular to its
 *  own direction of travel, which is what happened between v20 and v25. */
export type ArtAxis = "east" | "north";

/**
 * Draw a body with facing and squash applied.
 *
 * Squash acts along the body's own forward axis after rotation, which is what
 * makes a cell look like it is launching rather than just getting wider.
 */
export interface Flagellum {
  /** Beat phase in radians. Drive it from the clock and from speed. */
  readonly phase: number;
  readonly colour: string;
  /** Length and amplitude as fractions of the sprite size. */
  readonly len: number;
  readonly amp: number;
}

/**
 * A beating flagellum, stroked rather than drawn as pixels.
 *
 * As art it was a fat static stalk on a round body, which reads as an optic
 * nerve on an eyeball. Stroking it means it can be thin, it can taper, and it
 * can move -- and motion is most of what makes it read as a flagellum.
 */
function strokeFlagellum(
  ctx: CanvasRenderingContext2D, size: number, f: Flagellum,
): void {
  const L = size * f.len;
  const A = size * f.amp;
  const n = 14;
  ctx.strokeStyle = f.colour;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Two passes: a soft halo, then the filament, so it reads against any wall.
  for (const [width, alpha] of [[size * 0.10, 0.26], [size * 0.042, 1]] as const) {
    ctx.globalAlpha = alpha;
    ctx.lineWidth = Math.max(width, 1);
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      // Amplitude grows toward the free end, as a real filament's does.
      const y = Math.sin(t * Math.PI * 2.2 - f.phase) * A * (0.25 + t * 0.9);
      const x = -size * 0.32 - t * L;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function drawBody(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  cx: number, cy: number, size: number,
  facing: Facing, heading: number | null, squash: Squash,
  alpha = 1,
  axis: ArtAxis = "east",
  stretch = 1,
  flagellum: Flagellum | null = null,
  halo = true,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = false;
  ctx.translate(cx, cy);

  if (facing === "rotate" && heading !== null) {
    ctx.rotate(axis === "north" ? heading + Math.PI / 2 : heading);
    // After rotation the body's forward axis is local +x for east-drawn art
    // and local +y for north-drawn art.
    if (axis === "north") ctx.scale(squash.sy, squash.sx * stretch);
    else ctx.scale(squash.sx * stretch, squash.sy);
  } else if (facing === "flip") {
    if (heading !== null && Math.cos(heading) < 0) ctx.scale(-1, 1);
    ctx.scale(squash.sx * stretch, squash.sy);
  } else {
    // No long axis, or anchored. A gentle bob only.
    ctx.scale(1 + (squash.sx - 1) * 0.35, 1 + (squash.sy - 1) * 0.35);
  }

  // The flagellum is drawn in the body's own rotated frame, so it trails the
  // heading without any separate bookkeeping. Before the image, so the cell
  // sits on top of where the filament meets it.
  if (flagellum) {
    const a = ctx.globalAlpha;
    ctx.globalAlpha = alpha;
    strokeFlagellum(ctx, size, flagellum);
    ctx.globalAlpha = a;
  }
  // Separation halo, drawn here so it is soft at any zoom. A pale organism on
  // a pale wall vanishes without it.
  if (halo) {
    const r = size * 0.52;
    const g = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r);
    g.addColorStop(0, "rgba(0,0,0,0.5)");
    g.addColorStop(0.7, "rgba(0,0,0,0.3)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.drawImage(img, -size / 2, -size / 2, size, size);
  ctx.restore();
}

// ------------------------------------------------------------ wall pattern
//
// The motif used to be free because it never drew: a `px >= 40` gate against a
// tile that is about 15px at the default zoom. Fixing that made it cost 5000
// canvas operations a frame -- an `arc` and a `fill` per mark, per wall tile,
// per frame -- which is the entire budget on a phone.
//
// So it is rasterised ONCE into a block of tiles and used as a fill pattern.
// One `fill` for the whole wall area instead of five thousand.
//
// The block is several tiles across so the repeat is not obvious. It cannot be
// one tile: the motif is hashed per tile precisely so texture never repeats,
// and a 1x1 pattern would undo that. Four is enough that the eye does not
// catch it and small enough to rasterise in well under a millisecond.

const PATTERN_TILES = 4;
let patternCache: { key: string; pattern: CanvasPattern | null } | null = null;

/**
 * A repeating wall texture for one stratum at one tile size.
 *
 * Built from the authored tiles in `wall_pixels.ts` -- the same
 * character-grid format the organisms use, so wall art is editable text
 * rather than a binary asset with a loader and a cache-invalidation problem.
 *
 * The block is PATTERN_TILES square and each cell takes a DIFFERENT variant,
 * so the repeat carries several distinct tiles rather than one. A single-tile
 * pattern would undo the whole point of authoring variants.
 *
 * Returns null where there is no room for texture, or no document to
 * rasterise into -- the caller then fills flat, which is what it did before
 * any of this existed.
 */
export function wallPattern(
  ctx: CanvasRenderingContext2D, depth: number, px: number, floor: string,
  wall = "#6ec78d", accent = "#ffffff",
): CanvasPattern | null {
  // 12, not 10. Below that each art pixel is well under a screen pixel, the
  // marks merge, and the texture covers 60% of the tile -- more texture than
  // wall, which is the "small marks become stripes" failure the original
  // threshold was guarding against. NaN-safe form; see minimap.ts.
  if (!(px >= 12)) return null;
  const q = Math.max(Math.round(px), 1);
  const mat = materialFor(depth);
  // Every input, not just the ones that happen to differ today. `accent` was
  // read and not keyed: no two strata collide as the palettes stand, which is
  // exactly the kind of "safe by accident" that breaks when a colour is
  // retuned.
  const key = `${mat}@${String(q)}@${floor}@${wall}@${accent}`;
  if (patternCache?.key === key) return patternCache.pattern;

  let pattern: CanvasPattern | null = null;
  try {
    const tiles = WALL_MATERIALS[mat];
    const side = q * PATTERN_TILES;
    const c = document.createElement("canvas");
    c.width = side;
    c.height = side;
    const g = c.getContext("2d");
    if (g) {
      // One pixel of the 16x16 art, scaled to the tile. Rounded outward so
      // adjacent pixels overlap by a fraction rather than leaving hairlines --
      // at 15px a tile each art pixel is under a screen pixel wide.
      const unit = q / WALL_PX;
      const dot = Math.max(Math.ceil(unit), 1);
      const roles: Record<string, string> = {
        "1": mix(floor, 0, 0.35),          // pore: darker than the floor
        "2": mix(wall, 0, 0.30),           // grain: the wall, shaded
        "3": mix(accent, 255, 0.25),       // lit face
      };
      for (let ty = 0; ty < PATTERN_TILES; ty++) {
        for (let tx = 0; tx < PATTERN_TILES; tx++) {
          // Staggered by row. `ty * PATTERN_TILES + tx` alternates identically
          // on every row, which with two variants is a set of vertical stripes
          // -- a regularity as obvious as the repeat it was meant to hide.
          // The +1 offsets each row so it reads as a checker instead.
          const art = tiles[(ty * (PATTERN_TILES + 1) + tx) % tiles.length];
          if (!art) continue;
          for (let y = 0; y < WALL_PX; y++) {
            const row = art[y];
            if (!row) continue;
            for (let x = 0; x < WALL_PX; x++) {
              const role = roles[row[x] ?? "."];
              if (!role) continue;
              g.fillStyle = role;
              g.fillRect(Math.floor(tx * q + x * unit),
                         Math.floor(ty * q + y * unit), dot, dot);
            }
          }
        }
      }
      pattern = ctx.createPattern(c, "repeat");
    }
  } catch {
    pattern = null;                  // no document, or a context we cannot get
  }
  patternCache = { key, pattern };
  return pattern;
}

