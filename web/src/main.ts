// Microgue -- browser shell. Canvas rendering, pointer + keyboard input,
// localStorage persistence. Everything above this file is engine-free logic.

import * as bio from "./biology.js";
import { Dungeon, type Level, type Mob } from "./dungeon.js";
import { Plasmid } from "./plasmid.js";
import { drawRing, describe as describeSlot, slotAt, type RingGeom } from "./plasmid_ui.js";
import { buttonAt, drawButtons, layoutButtons, makeButtons, type Button } from "./buttons.js";
import * as mg from "./mapgen.js";
import type { Point } from "./mapgen.js";
import { findPath } from "./path.js";
import { drawBar, drawColumn, drawPlasmidRing, type HudLayout } from "./hud.js";
import { paintWallMotif, paletteForPigment, playerSprite, sprite } from "./paint.js";
import { traceWalls } from "./walls.js";
import { DEFAULT_SETTINGS, readSave, writeSave, type Settings } from "./save.js";

const TILE = 32;
const SAVE_KEY = "microgue:v1";

class Game {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  dungeon = new Dungeon(110, 80, 7);
  genome = new Plasmid();
  level!: Level;
  player = { x: 0, y: 0, ax: 0, ay: 0, hp: 30, maxhp: 30, speed: 18 };
  cursor: Point = { x: 0, y: 0 };
  path: Point[] | null = null;
  walk: { nodes: Point[]; i: number } | null = null;
  zoom = 1;
  log: { text: string; t: number }[] = [];
  showPlasmid = false;
  buttons: Button[] = makeButtons();
  ring: RingGeom = { cx: 0, cy: 0, rInner: 0, rOuter: 0, rot: 0 };
  dragFrom: number | null = null;
  dragXY: { x: number; y: number } | null = null;
  selected: number | null = null;
  spinFrom: number | null = null;
  barH = 0;
  settings: Settings = DEFAULT_SETTINGS;
  private last = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
    if (!this.load()) this.enter(this.dungeon.current(), this.dungeon.current().up);
    this.resize();
    addEventListener("resize", () => { this.resize(); });
    this.bindInput();
    requestAnimationFrame((t) => { this.frame(t); });
  }

  // ---------------------------------------------------------------- state
  /** Messages expire. Boot lines -- the stratum banner, the blurb, "Resumed."
   *  -- were eating four of five slots and crowding out actual play. */
  note(s: string): void {
    this.log.push({ text: s, t: performance.now() });
    while (this.log.length > 8) this.log.shift();
  }

  enter(level: Level, arrive: Point): void {
    this.level = level;
    let p: Point | null = arrive;
    if (!level.grid.isFloor(p.x, p.y)) p = mg.findSpawn(level.grid, p.x, p.y);
    p ??= mg.carveSpawn(level.grid);
    this.player.x = p.x; this.player.y = p.y;
    this.player.ax = p.x; this.player.ay = p.y;
    this.cursor = { x: p.x, y: p.y };
    this.path = null; this.walk = null;
    this.zoom = this.tileZoom();
    const s = level.stratum;
    this.note(`D${String(s.depth)} ${s.name} — ${s.teap} ${s.e0 >= 0 ? "+" : ""}${String(s.e0)} mV`);
    if (!level.visited) { level.visited = true; this.note(s.blurb); }
    this.save();
  }

  descend(): void {
    const r = this.dungeon.descend();
    if ("err" in r) { this.note(r.err); return; }
    this.enter(r.level, r.arrive);
  }
  ascend(): void {
    const r = this.dungeon.ascend();
    if ("err" in r) { this.note(r.err); return; }
    this.enter(r.level, r.arrive);
  }

  // ------------------------------------------------------------- combat
  atk(): number { return 3 + this.genome.power(this.dungeon.depth) * 0.9; }

  attack(m: Mob): void {
    m.hp = Math.max(m.hp - Math.max(Math.round(this.atk()), 1), 0);
    if (m.hp <= 0) {
      m.alive = false;
      this.note(`${m.name} destroyed.`);
      const pool = m.genes.filter((g) => !this.genome.has(g));
      if (!pool.length) { this.note(`Nothing new to take.`); }
      else {
        const pick = pool[Math.floor(Math.random() * pool.length)];
        if (pick === undefined) return;
        const r = this.genome.add({ kind: "gene", id: pick, optimised: false });
        this.note(r.ok ? `HGT: acquired ${bio.GENES[pick].name} from ${m.name}.`
                       : `${bio.GENES[pick].name} — ${r.err}`);
      }
    } else {
      this.player.hp = Math.max(this.player.hp - Math.round(m.atk * 0.5), 0);
      this.note(`${m.name}: ${Math.max(m.hp, 0)} hp left.`);
    }
    this.mobTurn();
    this.save();
  }

  mobTurn(): void {
    for (const m of this.level.mobs) {
      if (!m.alive) continue;
      const dx = this.player.x - m.x, dy = this.player.y - m.y;
      if (dx * dx + dy * dy > 64) continue;
      if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
        this.player.hp = Math.max(this.player.hp - Math.max(Math.round(m.atk * 0.35), 1), 0);
        continue;
      }
      const sx = Math.sign(dx), sy = Math.sign(dy);
      if (this.level.grid.isFloor(m.x + sx, m.y + sy) && !this.dungeon.mobAt(m.x + sx, m.y + sy)) {
        m.x += sx; m.y += sy;
      }
    }
    if (this.player.hp <= 0) {
      this.player.hp = this.player.maxhp;
      this.note("Lysed. Reassembled at the last stair.");
      this.player.x = this.level.up.x; this.player.y = this.level.up.y;
      this.player.ax = this.player.x; this.player.ay = this.player.y;
    }
  }

  step(x: number, y: number): boolean {
    const m = this.dungeon.mobAt(x, y);
    if (m) { this.attack(m); return false; }
    if (!this.level.grid.isFloor(x, y)) return false;
    this.player.x = x; this.player.y = y;
    this.mobTurn();
    return true;
  }

  stairs(): boolean {
    const { x, y } = this.player;
    const d = this.level.down;
    if (x === d?.x && y === d.y) { this.descend(); return true; }
    if (this.level.depth > 1 && x === this.level.up.x && y === this.level.up.y) { this.ascend(); return true; }
    return false;
  }

  // -------------------------------------------------------------- input
  repath(): void {
    this.path = findPath(this.level.grid, { x: this.player.x, y: this.player.y },
                         this.cursor, { diagonal: this.settings.diagonal });
  }

  tap(tx: number, ty: number): void {
    if (tx === this.player.x && ty === this.player.y) { if (this.stairs()) return; }
    const m = this.dungeon.mobAt(tx, ty);
    if (m !== undefined && Math.abs(tx - this.player.x) <= 1 && Math.abs(ty - this.player.y) <= 1) {
      this.attack(m); return;
    }
    this.cursor = { x: tx, y: ty };
    this.repath();
    if (this.path && this.path.length > 1) this.walk = { nodes: this.path, i: 0 };
  }

  private bindInput(): void {
    const toTile = (cx: number, cy: number): Point => {
      const r = this.canvas.getBoundingClientRect();
      const s = TILE * this.zoom;
      const px = (cx - r.left - r.width / 2) / s + this.player.ax + 0.5;
      const py = (cy - r.top - r.height / 2) / s + this.player.ay + 0.5;
      return { x: Math.floor(px), y: Math.floor(py) };
    };

    this.canvas.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (this.plasmidPointer("down", e.clientX, e.clientY)) return;
      const b = buttonAt(this.buttons, e.clientX, e.clientY);
      if (b) { b.active = true; this.press(b.id); return; }
      const t = toTile(e.clientX, e.clientY);
      this.tap(t.x, t.y);
    });
    this.canvas.addEventListener("pointermove", (e) => {
      this.plasmidPointer("move", e.clientX, e.clientY);
    });
    const release = (e: PointerEvent): void => {
      this.plasmidPointer("up", e.clientX, e.clientY);
      for (const b of this.buttons) if (b.id !== "plasmid") b.active = false;
    };
    this.canvas.addEventListener("pointerup", release);
    this.canvas.addEventListener("pointercancel", release);

    addEventListener("keydown", (e) => {
      const k = e.key;
      const dirs: Record<string, [number, number]> = {
        ArrowUp: [0,-1], ArrowDown: [0,1], ArrowLeft: [-1,0], ArrowRight: [1,0],
        w:[0,-1], s:[0,1], a:[-1,0], d:[1,0],
        y:[-1,-1], u:[1,-1], b:[-1,1], n:[1,1],
      };
      const dir = dirs[k];
      if (dir) {
        e.preventDefault();
        this.walk = null;
        const [dx, dy] = dir;
        const pinch = dx && dy
          && !this.level.grid.isFloor(this.player.x + dx, this.player.y)
          && !this.level.grid.isFloor(this.player.x, this.player.y + dy);
        if (!pinch) this.step(this.player.x + dx, this.player.y + dy);
        return;
      }
      if (k === "i" || k === "p") this.showPlasmid = !this.showPlasmid;
      else if (k === ">" || k === ".") this.descend();
      else if (k === "<" || k === ",") this.ascend();
      else if (k === "+" || k === "=") this.zoom = Math.min(this.zoom * 1.25, 8);
      else if (k === "-") this.zoom = Math.max(this.zoom / 1.25, 0.3);
      else if (k === "c") {
        this.settings = { ...this.settings, highContrast: !this.settings.highContrast };
        this.save();
      }
    });

    // Pinch-zoom, without the gesture fighting a tap.
    const pts = new Map<number, Point>();
    let d0 = 0;
    let z0 = 1;
    this.canvas.addEventListener("pointermove", (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()] as [Point, Point];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d0 > 0) this.zoom = Math.min(Math.max(z0 * (d / d0), 0.3), 8);
      }
    });
    this.canvas.addEventListener("pointerdown", (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()] as [Point, Point];
        d0 = Math.hypot(a.x - b.x, a.y - b.y); z0 = this.zoom; this.walk = null;
      }
    });
    const drop = (e: PointerEvent): void => { pts.delete(e.pointerId); if (pts.size < 2) d0 = 0; };
    this.canvas.addEventListener("pointerup", drop);
    this.canvas.addEventListener("pointercancel", drop);
  }

  // ------------------------------------------------------------ persist
  save(): void {
    writeSave(SAVE_KEY, {
      version: 1,
      depth: this.dungeon.depth,
      seed: this.dungeon.seed,
      px: this.player.x,
      py: this.player.y,
      hp: this.player.hp,
      ring: this.genome.slots.map((p) => (p === null ? null : { ...p })),
      settings: this.settings,
    });
  }

  load(): boolean {
    const s = readSave(SAVE_KEY);
    if (s === null) return false;
    this.dungeon = new Dungeon(110, 80, s.seed);
    this.dungeon.depth = s.depth;
    this.genome = new Plasmid();
    s.ring.forEach((p, i) => { this.genome.put(i, p); });
    this.settings = s.settings;
    this.enter(this.dungeon.current(), { x: s.px, y: s.py });
    this.player.hp = s.hp;
    return true;
  }

  // ------------------------------------------------------------- render
  /** Notch / gesture-bar insets. Read from CSS env() via a probe element,
   *  since canvas has no access to them directly. */
  private insetCache: { top: number; right: number; bottom: number; left: number } | null = null;

  /** Notch / gesture-bar insets. Cached: this touches the DOM, and the first
   *  version ran it on every frame. */
  private insets(): { top: number; right: number; bottom: number; left: number } {
    if (this.insetCache) return this.insetCache;
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;visibility:hidden;" +
      "top:env(safe-area-inset-top);right:env(safe-area-inset-right);" +
      "bottom:env(safe-area-inset-bottom);left:env(safe-area-inset-left)";
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    const px = (v: string): number => {
      const n = Number.parseFloat(v);
      return Number.isFinite(n) ? n : 0;
    };
    const out = { top: px(cs.top), right: px(cs.right), bottom: px(cs.bottom), left: px(cs.left) };
    probe.remove();
    this.insetCache = out;
    return out;
  }

  /** Largest font size at which `text` fits `maxWidth`, down to a floor. */
  private fitFont(text: string, maxWidth: number, ideal: number): number {
    const { ctx } = this;
    let size = ideal;
    for (; size > 8; size -= 0.5) {
      ctx.font = `${size}px ui-monospace,monospace`;
      if (ctx.measureText(text).width <= maxWidth) break;
    }
    return size;
  }

  /** Word-wrap for the message log, which ran off the right edge. */
  private wrap(text: string, maxWidth: number): string[] {
    const { ctx } = this;
    const words = text.split(" ");
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const test = line === "" ? word : `${line} ${word}`;
      if (ctx.measureText(test).width > maxWidth && line !== "") {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line !== "") lines.push(line);
    return lines;
  }

  tileZoom(): number {
    const short = Math.min(innerWidth, innerHeight);
    const coarse = matchMedia("(pointer: coarse)").matches;
    return Math.max(short / ((coarse ? 13 : 30) * TILE), 0.3);
  }

  resize(): void {
    this.insetCache = null;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(innerWidth * dpr, 1);
    this.canvas.height = Math.max(innerHeight * dpr, 1);
    this.canvas.style.width = `${innerWidth}px`;
    this.canvas.style.height = `${innerHeight}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.zoom = this.tileZoom();
  }

  frame(t: number): void {
    const dt = Math.min(Math.max((t - this.last) / 1000, 0), 1 / 15);
    this.last = t;

    // slide toward the logical tile; clamped so a hitch cannot overshoot
    const k = this.settings.reduceMotion ? 1 : Math.min(this.player.speed * dt, 1);
    this.player.ax += (this.player.x - this.player.ax) * k;
    this.player.ay += (this.player.y - this.player.ay) * k;
    const at = Math.abs(this.player.x - this.player.ax) < 0.02
            && Math.abs(this.player.y - this.player.ay) < 0.02;
    if (at) { this.player.ax = this.player.x; this.player.ay = this.player.y; }

    if (this.walk && at) {
      this.walk.i++;
      const n = this.walk.nodes[this.walk.i];
      if (!n || this.dungeon.mobAt(n.x, n.y) || !this.step(n.x, n.y)) this.walk = null;
    }

    this.draw();
    requestAnimationFrame((tt) => { this.frame(tt); });
  }

  draw(): void {
    const { ctx } = this;
    const W = innerWidth, H = innerHeight;
    const s = this.level.stratum;
    const hc = this.settings.highContrast;

    ctx.fillStyle = hc ? "#000" : s.floor;
    ctx.fillRect(0, 0, W, H);

    const px = TILE * this.zoom;
    ctx.save();
    ctx.translate(W / 2 - (this.player.ax + 0.5) * px, H / 2 - (this.player.ay + 0.5) * px);

    const x0 = Math.max(Math.floor((this.player.ax - W / px / 2) - 1), 0);
    const x1 = Math.min(Math.ceil((this.player.ax + W / px / 2) + 1), this.level.grid.w - 1);
    const y0 = Math.max(Math.floor((this.player.ay - H / px / 2) - 1), 0);
    const y1 = Math.min(Math.ceil((this.player.ay + H / px / 2) + 1), this.level.grid.h - 1);

    // Walls as one traced contour, not a grid of squares. Corners round where
    // they are exposed and fillet where three tiles meet, so the region reads
    // as organic rather than tiled. All tiles go into a single path and fill
    // together under nonzero winding, so shared edges leave no seam.
    ctx.fillStyle = hc ? "#ffffff" : s.wall;
    ctx.save();
    ctx.scale(px, px);
    ctx.beginPath();
    traceWalls(ctx, this.level.grid, x0, y0, x1, y1, hc ? 0 : 0.5);
    ctx.fill();
    ctx.restore();

    // Motifs afterwards, clipped to the contour so texture never spills into
    // the floor at a rounded corner.
    if (!hc && px >= 40) {
      ctx.save();
      ctx.beginPath();
      ctx.save();
      ctx.scale(px, px);
      traceWalls(ctx, this.level.grid, x0, y0, x1, y1, 0.5);
      ctx.restore();
      ctx.clip();
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (!this.level.grid.isWall(x, y)) continue;
          paintWallMotif(ctx, s.depth, x, y, Math.round(x * px), Math.round(y * px), px, s.floor);
        }
      }
      ctx.restore();
    }

    if (this.path) {
      // Trim the stretch already walked, so the trail shows where you are
      // going rather than where you have been.
      const at = this.path.findIndex((p) => p.x === this.player.x && p.y === this.player.y);
      const ahead = at >= 0 ? this.path.slice(at + 1) : this.path;
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
    if (this.level.down) stair(this.level.down, true);
    if (this.level.depth > 1) stair(this.level.up, false);

    for (const m of this.level.mobs) {
      if (!m.alive) continue;
      const f = Math.max(m.hp / m.maxhp, 0);
      const img = hc ? null : sprite(m.id, px * 0.92, paletteForPigment(m.pigment));
      if (img) {
        ctx.drawImage(img, m.x * px + px * 0.04, m.y * px + px * 0.04);
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
        const bx = m.x * px + px * 0.2;
        const by = m.y * px + px * 0.87;
        const bw = px * 0.6;
        const bh = Math.max(px * 0.08, 3);
        ctx.fillStyle = "rgba(0,0,0,0.8)";
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = "#ffd08a";
        ctx.fillRect(bx, by, bw * f, bh);
      }
    }

    const me = hc ? null : playerSprite(px * 0.92);
    if (me) {
      ctx.drawImage(me, this.player.ax * px + px * 0.04, this.player.ay * px + px * 0.04);
    } else {
      ctx.fillStyle = "#0ff";
      ctx.fillRect(this.player.ax * px + px * 0.18, this.player.ay * px + px * 0.18,
                   px * 0.64, px * 0.64);
    }

    ctx.strokeStyle = hc ? "#ff0" : (this.path ? "#ffffff" : "#777777");
    ctx.lineWidth = 2;
    ctx.strokeRect(this.cursor.x * px, this.cursor.y * px, px, px);
    ctx.restore();

    this.drawHud(W, H);
    const u = Math.max(Math.min(W, H) / 420, 1) * this.settings.uiScale;
    if (this.showPlasmid) {
      this.drawPlasmid(W, H);
    } else {
      layoutButtons(this.buttons, W, H, this.insets(), u, this.barH);
      drawButtons(ctx, this.buttons, u);
    }
  }

  drawHud(W: number, H: number): void {
    const { ctx } = this;
    const ins = this.insets();
    const u = Math.max(Math.min(W, H) / 420, 1) * this.settings.uiScale;
    const pad = 8 * u;
    const left = ins.left + pad;
    const maxW = W - ins.left - ins.right - pad * 2;
    const s = this.level.stratum;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    const L: HudLayout = {
      u, left: ins.left, right: ins.right, top: ins.top, bottom: ins.bottom,
      w: W, h: H, reserve: this.barH,
    };

    // The column gauge: eight bands in their stratum colours, your depth
    // marked. The game's structure, drawn literally.
    const gaugeW = drawColumn(ctx, L, this.dungeon.depth);
    const upBtn = this.buttons.find((b) => b.id === "up");
    const downBtn = this.buttons.find((b) => b.id === "down");
    if (upBtn) upBtn.enabled = this.dungeon.depth > 1;
    if (downBtn) downBtn.enabled = this.level.down !== null;
    const pl = this.buttons.find((b) => b.id === "plasmid");
    if (pl) pl.active = this.showPlasmid;

    const barX = left + gaugeW;
    const barW = Math.min(W - barX - ins.right - pad, 260 * u);
    const size = Math.min(this.fitFont(s.name, barW - 12, 13 * u), 13 * u);
    ctx.font = `${size}px ui-monospace,monospace`;
    const lh = size * 1.35;
    const barH = lh * 2.6 + pad;
    const barTop = H - ins.bottom - barH;
    this.barH = barH;

    ctx.fillStyle = "rgba(0,0,0,0.62)";
    ctx.fillRect(0, barTop, W, barH + ins.bottom);

    ctx.fillStyle = s.accent;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`${s.name}  ${s.teap} ${s.e0 >= 0 ? "+" : ""}${s.e0}mV`,
                 barX, barTop + lh * 0.9);

    const gaugeH = Math.max(lh * 0.8, 12);
    drawBar(ctx, barX, barTop + lh * 1.15, barW * 0.52, gaugeH,
            this.player.hp / this.player.maxhp, "#4fbf6a",
            `hp ${Math.max(this.player.hp, 0)}/${this.player.maxhp}`,
            `${size * 0.86}px ui-monospace,monospace`);

    const ringR = gaugeH * 0.95;
    const ringX = barX + barW * 0.6 + ringR;
    drawPlasmidRing(ctx, ringX, barTop + lh * 1.15 + gaugeH / 2, ringR,
                    this.genome, this.dungeon.depth);
    ctx.font = `${size * 0.86}px ui-monospace,monospace`;
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "middle";
    ctx.fillText(`${this.genome.used().toFixed(1)}/${this.genome.capacityKb()}kb   ` +
                 `${this.dungeon.aliveCount()} hostile`,
                 ringX + ringR + 8 * u, barTop + lh * 1.15 + gaugeH / 2);
    ctx.textBaseline = "alphabetic";

    const LIFE = 9000;
    const FADE = 2000;
    const now = performance.now();
    const wrapped: { line: string; alpha: number }[] = [];
    for (const entry of this.log) {
      const age = now - entry.t;
      if (age > LIFE) continue;
      const alpha = age > LIFE - FADE ? (LIFE - age) / FADE : 1;
      for (const line of this.wrap(entry.text, maxW)) wrapped.push({ line, alpha });
    }
    const shown = wrapped.slice(-4);
    // +lh: text is positioned by baseline, so the top line's ascender sits
    // ABOVE its y. Sizing the panel to shown.length*lh left it exposed.
    const logH = shown.length > 0 ? (shown.length + 0.4) * lh + pad * 0.5 : 0;

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

  drawPlasmid(W: number, H: number): void {
    const { ctx } = this;
    const ins = this.insets();
    const u = Math.max(Math.min(W, H) / 420, 1) * this.settings.uiScale;
    ctx.fillStyle = "rgba(0,0,0,0.93)";
    ctx.fillRect(0, 0, W, H);

    const avail = Math.min(W - ins.left - ins.right, H * 0.58);
    this.ring = {
      cx: W / 2,
      cy: ins.top + avail * 0.55 + 20 * u,
      rOuter: avail * 0.42,
      rInner: avail * 0.42 - Math.max(avail * 0.11, 30 * u),
      rot: this.ring.rot,
    };

    drawRing(ctx, this.ring, this.genome, {
      depth: this.dungeon.depth, dragFrom: this.dragFrom,
      dragXY: this.dragXY, selected: this.selected, u,
    });

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";
    ctx.font = `${15 * u}px ui-monospace,monospace`;
    ctx.fillText(`${this.genome.used().toFixed(1)}/${this.genome.capacityKb()} kb`,
                 this.ring.cx, this.ring.cy - 9 * u);
    ctx.font = `${11 * u}px ui-monospace,monospace`;
    ctx.fillStyle = this.genome.burden() > 0 ? "#ffb45a" : "#8fa89a";
    ctx.fillText(`burden ${(this.genome.burden() * 100) | 0}%`,
                 this.ring.cx, this.ring.cy + 9 * u);
    ctx.fillStyle = "#8fa89a";
    ctx.fillText(`power ${this.genome.power(this.dungeon.depth).toFixed(1)}`,
                 this.ring.cx, this.ring.cy + 26 * u);

    // Detail panel for the tapped slot.
    const py = this.ring.cy + this.ring.rOuter + 26 * u;
    const lines = this.selected === null
      ? ["tap a slot to inspect it",
         "drag a part to move it — genes must sit downstream of a promoter",
         "drag outside the ring to spin"]
      : describeSlot(this.genome, this.selected, this.dungeon.depth);
    ctx.textAlign = "left";
    ctx.font = `${12 * u}px ui-monospace,monospace`;
    lines.forEach((line, i) => {
      ctx.fillStyle = i === 0 ? "#ffffff" : "#9fb8a8";
      for (const w of this.wrap(line, W - (ins.left + ins.right + 32 * u))) {
        ctx.fillText(w, ins.left + 16 * u, py + i * 20 * u);
      }
    });

    ctx.textAlign = "center";
    ctx.fillStyle = "#8fa89a";
    ctx.font = `${12 * u}px ui-monospace,monospace`;
    ctx.fillText("tap outside to close", W / 2, H - ins.bottom - 18 * u);
  }

  /** Pointer handling while the plasmid screen is open. Returns true if the
   *  event was consumed. */
  plasmidPointer(phase: "down" | "move" | "up", x: number, y: number): boolean {
    if (!this.showPlasmid) return false;
    const i = slotAt(this.ring, x, y);

    if (phase === "down") {
      if (i === null) {
        const d = Math.hypot(x - this.ring.cx, y - this.ring.cy);
        if (d > this.ring.rOuter) {
          // outside the ring: either spin it or dismiss
          this.spinFrom = Math.atan2(y - this.ring.cy, x - this.ring.cx);
          return true;
        }
        return true;
      }
      this.selected = i;
      if (this.genome.at(i) !== null) {
        this.dragFrom = i;
        this.dragXY = { x, y };
      }
      return true;
    }

    if (phase === "move") {
      if (this.dragFrom !== null) { this.dragXY = { x, y }; return true; }
      if (this.spinFrom !== null) {
        const a = Math.atan2(y - this.ring.cy, x - this.ring.cx);
        this.ring.rot += a - this.spinFrom;
        this.spinFrom = a;
        return true;
      }
      return true;
    }

    // up
    if (this.dragFrom !== null) {
      if (i !== null && i !== this.dragFrom) {
        this.genome.swap(this.dragFrom, i);
        this.selected = i;
        this.save();
      }
      this.dragFrom = null;
      this.dragXY = null;
      return true;
    }
    if (this.spinFrom !== null) { this.spinFrom = null; return true; }
    if (i === null && Math.hypot(x - this.ring.cx, y - this.ring.cy) > this.ring.rOuter * 1.35) {
      this.showPlasmid = false;
    }
    return true;
  }

  press(id: string): void {
    switch (id) {
      case "plasmid": this.showPlasmid = !this.showPlasmid; this.selected = null; break;
      case "down": this.descend(); break;
      case "up": this.ascend(); break;
      case "zoomIn": this.zoom = Math.min(this.zoom * 1.25, 8); break;
      case "zoomOut": this.zoom = Math.max(this.zoom / 1.25, 0.3); break;
      case "contrast":
        this.settings = { ...this.settings, highContrast: !this.settings.highContrast };
        this.save();
        break;
      default: break;
    }
  }
}

function boot(): void {
  const el = document.getElementById("game");
  if (!(el instanceof HTMLCanvasElement)) return;
  new Game(el);
  document.getElementById("boot")?.remove();
  if ("serviceWorker" in navigator) {
    addEventListener("load", () => {
      void navigator.serviceWorker.register("./sw.js", { scope: "./" })
        .catch(() => undefined);
    });
  }
}
boot();

export { Game };
