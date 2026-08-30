// Rendering: the world, the HUD, and the two screens that need game state.
//
// The self-contained screens (splash, notebook, research, container) live in
// screens.ts and take plain data. These could not: they read the level, the
// plasmid, the effect queue and the view all at once, so they take the Game.

export { r_drawFx } from "./fx_render.js";
export { r_drawHud } from "./hud_render.js";
import { r_drawOffer } from "./hud_render.js";
import { BIN_CAP } from "./plasmid.js";
import { SIZES } from "./behaviour.js";
import { BARRIERS } from "./barrier.js";
import { boundsOf, centreOf, stretchOf } from "./footprint.js";
import { cloudAlpha, cloudTiles } from "./projectile.js";
import { describe as describeSlot, drawBinList, drawItemCard, drawRing }
  from "./plasmid_ui.js";
import { clampView, drawGraph, fitView, frame, litBounds } from "./kegg_ui.js";
import { drawClose, stage } from "./chrome.js";
import { isSeen, isVisible } from "./fov.js";
import { itemColour } from "./items.js";
import { jitter, lungeOffset } from "./fx.js";
import { drawBody, paintWallMotif, paletteForPigment, playerSprite, sprite }
  from "./paint.js";
import { phenotypeOf } from "./phenotype.js";
import { squashFor, travel, wake } from "./motion.js";
import { WALL_SPREAD, traceWalls } from "./walls.js";
import { TOAST_COLOUR, TOAST_EDGE } from "./toast.js";
import { drawButtons } from "./buttons.js";
import { drawContainer, drawLab, drawNotes, drawResearch, drawSplash, ellipsise }
  from "./screens.js";
import { phaseAt, shards, type Phase } from "./lysis.js";
import { NAME_POOL } from "./saves.js";
import { Effects, easeOutQuad }
  from "./fx.js";
import { Toasts } from "./toast.js";
import { WEAPONS } from "./weapons.js";
import { layoutButtons } from "./buttons.js";
import type { Point } from "./mapgen.js";
import type { Game } from "./main.js";

/** World tile size in CSS pixels before zoom. */
const TILE = 32;

