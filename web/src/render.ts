// Rendering: the world, the HUD, and the two screens that need game state.
//
// The self-contained screens (splash, notebook, research, container) live in
// screens.ts and take plain data. These could not: they read the level, the
// plasmid, the effect queue and the view all at once, so they take the Game.

import { BIN_CAP } from "./plasmid.js";
import { SIZES } from "./behaviour.js";
import { BARRIERS } from "./barrier.js";
import { MAX_FLOOR, Dungeon } from "./dungeon.js";
import { boundsOf, centreOf, stretchOf } from "./footprint.js";
import { cloudAlpha, cloudTiles } from "./projectile.js";
import { describe as describeSlot, drawBin, drawItemCard, drawRing }
  from "./plasmid_ui.js";
import { drawBar, drawColumn, type HudLayout } from "./hud.js";
import { clampView, drawGraph, fitView, frame, litBounds } from "./kegg_ui.js";
import { drawClose } from "./chrome.js";
import { isSeen, isVisible } from "./fov.js";
import { itemColour } from "./items.js";
import { jitter, lungeOffset } from "./fx.js";
import { drawBody, paintWallMotif, paletteForPigment, playerSprite, sprite }
  from "./paint.js";
import { squashFor, travel, wake } from "./motion.js";
import { traceWalls } from "./walls.js";
import { timeName } from "./cycle.js";
import { TOAST_COLOUR, TOAST_EDGE } from "./toast.js";
import { drawButtons } from "./buttons.js";
import { drawContainer, drawLab, drawNotes, drawResearch, drawSplash }
  from "./screens.js";
