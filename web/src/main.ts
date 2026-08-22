// Microgue -- browser shell. Canvas rendering, pointer + keyboard input,
// localStorage persistence. Everything above this file is engine-free logic.

import * as bio from "./biology.js";
import { Dungeon, type Level, type Mob } from "./dungeon.js";
import { Plasmid } from "./plasmid.js";
import { binAt, drawBin, drawRing, describe as describeSlot, slotAt,
         type BinGeom, type RingGeom } from "./plasmid_ui.js";
import { buttonAt, drawButtons, layoutButtons, makeButtons, type Button } from "./buttons.js";
import { classifyDown, classifyKey, type Gesture } from "./gesture.js";
import { drawMap, layoutMap, rowAt, type MapGeom, type MapRow } from "./kegg_ui.js";
import * as mg from "./mapgen.js";
import type { Point } from "./mapgen.js";
import { findPath } from "./path.js";
import { drawBar, drawColumn, type HudLayout } from "./hud.js";
import { paintWallMotif, paletteForPigment, playerSprite, sprite } from "./paint.js";
import { traceWalls } from "./walls.js";
import { DEFAULT_SETTINGS, SCHEMA, readSave, writeSave, type Settings } from "./save.js";

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
  // A pointer gesture is classified once on down and acted on once on up.
  // Deciding per-event is what let a button press open the plasmid on down and
  // a stray dismiss check close it again on up, in the same tap.
  gesture: Gesture = "none";
  gestureBtn: Button | null = null;
  closeBox = { x: 0, y: 0, w: 0, h: 0 };
  dragFrom: number | null = null;
  dragBin: number | null = null;
  bin: BinGeom = { x: 0, y: 0, cell: 0, gap: 0, cols: 6 };
  showMap = false;
  map: MapGeom = { x: 0, y: 0, w: 0, rowH: 0, scroll: 0 };
  mapRows: MapRow[] = [];
  mapContentH = 0;
  dragXY: { x: number; y: number } | null = null;
  selected: number | null = null;
  spinFrom: number | null = null;
  spinStart: number | null = null;
  barH = 0;
  logH = 0;
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

  /** Per-action upkeep: toxic intermediates bite, complexes repair, and a
   *  sulfide aura burns anything adjacent. */
  private upkeep(): void {
    const d = this.dungeon.depth;
    const tox = this.genome.toxicity(d);
    if (tox > 0) {
      this.player.hp = Math.max(this.player.hp - tox, 0);
      const h = this.genome.hazards(d)[0];
      if (h && Math.random() < 0.2) this.note(`${h.name} — ${tox} damage.`);
    }
    const regen = this.genome.regen(d);
    if (regen > 0 && this.player.hp < this.player.maxhp) {
      this.player.hp = Math.min(this.player.hp + regen, this.player.maxhp);
    }
    const aura = this.genome.aura(d);
    if (aura > 0) {
      for (const m of this.level.mobs) {
        if (!m.alive) continue;
        if (Math.abs(m.x - this.player.x) <= 1 && Math.abs(m.y - this.player.y) <= 1) {
          m.hp = Math.max(m.hp - aura, 0);
          if (m.hp <= 0) { m.alive = false; this.note(`${m.name} dissolved by H2S.`); }
        }
      }
    }
  }

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
        const r = this.genome.stash({ kind: "gene", id: pick, optimised: false });
        this.note(r.ok ? `HGT: ${bio.GENES[pick].name} from ${m.name} \u2192 parts bin.`
                       : `${bio.GENES[pick].name} — ${r.err}`);
      }
    } else {
      const inc = Math.round(m.atk * 0.5 * this.genome.armour(this.dungeon.depth));
      this.player.hp = Math.max(this.player.hp - inc, 0);
      this.note(`${m.name}: ${Math.max(m.hp, 0)} hp left.`);
    }
    this.mobTurn();
    this.save();
  }

  mobTurn(): void {
    this.upkeep();
    for (const m of this.level.mobs) {
      if (!m.alive) continue;
      const dx = this.player.x - m.x, dy = this.player.y - m.y;
      if (dx * dx + dy * dy > 64) continue;
      if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
        const inc = Math.max(
          Math.round(m.atk * 0.35 * this.genome.armour(this.dungeon.depth)), 1);
        this.player.hp = Math.max(this.player.hp - inc, 0);
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
    // Extracellular electron transfer lets you strike along a nanowire.
    const reach = this.genome.reach(this.dungeon.depth);
    if (m !== undefined && Math.abs(tx - this.player.x) <= reach
                        && Math.abs(ty - this.player.y) <= reach) {
      this.attack(m); return;
    }
    this.cursor = { x: tx, y: ty };
    this.repath();
    if (this.path && this.path.length > 1) this.walk = { nodes: this.path, i: 0 };
  }

  /** Screen point -> tile. Lives on the class because pointerDown needs it. */
  toTile(cx: number, cy: number): Point {
    const r = this.canvas.getBoundingClientRect();
    const s = TILE * this.zoom;
    return {
      x: Math.floor((cx - r.left - r.width / 2) / s + this.player.ax + 0.5),
      y: Math.floor((cy - r.top - r.height / 2) / s + this.player.ay + 0.5),
    };
  }

  private bindInput(): void {
    this.canvas.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.pointerDown(e.clientX, e.clientY);
    });
    this.canvas.addEventListener("pointermove", (e) => {
      this.pointerMove(e.clientX, e.clientY);
    });
    const release = (e: PointerEvent): void => { this.pointerUp(e.clientX, e.clientY); };
    this.canvas.addEventListener("pointerup", release);
    this.canvas.addEventListener("pointercancel", release);

    addEventListener("keydown", (e) => {
      const act = classifyKey(e.key, this.showPlasmid);
      if (act.kind === "none") return;
      e.preventDefault();
      switch (act.kind) {
        case "move": {
          this.walk = null;
          const pinched = act.dx !== 0 && act.dy !== 0
            && !this.level.grid.isFloor(this.player.x + act.dx, this.player.y)
            && !this.level.grid.isFloor(this.player.x, this.player.y + act.dy);
          if (!pinched) this.step(this.player.x + act.dx, this.player.y + act.dy);
          break;
        }
        case "zoom":
          this.zoom = Math.min(Math.max(this.zoom * act.factor, 0.3), 8);
          break;
        case "togglePlasmid": this.openPlasmid(true); break;
        case "closePlasmid": this.openPlasmid(false); break;
        case "toggleHud": break;      // the HUD is always on now
        case "toggleContrast":
          this.settings = { ...this.settings, highContrast: !this.settings.highContrast };
          this.save();
          break;
        case "fullscreen": break;
        case "descend": this.descend(); break;
        case "ascend": this.ascend(); break;
        case "quit": break;
      }
    });

    // Pinch-zoom, without the gesture fighting a tap.
    const pts = new Map<number, Point>();
    let d0 = 0;
    let z0 = 1;
    this.canvas.addEventListener("pointermove", (e) => {
      if (this.showPlasmid) return;         // the ring owns the pointer here
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()] as [Point, Point];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d0 > 0) this.zoom = Math.min(Math.max(z0 * (d / d0), 0.3), 8);
      }
    });
    this.canvas.addEventListener("pointerdown", (e) => {
      if (this.showPlasmid) return;
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
      version: SCHEMA,
      depth: this.dungeon.depth,
      seed: this.dungeon.seed,
      px: this.player.x,
      py: this.player.y,
      hp: this.player.hp,
      ring: this.genome.slots.map((p) => (p === null ? null : { ...p })),
      bin: this.genome.bin.map((p) => ({ ...p })),
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
    this.genome.bin.length = 0;
    for (const p of s.bin) this.genome.bin.push({ ...p });
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

    // Belt and braces: openPlasmid() clears the walk, but the loop refuses to
    // advance one while the screen is up regardless.
    if (this.walk && at && !this.showPlasmid) {
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
    if (this.showMap) {
      this.drawMapScreen(W, H);
    } else if (this.showPlasmid) {
      this.drawPlasmid(W, H);
    } else {
      layoutButtons(this.buttons, W, H, this.insets(), u, this.barH + this.logH);
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

    // One row: hp gauge, then plain readouts. A miniature plasmid ring used to
    // sit here and read as an unexplained circle, so it is gone -- the real
    // ring is one tap away and legible.
    const gaugeH = Math.max(lh * 0.8, 12);
    const hpW = Math.min(barW * 0.44, 150 * u);
    drawBar(ctx, barX, barTop + lh * 1.15, hpW, gaugeH,
            this.player.hp / this.player.maxhp, "#4fbf6a",
            `hp ${Math.max(this.player.hp, 0)}/${this.player.maxhp}`,
            `${size * 0.86}px ui-monospace,monospace`);

    const ops = this.genome.operons().filter((op) => op.genes.length > 0).length;
    ctx.font = `${size * 0.86}px ui-monospace,monospace`;
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "middle";
    ctx.fillText(
      `${this.genome.used().toFixed(1)}kb  ${ops} operon${ops === 1 ? "" : "s"}` +
      `   ${this.dungeon.aliveCount()} hostile`,
      barX + hpW + 10 * u, barTop + lh * 1.15 + gaugeH / 2);
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
    this.logH = logH;

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

    const avail = Math.min(W - ins.left - ins.right, H * 0.46);
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

    // Parts bin: everything you hold but have not installed.
    const cell = Math.max(Math.min((W - ins.left - ins.right - 7 * 8 * u) / 6, 62 * u), 44);
    const gap = 8 * u;
    this.bin = {
      x: ins.left + gap, y: this.ring.cy + this.ring.rOuter + 16 * u,
      cell, gap, cols: 6,
    };
    ctx.fillStyle = "#8fa89a";
    ctx.font = `${11 * u}px ui-monospace,monospace`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`PARTS BIN  ${this.genome.bin.length}/12`, this.bin.x, this.bin.y - 6 * u);
    drawBin(ctx, this.bin, this.genome.bin, u, this.dragBin);
    const binRows = Math.floor(this.genome.bin.length / 6) + 1;

    // Active complexes and hazards, which is the payoff for arranging well.
    let cy = this.bin.y + binRows * (cell + gap) + 14 * u;
    ctx.font = `${11 * u}px ui-monospace,monospace`;
    for (const c of this.genome.complexes(this.dungeon.depth)) {
      ctx.fillStyle = "#7fe0a4";
      ctx.fillText(`\u2713 ${c.name}`, this.bin.x, cy);
      cy += 15 * u;
    }
    for (const h of this.genome.hazards(this.dungeon.depth)) {
      ctx.fillStyle = "#ff9a5a";
      ctx.fillText(`\u26A0 ${h.name}  -${h.dmg}/turn`, this.bin.x, cy);
      cy += 15 * u;
    }

    // Detail panel for the tapped slot.
    const py = cy + 8 * u;
    const lines = this.selected === null
      ? ["drag a part from the bin onto a slot to install it",
         "drag a slot back onto the bin to remove it",
         "drag a part between slots to rearrange — a gene transcribes only if",
         "it sits downstream of a promoter with no gap or terminator between",
         "drag outside the ring to spin it"]
      : describeSlot(this.genome, this.selected, this.dungeon.depth);
    ctx.textAlign = "left";
    ctx.font = `${11.5 * u}px ui-monospace,monospace`;
    lines.forEach((line, i) => {
      ctx.fillStyle = i === 0 ? "#ffffff" : "#9fb8a8";
      for (const w of this.wrap(line, W - (ins.left + ins.right + 32 * u))) {
        ctx.fillText(w, ins.left + gap, py + i * 17 * u);
      }
    });

    // A real close target. "Tap outside" was ambiguous, and it was what let a
    // button press dismiss the screen in the same gesture that opened it.
    const cs = Math.max(46 * u, 44);
    this.closeBox = { x: W - ins.right - cs - 12 * u, y: ins.top + 12 * u, w: cs, h: cs };
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = Math.max(1.5 * u, 1.5);
    ctx.beginPath();
    ctx.roundRect(this.closeBox.x, this.closeBox.y, cs, cs, cs * 0.28);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = `${cs * 0.42}px ui-monospace,monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("\u2715", this.closeBox.x + cs / 2, this.closeBox.y + cs / 2);
  }

  private inClose(x: number, y: number): boolean {
    const c = this.closeBox;
    return x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h;
  }

  pointerDown(x: number, y: number): void {
    if (this.showMap) {
      if (this.inClose(x, y)) { this.gesture = "dismiss"; return; }
      this.gesture = "spin";                 // reused as "scroll" here
      this.spinFrom = y;
      this.spinStart = y;
      return;
    }
    // Bin cells are checked first: they sit outside the ring, which would
    // otherwise classify as a spin.
    if (this.showPlasmid) {
      const b = binAt(this.bin, this.genome.bin.length, x, y);
      if (b !== null) {
        this.gesture = "slot";
        this.dragBin = b;
        this.dragXY = { x, y };
        this.selected = null;
        return;
      }
    }
    const slot = this.showPlasmid ? slotAt(this.ring, x, y) : null;
    const btn = this.showPlasmid ? null : buttonAt(this.buttons, x, y);
    this.gesture = classifyDown({
      plasmidOpen: this.showPlasmid,
      closeBox: this.closeBox,
      slot,
      distFromRing: Math.hypot(x - this.ring.cx, y - this.ring.cy),
      rOuter: this.ring.rOuter,
      onButton: btn !== null,
    }, x, y);

    switch (this.gesture) {
      case "button":
        this.gestureBtn = btn;
        if (btn) btn.active = true;
        break;
      case "slot":
        if (slot !== null) {
          this.selected = slot;
          if (this.genome.at(slot) !== null) { this.dragFrom = slot; this.dragXY = { x, y }; }
        }
        break;
      case "spin":
        this.spinFrom = Math.atan2(y - this.ring.cy, x - this.ring.cx);
        break;
      case "world": {
        const t = this.toTile(x, y);
        this.tap(t.x, t.y);
        break;
      }
      case "dismiss": case "none": break;
    }
  }

  pointerMove(x: number, y: number): void {
    if (this.gesture === "slot" && (this.dragFrom !== null || this.dragBin !== null)) {
      this.dragXY = { x, y };
    } else if (this.gesture === "spin" && this.spinFrom !== null) {
      if (this.showMap) {
        const maxScroll = Math.max(this.mapContentH - this.map.rowH * 3, 0);
        this.map.scroll = Math.min(Math.max(this.map.scroll - (y - this.spinFrom), 0), maxScroll);
        this.spinFrom = y;
      } else {
        const a = Math.atan2(y - this.ring.cy, x - this.ring.cx);
        this.ring.rot += a - this.spinFrom;
        this.spinFrom = a;
      }
    }
  }

  pointerUp(x: number, y: number): void {
    switch (this.gesture) {
      case "button": {
        const b = this.gestureBtn;
        if (b) { b.active = false; if (buttonAt(this.buttons, x, y) === b) this.press(b.id); }
        break;
      }
      case "slot": {
        const target = slotAt(this.ring, x, y);
        if (this.dragBin !== null) {
          if (target !== null) {                       // bin -> ring
            const r = this.genome.install(this.dragBin, target);
            if (r.ok) { this.selected = target; this.save(); } else this.note(r.err);
          }
        } else if (this.dragFrom !== null) {
          if (binAt(this.bin, this.genome.bin.length + 1, x, y) !== null) {
            const r = this.genome.uninstall(this.dragFrom);   // ring -> bin
            if (r.ok) { this.selected = null; this.save(); } else this.note(r.err);
          } else if (target !== null && target !== this.dragFrom) {
            this.genome.swap(this.dragFrom, target);
            this.selected = target;
            this.save();
          }
        }
        break;
      }
      case "dismiss":
        if (this.inClose(x, y)) {
          if (this.showMap) this.showMap = false;
          else this.openPlasmid(false);
        }
        break;
      case "spin":
        // A tap on a complete module builds it, but only if the drag was
        // short enough to be a tap rather than a scroll.
        if (this.showMap && this.spinStart !== null && Math.abs(y - this.spinStart) < 8) {
          const row = rowAt(this.mapRows, y);
          if (row?.canAssemble) {
            const r = this.genome.assemble(row.state.module.steps.map((s) => s.gene));
            this.note(r.ok
              ? `Assembled ${row.state.module.id} ${row.state.module.name}.`
              : `${row.state.module.id}: ${r.err}`);
            if (r.ok) { this.showMap = false; this.save(); }
          }
        }
        break;
      case "none": case "world": break;
    }
    this.gesture = "none";
    this.gestureBtn = null;
    this.dragFrom = null;
    this.dragBin = null;
    this.dragXY = null;
    this.spinFrom = null;
    this.spinStart = null;
  }

  drawMapScreen(W: number, H: number): void {
    const { ctx } = this;
    const ins = this.insets();
    const u = Math.max(Math.min(W, H) / 420, 1) * this.settings.uiScale;
    ctx.fillStyle = "rgba(0,0,0,0.94)";
    ctx.fillRect(0, 0, W, H);

    const headerH = ins.top + 44 * u;
    ctx.fillStyle = "#ffffff";
    ctx.font = `${14 * u}px ui-monospace,monospace`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("PATHWAY MODULES", ins.left + 14 * u, ins.top + 26 * u);
    ctx.fillStyle = "#8fa89a";
    ctx.font = `${10 * u}px ui-monospace,monospace`;
    ctx.fillText("greyed enzymes are ones you do not carry",
                 ins.left + 14 * u, ins.top + 40 * u);

    this.map = {
      x: ins.left + 14 * u,
      y: headerH + 10 * u,
      w: W - ins.left - ins.right - 28 * u,
      rowH: 62 * u,
      scroll: this.map.scroll,
    };
    const laid = layoutMap(this.map, this.genome);
    this.mapRows = laid.rows;
    this.mapContentH = laid.contentH;
    drawMap(ctx, this.map, this.mapRows, u, headerH, H - ins.bottom - 40 * u);

    const cs = Math.max(46 * u, 44);
    this.closeBox = { x: W - ins.right - cs - 12 * u, y: ins.top + 8 * u, w: cs, h: cs };
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = Math.max(1.5 * u, 1.5);
    ctx.beginPath();
    ctx.roundRect(this.closeBox.x, this.closeBox.y, cs, cs, cs * 0.28);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = `${cs * 0.42}px ui-monospace,monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("\u2715", this.closeBox.x + cs / 2, this.closeBox.y + cs / 2);
  }

  /** Single entry point, so nothing can open the screen without also parking
   *  the world. An in-flight walk used to keep stepping underneath it. */
  openPlasmid(open: boolean): void {
    this.showPlasmid = open;
    this.selected = null;
    this.dragFrom = null;
    this.dragXY = null;
    this.spinFrom = null;
    if (open) {
      this.walk = null;                     // stop mid-path movement
      this.path = null;
    }
  }

  press(id: string): void {
    switch (id) {
      case "plasmid": this.openPlasmid(!this.showPlasmid); this.showMap = false; break;
      case "map":
        this.showMap = !this.showMap;
        if (this.showMap) this.openPlasmid(false);
        break;
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