export function r_draw(_g: Game): void {
    const { ctx } = _g;
    const W = innerWidth, H = innerHeight;

    // Before any world state is touched. This guard used to sit below
    // `_g.level.stratum`, so with no run started draw() threw on its fourth
    // line -- and because the toast renderer lives at the bottom of this same
    // function, the error it queued was never drawn either. Black screen, no
    // diagnostic, which is precisely the failure this was meant to prevent.
    if (_g.showSplash || !_g.started) {
      _g.closeBox = drawSplash(ctx, W, H, stage(W, _g.insets(), Math.max(Math.min(W, H) / 420, 1)),
        Math.max(Math.min(W, H) / 420, 1), _g.slotBoxes, NAME_POOL, _g.lab);
      _g.drawToasts(W, H);
      return;
    }

    const s = _g.level.stratum;
    const hc = _g.settings.highContrast;

    ctx.fillStyle = hc ? "#000" : s.floor;
    ctx.fillRect(0, 0, W, H);

    const px = TILE * _g.zoom;
    ctx.save();
    const sh = _g.fx.shakeOffset(_g.now);
    ctx.translate(W / 2 - (_g.player.ax + 0.5) * px + sh.x,
                  H / 2 - (_g.player.ay + 0.5) * px + sh.y);

    const x0 = Math.max(Math.floor((_g.player.ax - W / px / 2) - 1), 0);
    const x1 = Math.min(Math.ceil((_g.player.ax + W / px / 2) + 1), _g.level.grid.w - 1);
    const y0 = Math.max(Math.floor((_g.player.ay - H / px / 2) - 1), 0);
    const y1 = Math.min(Math.ceil((_g.player.ay + H / px / 2) + 1), _g.level.grid.h - 1);

    // Walls as one traced contour, not a grid of squares. Corners round where
    // they are exposed and fillet where three tiles meet, so the region reads
    // as organic rather than tiled. All tiles go into a single path and fill
    // together under nonzero winding, so shared edges leave no seam.
    // One Path2D, used for both the fill and the motif clip. Tracing twice a
    // frame cost 29 us; this halves it and the geometry is identical by
    // construction rather than by hoping the two calls match.
    const wallPath = new Path2D();
    // Per-vertex radius, seeded per floor. One constant radius meant every
    // convex corner was the same quarter circle, so a one-tile bump was always
    // a perfect circle and a corridor always a perfect stadium -- a very small
    // shape vocabulary, repeated, which is what reads as cookie-cutter.
    traceWalls(wallPath, _g.level.grid, x0, y0, x1, y1, hc ? 0 : 0.5,   // see walls.ts
      _g.dungeon.seed ^ (_g.level.floor * 9176), hc ? 0 : WALL_SPREAD[s.hatch], hc ? 0 : 0.13);
    const sight = _g.level.sight;

    ctx.fillStyle = hc ? "#ffffff" : s.wall;
    ctx.save();
    ctx.scale(px, px);
    ctx.fill(wallPath);
    ctx.restore();

    if (!hc && px >= 40) {
      ctx.save();
      ctx.scale(px, px);
      ctx.clip(wallPath);
      ctx.scale(1 / px, 1 / px);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (!_g.level.grid.isWall(x, y)) continue;
          paintWallMotif(ctx, s.depth, x, y, Math.round(x * px), Math.round(y * px), px, s.floor);
        }
      }
      ctx.restore();
    }

    if (_g.path) {
      // Trim the stretch already walked, so the trail shows where you are
      // going rather than where you have been.
      const at = _g.path.findIndex((p) => p.x === _g.player.x && p.y === _g.player.y);
      const ahead = at >= 0 ? _g.path.slice(at + 1) : _g.path;
      ctx.fillStyle = hc ? "#ff0" : s.accent;
      ctx.globalAlpha = 0.5;
      for (const p of ahead) {
        ctx.fillRect(p.x * px + px * 0.38, p.y * px + px * 0.38, px * 0.24, px * 0.24);
      }
      ctx.globalAlpha = 1;
    }

    const stair = (p: Point, down: boolean) => {
      ctx.strokeStyle = hc ? "#fff" : "#ffe9a0";
      ctx.lineWidth = Math.max(px * 0.08, 2);
      ctx.strokeRect(p.x * px + px * 0.12, p.y * px + px * 0.12, px * 0.76, px * 0.76);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.font = `bold ${px * 0.5}px ui-monospace,monospace`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(down ? "\u25BC" : "\u25B2", p.x * px + px / 2, p.y * px + px / 2);
    };
    if (_g.level.down) stair(_g.level.down, true);
    if (_g.level.depth > 1) stair(_g.level.up, false);

    // Lunges indexed once per frame. Scanning the whole effect queue inside
    // the mob loop was O(mobs x effects) -- 27 us a frame at 14 mobs.
    const lunges = new Map<string, { x: number; y: number }>();
    for (const f of _g.fx.all()) {
      if (f.kind !== "lunge") continue;
      const o = lungeOffset(f, _g.now);
      const cur = lunges.get(f.who);
      if (cur) { cur.x += o.x; cur.y += o.y; } else { lunges.set(f.who, { x: o.x, y: o.y }); }
    }

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
        const sq = squashFor(v, 0.16);
        const bx = (c.x + mx + 0.5) * px, by = (c.y + my + 0.5) * px;
        for (const w of wake(m.heading, v, 2)) {
          drawBody(ctx, img, bx + w.dx * px, by + w.dy * px, px * scale * spread,
                   m.facing, m.heading, sq, w.alpha * 0.7, "east", stretchOf(fp));
        }
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

    const pl = lunges.get("player");
    const lx = pl?.x ?? 0, ly = pl?.y ?? 0;
    // The body is tinted by what the plasmid is EXPRESSING, so a
    // photoferrotroph and a methanogen no longer look alike.
    const ph = phenotypeOf(_g.genome, _g.dungeon.depth);
    const me = hc ? null : playerSprite(px * 0.92, ph);
    if (me) {
      const v = travel(_g.player.ax, _g.player.ay, _g.player.x, _g.player.y);
      const sq = squashFor(v);
      // The beat runs always, and faster when swimming. A still flagellum is
      // just a wire; the motion is what makes it read as one.
      // The filament reads as strongly as the cell actually expresses it. A
      // strain with no flagellar genes should not be trailing one.
      const flag = ph.flagellum <= 0.02 ? null : {
        phase: _g.now / (_g.settings.reduceMotion ? 1e9 : 130 - v * 60),
        colour: ph.accent,
        len: 0.34 + ph.flagellum * 0.3,
        amp: 0.09 + ph.flagellum * 0.1,
      };
      const bx = (_g.player.ax + lx + 0.5) * px;
      const by = (_g.player.ay + ly + 0.5) * px;
      // Wake: a cell moving through fluid leaves one.
      for (const w of wake(_g.player.heading, v)) {
        drawBody(ctx, me, bx + w.dx * px, by + w.dy * px, px * 0.92,
                 "rotate", _g.player.heading, sq, w.alpha, "east", 1, null);
      }
      // Bioluminescence, before the body so the cell sits inside its own
      // light rather than being washed out by it. Luciferase is an oxygenase,
      // so this fades on its own as you leave the oxic zone.
      if (ph.glow > 0.02 && !_g.settings.reduceMotion) {
        const pulse = 0.85 + Math.sin(_g.now / 620) * 0.15;
        const r0 = px * (0.5 + ph.glow * 0.7) * pulse;
        const grad = ctx.createRadialGradient(bx, by, px * 0.1, bx, by, r0);
        grad.addColorStop(0, `rgba(157,251,255,${String(0.36 * ph.glow)})`);
        grad.addColorStop(1, "rgba(157,251,255,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(bx, by, r0, 0, Math.PI * 2);
        ctx.fill();
      }
      drawBody(ctx, me, bx, by, px * 0.92, "rotate", _g.player.heading, sq,
               1, "east", 1, flag);
      // Pili: short, stiff, and around the pole rather than trailing. They are
      // grappling hooks, not oars, and drawing them as a second flagellum
      // misrepresents what pilA does.
      if (ph.pili > 0.05) {
        ctx.strokeStyle = ph.accent;
        ctx.globalAlpha = 0.4 + ph.pili * 0.4;
        ctx.lineWidth = Math.max(px * 0.03, 0.8);
        ctx.lineCap = "round";
        const n = 3 + Math.round(ph.pili * 3);
        for (let i = 0; i < n; i++) {
          const a = (_g.player.heading ?? 0) + (i / n - 0.5) * 1.5;
          const wob = Math.sin(_g.now / 400 + i * 2.1) * 0.12;
          const len = px * (0.28 + ph.pili * 0.16);
          ctx.beginPath();
          ctx.moveTo(bx + Math.cos(a) * px * 0.3, by + Math.sin(a) * px * 0.3);
          ctx.lineTo(bx + Math.cos(a + wob) * (px * 0.3 + len),
                     by + Math.sin(a + wob) * (px * 0.3 + len));
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    } else {
      ctx.fillStyle = "#0ff";
      ctx.fillRect((_g.player.ax + lx) * px + px * 0.18,
                   (_g.player.ay + ly) * px + px * 0.18, px * 0.64, px * 0.64);
    }

    // The highlight covers the whole body. Boxing one tile of a three-tile
    // filament reads as though you are aiming at a fragment of it.
    const t = _g.target;
    if (t?.alive === true) {
      const tb = boundsOf(SIZES[t.size].footprint, t.x, t.y, t.heading);
      ctx.strokeStyle = "#ff3b30";
      ctx.lineWidth = 2.5;
      ctx.strokeRect(tb.minX * px, tb.minY * px,
                     (tb.maxX - tb.minX + 1) * px, (tb.maxY - tb.minY + 1) * px);
    }
    const under = _g.dungeon.mobAt(_g.cursor.x, _g.cursor.y);
    // Red means "this is what I am going to kill". Orange is merely hovered.
    const isTarget = under !== undefined && under === _g.target;
    ctx.strokeStyle = hc ? "#ff0"
      : isTarget ? "#ff3b30" : under ? "#ff9a7a" : _g.path ? "#ffffff" : "#777777";
    ctx.lineWidth = isTarget ? 3.5 : 2;
    if (under) {
      const b = boundsOf(SIZES[under.size].footprint, under.x, under.y, under.heading);
      ctx.strokeRect(b.minX * px, b.minY * px,
                     (b.maxX - b.minX + 1) * px, (b.maxY - b.minY + 1) * px);
      if (isTarget) {
        ctx.fillStyle = "rgba(255,59,48,0.14)";
        ctx.fillRect(b.minX * px, b.minY * px,
                     (b.maxX - b.minX + 1) * px, (b.maxY - b.minY + 1) * px);
      }
    } else {
      ctx.strokeRect(_g.cursor.x * px, _g.cursor.y * px, px, px);
    }
    // Gradients under everything, particles over it.
    for (const c of _g.clouds) {
      ctx.globalAlpha = cloudAlpha(c, WEAPONS.cloud.persist) * 0.28;
      ctx.fillStyle = c.colour;
      for (const t of cloudTiles(c.cx, c.cy, c.radius)) {
        ctx.fillRect(t.x * px, t.y * px, px, px);
      }
    }
    ctx.globalAlpha = 1;
    for (const p of _g.packets) {
      ctx.fillStyle = p.colour;
      ctx.beginPath();
      ctx.arc((p.x + 0.5) * px, (p.y + 0.5) * px, px * 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc((p.x + 0.5 - p.dx * 0.4) * px, (p.y + 0.5 - p.dy * 0.4) * px,
              px * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // Rooms get a faint floor wash so a chamber reads as a place, but only
    // where you have actually been.
    for (const room of _g.level.rooms) {
      ctx.fillStyle = room.kind === "port" ? "rgba(120,200,255,0.07)"
        : room.kind === "enrichment" ? "rgba(255,200,120,0.08)"
        : room.kind === "mat" ? "rgba(220,190,90,0.07)"
        : "rgba(255,255,255,0.035)";
      for (const t of room.tiles) {
        if (!isSeen(sight, t.x, t.y)) continue;
        ctx.fillRect(t.x * px, t.y * px, px + 1, px + 1);
      }
    }

    // Barriers, drawn as material rather than as doors.
    for (const b of _g.level.barriers) {
      if (!isSeen(sight, b.x, b.y)) continue;
      const def = BARRIERS[b.id];
      ctx.globalAlpha = isVisible(sight, b.x, b.y) ? 0.85 : 0.4;
      ctx.fillStyle = def.colour;
      ctx.fillRect(b.x * px, b.y * px, px, px);
      ctx.globalAlpha = isVisible(sight, b.x, b.y) ? 0.35 : 0.15;
      ctx.fillStyle = "#000000";
      for (let i = 0; i < 4; i++) {
        const j = jitter(b.x * 31 + b.y, i);
        ctx.fillRect((b.x + 0.5 + j.x * 0.32) * px, (b.y + 0.5 + j.y * 0.32) * px,
                     px * 0.2, px * 0.2);
      }
      ctx.globalAlpha = 1;
      if (b.work > 0) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = Math.max(px * 0.05, 1);
        ctx.strokeRect(b.x * px + px * 0.12, b.y * px + px * 0.12, px * 0.76, px * 0.76);
      }
    }

    // Loot on the floor: a lozenge per tile, marked when it is a pile.
    for (const d of _g.drops) {
      const it = d.items[0];
      if (!it) continue;
      if (!isVisible(sight, d.x, d.y)) continue;      // loot is not remembered
      const cx = (d.x + 0.5) * px, cy = (d.y + 0.5) * px;
      ctx.fillStyle = itemColour(it);
      ctx.beginPath();
      ctx.ellipse(cx, cy, px * 0.2, px * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.lineWidth = Math.max(px * 0.02, 1);
      ctx.stroke();
      if (d.items.length > 1) {
        ctx.fillStyle = "#0f1512";
        ctx.font = `bold ${px * 0.22}px ui-monospace,monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(d.items.length), cx, cy);
      }
    }
    // The fog. Unseen is black, remembered is dimmed, lit is untouched.
    //
    // ONE fill per shade, over a compound path. Two earlier attempts failed
    // for the same underlying reason: a per-tile rect padded by +1 overlapped
    // its neighbour and two passes of a 62% black composited to 86%, and
    // rounding the rects to whole pixels did nothing because this is drawn
    // inside a FRACTIONAL camera translate -- the rounding was in tile space
    // and the transform undid it.
    //
    // A single fill composites once per pixel however much its subpaths
    // overlap, and it does not care what transform is active. That is the only
    // version of this that cannot seam.
    if (!hc) {
      const dim = new Path2D();
      const dark = new Path2D();
      for (let y = y0; y <= y1; y++) {
        let runStart = -1;
        let runSeen = false;
        const flush = (endX: number): void => {
          if (runStart < 0) return;
          // Padded outward by half a pixel: adjacent runs overlap slightly,
          // which is now harmless and closes any sub-pixel gap the transform
          // would otherwise leave.
          const pad = 0.5 / _g.zoom;
          const rect = runSeen ? dim : dark;
          rect.rect(runStart * px - pad, y * px - pad,
                    (endX + 1 - runStart) * px + pad * 2, px + pad * 2);
          runStart = -1;
        };
        for (let x = x0; x <= x1; x++) {
          if (isVisible(sight, x, y)) { flush(x - 1); continue; }
          const seen = isSeen(sight, x, y);
          if (runStart >= 0 && seen !== runSeen) flush(x - 1);
          if (runStart < 0) { runStart = x; runSeen = seen; }
        }
        flush(x1);
      }
      // Filling an empty path is a no-op, so there is nothing to guard.
      ctx.fillStyle = "#010303";
      ctx.fill(dark);
      ctx.fillStyle = "rgba(2,4,4,0.82)";
      ctx.fill(dim);
    }
    _g.drawFx(px);
    ctx.restore();

    _g.drawScreenFx(W, H);
    _g.drawHud(W, H);
    // Over the HUD: it is a decision about the tile you are standing on, and
    // it has to be answerable before anything else is.
    r_drawOffer(_g, Math.max(Math.min(W, H) / 420, 1), W, H);
    if (_g.openDrop) {
      drawContainer(ctx, W, H, stage(W, _g.insets(), Math.max(Math.min(W, H) / 420, 1)), Math.max(Math.min(W, H) / 420, 1),
                    _g.openDrop, _g.dropBoxes, (t, w) => _g.wrap(t, w));
    }
    _g.drawToasts(W, H);
    const u = Math.max(Math.min(W, H) / 420, 1) * _g.settings.uiScale;
    // Death takes over the screen: the run has to have an ending you can read.
    // `!drawingLysis` on the OUTER condition, not just the inner one. While
    // lysis is drawing the world it calls back into r_draw, which fell through
    // to the lab screen -- so the shop appeared instantly underneath and the
    // death sequence was never visible.
    if ((_g.dead || _g.showLab) && !drawingLysis) {
      // The cell lyses before the ledger appears. The run ending is the only
      // irreversible moment in the game and it should land as one.
      // `drawingLysis` breaks a recursion: r_drawLysis draws the ordinary
      // world by calling r_draw, and r_draw's death branch would call back
      // into r_drawLysis for ever. The frame guard caught it as a stack
      // overflow, which is the error boundary working but not a fix.
      if (_g.dead) {
        const p = phaseAt(_g.now - _g.deathAt);
        if (p.beat !== "done") {
          r_drawLysis(_g, W, H, p);
          r_drawToasts(_g, W, H);
          if (p.reveal <= 0) return;
          ctx.globalAlpha = p.reveal;
        }
      }
      const u = Math.max(Math.min(W, H) / 420, 1);
      // Reserve room for however many toasts are up, so the obituary is never
      // hidden behind the very message announcing it.
      const band = _g.toasts.count() * 30 + (_g.toasts.count() > 0 ? 10 : 0);
      const lab = drawLab(ctx, W, H, stage(W, _g.insets(), u), u, _g.lab, _g.deathRecord,
                          _g.known(), _g.shopRows, (s, max) => _g.wrap(s, max),
                          band, _g.shopScroll);
      _g.closeBox = lab.close;
      _g.shopMaxScroll = lab.maxScroll;
      ctx.globalAlpha = 1;
      r_drawToasts(_g, W, H);
      return;
    }
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
      return;
    }
    if (_g.showNotes) {
      _g.closeBox = drawNotes(ctx, W, H, stage(W, _g.insets(), Math.max(Math.min(W, H) / 420, 1)),
        Math.max(Math.min(W, H) / 420, 1), _g.run,
        (t, w) => _g.wrap(t, w));
      _g.drawToasts(W, H);
      return;
    }
    if (_g.showMap) {
      _g.drawMapScreen(W, H);
    } else if (_g.showPlasmid) {
      _g.drawPlasmid(W, H);
    } else {
      layoutButtons(_g.buttons, W, H, _g.insets(), u, _g.barH + _g.logH);
      drawButtons(ctx, _g.buttons, u);
    }
  }


export function r_drawScreenFx(_g: Game, W: number, H: number): void {
    const { ctx } = _g;
    for (const f of _g.fx.all()) {
      if (f.kind !== "wipe") continue;
      const t = Effects.t(f, _g.now);
      ctx.globalAlpha = 1 - easeOutQuad(t);
      ctx.fillStyle = f.colour;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

export function r_drawToasts(_g: Game, W: number, H: number): void {
    const { ctx } = _g;
    const items = _g.toasts.all();
    if (items.length === 0) return;
    const ins = _g.insets();
    const u = Math.max(Math.min(W, H) / 420, 1);
    const pad = 10 * u;
    let y = ins.top + pad;

    ctx.save();
    ctx.font = `${11.5 * u}px ui-monospace,monospace`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    for (const t of items) {
      const lines = _g.wrap(t.text, W - ins.left - ins.right - pad * 4);
      const h = Math.max(lines.length * 15 * u + 14 * u, 34 * u);
      ctx.globalAlpha = Toasts.alpha(t, _g.now);
      ctx.fillStyle = TOAST_COLOUR[t.level];
      ctx.strokeStyle = TOAST_EDGE[t.level];
      ctx.lineWidth = Math.max(1.4 * u, 1.2);
      ctx.beginPath();
      ctx.roundRect(ins.left + pad, y, W - ins.left - ins.right - pad * 2, h, 7 * u);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      lines.forEach((line, i) => {
        ctx.fillText(line, ins.left + pad * 2, y + 17 * u + i * 15 * u);
      });
      y += h + 6 * u;
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

export function r_drawEmergency(_g: Game, msg: string): void {
    try {
      const { ctx } = _g;
      const W = innerWidth, H = innerHeight;
      const u = Math.max(Math.min(W, H) / 420, 1);
      ctx.setTransform(Math.min(devicePixelRatio || 1, 2), 0, 0,
                       Math.min(devicePixelRatio || 1, 2), 0, 0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#140606";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#ff8a7a";
      ctx.font = `${13 * u}px ui-monospace,monospace`;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("Microgue hit an error and recovered:", 14 * u, 60 * u);
      ctx.fillStyle = "#ffffff";
      ctx.font = `${11 * u}px ui-monospace,monospace`;
      let y = 84 * u;
      for (const line of msg.match(/.{1,46}/g)?.slice(0, 8) ?? []) {
        ctx.fillText(line, 14 * u, y);
        y += 15 * u;
      }
      ctx.fillStyle = "#9fb8a8";
      ctx.fillText("reload to restart", 14 * u, y + 12 * u);
    } catch { /* nothing left to try */ }
  }


export function r_drawPlasmid(_g: Game, W: number, H: number): void {
    const { ctx } = _g;
    const u = Math.max(Math.min(W, H) / 420, 1) * _g.settings.uiScale;
    const ins = stage(W, _g.insets(), u);
    ctx.fillStyle = "rgba(0,0,0,0.93)";
    ctx.fillRect(0, 0, W, H);

    const avail = Math.min(W - ins.left - ins.right, H * 0.46);
    _g.ring = {
      // The ring is the REPLICON's, not the array's. Drawing all 24 on a
      // 16-slot backbone put eight phantom wedges on screen that could be
      // tapped, selected and dropped into, and did nothing when you did.
      used: _g.genome.usableSlots,
      cx: W / 2,
      cy: ins.top + avail * 0.55 + 20 * u,
      rOuter: avail * 0.42,
      rInner: avail * 0.42 - Math.max(avail * 0.11, 30 * u),
      rot: _g.ring.rot,
    };

    drawRing(ctx, _g.ring, _g.genome, {
      depth: _g.dungeon.depth,
      dragFrom: _g.dragFrom,
      dragXY: _g.dragXY, selected: _g.selected, u,
    });

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Sized to the RING, not to the screen.
    //
    // These were `15 * u`, scaled by the smaller screen dimension, while the
    // ring hole is sized from `H * 0.46`. On a wide, short screen the hole
    // shrinks and the text does not, so the readout was drawn straight across
    // the plasmid -- which is what a landscape phone actually looked like.
    // 0.86 of the diameter, not the diameter: a chord across a circle is only
    // that long at the exact middle, and three lines are stacked.
    const hole = _g.ring.rInner * 2 * 0.86;
    const fit = (text: string, want: number): number => {
      let size = want;
      for (let i = 0; i < 14; i++) {
        ctx.font = `${size}px ui-monospace,monospace`;
        if (ctx.measureText(text).width <= hole || size <= 6) break;
        size = Math.max(size * 0.9, 6);
      }
      return size;
    };

    ctx.fillStyle = "#ffffff";
    // toFixed on BOTH: capacity is a float sum, printed raw as "13.1499999 kb".
    const kbText = `${_g.genome.used().toFixed(1)}/`
      + `${_g.genome.capacityKb().toFixed(1)} kb`;
    const kbSize = fit(kbText, 15 * u);
    ctx.fillText(kbText, _g.ring.cx, _g.ring.cy - 9 * u);
    const d = _g.dungeon.depth;
    const bal = _g.genome.atpBalance(d);
    ctx.fillStyle = bal >= 0 ? "#7fc4e8" : "#e08a5a";
    const atpText = `ATP ${Math.round(_g.player.atp)}/${_g.player.atpMax}   `
      + `${bal >= 0 ? "+" : ""}${bal.toFixed(1)}/action`;
    fit(atpText, Math.min(11 * u, kbSize * 0.75));
    ctx.fillText(
      atpText,
      _g.ring.cx, _g.ring.cy + 10 * u);
    ctx.fillStyle = "#8fa89a";
    const powerText = `power ${_g.genome.power(d).toFixed(1)}`
      + (_g.genome.burden() > 0 ? `   burden ${String((_g.genome.burden() * 100) | 0)}%` : "")
      + (_g.genome.supply < 0.99 ? `   brownout ${String((_g.genome.supply * 100) | 0)}%` : "");
    fit(powerText, Math.min(11 * u, kbSize * 0.75));
    ctx.fillText(powerText, _g.ring.cx, _g.ring.cy + 27 * u);

    // Parts bin: everything you hold but have not installed.
    const cell = Math.max(Math.min((W - ins.left - ins.right - 7 * 8 * u) / 6, 62 * u), 44);
    const gap = 8 * u;
    _g.bin = {
      x: ins.left + gap, y: _g.ring.cy + _g.ring.rOuter + 16 * u,
      cell, gap, cols: 6,
    };
    ctx.fillStyle = "#8fa89a";
    ctx.font = `${11 * u}px ui-monospace,monospace`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`PARTS BIN  ${_g.genome.bin.length}/${BIN_CAP}`,
                 _g.bin.x, _g.bin.y - 6 * u);
    // Full rows, scrolled. The tile grid could not name a part: allele names
    // run to "psychrophilic mtrC of high copy" and a tile showed half of it.
    // The list gets the room the tile grid used, and no more: complexes and
    // hazards still have to fit under it.
    const binW = _g.bin.cell * _g.bin.cols + _g.bin.gap * (_g.bin.cols - 1);
    const binH = Math.min(_g.genome.bin.length * 34 * u, 152 * u);
    const list = drawBinList(ctx, { ..._g.bin, w: binW, h: binH },
                             _g.genome.bin, u, _g.dragBin, _g.binScroll,
                             _g.binRows);
    _g.binMaxScroll = list.maxScroll;
    // Deferred: the card belongs on top of everything else on this screen.
    const card = _g.card;

    // Active complexes and hazards, which is the payoff for arranging well.
    let cy = _g.bin.y + binH + 16 * u;
    ctx.font = `${11 * u}px ui-monospace,monospace`;
    for (const c of _g.genome.complexes(_g.dungeon.depth)) {
      ctx.fillStyle = "#7fe0a4";
      ctx.fillText(`\u2713 ${c.name}`, _g.bin.x, cy);
      cy += 15 * u;
    }
    for (const h of _g.genome.hazards(_g.dungeon.depth)) {
      ctx.fillStyle = "#ff9a5a";
      ctx.fillText(`\u26A0 ${h.name}  -${h.dmg}/turn`, _g.bin.x, cy);
      cy += 15 * u;
    }

    // Detail panel for the tapped slot.
    const py = cy + 8 * u;
    const lines = _g.selected === null
      ? ["promoter → gene → terminator switches an operon on",
         "tap a part below to inspect it, then install or catabolise",
         "drag the list to scroll · drag outside the ring to spin it",
         "expression costs ATP; respiration pays less the deeper you go"]
      : describeSlot(_g.genome, _g.selected, _g.dungeon.depth);
    ctx.textAlign = "left";
    // Shrink to the room that is actually left, and stop when there is none.
    // The screen stacks VERTICALLY while `u` scales off the SMALLER dimension,
    // so on a landscape phone or a desktop the footer ran off the bottom --
    // 1114px of content on a 1080px display.
    const bottom = H - ins.bottom - 6 * u;
    const wrapped: { text: string; head: boolean }[] = [];
    for (const [i, line] of lines.entries()) {
      for (const w of _g.wrap(line, W - (ins.left + ins.right + 32 * u))) {
        wrapped.push({ text: w, head: i === 0 });
      }
    }
    let lh = 17 * u;
    let fs = 11.5 * u;
    const need = wrapped.length * lh;
    const room = Math.max(bottom - py, 0);
    if (need > room && wrapped.length > 0) {
      const k = Math.max(room / need, 0.55);
      lh *= k;
      fs *= k;
    }
    ctx.font = `${fs}px ui-monospace,monospace`;
    wrapped.forEach((w, row) => {
      const y = py + row * lh;
      if (y > bottom) return;             // nothing is drawn past the edge
      ctx.fillStyle = w.head ? "#ffffff" : "#9fb8a8";
      ctx.fillText(w.text, ins.left + gap, y);
    });

    // A real close target. "Tap outside" was ambiguous, and it was what let a
    // button press dismiss the screen in the same gesture that opened it.
    _g.closeBox = drawClose(ctx, W, ins, u);
    if (card) {
      const isOrigin = card.kind === "gene" && card.id === "ori";
      _g.cardBoxes = drawItemCard(ctx, W, H, u, card, _g.genome, _g.dungeon.depth,
                                  (s, max) => _g.wrap(s, max),
                                  _g.cardIndex >= 0 && !isOrigin,
                                  _g.cardIndex >= 0 && !isOrigin
                                    && _g.genome.free() > 0,
                                  _g.cardConfirm);
    }
  }

export function r_drawMapScreen(_g: Game, W: number, H: number): void {
    const { ctx } = _g;
    const u = Math.max(Math.min(W, H) / 420, 1) * _g.settings.uiScale;
    const ins = stage(W, _g.insets(), u);   // chrome in the column; graph pans free
    ctx.fillStyle = "rgba(4,7,6,0.97)";
    ctx.fillRect(0, 0, W, H);

    // Frame what you have unlocked. The whole diagram put your own metabolism
    // in a corner of a mostly dark chart; this centres it and leaves the rest
    // to be found by panning.
    if (!_g.view) {
      const vh = H - ins.top - ins.bottom - 60 * u;
      const lit = litBounds(_g.genome.carried());
      _g.view = lit ? frame(W, vh, lit) : fitView(W, vh);
    }
    _g.view = clampView(_g.view, W, H);

    ctx.save();
    ctx.translate(0, ins.top + 52 * u);
    drawGraph(ctx, _g.view, _g.genome, u, _g.boxes);
    ctx.restore();

    // header sits above the graph, opaque, so panning never runs under it
    ctx.fillStyle = "rgba(4,7,6,0.95)";
    ctx.fillRect(0, 0, W, ins.top + 50 * u);
    ctx.fillStyle = "#ffffff";
    ctx.font = `${14 * u}px ui-monospace,monospace`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("PATHWAY MAP", ins.left + 14 * u, ins.top + 24 * u);
    ctx.fillStyle = "#8fa89a";
    ctx.font = `${10 * u}px ui-monospace,monospace`;
    ctx.fillText(ellipsise(ctx, "drag to pan · pinch to zoom · tap a complete module to build it",
                           W - ins.left - ins.right - 16),
                 ins.left + 14 * u, ins.top + 40 * u);

    _g.closeBox = drawClose(ctx, W, ins, u);
  }


/**
 * The world at the moment of lysis.
 *
 * Draws the ordinary scene with the player replaced by whatever is left of it,
 * then washes the whole screen as the column takes the remains. The shake is
 * applied to the canvas rather than the camera so the HUD moves with it -- the
 * whole cell is coming apart, not just the view.
 */
let drawingLysis = false;

export function r_drawLysis(_g: Game, W: number, H: number, p: Phase): void {
  const { ctx } = _g;
  ctx.save();
  drawingLysis = true;
  if (p.shake > 0) {
    const px = _g.zoom * TILE;
    const j = jitter(_g.deathAt, Math.floor(_g.now / 30));
    ctx.translate(j.x * p.shake * px * 0.5, j.y * p.shake * px * 0.5);
  }
  try {
    r_draw(_g);
  } finally {
    drawingLysis = false;
    ctx.restore();
  }

  // The world is drawn centred on the player, so the remains are centred too.
  // No camera lookup needed, and none exists to ask.
  const px = _g.zoom * TILE;
  const cx = W / 2;
  const cy = H / 2;

  // The remains, spreading.
  if (p.spill > 0) {
    for (const s of shards(_g.deathAt, p.spill)) {
      if (s.a <= 0) continue;
      ctx.globalAlpha = s.a;
      ctx.fillStyle = s.a > 0.6 ? "#bfe6ff" : "#7fc4e8";
      const r = px * (0.09 + 0.05 * s.a);
      ctx.beginPath();
      ctx.ellipse(cx + s.x * px, cy + s.y * px, r, r * 0.75, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // The envelope, opening.
    ctx.globalAlpha = Math.max(1 - p.spill * 1.4, 0);
    ctx.strokeStyle = "#d8f0ff";
    ctx.lineWidth = Math.max(px * 0.06, 1);
    ctx.beginPath();
    ctx.arc(cx, cy, px * (0.35 + p.spill * 1.6), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  if (p.wash > 0) {
    ctx.globalAlpha = p.wash;
    ctx.fillStyle = "#04120c";
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
}