import { phaseAt, shards, type Phase } from "./lysis.js";
import { MAX_STRAIN, levelProgress } from "./strain.js";
import { NAME_POOL } from "./saves.js";
import { Effects, easeInQuad as easeInQuadLocal, easeOutCubic, easeOutQuad }
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
      _g.closeBox = drawSplash(ctx, W, H, _g.insets(),
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
    traceWalls(wallPath, _g.level.grid, x0, y0, x1, y1, hc ? 0 : 0.5);
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
    const me = hc ? null : playerSprite(px * 0.92);
    if (me) {
      const v = travel(_g.player.ax, _g.player.ay, _g.player.x, _g.player.y);
      const sq = squashFor(v);
      // The beat runs always, and faster when swimming. A still flagellum is
      // just a wire; the motion is what makes it read as one.
      const flag = {
        phase: _g.now / (_g.settings.reduceMotion ? 1e9 : 130 - v * 60),
        colour: "#8fe6ff", len: 0.52, amp: 0.15,
      };
      const bx = (_g.player.ax + lx + 0.5) * px;
      const by = (_g.player.ay + ly + 0.5) * px;
      // Wake: a cell moving through fluid leaves one.
      for (const w of wake(_g.player.heading, v)) {
        drawBody(ctx, me, bx + w.dx * px, by + w.dy * px, px * 0.92,
                 "rotate", _g.player.heading, sq, w.alpha, "east", 1, null);
      }
      drawBody(ctx, me, bx, by, px * 0.92, "rotate", _g.player.heading, sq,
               1, "east", 1, flag);
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
    // Drawn as horizontal RUNS with pixel-rounded edges, not per tile. A
    // per-tile rect padded by +1 overlapped its neighbour, and two passes of a
    // 62% black composite to 86% -- which is exactly the grid of dark lines
    // that showed up across every remembered area.
    if (!hc) {
      const DIM = "rgba(2,4,4,0.82)";
      const DARK = "#010303";
      for (let y = y0; y <= y1; y++) {
        let runStart = -1;
        let runStyle = "";
        const flush = (endX: number): void => {
          if (runStart < 0) return;
          const x1p = Math.round((endX + 1) * px);
          const x0p = Math.round(runStart * px);
          ctx.fillStyle = runStyle;
          ctx.fillRect(x0p, Math.round(y * px), x1p - x0p,
                       Math.round((y + 1) * px) - Math.round(y * px));
          runStart = -1;
        };
        for (let x = x0; x <= x1; x++) {
          const style = isVisible(sight, x, y) ? ""
            : isSeen(sight, x, y) ? DIM : DARK;
          if (style !== runStyle) { flush(x - 1); runStyle = style; }
          if (style !== "" && runStart < 0) runStart = x;
        }
        flush(x1);
      }
    }
    _g.drawFx(px);
    ctx.restore();

    _g.drawScreenFx(W, H);
    _g.drawHud(W, H);
    if (_g.openDrop) {
      drawContainer(ctx, W, H, _g.insets(), Math.max(Math.min(W, H) / 420, 1),
                    _g.openDrop, _g.dropBoxes, (t, w) => _g.wrap(t, w));
    }
    _g.drawToasts(W, H);
    const u = Math.max(Math.min(W, H) / 420, 1) * _g.settings.uiScale;
    // Death takes over the screen: the run has to have an ending you can read.
    if (_g.dead || _g.showLab) {
      // The cell lyses before the ledger appears. The run ending is the only
      // irreversible moment in the game and it should land as one.
      // `drawingLysis` breaks a recursion: r_drawLysis draws the ordinary
      // world by calling r_draw, and r_draw's death branch would call back
      // into r_drawLysis for ever. The frame guard caught it as a stack
      // overflow, which is the error boundary working but not a fix.
      if (_g.dead && !drawingLysis) {
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
      const lab = drawLab(ctx, W, H, _g.insets(), u, _g.lab, _g.deathRecord,
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
      _g.closeBox = drawResearch(ctx, W, H, _g.insets(), u,
        _g.genome.slots.flatMap((p) =>
          p?.kind === "gene" && p.id !== "ori"
            ? [{ id: p.id, level: p.level, mods: p.mods }] : []),
        _g.mods, _g.player.atp, _g.researchPick, _g.researchRows,
        _g.genome.strain, _g.genome.replicon);
      _g.drawToasts(W, H);
      return;
    }
    if (_g.showNotes) {
      _g.closeBox = drawNotes(ctx, W, H, _g.insets(),
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

export function r_drawFx(_g: Game, px: number): void {
    const { ctx } = _g;
    const now = _g.now;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const f of _g.fx.all()) {
      const t = Effects.t(f, now);
      if (now < f.t0) continue;

      switch (f.kind) {
        case "flash": {
          ctx.globalAlpha = (1 - t) * 0.85;
          ctx.fillStyle = f.colour;
          ctx.fillRect(f.x * px + px * 0.06, f.y * px + px * 0.06, px * 0.88, px * 0.88);
          break;
        }
        case "text": {
          // rise and fade
          ctx.globalAlpha = 1 - easeInQuadLocal(t);
          ctx.fillStyle = f.colour;
          ctx.font = `bold ${px * 0.34}px ui-monospace,monospace`;
          ctx.fillText(f.text, (f.x + 0.5) * px, (f.y + 0.4 - t * 0.8) * px);
          break;
        }
        case "burst": {
          const e = easeOutCubic(t);
          ctx.globalAlpha = 1 - t;
          ctx.fillStyle = f.colour;
          for (let i = 0; i < f.n; i++) {
            const j = jitter(f.seed, i);
            const d = (0.25 + Math.abs(j.x) * 0.7) * e;
            const r = px * 0.055 * (1 - t * 0.6);
            ctx.beginPath();
            ctx.arc((f.x + 0.5 + j.x * d) * px, (f.y + 0.5 + j.y * d) * px, r, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        }
        case "bolt": {
          // A jagged discharge that draws in, then fades.
          const grow = easeOutQuad(Math.min(t * 2.2, 1));
          ctx.globalAlpha = 1 - easeInQuadLocal(t);
          ctx.strokeStyle = f.colour;
          ctx.lineWidth = Math.max(px * 0.055, 2);
          ctx.lineCap = "round";
          ctx.beginPath();
          const segs = 7;
          for (let i = 0; i <= segs; i++) {
            const k = (i / segs) * grow;
            const j = jitter(f.seed, i);
            const bx = (f.from.x + (f.to.x - f.from.x) * k + 0.5 + j.x * 0.13) * px;
            const by = (f.from.y + (f.to.y - f.from.y) * k + 0.5 + j.y * 0.13) * px;
            if (i === 0) ctx.moveTo(bx, by); else ctx.lineTo(bx, by);
          }
          ctx.stroke();
          break;
        }
        case "ring": {
          const e = easeOutCubic(t);
          ctx.globalAlpha = (1 - t) * 0.6;
          ctx.strokeStyle = f.colour;
          ctx.lineWidth = Math.max(px * 0.05, 2);
          ctx.beginPath();
          ctx.arc((f.x + 0.5) * px, (f.y + 0.5) * px, f.r * px * e, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case "lunge": case "wipe": break;    // handled elsewhere
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
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

export function r_drawHud(_g: Game, W: number, H: number): void {
    const { ctx } = _g;
    const ins = _g.insets();
    const u = Math.max(Math.min(W, H) / 420, 1) * _g.settings.uiScale;
    const pad = 8 * u;
    const left = ins.left + pad;
    const maxW = W - ins.left - ins.right - pad * 2;
    const s = _g.level.stratum;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    const L: HudLayout = {
      u, left: ins.left, right: ins.right, top: ins.top, bottom: ins.bottom,
      w: W, h: H, reserve: _g.barH,
    };

    // The column gauge: eight bands in their stratum colours, your depth
    // marked. The game's structure, drawn literally.
    const gaugeW = drawColumn(ctx, L, _g.dungeon.depth);
    // A sealed floor must say so, or the blocked stair reads as a bug.
    const sealed = !Dungeon.isCleared(_g.level);
    const upBtn = _g.buttons.find((b) => b.id === "up");
    const downBtn = _g.buttons.find((b) => b.id === "down");
    if (upBtn) upBtn.enabled = _g.dungeon.depth > 1;
    if (downBtn) downBtn.enabled = _g.level.down !== null;
    const pl = _g.buttons.find((b) => b.id === "plasmid");
    if (pl) pl.active = _g.showPlasmid;

    const barX = left + gaugeW;
    const barW = Math.min(W - barX - ins.right - pad, 260 * u);
    const size = Math.min(_g.fitFont(s.name, barW - 12, 13 * u), 13 * u);
    ctx.font = `${size}px ui-monospace,monospace`;
    const lh = size * 1.35;
    const barH = lh * 2.6 + pad;
    const barTop = H - ins.bottom - barH;
    _g.barH = barH;

    ctx.fillStyle = "rgba(0,0,0,0.62)";
    ctx.fillRect(0, barTop, W, barH + ins.bottom);

    ctx.fillStyle = s.accent;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`F${_g.dungeon.floor}/${MAX_FLOOR}${sealed ? " \u26D4" : ""} ${s.name}  ${s.teap} ${s.e0 >= 0 ? "+" : ""}${s.e0}mV  ${timeName(_g.clock)}`,
                 barX, barTop + lh * 0.9);

    // One row: hp gauge, then plain readouts. A miniature plasmid ring used to
    // sit here and read as an unexplained circle, so it is gone -- the real
    // ring is one tap away and legible.
    const gaugeH = Math.max(lh * 0.8, 12);
    const hpW = Math.min(barW * 0.44, 150 * u);
    drawBar(ctx, barX, barTop + lh * 1.15, hpW, gaugeH,
            _g.player.hp / _g.player.maxhp, "#4fbf6a",
            `hp ${Math.max(_g.player.hp, 0)}/${_g.player.maxhp}`,
            `${size * 0.86}px ui-monospace,monospace`);

    const bal = _g.genome.atpBalance(_g.dungeon.depth);
    drawBar(ctx, barX + hpW + 8 * u, barTop + lh * 1.15, hpW, gaugeH,
            _g.player.atp / _g.player.atpMax,
            bal >= 0 ? "#4a9fd8" : "#c86a3a",
            `atp ${Math.round(_g.player.atp)}  ${bal >= 0 ? "+" : ""}${bal.toFixed(1)}`,
            `${size * 0.86}px ui-monospace,monospace`);

    // Strain progress. A thin line rather than a third gauge: it advances
    // slowly and over the whole run, so it should not compete with hp and ATP
    // for attention.
    const prog = levelProgress({
      catalogued: _g.run.bestiary.length, deepest: _g.run.deepest,
    });
    const sy = barTop + lh * 1.15 + gaugeH + 3 * u;
    const sw = hpW * 2 + 8 * u;
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(barX, sy, sw, Math.max(2 * u, 2));
    ctx.fillStyle = _g.genome.strain >= MAX_STRAIN ? "#7fe0a4" : "#cfe04a";
    ctx.fillRect(barX, sy, sw * prog, Math.max(2 * u, 2));

    const ops = _g.genome.operons().filter((op) => op.genes.length > 0).length;
    ctx.font = `${size * 0.86}px ui-monospace,monospace`;
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "middle";
    // Shortened and measured: the long form clipped off the right edge.
    const tailX = barX + hpW * 2 + 18 * u;
    const room = W - ins.right - 6 * u - tailX;
    const long = `${ops} operon${ops === 1 ? "" : "s"}   ${_g.dungeon.aliveCount()} hostile`;
    const short = `${ops}op  ${_g.dungeon.aliveCount()}hp`;
    ctx.fillText(ctx.measureText(long).width <= room ? long : short,
                 tailX, barTop + lh * 1.15 + gaugeH / 2);
    ctx.textBaseline = "alphabetic";

    const LIFE = 9000;
    const FADE = 2000;
    const now = performance.now();
    const wrapped: { line: string; alpha: number }[] = [];
    for (const entry of _g.log) {
      const age = now - entry.t;
      if (age > LIFE) continue;
      const alpha = age > LIFE - FADE ? (LIFE - age) / FADE : 1;
      for (const line of _g.wrap(entry.text, maxW)) wrapped.push({ line, alpha });
    }
    const shown = wrapped.slice(-4);
    // +lh: text is positioned by baseline, so the top line's ascender sits
    // ABOVE its y. Sizing the panel to shown.length*lh left it exposed.
    const logH = shown.length > 0 ? (shown.length + 0.4) * lh + pad * 0.5 : 0;
    _g.logH = logH;

    if (logH > 0) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(0, barTop - logH, W, logH);
    }
    ctx.font = `${size}px ui-monospace,monospace`;

    for (let i = shown.length - 1; i >= 0; i--) {
      const row = shown[i];
      if (row === undefined) continue;
      ctx.globalAlpha = row.alpha;
      ctx.fillStyle = "#cfe8d4";
      ctx.fillText(row.line, barX, barTop - (shown.length - i) * lh - pad * 0.25);
    }
    ctx.globalAlpha = 1;
  }

export function r_drawPlasmid(_g: Game, W: number, H: number): void {
    const { ctx } = _g;
    const ins = _g.insets();
    const u = Math.max(Math.min(W, H) / 420, 1) * _g.settings.uiScale;
    ctx.fillStyle = "rgba(0,0,0,0.93)";
    ctx.fillRect(0, 0, W, H);

    const avail = Math.min(W - ins.left - ins.right, H * 0.46);
    _g.ring = {
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
    ctx.fillStyle = "#ffffff";
    ctx.font = `${15 * u}px ui-monospace,monospace`;
    ctx.fillText(`${_g.genome.used().toFixed(1)}/${_g.genome.capacityKb()} kb`,
                 _g.ring.cx, _g.ring.cy - 9 * u);
    const d = _g.dungeon.depth;
    const bal = _g.genome.atpBalance(d);
    ctx.font = `${11 * u}px ui-monospace,monospace`;
    ctx.fillStyle = bal >= 0 ? "#7fc4e8" : "#e08a5a";
    ctx.fillText(
      `ATP ${Math.round(_g.player.atp)}/${_g.player.atpMax}   ` +
      `${bal >= 0 ? "+" : ""}${bal.toFixed(1)}/action`,
      _g.ring.cx, _g.ring.cy + 10 * u);
    ctx.fillStyle = "#8fa89a";
    ctx.fillText(
      `power ${_g.genome.power(d).toFixed(1)}` +
      (_g.genome.burden() > 0 ? `   burden ${(_g.genome.burden() * 100) | 0}%` : "") +
      (_g.genome.supply < 0.99 ? `   brownout ${(_g.genome.supply * 100) | 0}%` : ""),
      _g.ring.cx, _g.ring.cy + 27 * u);

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
    drawBin(ctx, _g.bin, _g.genome.bin, u, _g.dragBin);
    const binRows = Math.floor(_g.genome.bin.length / 6) + 1;
    // Deferred: the card belongs on top of everything else on this screen.
    const card = _g.card;

    // Active complexes and hazards, which is the payoff for arranging well.
    let cy = _g.bin.y + binRows * (cell + gap) + 14 * u;
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
         "drag bin → slot to install, slot → bin to remove",
         "drag outside the ring to spin it",
         "expression costs ATP; respiration pays less the deeper you go"]
      : describeSlot(_g.genome, _g.selected, _g.dungeon.depth);
    ctx.textAlign = "left";
    ctx.font = `${11.5 * u}px ui-monospace,monospace`;
    // A running row counter, not the entry index: wrapping produces several
    // lines per entry and they were all being drawn at the same y.
    let row = 0;
    lines.forEach((line, i) => {
      ctx.fillStyle = i === 0 ? "#ffffff" : "#9fb8a8";
      for (const w of _g.wrap(line, W - (ins.left + ins.right + 32 * u))) {
        ctx.fillText(w, ins.left + gap, py + row * 17 * u);
        row++;
      }
    });

    // A real close target. "Tap outside" was ambiguous, and it was what let a
    // button press dismiss the screen in the same gesture that opened it.
    _g.closeBox = drawClose(ctx, W, ins, u);
    if (card) {
      _g.cardEat = drawItemCard(ctx, W, H, u, card, _g.genome, _g.dungeon.depth,
                                (s, max) => _g.wrap(s, max),
                                _g.cardIndex >= 0
                                  && !(card.kind === "gene" && card.id === "ori"));
    }
  }

export function r_drawMapScreen(_g: Game, W: number, H: number): void {
    const { ctx } = _g;
    const ins = _g.insets();
    const u = Math.max(Math.min(W, H) / 420, 1) * _g.settings.uiScale;
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
    ctx.fillText("drag to pan · pinch to zoom · tap a complete module to build it",
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
